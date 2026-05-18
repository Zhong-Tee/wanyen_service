-- Task jobs
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all jobs" ON jobs FOR ALL USING (true) WITH CHECK (true);

-- Job images
CREATE TABLE job_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE job_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all job_images" ON job_images FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created_at ON jobs(created_at);
CREATE INDEX idx_job_images_job ON job_images(job_id);
