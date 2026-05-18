-- ============================================================
-- Wanyen Service Code Manager - Database Migration
-- Run this SQL in your Supabase SQL Editor
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- Table: code_categories
-- ============================================================
create table if not exists code_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null,
  created_at  timestamp with time zone default now()
);

-- ============================================================
-- Table: codes
-- ============================================================
create table if not exists codes (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid references code_categories(id) on delete cascade not null,
  code        text not null,
  status      text not null default 'available' check (status in ('available', 'used')),
  used_at     timestamp with time zone,
  created_at  timestamp with time zone default now(),
  unique (category_id, code)
);

-- ============================================================
-- Indexes for performance
-- ============================================================
create index if not exists idx_codes_category_status
  on codes (category_id, status);

create index if not exists idx_codes_category_id
  on codes (category_id);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
-- Enable RLS on both tables
alter table code_categories enable row level security;
alter table codes enable row level security;

-- Allow all operations for authenticated users (adjust as needed)
-- If you want public access (no auth), use the policies below:

-- code_categories: allow all (anon + authenticated)
create policy "Allow all on code_categories"
  on code_categories
  for all
  using (true)
  with check (true);

-- codes: allow all (anon + authenticated)
create policy "Allow all on codes"
  on codes
  for all
  using (true)
  with check (true);
