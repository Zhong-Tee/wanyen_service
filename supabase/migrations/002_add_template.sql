-- ============================================================
-- Migration 002: Add template column to code_categories
-- Run this in Supabase SQL Editor AFTER 001_init.sql
-- ============================================================

alter table code_categories
  add column if not exists template text;
