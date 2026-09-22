-- migrate_v2_custom_schedule.sql
-- Jalankan file ini SEKALI SAJA kalau database lonceng_gereja kamu sudah ada
-- sebelumnya (dibuat pakai versi schema.sql yang lama, sebelum fitur
-- Tambah Jadwal & Kalender Perayaan ditambahkan).
--
-- Kalau kamu baru pertama kali install (belum pernah punya database ini),
-- TIDAK PERLU menjalankan file ini — cukup jalankan schema.sql saja, karena
-- schema.sql yang baru sudah termasuk kolom ini dari awal.

USE lonceng_gereja;

ALTER TABLE schedule_items
  ADD COLUMN source ENUM('default', 'custom') NOT NULL DEFAULT 'default' AFTER ringed_at;
