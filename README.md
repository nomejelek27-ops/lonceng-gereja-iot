# Sistem Kendali & Penjadwalan Lonceng Gereja (IoT + Priority Queue + MySQL)

Gereja Santa Maria Ratu Oeolo — prototipe skripsi.

## Struktur folder

```
lonceng-app/
├── server.js             # Backend (Express) — API web & API ESP32
├── db.js                 # Koneksi pool ke MySQL
├── priorityQueue.js       # Implementasi algoritma Priority Queue (min-heap)
├── scheduleConfig.js      # Jadwal tetap Senin–Sabtu & Minggu
├── sql/schema.sql         # Skema database (jalankan sekali di awal)
├── .env.example            # Contoh konfigurasi koneksi database
├── public/                 # Web dashboard (HTML/CSS/JS)
│   ├── index.html
│   ├── style.css
│   └── app.js
└── esp32/
    └── lonceng_esp32.ino  # Sketch Arduino untuk ESP32
```

## 1. Menyiapkan MySQL

Butuh **MySQL** atau **MariaDB** sudah terpasang dan menyala di komputer/laptop
(atau server) yang akan menjalankan aplikasi ini.

### a. Buat database + tabel

Jalankan file skema yang sudah disediakan:

```bash
mysql -u root -p < sql/schema.sql
```

Ini akan membuat database `lonceng_gereja` beserta tabel `users`, `settings`,
`schedule_items`, `logs`, dan `push_subscriptions`, plus satu akun petugas default.

> **Sudah pernah install sebelumnya?** Kalau database `lonceng_gereja` sudah
> ada dari versi lama (sebelum fitur Web Push ditambahkan), jangan jalankan
> `schema.sql` ulang — cukup jalankan migrasi:
> ```bash
> mysql -u root -p < sql/migrate_v3_push_notifications.sql
> ```

### b. Buat user database khusus aplikasi (disarankan)

Jangan pakai akun `root` MySQL untuk aplikasi. Buat user baru:

```sql
CREATE USER 'lonceng_app'@'localhost' IDENTIFIED BY 'ganti_dengan_password_kamu';
GRANT ALL PRIVILEGES ON lonceng_gereja.* TO 'lonceng_app'@'localhost';
FLUSH PRIVILEGES;
```

> **Catatan Ubuntu/Debian:** akun `root` bawaan MySQL biasanya memakai metode
> autentikasi `auth_socket`, bukan password biasa — jadi kalau `.env` diisi
> `DB_USER=root` dengan password kosong, koneksi akan **ditolak**. Selalu
> pakai user khusus seperti contoh di atas.

## 2. Konfigurasi aplikasi

```bash
cp .env.example .env
```

Lalu edit `.env` sesuai user yang baru dibuat:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=lonceng_app
DB_PASSWORD=ganti_dengan_password_kamu
DB_NAME=lonceng_gereja
PORT=3000
```

## 3. Menjalankan server (backend + web)

Butuh **Node.js** versi 18 ke atas.

```bash
npm install
npm start
```

Kalau berhasil akan muncul:

```
Berhasil terhubung ke MySQL.
Server lonceng gereja jalan di http://localhost:3000
Device API key: xxxxxxxxxxxxxxxx
```

Kalau muncul pesan "Gagal terhubung ke MySQL", cek: MySQL sudah menyala,
isi `.env` sudah benar, dan database `lonceng_gereja` sudah dibuat (langkah 1a).

Buka `http://localhost:3000` di browser (atau dari HP yang satu jaringan WiFi
dengan komputer server, pakai `http://[IP-komputer]:3000`).

**Login default** (ganti setelah login pertama, lihat bagian 6):
- Username: `petugas`
- Password: `gereja123`

## 4. Menyambungkan ESP32 (alat fisik)

1. Rangkai ESP32 → modul relay → mekanisme penggerak lonceng (motor/solenoid).
   Pin sinyal relay dihubungkan ke **GPIO 26** ESP32 (bisa diganti di sketch).
2. Buka `esp32/lonceng_esp32.ino` di Arduino IDE.
3. Install board **ESP32** (lewat Board Manager) dan library **ArduinoJson**
   (lewat Library Manager) jika belum ada.
4. Isi bagian konfigurasi di paling atas file:
   - `WIFI_SSID`, `WIFI_PASSWORD`
   - `SERVER_HOST` — alamat IP komputer yang menjalankan `npm start`
   - `deviceKey` — buka web, login, klik **Pengaturan** di dashboard, salin
     kunci yang tampil, tempel ke sini
