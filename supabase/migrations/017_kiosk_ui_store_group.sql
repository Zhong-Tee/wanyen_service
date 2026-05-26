-- ============================================================
-- Migration 017: UI options per store group
-- ============================================================

alter table kiosk_ui_options
  add column if not exists store_group_id uuid references store_groups(id) on delete restrict;

update kiosk_ui_options
set store_group_id = (select id from store_groups order by name limit 1)
where store_group_id is null
  and exists (select 1 from store_groups limit 1);

alter table kiosk_ui_options
  alter column store_group_id set not null;

alter table kiosk_ui_options drop constraint if exists kiosk_ui_options_name_unique;

alter table kiosk_ui_options
  add constraint kiosk_ui_options_store_group_name_unique unique (store_group_id, name);

create index if not exists idx_kiosk_ui_options_store_group
  on kiosk_ui_options (store_group_id, is_active, sort_order, name);
