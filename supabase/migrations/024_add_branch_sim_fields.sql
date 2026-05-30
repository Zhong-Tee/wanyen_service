-- ============================================================
-- Migration 024: เพิ่มข้อมูล Kiosk SIM ในตาราง branches
-- ============================================================

ALTER TABLE branches ADD COLUMN IF NOT EXISTS kiosk_sim_phone text;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS sim_code text;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS sim_expiry_date date;
