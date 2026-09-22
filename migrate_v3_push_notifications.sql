-- migrate_v3_push_notifications.sql
-- Jalankan file ini SEKALI SAJA kalau database lonceng_gereja kamu sudah ada
-- sebelumnya (dibuat sebelum fitur Web Push Notification ditambahkan).
--
-- Kalau kamu baru pertama kali install (belum pernah punya database ini),
-- TIDAK PERLU menjalankan file ini — cukup jalankan schema.sql saja, karena
-- schema.sql yang baru sudah termasuk tabel ini dari awal.

USE lonceng_gereja;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  endpoint VARCHAR(500) CHARACTER SET ascii NOT NULL UNIQUE,
  subscription_json TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
