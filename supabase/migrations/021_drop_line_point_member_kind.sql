-- ยกเลิก member_kind — นำเข้า Excel รองรับเฉพาะเบอร์โทร
alter table line_point_queue drop column if exists member_kind;

comment on column line_point_queue.phone is
  'เบอร์โทร 10 หลัก (คอลัมน์ Phone Number ใน Excel)';
