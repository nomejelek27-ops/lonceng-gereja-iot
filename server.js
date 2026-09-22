/**
 * server.js
 * Backend Sistem Kendali & Penjadwalan Lonceng Gereja (IoT + Priority Queue)
 * Versi ini menyimpan data (jadwal, log, pengaturan) di MySQL lewat db.js.
 *
 * Alur singkat:
 *  1. Setiap awal hari, jadwal hari itu dibangun dengan Priority Queue
 *     (priorityQueue.js, rumus T = 60J + M), lalu disimpan ke tabel schedule_items.
 *  2. Web (public/) menampilkan urutan jadwal (SELECT ... ORDER BY priority)
 *     dan memberi notifikasi saat waktu mendekat.
 *  3. Saat petugas menekan "Bunyikan", perintah masuk ke antrean perintah
 *     perangkat di memori (deviceCommandQueue) — ini sengaja tidak disimpan
 *     ke DB karena sifatnya sementara/menunggu diambil ESP32.
 *  4. ESP32 polling ke /api/device/poll untuk ambil perintah, gerakkan relay,
 *     lalu lapor balik ke /api/device/ack — hasilnya dicatat ke tabel logs.
 */

// Paksa server selalu memakai zona waktu Indonesia bagian Tengah (WITA / Asia/Makassar),
// supaya jadwal 06:00, 12:00, dst tetap benar walau nanti di-hosting di server luar negeri
// yang defaultnya UTC. Wajib ada SEBELUM baris lain yang menggunakan objek Date.
process.env.TZ = process.env.TZ || 'Asia/Makassar';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const webpush = require('web-push');

const pool = require('./db');
const PriorityQueue = require('./priorityQueue');
const { getScheduleForDay } = require('./scheduleConfig');
const { getFeastDays } = require('./feastDays');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const REMINDER_MINUTES = 5; // notifikasi muncul N menit sebelum jadwal

// ---------- Sesi login sederhana (token di memori) ----------
const activeSessions = new Set();

function requireLogin(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token || !activeSessions.has(token)) {
    return res.status(401).json({ error: 'Belum login' });
  }
  next();
}

async function requireDeviceKey(req, res, next) {
  const key = req.headers['x-device-key'] || req.query.key;
  const dbKey = await getDeviceApiKey();
  if (key !== dbKey) {
    return res.status(401).json({ error: 'Device key salah' });
  }
  next();
}

// ---------- Pengaturan (tabel settings) ----------
async function getSetting(key) {
  const [rows] = await pool.query('SELECT setting_value FROM settings WHERE setting_key = ?', [key]);
  return rows.length > 0 ? rows[0].setting_value : null;
}

async function setSetting(key, value) {
  await pool.query(
    'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
    [key, value, value]
  );
}

async function getDeviceApiKey() {
  const existing = await getSetting('device_api_key');
  if (existing) return existing;
  const newKey = crypto.randomBytes(12).toString('hex');
  await setSetting('device_api_key', newKey);
  return newKey;
}

// ---------- Web Push Notification (VAPID) ----------
// Kunci VAPID dibuat otomatis sekali lalu disimpan di tabel settings,
// supaya subscription browser tetap valid walau server di-restart.
let vapidReady = null;

async function initPush() {
  let publicKey = await getSetting('vapid_public_key');
  let privateKey = await getSetting('vapid_private_key');

  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    await setSetting('vapid_public_key', publicKey);
    await setSetting('vapid_private_key', privateKey);
    console.log('[push] Kunci VAPID baru dibuat dan disimpan di database.');
  }

  webpush.setVapidDetails('mailto:admin@gereja-oeolo.local', publicKey, privateKey);
  vapidReady = publicKey;
  return publicKey;
}

/** Kirim satu notifikasi push ke semua browser yang berlangganan; hapus langganan yang sudah tidak valid.
 *  Mengembalikan ringkasan hasil supaya bisa ditampilkan untuk keperluan diagnosis (lihat /api/push/test). */
