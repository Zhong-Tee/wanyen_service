-- Enable realtime for Printer menu badge (problem + monitor offline counts)
alter publication supabase_realtime add table public.printer_log;
