const API = {
  token: localStorage.getItem('loncengToken') || null,
};

const $ = (sel) => document.querySelector(sel);

const loginScreen = $('#loginScreen');
const dashScreen = $('#dashScreen');
const loginForm = $('#loginForm');
const loginError = $('#loginError');
const scheduleList = $('#scheduleList');
const upcomingList = $('#upcomingList');
const logBody = $('#logBody');
const notifBanner = $('#notifBanner');
const todayLabel = $('#todayLabel');
const deviceDot = $('#deviceDot');
const deviceStatusText = $('#deviceStatusText');
const settingsModal = $('#settingsModal');
const deviceKeyBox = $('#deviceKeyBox');
const addScheduleModal = $('#addScheduleModal');
const addScheduleForm = $('#addScheduleForm');
const addScheduleError = $('#addScheduleError');

// ---- Elemen kalender ----
const calendarGrid = $('#calendarGrid');
const calMonthLabel = $('#calMonthLabel');
const calPrevBtn = $('#calPrevBtn');
const calNextBtn = $('#calNextBtn');
const calTodayBtn = $('#calTodayBtn');
const calSelectedLabel = $('#calSelectedLabel');
const calEventsList = $('#calEventsList');
const calAddFab = $('#calAddFab');

// ---- Elemen notifikasi push ----
const pushStatusText = $('#pushStatusText');
const pushToggleBtn = $('#pushToggleBtn');
const pushTestBtn = $('#pushTestBtn');
const pushTestError = $('#pushTestError');
const pushTestSuccess = $('#pushTestSuccess');

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jumat", 'Sabtu'];
const ORIGINAL_TITLE = document.title;
let lastNotifiedId = null;
let titleBlinkInterval = null;

/** Bunyi bip pendek pakai Web Audio API (tidak perlu file suara, tidak perlu HTTPS) */
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 350, 700].forEach((delay) => {
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.9, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      }, delay);
    });
  } catch (err) {
    console.error('Tidak bisa memutar bunyi:', err);
  }
}

function startTitleBlink(text) {
  if (titleBlinkInterval) return; // sudah berkedip, tidak perlu diulang
  let showAlert = true;
  titleBlinkInterval = setInterval(() => {
    document.title = showAlert ? text : ORIGINAL_TITLE;
    showAlert = !showAlert;
  }, 1200);
}

function stopTitleBlink() {
  if (titleBlinkInterval) {
    clearInterval(titleBlinkInterval);
    titleBlinkInterval = null;
    document.title = ORIGINAL_TITLE;
  }
}

function authHeaders(extra = {}) {
  return { 'x-auth-token': API.token, 'Content-Type': 'application/json', ...extra };
}

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: authHeaders(opts.headers) });
  if (res.status === 401) {
    logout();
    throw new Error('Sesi berakhir, silakan masuk kembali');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan');
  return data;
}

function showDashboard() {
  loginScreen.hidden = true;
  dashScreen.hidden = false;
  refreshAll();
  initCalendar();
  refreshPushStatus();
  setInterval(refreshAll, 8000);
}

function logout() {
  API.token = null;
  localStorage.removeItem('loncengToken');
  dashScreen.hidden = true;
  loginScreen.hidden = false;
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const username = $('#username').value.trim();
  const password = $('#password').value;
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal masuk');
    API.token = data.token;
    localStorage.setItem('loncengToken', data.token);
    showDashboard();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.hidden = false;
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } catch (_) {}
  logout();
});

$('#manualRingBtn').addEventListener('click', async () => {
  if (!confirm('Bunyikan lonceng sekarang di luar jadwal?')) return;
  try {
    await api('/api/ring-manual', { method: 'POST', body: JSON.stringify({ label: 'Bunyi manual' }) });
    refreshAll();
  } catch (err) {
    alert(err.message);
  }
});

$('#settingsBtn').addEventListener('click', async () => {
  settingsModal.hidden = false;
  try {
    const data = await api('/api/device-key');
    deviceKeyBox.textContent = data.deviceApiKey;
  } catch (err) {
    deviceKeyBox.textContent = 'Gagal memuat: ' + err.message;
  }
  refreshPushStatus();
});
$('#closeSettingsBtn').addEventListener('click', () => { settingsModal.hidden = true; });

function openAddScheduleModal(prefill = {}) {
  addScheduleError.hidden = true;
  addScheduleForm.reset();
  $('#scheduleDate').value = prefill.date || new Date().toISOString().slice(0, 10);
  if (prefill.time) $('#scheduleTime').value = prefill.time;
  if (prefill.label) $('#scheduleLabel').value = prefill.label;
  addScheduleModal.hidden = false;
}