async function sendPushToAll(payload) {
  const [rows] = await pool.query('SELECT id, endpoint, subscription_json FROM push_subscriptions');
  if (rows.length === 0) return { total: 0, sent: 0, failed: 0, errors: [] };

  const body = JSON.stringify(payload);
  let sent = 0;
  const errors = [];

  await Promise.all(
    rows.map(async (row) => {
      try {
        const subscription = JSON.parse(row.subscription_json);
        await webpush.sendNotification(subscription, body);
        sent++;
      } catch (err) {
        // 404/410 = subscription sudah dicabut/kadaluarsa di sisi browser, bersihkan dari DB
        if (err.statusCode === 404 || err.statusCode === 410) {
          await pool.query('DELETE FROM push_subscriptions WHERE id = ?', [row.id]);
          errors.push(`Langganan sudah tidak valid (dihapus): ${err.statusCode}`);
        } else {
          console.error('[push] Gagal kirim ke satu langganan:', err.statusCode, err.body || err.message);
          errors.push(`HTTP ${err.statusCode || '?'}: ${err.body || err.message}`);
        }
      }
    })
  );

  return { total: rows.length, sent, failed: rows.length - sent, errors };
}

// ---------- State harian: bangun jadwal via Priority Queue lalu simpan ke DB ----------
let deviceCommandQueue = []; // FIFO perintah menunggu diambil ESP32 (sementara, tidak perlu persist)
let lastKnownDeviceContact = null; // waktu terakhir ESP32 polling (untuk status online/offline)

function todayStamp(d = new Date()) {
  // PENTING: pakai getFullYear/getMonth/getDate (zona waktu LOKAL server, sudah dikunci ke
  // Asia/Makassar di atas), BUKAN toISOString() yang selalu mengonversi ke UTC — kalau pakai
  // toISOString() di sini, sekitar jam 00:00-07:59 WITA tanggalnya bisa keliru jadi hari sebelumnya.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Pastikan tabel schedule_items sudah punya baris jadwal TETAP untuk hari ini; kalau belum, bangun via Priority Queue */
async function ensureTodayQueue() {
  const stamp = todayStamp();
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS n FROM schedule_items WHERE item_date = ? AND source = 'default'",
    [stamp]
  );
  if (rows[0].n > 0) return; // sudah pernah dibangun untuk hari ini

  const now = new Date();
  const jadwalHariIni = getScheduleForDay(now.getDay());

  // Susun lewat Priority Queue (min-heap) berdasarkan T = 60J + M, baru simpan terurut ke DB
  const pq = new PriorityQueue();
  jadwalHariIni.forEach((item, idx) => {
    pq.push({
      id: `${stamp}-${idx}`,
      time: item.time,
      label: item.label,
      priority: PriorityQueue.timeToPriority(item.time),
    });
  });

  const sorted = pq.toSortedArray();
  for (const item of sorted) {
    await pool.query(
      `INSERT IGNORE INTO schedule_items (id, item_date, ring_time, label, priority, status, source)
       VALUES (?, ?, ?, ?, ?, 'pending', 'default')`,
      [item.id, stamp, item.time, item.label, item.priority]
    );
  }

  deviceCommandQueue = [];
  console.log(`[queue] Jadwal tetap hari ${stamp} dibangun ulang di DB (${sorted.length} item)`);
}

