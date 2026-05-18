-- Store groups (e.g. B2S, Moshi, WY)
CREATE TABLE store_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE store_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all store_groups" ON store_groups FOR ALL USING (true) WITH CHECK (true);

-- Branches
CREATE TABLE branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_group_id uuid REFERENCES store_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  phone text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all branches" ON branches FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_branches_store_group ON branches(store_group_id);
