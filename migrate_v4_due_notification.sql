-- migrate_v4_due_notification.sql
-- Jalankan file ini SEKALI SAJA kalau database lonceng_gereja kamu sudah ada
-- sebelumnya (sebelum fitur notifikasi kedua "tepat pada jamnya" ditambahkan).
--
-- Kalau baru pertama kali install, TIDAK PERLU menjalankan file ini —
-- cukup jalankan schema.sql saja, karena sudah termasuk kolom ini dari awal.

USE lonceng_gereja;

ALTER TABLE schedule_items
  ADD COLUMN due_notified TINYINT(1) NOT NULL DEFAULT 0 AFTER source;