$('#addScheduleBtn').addEventListener('click', () => openAddScheduleModal());
$('#closeAddScheduleBtn').addEventListener('click', () => { addScheduleModal.hidden = true; });

addScheduleForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  addScheduleError.hidden = true;
  try {
    await api('/api/schedule/custom', {
      method: 'POST',
      body: JSON.stringify({
        date: $('#scheduleDate').value,
        time: $('#scheduleTime').value,
        label: $('#scheduleLabel').value,
      }),
    });
    addScheduleModal.hidden = true;
    refreshAll();
    loadCalendarMonth();
  } catch (err) {
    addScheduleError.textContent = err.message;
    addScheduleError.hidden = false;
  }
});

const HARI_SINGKAT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function formatTanggalIndo(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  return `${HARI_SINGKAT[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]}`;
}

function statusLabel(item) {
  switch (item.status) {
    case 'rung': return `Sudah dibunyikan${item.ringedAt ? ' • ' + new Date(item.ringedAt).toLocaleTimeString('id-ID') : ''}`;
    case 'ringing': return 'Menunggu alat membunyikan...';
    case 'notified': return 'Waktunya sudah dekat';
    default: return 'Menunggu jadwal';
  }
}

function renderSchedule(items) {
  scheduleList.innerHTML = '';
  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'schedule-item' + (item.status === 'notified' ? ' is-notified' : '') + (item.status === 'rung' ? ' is-rung' : '');

    const time = document.createElement('div');
    time.className = 'sched-time';
    time.textContent = item.time;

    const info = document.createElement('div');
    info.className = 'sched-info';
    info.innerHTML = `<div class="sched-label">${item.label}</div><div class="sched-status">${statusLabel(item)}</div>`;

    const btn = document.createElement('button');
    btn.className = 'ring-btn';
    btn.textContent = item.status === 'rung' ? 'Selesai' : 'Bunyikan';
    btn.disabled = item.status === 'rung' || item.status === 'ringing';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await api(`/api/ring/${item.id}`, { method: 'POST' });
        refreshAll();
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
      }
    });

    li.append(time, info, btn);
    scheduleList.appendChild(li);
  });

  const soon = items.find((i) => i.status === 'notified');
  if (soon) {
    notifBanner.hidden = false;
    notifBanner.textContent = `Waktunya sudah dekat: ${soon.label} pukul ${soon.time}`;

    if (lastNotifiedId !== soon.id) {
      lastNotifiedId = soon.id;
      playBeep();
    }
    startTitleBlink('🔔 Ada jadwal lonceng!');
  } else {
    notifBanner.hidden = true;
    lastNotifiedId = null;
    stopTitleBlink();
  }
}

function renderLogs(logs) {
  logBody.innerHTML = '';
  if (logs.length === 0) {
    logBody.innerHTML = '<tr class="empty-row"><td colspan="2">Belum ada riwayat pembunyian</td></tr>';
    return;
  }
  logs.forEach((log) => {
    const tr = document.createElement('tr');
    const waktu = new Date(log.ringedAt).toLocaleString('id-ID');
    tr.innerHTML = `<td>${waktu}</td><td>${log.label}</td>`;
    logBody.appendChild(tr);
  });
}

function renderUpcoming(items) {
  upcomingList.innerHTML = '';
  if (items.length === 0) {
    upcomingList.innerHTML = '<li class="empty-note">Belum ada jadwal khusus mendatang</li>';
    return;
  }
  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'schedule-item' + (item.status === 'rung' ? ' is-rung' : '');

    const time = document.createElement('div');
    time.className = 'sched-time';
    time.textContent = item.time;

    const info = document.createElement('div');
    info.className = 'sched-info';
    info.innerHTML = `<div class="sched-label">${item.label}</div><div class="sched-status">${formatTanggalIndo(item.date)}</div>`;

    const btn = document.createElement('button');
    btn.className = 'ring-btn';
    btn.textContent = 'Hapus';
    btn.disabled = item.status === 'rung';
    btn.addEventListener('click', async () => {
      if (!confirm(`Hapus jadwal "${item.label}" (${formatTanggalIndo(item.date)} ${item.time})?`)) return;
      try {
        await api(`/api/schedule/custom/${item.id}`, { method: 'DELETE' });
        refreshAll();
        loadCalendarMonth();
      } catch (err) {
        alert(err.message);
      }
    });

    li.append(time, info, btn);
    upcomingList.appendChild(li);
  });
}

