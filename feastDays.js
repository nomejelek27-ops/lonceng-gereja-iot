/**
 * feastDays.js
 * Menghitung tanggal hari raya/perayaan penting Gereja Katolik untuk tahun tertentu.
 *
 * Perayaan dibagi dua jenis:
 *  - Tanggal tetap (misal Natal selalu 25 Desember)
 *  - Tanggal bergerak, dihitung berdasarkan Hari Raya Paskah (misal Rabu Abu = 46 hari
 *    sebelum Paskah). Tanggal Paskah dihitung pakai algoritma standar (Meeus/Jones/Butcher).
 *
 * Catatan: beberapa perayaan (Epifani, Kenaikan, Tubuh & Darah Kristus) di sejumlah
 * keuskupan dipindah ke hari Minggu terdekat sesuai ketentuan setempat. Tanggal di sini
 * adalah tanggal liturgi standar; sesuaikan manual lewat fitur "Tambah Jadwal" kalau
 * keuskupan/paroki kamu memindahkannya.
 */

/** Hitung tanggal Hari Raya Paskah untuk tahun tertentu (algoritma Meeus/Jones/Butcher) */
function getEasterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = Maret, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

/** Minggu Adven Pertama: hari Minggu terdekat dengan 30 November */
function getFirstAdventSunday(year) {
  for (let day = 27; day <= 30; day++) {
    const d = new Date(Date.UTC(year, 10, day)); // November
    if (d.getUTCDay() === 0) return d;
  }
  for (let day = 1; day <= 3; day++) {
    const d = new Date(Date.UTC(year, 11, day)); // Desember
    if (d.getUTCDay() === 0) return d;
  }
  return new Date(Date.UTC(year, 10, 30));
}

/** Kembalikan daftar hari raya/perayaan sepanjang tahun tertentu, terurut tanggal */
function getFeastDays(year) {
  const easter = getEasterDate(year);
  const feasts = [];

  const addFixed = (month, day, name) => feasts.push({ date: new Date(Date.UTC(year, month - 1, day)), name });
  const addRelative = (offsetDays, name) => feasts.push({ date: addDays(easter, offsetDays), name });

  // ---- Tanggal tetap ----
  addFixed(1, 1, 'Santa Maria Bunda Allah (Tahun Baru)');
  addFixed(1, 6, 'Hari Raya Penampakan Tuhan (Epifani)');
  addFixed(2, 2, 'Yesus Dipersembahkan di Kenisah');
  addFixed(3, 19, 'Santo Yosef');
  addFixed(3, 25, 'Kabar Sukacita');
  addFixed(5, 1, 'Santo Yusuf Pekerja');
  addFixed(8, 15, 'Santa Perawan Maria Diangkat ke Surga');
  addFixed(9, 8, 'Kelahiran Santa Perawan Maria');
  addFixed(11, 1, 'Hari Raya Semua Orang Kudus');
  addFixed(11, 2, 'Peringatan Arwah Semua Orang Beriman');
  addFixed(12, 8, 'Santa Perawan Maria Dikandung Tanpa Noda');
  addFixed(12, 24, 'Malam Natal');
  addFixed(12, 25, 'Hari Raya Natal');
  addFixed(12, 31, 'Malam Tahun Baru');

  // ---- Tanggal bergerak (dihitung dari Paskah) ----
  addRelative(-46, 'Rabu Abu (awal Masa Prapaskah)');
  addRelative(-7, 'Minggu Palma');
  addRelative(-3, 'Kamis Putih');
  addRelative(-2, 'Jumat Agung');
  addRelative(-1, 'Sabtu Suci / Malam Paskah');
  addRelative(0, 'Hari Raya Paskah');
  addRelative(39, 'Kenaikan Tuhan');
  addRelative(49, 'Hari Raya Pentakosta');
  addRelative(56, 'Hari Raya Tritunggal Mahakudus');
  addRelative(60, 'Hari Raya Tubuh dan Darah Kristus');

  feasts.push({ date: getFirstAdventSunday(year), name: 'Hari Minggu Adven Pertama' });

  return feasts.sort((a, b) => a.date - b.date);
}

module.exports = { getEasterDate, getFeastDays };
