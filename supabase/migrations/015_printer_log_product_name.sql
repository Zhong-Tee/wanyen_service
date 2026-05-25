-- Migration 015: ผูกปริ้นเตอร์กับชื่อสินค้า (สำหรับ PT ต่อสินค้าใน Service Report)
alter table printer_log
  add column if not exists product_name text;

-- CREATE OR REPLACE ไม่รองรับการแทรกคอลumnกลาง view — ต้อง drop แล้วสร้างใหม่
drop view if exists printer_latest_status;

create view printer_latest_status as
select distinct on (branch_id, printer_id)
  id, branch_id, branch_name, printer_id, printer_name, printer_ip,
  status, page_count, alert_msg, event, stock_remaining, product_name, timestamp
from printer_log
order by branch_id, printer_id, timestamp desc;

comment on column printer_log.product_name is
  'ชื่อสินค้าที่ปริ้นเตอร์นี้พิมพ์ — ต้องตรงกับ products.name ในระบบ (ตั้งใน config.json)';

comment on view printer_latest_status is
  'สถานะล่าสุดของแต่ละปริ้นเตอร์ (DISTINCT ON branch_id, printer_id ORDER BY timestamp DESC)';
