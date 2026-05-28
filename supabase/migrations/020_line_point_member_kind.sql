-- รองรับค้นหาสมาชิกด้วยชื่อไลน์ / ID นอกจากเบอร์โทร
alter table line_point_queue
  add column if not exists member_kind text not null default 'phone'
    check (member_kind in ('phone', 'line'));

comment on column line_point_queue.phone is
  'ค่าค้นหาสมาชิก — เบอร์ 10 หลัก หรือชื่อไลน์/ID (คอลัมน์ Phone Number ใน Excel)';
comment on column line_point_queue.member_kind is
  'phone = เบอร์โทร, line = ชื่อไลน์หรือ LINE ID';
