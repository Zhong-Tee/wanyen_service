-- ============================================================
-- Migration 013: Printer Log Table + Auto Cleanup (3 วัน)
-- รันใน Supabase SQL Editor
-- ⚠️ ต้องเปิด pg_cron extension ใน Supabase Dashboard ก่อน
--    Database → Extensions → pg_cron → Enable
-- ============================================================

-- ตารางเก็บ log สถานะปริ้นเตอร์แต่ละสาขา
create table if not exists printer_log (
  id              bigserial         primary key,
  branch_id       text,
  branch_name     text,
  printer_id      text,
  printer_name    text,
  printer_ip      text,
  status          text,             -- online | printing | offline | paper_out | ribbon_out | error
  page_count      bigint,
  alert_msg       text,
  event           text,             -- routine | error | recovered
  stock_remaining integer,
  timestamp       timestamptz       not null default now()
);

-- ── Indexes ─────────────────────────────────────────────────
create index if not exists idx_printer_log_printer_id
  on printer_log (printer_id);

create index if not exists idx_printer_log_timestamp
  on printer_log (timestamp desc);

create index if not exists idx_printer_log_branch_id
  on printer_log (branch_id);

create index if not exists idx_printer_log_status
  on printer_log (status);

-- ── View: สถานะล่าสุดของแต่ละเครื่อง ──────────────────────
create or replace view printer_latest_status as
select distinct on (branch_id, printer_id)
  id, branch_id, branch_name, printer_id, printer_name, printer_ip,
  status, page_count, alert_msg, event, stock_remaining, timestamp
from printer_log
order by branch_id, printer_id, timestamp desc;

-- ── Row Level Security ──────────────────────────────────────
alter table printer_log enable row level security;

create policy "Allow all on printer_log"
  on printer_log
  for all
  using (true)
  with check (true);

-- ── pg_cron: ลบข้อมูลเก่าทุกวัน เก็บแค่ 3 วัน ─────────────
create extension if not exists pg_cron;

create or replace function cleanup_printer_log()
returns void
language plpgsql as $$
begin
  delete from printer_log
  where timestamp < now() - interval '3 days';
end;
$$;

select cron.schedule(
  'cleanup-printer-log-daily',
  '0 3 * * *',
  'select cleanup_printer_log()'
);

-- ── Comments ─────────────────────────────────────────────────
comment on table printer_log is
  'Log สถานะปริ้นเตอร์ TSC T300A แต่ละสาขา – บันทึกจาก printer_monitor.py';

comment on view printer_latest_status is
  'สถานะล่าสุดของแต่ละปริ้นเตอร์ (DISTINCT ON printer_id ORDER BY timestamp DESC)';
