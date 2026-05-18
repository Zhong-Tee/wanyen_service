-- Allow duplicate products per branch (show as separate rows)
ALTER TABLE branch_stock DROP CONSTRAINT IF EXISTS branch_stock_branch_id_product_id_key;
