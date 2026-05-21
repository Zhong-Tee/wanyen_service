-- ============================================================
-- Migration 011: Daily Sales Report Table
-- รันใน Supabase SQL Editor
-- ============================================================

-- ตารางเก็บรายงานยอดขายประจำวัน
create table if not exists daily_sales_report (
  id              uuid        primary key default gen_random_uuid(),
  report_date     date        not null,

  -- ── ข้อมูลสาขา ──────────────────────────────────────────
  branch_code     text,
  branch_name     text,

  -- ── ข้อมูลการขาย ────────────────────────────────────────
  transaction_no  text,
  sale_date       text,       -- วันที่จากไฟล์ (text เผื่อรูปแบบต่างกัน)
  sale_time       text,       -- เวลา
  sale_datetime   text,       -- วันที่ + เวลา รวมกัน (ถ้ามี)

  -- ── ข้อมูลสินค้า ────────────────────────────────────────
  product_code    text,
  product_name    text,
  category        text,

  -- ── จำนวน / ราคา ────────────────────────────────────────
  quantity        numeric(12, 3),
  unit_price      numeric(12, 2),
  discount        numeric(12, 2),
  total_amount    numeric(12, 2),
  payment_amount  numeric(12, 2),
  payment_method  text,

  -- ── เก็บข้อมูลดิบทุกคอลัมน์ (JSON) ─────────────────────
  -- ใช้ query ข้อมูลที่ยังไม่ได้ map เช่น:
  --   select raw_data->>'ชื่อคอลัมน์' from daily_sales_report
  raw_data        jsonb,

  -- ── Metadata ────────────────────────────────────────────
  imported_at     timestamp with time zone default now()
);

-- ── Indexes ────────────────────────────────────────────────
create index if not exists idx_dsr_report_date
  on daily_sales_report (report_date desc);

create index if not exists idx_dsr_branch
  on daily_sales_report (branch_name);

create index if not exists idx_dsr_product
  on daily_sales_report (product_code);

create index if not exists idx_dsr_raw_data
  on daily_sales_report using gin (raw_data);

-- ── Row Level Security ─────────────────────────────────────
alter table daily_sales_report enable row level security;

create policy "Allow all on daily_sales_report"
  on daily_sales_report
  for all
  using (true)
  with check (true);

-- ── View: สรุปยอดขายรายวัน ─────────────────────────────────
create or replace view daily_sales_summary as
select
  report_date,
  branch_name,
  count(*)                          as row_count,
  sum(quantity)                     as total_qty,
  sum(total_amount)                 as total_sales,
  max(imported_at)                  as last_imported
from daily_sales_report
group by report_date, branch_name
order by report_date desc, branch_name;

-- ── Comment ────────────────────────────────────────────────
comment on table daily_sales_report is
  'รายงานยอดขายประจำวัน – import จาก wanyenreport.py';
comment on column daily_sales_report.raw_data is
  'ข้อมูลดิบทุกคอลัมน์จากไฟล์ Excel (key = ชื่อคอลัมน์เดิม)';
comment on column daily_sales_report.report_date is
  'วันที่ของรายงาน (เมื่อวาน) – ใช้สำหรับ filter และลบข้อมูลซ้ำ';