// ==============================================================
// ===================  KALENDER (grid ala HP)  ==================
// ==============================================================

function isoLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const calState = {
  year: 0,
  month: 0, // 1-12
  selected: null, // "YYYY-MM-DD"
  events: {}, // { "YYYY-MM-DD": [ {type, label, time?, id?, status?} ] }
};

function initCalendar() {
  const today = new Date();
  calState.year = today.getFullYear();
  calState.month = today.getMonth() + 1;
  calState.selected = isoLocalDate(today);
  loadCalendarMonth();
}

calPrevBtn.addEventListener('click', () => changeCalendarMonth(-1));
calNextBtn.addEventListener('click', () => changeCalendarMonth(1));
calTodayBtn.addEventListener('click', () => initCalendar());

function changeCalendarMonth(delta) {
  let m = calState.month + delta;
  let y = calState.year;
  if (m < 1) { m = 12; y -= 1; }
  if (m > 12) { m = 1; y += 1; }
  calState.year = y;
  calState.month = m;
  loadCalendarMonth();
}

async function loadCalendarMonth() {
  try {
    const data = await api(`/api/calendar/month?year=${calState.year}&month=${calState.month}`);
    calState.events = data.events || {};
    renderCalendarGrid();
    renderSelectedDayEvents();
  } catch (err) {
    console.error(err);
  }
}

function renderCalendarGrid() {
  const { year, month } = calState;
  calMonthLabel.textContent = `${BULAN[month - 1]} ${year}`;

  const firstOfMonth = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startWeekday = firstOfMonth.getDay(); // 0 = Minggu
  const todayIso = isoLocalDate(new Date());

  calendarGrid.innerHTML = '';

  // Sel kosong (tanggal bulan sebelumnya) supaya hari pertama jatuh di kolom yang benar
  const prevMonthLastDate = new Date(year, month - 1, 0).getDate();
  for (let i = 0; i < startWeekday; i++) {
    const dayNum = prevMonthLastDate - startWeekday + 1 + i;
    calendarGrid.appendChild(buildCalDayCell(dayNum, true, null));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    calendarGrid.appendChild(buildCalDayCell(day, false, iso, iso === todayIso));
  }

  // Sel kosong (tanggal bulan berikutnya) supaya baris terakhir tetap genap 7 kolom
  const totalCells = startWeekday + daysInMonth;
  const trailing = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= trailing; i++) {
    calendarGrid.appendChild(buildCalDayCell(i, true, null));
  }
}

function buildCalDayCell(dayNum, isOutside, iso, isToday = false) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cal-day' + (isOutside ? ' is-outside' : '') + (isToday ? ' is-today' : '');

  if (!isOutside) {
    if (iso === calState.selected && !isToday) btn.classList.add('is-selected');
    btn.addEventListener('click', () => {
      calState.selected = iso;
      renderCalendarGrid();
      renderSelectedDayEvents();
    });
  } else {
    btn.disabled = true;
  }

  const num = document.createElement('span');
  num.className = 'cal-day-num';
  num.textContent = dayNum;
  btn.appendChild(num);

  if (!isOutside && calState.events[iso] && calState.events[iso].length > 0) {
    const dot = document.createElement('span');
    dot.className = 'cal-day-dot';
    btn.appendChild(dot);
  }

  return btn;
}

function renderSelectedDayEvents() {
  const iso = calState.selected;
  calSelectedLabel.textContent = iso ? formatTanggalIndo(iso) : '-';
  calEventsList.innerHTML = '';

  const items = calState.events[iso] || [];
  if (items.length === 0) {
    calEventsList.innerHTML = '<li class="empty-note">Tak ada acara</li>';
    return;
  }

  items.forEach((ev) => {
    const li = document.createElement('li');
    li.className = 'schedule-item' + (ev.status === 'rung' ? ' is-rung' : '');

    if (ev.type === 'custom') {
      const time = document.createElement('div');
      time.className = 'sched-time';
      time.textContent = ev.time;

      const info = document.createElement('div');
      info.className = 'sched-info';
      info.innerHTML = `<div class="sched-label">${ev.label}</div><div class="sched-status">Jadwal khusus</div>`;

      const btn = document.createElement('button');
      btn.className = 'ring-btn';
      btn.textContent = 'Hapus';
      btn.disabled = ev.status === 'rung';
      btn.addEventListener('click', async () => {
        if (!confirm(`Hapus jadwal "${ev.label}" (${formatTanggalIndo(iso)} ${ev.time})?`)) return;
        try {
          await api(`/api/schedule/custom/${ev.id}`, { method: 'DELETE' });
          loadCalendarMonth();
          refreshAll();
        } catch (err) {
          alert(err.message);
        }
      });

      li.append(time, info, btn);
    } else {
      // Perayaan/hari raya
      const info = document.createElement('div');
      info.className = 'sched-info';
      info.innerHTML = `<div class="sched-label">${ev.label}</div><div class="sched-status">Hari raya / perayaan</div>`;

      const btn = document.createElement('button');
      btn.className = 'ring-btn';
      btn.textContent = '+ Jadwal';
      btn.addEventListener('click', () => openAddScheduleModal({ date: iso, label: ev.label }));

      li.append(info, btn);
    }

    calEventsList.appendChild(li);
  });
}

