-- ============================================================
-- Migration 012: เพิ่ม rent และ gp_percent ในตาราง branches
-- รันใน Supabase SQL Editor
-- ============================================================

ALTER TABLE branches ADD COLUMN IF NOT EXISTS rent numeric(12,2);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS gp_percent numeric(5,2);