/** Loop background: cek jadwal yang mendekat, tandai status "notified" di DB, dan kirim Web Push */
async function tickScheduler() {
  try {
    await ensureTodayQueue();
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const stamp = todayStamp(now);

    // Ambil dulu item mana saja yang BARU akan masuk status "notified" (belum pernah dinotifikasi),
    // supaya push notification hanya terkirim sekali per jadwal, bukan berulang setiap tick.
    const [toNotify] = await pool.query(
      `SELECT id, label, ring_time AS time FROM schedule_items
       WHERE item_date = ? AND status = 'pending'
         AND (priority - ?) BETWEEN 0 AND ?`,
      [stamp, nowMinutes, REMINDER_MINUTES]
    );

    if (toNotify.length > 0) {
      const ids = toNotify.map((item) => item.id);
      await pool.query(`UPDATE schedule_items SET status = 'notified' WHERE id IN (?)`, [ids]);

      for (const item of toNotify) {
        sendPushToAll({
          title: '🔔 Waktunya sudah dekat',
          body: `${item.label} pukul ${item.time}`,
          tag: item.id,
          url: '/',
        }).catch((err) => console.error('[push] Gagal kirim notifikasi jadwal:', err.message));
      }
    }

    // Notifikasi KEDUA: tepat saat jam jadwal tiba (bukan lagi "sebentar lagi", tapi "sekarang")
    const [dueNow] = await pool.query(
      `SELECT id, label, ring_time AS time FROM schedule_items
       WHERE item_date = ? AND status != 'rung' AND due_notified = 0
         AND priority <= ?`,
      [stamp, nowMinutes]
    );

    if (dueNow.length > 0) {
      const dueIds = dueNow.map((item) => item.id);
      await pool.query(`UPDATE schedule_items SET due_notified = 1 WHERE id IN (?)`, [dueIds]);

      for (const item of dueNow) {
        sendPushToAll({
          title: '🔔 Sekarang waktunya!',
          body: `${item.label} pukul ${item.time} — silakan bunyikan lonceng`,
          tag: `${item.id}-due`,
          url: '/',
        }).catch((err) => console.error('[push] Gagal kirim notifikasi due:', err.message));
      }
    }
  } catch (err) {
    console.error('[tickScheduler] error:', err.message);
  }
}

setInterval(tickScheduler, 30 * 1000);
tickScheduler();

// =====================================================================
// ==============================  AUTH  ================================
// =====================================================================

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
    if (rows.length === 0) return res.status(401).json({ error: 'Username atau password salah' });

    const token = crypto.randomBytes(16).toString('hex');
    activeSessions.add(token);
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghubungi database' });
  }
});

app.post('/api/logout', requireLogin, (req, res) => {
  activeSessions.delete(req.headers['x-auth-token']);
  res.json({ ok: true });
});

// =====================================================================
// ========================  API UNTUK WEB (PETUGAS)  ===================
// =====================================================================