calAddFab.addEventListener('click', () => {
  openAddScheduleModal({ date: calState.selected });
});

async function refreshAll() {
  try {
    const sched = await api('/api/schedule/today');
    const dateObj = new Date(sched.date);
    todayLabel.textContent = `${HARI[dateObj.getDay()]}, ${sched.date}`;
    renderSchedule(sched.items);

    deviceDot.className = 'dot ' + (sched.deviceOnline ? 'online' : 'offline');
    deviceStatusText.textContent = sched.deviceOnline ? 'Alat terhubung' : 'Alat belum terhubung';

    const logsData = await api('/api/logs');
    renderLogs(logsData.logs);

    const upcomingData = await api('/api/schedule/upcoming');
    renderUpcoming(upcomingData.items);
  } catch (err) {
    console.error(err);
  }
}

// ==============================================================
// ==================  WEB PUSH NOTIFICATION  ===================
// ==============================================================

const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window;

/** VAPID public key (base64 URL-safe) perlu diubah jadi Uint8Array sebelum dipakai pushManager.subscribe */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function refreshPushStatus() {
  if (!pushSupported) {
    pushStatusText.textContent = 'Browser ini tidak mendukung notifikasi push.';
    pushToggleBtn.hidden = true;
    return;
  }
  if (Notification.permission === 'denied') {
    pushStatusText.textContent = 'Notifikasi diblokir di pengaturan browser. Aktifkan lewat izin situs di browser kamu.';
    pushToggleBtn.hidden = true;
    return;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      pushStatusText.textContent = 'Notifikasi push aktif di perangkat ini.';
      pushToggleBtn.textContent = 'Matikan notifikasi';
      pushToggleBtn.onclick = () => unsubscribeFromPush(sub);
      pushTestBtn.hidden = false;
    } else {
      pushStatusText.textContent = 'Notifikasi belum aktif. Aktifkan supaya dapat pengingat jadwal walau tab ini tertutup.';
      pushToggleBtn.textContent = 'Aktifkan notifikasi';
      pushToggleBtn.onclick = subscribeToPush;
      pushTestBtn.hidden = true;
    }
    pushToggleBtn.hidden = false;
  } catch (err) {
    console.error(err);
    pushStatusText.textContent = 'Gagal memeriksa status notifikasi.';
  }
}

pushTestBtn.addEventListener('click', async () => {
  pushTestError.hidden = true;
  pushTestSuccess.hidden = true;
  pushTestBtn.disabled = true;
  pushTestBtn.textContent = 'Mengirim...';
  try {
    const data = await api('/api/push/test', { method: 'POST' });
    pushTestSuccess.textContent = (data.message || 'Terkirim!') + ' Tunggu beberapa detik, notifikasi akan muncul di layar HP.';
    pushTestSuccess.hidden = false;
  } catch (err) {
    pushTestError.textContent = err.message;
    pushTestError.hidden = false;
  } finally {
    pushTestBtn.disabled = false;
    pushTestBtn.textContent = 'Kirim tes notifikasi';
  }
});

async function subscribeToPush() {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      pushStatusText.textContent = 'Izin notifikasi ditolak.';
      return;
    }

    const { publicKey } = await api('/api/push/vapid-public-key');
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub }) });
    refreshPushStatus();
  } catch (err) {
    console.error(err);
    pushStatusText.textContent = 'Gagal mengaktifkan notifikasi: ' + err.message;
  }
}

async function unsubscribeFromPush(sub) {
  try {
    await api('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) });
    await sub.unsubscribe();
    refreshPushStatus();
  } catch (err) {
    console.error(err);
    pushStatusText.textContent = 'Gagal mematikan notifikasi: ' + err.message;
  }
}

if (API.token) showDashboard();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.error('SW gagal daftar:', err));
  });
}
