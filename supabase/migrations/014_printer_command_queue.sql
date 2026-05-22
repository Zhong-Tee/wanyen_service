-- ============================================================
-- Migration 014: Printer Command Queue (160 สาขา + Telegram hub)
-- รันใน Supabase SQL Editor
-- Hub รับคำสั่งจาก Telegram → insert คิว → สาขาดึงไปทำ
-- ============================================================

create table if not exists printer_command_queue (
  id           bigserial     primary key,
  branch_id    text          not null,
  command      text          not null,
  args         jsonb         not null default '[]',
  status       text          not null default 'pending',
  chat_id      text,
  error_msg    text,
  created_at   timestamptz   not null default now(),
  processed_at timestamptz
);

create index if not exists idx_printer_cmd_queue_pending
  on printer_command_queue (branch_id, created_at)
  where status = 'pending';

alter table printer_command_queue enable row level security;

create policy "Allow all on printer_command_queue"
  on printer_command_queue
  for all
  using (true)
  with check (true);

-- ลบคิวเก่า (>7 วัน) ทุกวัน
create or replace function cleanup_printer_command_queue()
returns void
language plpgsql as $$
begin
  delete from printer_command_queue
  where created_at < now() - interval '7 days';
end;
$$;

select cron.schedule(
  'cleanup-printer-command-queue-daily',
  '15 3 * * *',
  'select cleanup_printer_command_queue()'
);

comment on table printer_command_queue is
  'คิวคำสั่ง Telegram สำหรับ printer_monitor — hub insert, สาขา poll แล้ว execute';
