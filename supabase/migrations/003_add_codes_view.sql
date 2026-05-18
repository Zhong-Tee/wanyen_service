-- ============================================================
-- Migration 003: Create codes_view joining codes + code_categories
-- Run this in Supabase SQL Editor AFTER 002_add_template.sql
-- ============================================================

create or replace view codes_view as
select
  c.id,
  c.category_id,
  cc.name   as category_name,
  c.code,
  c.status,
  c.used_at,
  c.created_at
from codes c
join code_categories cc on cc.id = c.category_id;
