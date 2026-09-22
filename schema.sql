-- schema.sql
-- Skema database untuk Sistem Kendali & Penjadwalan Lonceng Gereja
-- Jalankan file ini di MySQL sebelum menjalankan server (lihat README).

CREATE DATABASE IF NOT EXISTS lonceng_gereja
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE lonceng_gereja;

-- Akun petugas yang bisa login ke web
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL
);

-- Pengaturan sistem, termasuk device_api_key untuk ESP32
CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(50) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL
);

-- Jadwal harian hasil Priority Queue (satu baris per item jadwal per tanggal)
CREATE TABLE IF NOT EXISTS schedule_items (
  id VARCHAR(30) PRIMARY KEY,
  item_date DATE NOT NULL,
  ring_time VARCHAR(5) NOT NULL,
  label VARCHAR(100) NOT NULL,
  priority INT NOT NULL,
  status ENUM('pending', 'notified', 'ringing', 'rung') NOT NULL DEFAULT 'pending',
  ringed_at DATETIME NULL,
  source ENUM('default', 'custom') NOT NULL DEFAULT 'default',
  due_notified TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_item_date (item_date),
  INDEX idx_priority (priority)
);

-- Riwayat setiap kali lonceng benar-benar dibunyikan (dilaporkan oleh ESP32)
CREATE TABLE IF NOT EXISTS logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(100) NOT NULL,
  schedule_id VARCHAR(30) NULL,
  ringed_at DATETIME NOT NULL,
  INDEX idx_ringed_at (ringed_at)
);

-- Langganan Web Push Notification (satu baris per browser/perangkat yang mengizinkan notifikasi)
-- Kolom endpoint sengaja dibuat CHARACTER SET ascii (bukan ikut utf8mb4 punya database) karena isinya
-- selalu berupa URL (aman hanya karakter ASCII), supaya unique index-nya tidak melebihi batas 767 byte
-- yang berlaku di banyak instalasi MySQL/MariaDB (termasuk XAMPP default).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  endpoint VARCHAR(500) CHARACTER SET ascii NOT NULL UNIQUE,
  subscription_json TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Akun petugas default (ganti passwordnya setelah login pertama! lihat README)
INSERT IGNORE INTO users (username, password) VALUES ('petugas', 'gereja123');
