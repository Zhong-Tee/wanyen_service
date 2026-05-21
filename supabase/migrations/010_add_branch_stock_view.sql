-- ============================================================
-- Migration 010: Create branch_stock_view joining
--   branch_stock + branches + products
-- Run this in Supabase SQL Editor AFTER 009_add_branch_is_active.sql
-- ============================================================

create or replace view branch_stock_view as
select
  bs.id,
  bs.branch_id,
  b.name   as branch_name,
  bs.product_id,
  p.name   as product_name,
  bs.status,
  bs.quantity,
  bs.updated_at
from branch_stock bs
join branches b on b.id = bs.branch_id
join products p  on p.id = bs.product_id;
