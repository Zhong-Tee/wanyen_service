-- Delivery records
CREATE TABLE deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_branch_id uuid REFERENCES branches(id),
  tracking_number text,
  status text DEFAULT 'ต้องจัดส่ง' CHECK (status IN ('ต้องจัดส่ง', 'จัดส่งแล้ว', 'ได้รับแล้ว')),
  notes text,
  created_at timestamptz DEFAULT now(),
  shipped_at timestamptz,
  received_at timestamptz
);

ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all deliveries" ON deliveries FOR ALL USING (true) WITH CHECK (true);

-- Delivery line items
CREATE TABLE delivery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid REFERENCES deliveries(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  quantity integer NOT NULL DEFAULT 1
);

ALTER TABLE delivery_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all delivery_items" ON delivery_items FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_deliveries_status ON deliveries(status);
CREATE INDEX idx_deliveries_branch ON deliveries(to_branch_id);
CREATE INDEX idx_delivery_items_delivery ON delivery_items(delivery_id);
