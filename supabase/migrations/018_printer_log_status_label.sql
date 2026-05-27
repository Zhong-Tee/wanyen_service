-- Migration 018: ชื่อสถานะจากหน้าเว็บปริ้นเตอร์ (Ready, Carriage Open, ...)
alter table printer_log
  add column if not exists status_label text;

drop view if exists printer_latest_status;

create view printer_latest_status as
select distinct on (branch_id, printer_id)
  id, branch_id, branch_name, printer_id, printer_name, printer_ip,
  status, status_label, page_count, alert_msg, event, stock_remaining,
  product_name, timestamp
from printer_log
order by branch_id, printer_id, timestamp desc;

comment on column printer_log.status_label is
  'ข้อความสถานะจากปริ้นเตอร์ เช่น Ready, Carriage Open, Paper Out';
