-- schema_cloud.sql
-- Versi schema.sql khusus untuk database CLOUD (misalnya Aiven), yang biasanya
-- sudah menyediakan satu database jadi (contoh: "defaultdb") dan tidak
-- mengizinkan akun gratis membuat database baru sendiri.
--
-- Jalankan file ini di dalam database yang SUDAH ADA itu (bukan bikin
-- database baru bernama lonceng_gereja). Untuk pemasangan lokal (XAMPP),
-- tetap pakai schema.sql biasa, BUKAN file ini.

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(50) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL
);

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

CREATE TABLE IF NOT EXISTS logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(100) NOT NULL,
  schedule_id VARCHAR(30) NULL,
  ringed_at DATETIME NOT NULL,
  INDEX idx_ringed_at (ringed_at)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  endpoint VARCHAR(500) CHARACTER SET ascii NOT NULL UNIQUE,
  subscription_json TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO users (username, password) VALUES ('petugas', 'gereja123');