5. Upload sketch ke ESP32, lalu buka Serial Monitor (115200 baud) untuk
   memastikan berhasil konek WiFi dan mulai polling.

Status di dashboard akan berubah jadi **"Alat terhubung"** begitu ESP32
mulai polling ke server.

## 5. Cara kerja Priority Queue + penyimpanan MySQL

Setiap awal hari, `scheduleConfig.js` menyediakan daftar jadwal hari itu
(beda Minggu vs hari lain). Tiap jadwal dikonversi ke nilai prioritas
`T = 60×J + M`, dimasukkan ke struktur **min-heap** di `priorityQueue.js`
untuk ditentukan urutannya, lalu hasil urutannya disimpan sebagai baris-baris
di tabel `schedule_items` (kolom `priority` menyimpan nilai T tersebut).
Saat web meminta jadwal hari ini, server tinggal `SELECT ... ORDER BY priority`.
Setiap kali lonceng benar-benar dibunyikan (dikonfirmasi oleh ESP32 lewat
`/api/device/ack`), tercatat sebagai baris baru di tabel `logs`.

## 6. Notifikasi

Saat jadwal mendekat (default: 10 menit sebelumnya, bisa diubah lewat
`REMINDER_MINUTES` di `server.js`), ada dua lapis notifikasi:

**a. Notifikasi dalam tab (selalu aktif, tidak perlu HTTPS)**
- Pita kuning "Waktunya sudah dekat: ..." tampil di dashboard
- Bunyi bip dua kali (Web Audio API, tanpa file suara)
- Judul tab browser berkedip "🔔 Ada jadwal lonceng!"

Syaratnya hanya tab dashboard tetap terbuka (boleh di latar belakang/minimize).

**b. Web Push Notification (tetap masuk walau tab/browser tertutup)**
- Petugas membuka **Pengaturan** di dashboard lalu menekan **Aktifkan notifikasi**
  sekali saja (browser akan minta izin notifikasi)
- Server otomatis membuat sepasang kunci VAPID saat pertama kali dijalankan
  (disimpan di tabel `settings`, tidak perlu diisi manual)
- Setiap kali penjadwal (`tickScheduler` di `server.js`) mendeteksi jadwal
  yang mendekat, server mengirim push lewat library `web-push` ke semua
  browser yang berlangganan (tabel `push_subscriptions`), diteruskan oleh
  layanan push milik vendor browser (Chrome/Firefox/dst) ke perangkat
  petugas — notifikasi muncul walau dashboard tidak sedang dibuka

> **Penting:** Web Push mengharuskan **HTTPS** saat sudah dipakai di luar
> `localhost` (untuk demo/pengembangan di `localhost`, HTTP biasa tetap
> berfungsi). Kalau nanti di-deploy ke server sungguhan, pasang HTTPS
> (misalnya lewat reverse proxy Nginx + Let's Encrypt) supaya fitur ini
> tetap jalan.

## 7. Kalender bulanan

Dashboard menampilkan kalender bulan berjalan dalam bentuk grid (mirip
kalender bawaan HP): tanggal hari ini ditandai lingkaran penuh, tanggal
yang punya acara ditandai titik kecil, dan bisa navigasi ke bulan
sebelum/berikutnya. Mengetuk satu tanggal menampilkan daftar acara pada
tanggal itu di bawah grid — gabungan dari jadwal khusus yang ditambahkan
petugas (`schedule_items` dengan `source = 'custom'`) dan hari
raya/perayaan Katolik yang dihitung otomatis (`feastDays.js`). Tombol
**+** di pojok panel acara langsung membuka form tambah jadwal untuk
tanggal yang sedang dipilih.

## 8. Mengganti kata sandi petugas

```sql
UPDATE users SET password = 'password_baru' WHERE username = 'petugas';
```

Untuk penggunaan produksi sungguhan, sebaiknya password di-hash (misalnya
dengan `bcrypt`) — versi ini sengaja dibuat sederhana untuk keperluan
prototipe/skripsi.

## 9. Menjalankan server terus-menerus (opsional)

```bash
npm install -g pm2
pm2 start server.js --name lonceng-gereja
pm2 save
```

## Catatan keamanan untuk pengembangan lanjutan

- Ganti password default (akun petugas maupun user MySQL) sebelum dipakai sungguhan.
- `deviceKey` sebaiknya diperlakukan seperti password — jangan disebar.
- Untuk jaringan produksi, pertimbangkan HTTPS (lewat reverse proxy seperti
  Nginx) agar komunikasi web dan ESP32 terenkripsi.
