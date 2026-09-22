/**
 * db.js
 * Connection pool ke MySQL. Konfigurasi diambil dari file .env
 * (lihat .env.example untuk contoh).
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'lonceng_gereja',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // supaya kolom DATE/DATETIME dikembalikan sebagai string, bukan objek Date bermasalah zona waktu
  // Database cloud (Aiven, PlanetScale, dll) umumnya WAJIB koneksi terenkripsi (SSL).
  // Set DB_SSL=true di .env untuk mengaktifkan ini. MySQL lokal (XAMPP) tidak perlu ini.
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

module.exports = pool;

