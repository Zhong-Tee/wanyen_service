-- ============================================================
-- Migration 023: App settings — stock notification template
-- ============================================================

create table if not exists app_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz default now()
);

alter table app_settings enable row level security;

create policy "Allow all on app_settings"
  on app_settings
  for all
  using (true)
  with check (true);

insert into app_settings (key, value)
values ('stock_notification_template', '{{PRODUCT}}' || E'\n' || 'จำนวน {{QUANTITY}} แผ่น')
on conflict (key) do nothing;
