-- Enable realtime for service alert badge (branch_stock + daily_sales_report)
alter publication supabase_realtime add table public.branch_stock;
alter publication supabase_realtime add table public.daily_sales_report;
