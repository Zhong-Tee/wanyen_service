-- ============================================================
-- Migration 016: Kiosk UI options + change history
-- ============================================================

create table if not exists kiosk_ui_options (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  sort_order  integer     not null default 0,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  constraint kiosk_ui_options_name_unique unique (name)
);

create index if not exists idx_kiosk_ui_options_active_sort
  on kiosk_ui_options (is_active, sort_order, name);

alter table kiosk_ui_options enable row level security;

create policy "Allow all on kiosk_ui_options"
  on kiosk_ui_options
  for all
  using (true)
  with check (true);

-- ── UI change log (successful changes only) ─────────────────────────────────

create table if not exists ui_change_log (
  id              uuid        primary key default gen_random_uuid(),
  branch_id       uuid        not null references branches(id) on delete cascade,
  branch_name     text        not null,
  store_group_id  uuid        not null references store_groups(id) on delete restrict,
  ui_name         text        not null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_ui_change_log_created_at
  on ui_change_log (created_at desc);

create index if not exists idx_ui_change_log_store_group_created
  on ui_change_log (store_group_id, created_at desc);

alter table ui_change_log enable row level security;

create policy "Allow all on ui_change_log"
  on ui_change_log
  for all
  using (true)
  with check (true);

comment on table kiosk_ui_options is
  'รายชื่อโฟลเดอร์ UI สำหรับคำสั่ง changeui — ชื่อต้องตรงกับโฟลเดอร์ย่อยใน ui_rebuild_dir';

comment on table ui_change_log is
  'ประวัติการเปลี่ยน UI สำเร็จเท่านั้น';
