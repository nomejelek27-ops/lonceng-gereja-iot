/**
 * scheduleConfig.js
 * Jadwal tetap pembunyian lonceng Gereja Santa Maria Ratu Oeolo.
 * Ubah di sini jika jadwal berubah di kemudian hari.
 */

const JADWAL_HARIAN = [
  { time: '06:00', label: 'Doa Angelus' },
  { time: '12:00', label: 'Doa Angelus' },
  { time: '15:00', label: 'Doa Kerahiman Ilahi' },
  { time: '18:00', label: 'Doa Angelus' },
];

const JADWAL_MINGGU = [
  { time: '06:00', label: 'Lonceng pertama (Angelus)' },
  { time: '06:30', label: 'Lonceng kedua' },
  { time: '07:00', label: 'Lonceng ketiga (misa dimulai)' },
  { time: '12:00', label: 'Doa Angelus' },
  { time: '15:00', label: 'Doa Kerahiman Ilahi' },
  { time: '18:00', label: 'Doa Angelus' },
];

/** 0 = Minggu, 1 = Senin, ..., 6 = Sabtu (sesuai Date.getDay() di JS) */
function getScheduleForDay(dayIndex) {
  return dayIndex === 0 ? JADWAL_MINGGU : JADWAL_HARIAN;
}

module.exports = { JADWAL_HARIAN, JADWAL_MINGGU, getScheduleForDay };
