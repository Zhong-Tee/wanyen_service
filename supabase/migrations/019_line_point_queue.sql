-- LINE OA Plus — คิวเพิ่มพอยท์ (นำเข้าผ่าน Excel bulk upload)
create table if not exists line_point_queue (
  id            uuid primary key default gen_random_uuid(),
  billing_id    text not null unique,
  phone         text not null,
  amount_baht   numeric(12, 2) not null check (amount_baht > 0),
  branch_name   text not null default 'ช่องทางออนไลน์',
  status        text not null default 'pending'
    check (status in ('pending', 'exported', 'uploaded', 'success', 'failed')),
  batch_id      uuid,
  error_message text,
  created_at    timestamptz not null default now(),
  exported_at   timestamptz,
  processed_at  timestamptz
);

create index if not exists idx_line_point_queue_status
  on line_point_queue (status, created_at desc);

create index if not exists idx_line_point_queue_batch
  on line_point_queue (batch_id)
  where batch_id is not null;

alter table line_point_queue enable row level security;

create policy "allow all line_point_queue"
  on line_point_queue for all using (true) with check (true);

comment on table line_point_queue is
  'คิวเพิ่มพอยท์ LINE OA Plus — billing_id = หมายเลขรายการใน CRM';
