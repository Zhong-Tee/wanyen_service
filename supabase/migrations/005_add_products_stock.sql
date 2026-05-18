-- Products master catalog
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  image_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all products" ON products FOR ALL USING (true) WITH CHECK (true);

-- Branch stock (inventory per branch)
CREATE TABLE branch_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  status text DEFAULT 'เก็บ' CHECK (status IN ('กำลังใช้', 'เก็บ', 'หมด')),
  quantity integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (branch_id, product_id)
);

ALTER TABLE branch_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all branch_stock" ON branch_stock FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_branch_stock_branch ON branch_stock(branch_id);
CREATE INDEX idx_branch_stock_product ON branch_stock(product_id);
CREATE INDEX idx_branch_stock_status ON branch_stock(status);