app.get('/api/schedule/today', requireLogin, async (req, res) => {
  try {
    await ensureTodayQueue();
    const stamp = todayStamp();
    const [items] = await pool.query(
      `SELECT id, ring_time AS time, label, priority, status, ringed_at AS ringedAt
       FROM schedule_items WHERE item_date = ? ORDER BY priority ASC`,
      [stamp]
    );
    res.json({
      date: stamp,
      items,
      deviceOnline: lastKnownDeviceContact ? Date.now() - lastKnownDeviceContact < 15000 : false,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil jadwal' });
  }
});

app.post('/api/ring/:id', requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM schedule_items WHERE id = ?', [req.params.id]);
    const item = rows[0];
    if (!item) return res.status(404).json({ error: 'Jadwal tidak ditemukan' });
    if (item.status === 'rung') return res.status(400).json({ error: 'Sudah dibunyikan' });

    await pool.query('UPDATE schedule_items SET status = ? WHERE id = ?', ['ringing', item.id]);
    deviceCommandQueue.push({
      commandId: crypto.randomBytes(8).toString('hex'),
      scheduleId: item.id,
      label: item.label,
      issuedAt: Date.now(),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengirim perintah' });
  }
});

app.post('/api/ring-manual', requireLogin, (req, res) => {
  const label = (req.body && req.body.label) || 'Bunyi manual';
  const commandId = crypto.randomBytes(8).toString('hex');
  deviceCommandQueue.push({ commandId, scheduleId: null, label, issuedAt: Date.now() });
  res.json({ ok: true, commandId });
});

app.get('/api/logs', requireLogin, async (req, res) => {
  try {
    const [logs] = await pool.query(
      `SELECT label, schedule_id AS scheduleId, ringed_at AS ringedAt
       FROM logs ORDER BY ringed_at DESC LIMIT 100`
    );
    res.json({ logs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil riwayat' });
  }
});

app.get('/api/device-key', requireLogin, async (req, res) => {
  res.json({ deviceApiKey: await getDeviceApiKey() });
});

/** Petugas menambahkan jadwal khusus (di luar 4 jadwal tetap harian), untuk tanggal apa saja */
app.post('/api/schedule/custom', requireLogin, async (req, res) => {
  try {
    const { date, time, label } = req.body || {};
    if (!date || !time || !label || !label.trim()) {
      return res.status(400).json({ error: 'Tanggal, jam, dan judul wajib diisi' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Format tanggal tidak valid' });
    if (!/^\d{2}:\d{2}$/.test(time)) return res.status(400).json({ error: 'Format jam tidak valid' });

    const id = `custom-${date}-${crypto.randomBytes(4).toString('hex')}`;
    const priority = PriorityQueue.timeToPriority(time);
    await pool.query(
      `INSERT INTO schedule_items (id, item_date, ring_time, label, priority, status, source)
       VALUES (?, ?, ?, ?, ?, 'pending', 'custom')`,
      [id, date, time, label.trim(), priority]
    );
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menambah jadwal' });
  }
});

/** Daftar jadwal khusus yang akan datang (hari ini dan seterusnya), untuk ditampilkan & dikelola petugas */
app.get('/api/schedule/upcoming', requireLogin, async (req, res) => {
  try {
    const stamp = todayStamp();
    const [items] = await pool.query(
      `SELECT id, item_date AS date, ring_time AS time, label, status
       FROM schedule_items
       WHERE source = 'custom' AND item_date >= ?
       ORDER BY item_date ASC, priority ASC
       LIMIT 100`,
      [stamp]
    );
    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil jadwal mendatang' });
  }
});

/** Hapus jadwal khusus yang belum dibunyikan (jadwal tetap harian tidak bisa dihapus lewat sini) */
app.delete('/api/schedule/custom/:id', requireLogin, async (req, res) => {
  try {
    const [result] = await pool.query(
      "DELETE FROM schedule_items WHERE id = ? AND source = 'custom' AND status != 'rung'",
      [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Jadwal tidak ditemukan atau sudah dibunyikan' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus jadwal' });
  }
});

// =====================================================================
// =====================  WEB PUSH NOTIFICATION  =======================
// =====================================================================

app.get('/api/push/vapid-public-key', requireLogin, (req, res) => {
  res.json({ publicKey: vapidReady });
});

app.post('/api/push/subscribe', requireLogin, async (req, res) => {
  try {
    const { subscription } = req.body || {};
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Data langganan tidak lengkap' });
    }
    const json = JSON.stringify(subscription);
    await pool.query(
      `INSERT INTO push_subscriptions (endpoint, subscription_json) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE subscription_json = ?`,
      [subscription.endpoint, json, json]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menyimpan langganan notifikasi' });
  }
});

app.post('/api/push/unsubscribe', requireLogin, async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'Endpoint wajib diisi' });
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus langganan notifikasi' });
  }
});

/** Kirim notifikasi tes ke semua perangkat yang berlangganan, sekaligus laporkan hasilnya untuk diagnosis */
app.post('/api/push/test', requireLogin, async (req, res) => {
  try {
    const [countRows] = await pool.query('SELECT COUNT(*) AS n FROM push_subscriptions');
    if (countRows[0].n === 0) {
      return res.status(400).json({ error: 'Belum ada perangkat yang berlangganan. Klik "Aktifkan notifikasi" dulu di HP kamu.' });
    }

    const result = await sendPushToAll({
      title: '🔔 Tes notifikasi',
      body: 'Kalau ini muncul, notifikasi push sudah berfungsi!',
      tag: 'test-notification',
      url: '/',
    });

    if (result.sent === 0) {
      return res.status(500).json({
        error: `Gagal terkirim ke semua ${result.total} perangkat. Detail: ${result.errors.join(' | ')}`,
      });
    }
    res.json({ ok: true, message: `Terkirim ke ${result.sent} dari ${result.total} perangkat.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengirim tes: ' + err.message });
  }
});

// =====================================================================
// ==========================  KALENDER BULANAN  ========================
// =====================================================================

/** Gabungan jadwal khusus + hari raya untuk satu bulan tertentu, dikelompokkan per tanggal — untuk tampilan grid kalender */
app.get('/api/calendar/month', requireLogin, async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year, 10) || now.getFullYear();
    const month = parseInt(req.query.month, 10) || now.getMonth() + 1; // 1-12

    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDateNum = new Date(year, month, 0).getDate();
    const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(lastDateNum).padStart(2, '0')}`;

    const [customItems] = await pool.query(
      `SELECT id, item_date AS date, ring_time AS time, label, status
       FROM schedule_items
       WHERE source = 'custom' AND item_date BETWEEN ? AND ?
       ORDER BY item_date ASC, priority ASC`,
      [firstDay, lastDay]
    );

    const feasts = getFeastDays(year).filter((f) => f.date.getUTCMonth() + 1 === month);

    const events = {};
    const addEvent = (dateStr, ev) => {
      if (!events[dateStr]) events[dateStr] = [];
      events[dateStr].push(ev);
    };

    customItems.forEach((item) => {
      addEvent(item.date, { type: 'custom', id: item.id, time: item.time, label: item.label, status: item.status });
    });
    feasts.forEach((f) => {
      addEvent(f.date.toISOString().slice(0, 10), { type: 'feast', label: f.name });
    });

    res.json({ year, month, daysInMonth: lastDateNum, events });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil data kalender' });
  }
});

/** Daftar hari raya/perayaan Katolik untuk bulan & tahun tertentu (dihitung otomatis, termasuk yang tanggalnya bergerak) */
app.get('/api/calendar/feasts', requireLogin, (req, res) => {
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const month = req.query.month ? parseInt(req.query.month, 10) : null;

    let feasts = getFeastDays(year);
    if (month) feasts = feasts.filter((f) => f.date.getUTCMonth() + 1 === month);

    res.json({
      year,
      month,
      feasts: feasts.map((f) => ({ date: f.date.toISOString().slice(0, 10), name: f.name })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghitung kalender perayaan' });
  }
});

// =====================================================================
// ==========================  API UNTUK ESP32  =========================
// =====================================================================

app.get('/api/device/poll', requireDeviceKey, (req, res) => {
  lastKnownDeviceContact = Date.now();
  const next = deviceCommandQueue.length > 0 ? deviceCommandQueue[0] : null;
  res.json({ command: next });
});

app.post('/api/device/ack', requireDeviceKey, async (req, res) => {
  try {
    lastKnownDeviceContact = Date.now();
    const { commandId } = req.body || {};
    const idx = deviceCommandQueue.findIndex((c) => c.commandId === commandId);
    if (idx === -1) return res.status(404).json({ error: 'Command tidak ditemukan' });

    const [cmd] = deviceCommandQueue.splice(idx, 1);
    const now = new Date();
    // Format manual (bukan toISOString) supaya waktu yang tercatat adalah waktu LOKAL (WITA),
    // bukan waktu UTC yang bisa selisih 8 jam kalau server dihosting di luar negeri.
    const pad = (n) => String(n).padStart(2, '0');
    const ringedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    if (cmd.scheduleId) {
      await pool.query('UPDATE schedule_items SET status = ?, ringed_at = ? WHERE id = ?', ['rung', ringedAt, cmd.scheduleId]);
    }

    await pool.query('INSERT INTO logs (label, schedule_id, ringed_at) VALUES (?, ?, ?)', [cmd.label, cmd.scheduleId, ringedAt]);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mencatat riwayat' });
  }
});

const PORT = process.env.PORT || 3000;

// Pastikan koneksi DB hidup sebelum server mulai menerima request
pool.query('SELECT 1')
  .then(async () => {
    console.log('Berhasil terhubung ke MySQL.');
    await initPush();
    app.listen(PORT, async () => {
      console.log(`Server lonceng gereja jalan di http://localhost:${PORT}`);
      console.log(`Device API key: ${await getDeviceApiKey()}`);
      console.log('Web Push siap (kunci VAPID dimuat).');
    });
  })
  .catch((err) => {
    console.error('Gagal terhubung ke MySQL. Cek konfigurasi di .env dan pastikan MySQL sudah jalan.');
    console.error(err.message);
    process.exit(1);
  });
