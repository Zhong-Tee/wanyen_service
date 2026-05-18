# Wanyen Service Code Manager

เว็บแอพสำหรับจัดการและคัดลอกรหัสโค้ด 6 หลัก พร้อมระบบ Import จาก Excel

---

## Tech Stack

- **Frontend**: React 18 + Vite + TypeScript
- **Styling**: Tailwind CSS v3
- **Database**: Supabase (PostgreSQL)
- **Excel Parser**: xlsx
- **Deploy**: Vercel

---

## ฟีเจอร์หลัก

| ฟีเจอร์ | รายละเอียด |
|---|---|
| ออกโค้ด | เลือกประเภท → เลือกจำนวน → คัดลอกได้เลย |
| Template อัตโนมัติ | ข้อความพร้อมส่งลูกค้า สร้างอัตโนมัติ |
| Multi-copy | คัดลอกหลายโค้ดในครั้งเดียว |
| Import Excel | อ่าน .xlsx/.xls ป้องกันโค้ดซ้ำ |
| Mobile Ready | ใช้งานได้ทั้งคอมและมือถือ |

---

## ขั้นตอนการติดตั้ง

### 1. Clone / Download โปรเจกต์

```bash
git clone <your-repo-url>
cd wanyen-service
```

### 2. ติดตั้ง Dependencies

```bash
npm install
```

### 3. ตั้งค่า Supabase Environment Variables

```bash
# คัดลอกไฟล์ตัวอย่าง
cp .env.example .env
```

แก้ไขไฟล์ `.env`:

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> ดูค่าเหล่านี้ได้จาก: [Supabase Dashboard](https://app.supabase.com) → เลือก Project → Settings → API

### 4. สร้างฐานข้อมูล Supabase

ไปที่ **Supabase Dashboard → SQL Editor** แล้วรัน SQL ต่อไปนี้:

```sql
-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Table: code_categories
create table if not exists code_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null,
  created_at  timestamp with time zone default now()
);

-- Table: codes
create table if not exists codes (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid references code_categories(id) on delete cascade not null,
  code        text not null,
  status      text not null default 'available' check (status in ('available', 'used')),
  used_at     timestamp with time zone,
  created_at  timestamp with time zone default now(),
  unique (category_id, code)
);

-- Indexes
create index if not exists idx_codes_category_status
  on codes (category_id, status);

-- RLS Policies
alter table code_categories enable row level security;
alter table codes enable row level security;

create policy "Allow all on code_categories"
  on code_categories for all using (true) with check (true);

create policy "Allow all on codes"
  on codes for all using (true) with check (true);
```

> หรือใช้ไฟล์ `supabase/migrations/001_init.sql` ที่เตรียมไว้แล้ว

### 5. รันโปรเจกต์ (Local)

```bash
npm run dev
```

เปิดเบราว์เซอร์ที่ `http://localhost:5173`

---

## วิธี Deploy บน Vercel

### วิธีที่ 1: Deploy ผ่าน Vercel CLI

```bash
npm install -g vercel
vercel
```

### วิธีที่ 2: Deploy ผ่าน Vercel Dashboard

1. Push โค้ดขึ้น GitHub/GitLab
2. ไปที่ [vercel.com](https://vercel.com) → New Project
3. Import repository
4. ตั้งค่า **Environment Variables**:
   - `VITE_SUPABASE_URL` = URL ของ Supabase project
   - `VITE_SUPABASE_ANON_KEY` = Anon key ของ Supabase project
5. กด **Deploy**

> Vercel จะ build โดยใช้ `npm run build` และ serve จาก `dist/` โดยอัตโนมัติ

---

## โครงสร้างโปรเจกต์

```
src/
├── components/
│   ├── Layout.tsx       # Navigation + Mobile bottom bar
│   └── Toast.tsx        # Toast notifications
├── pages/
│   ├── IssueCode.tsx    # หน้าออกโค้ด
│   └── Settings.tsx     # หน้าตั้งค่า + Import Excel
├── lib/
│   ├── supabase.ts      # Supabase client
│   └── excel.ts         # Excel parser
├── hooks/
│   ├── useCategories.ts # CRUD ประเภทโค้ด
│   └── useCodes.ts      # คัดลอกโค้ด + Import
├── types/
│   └── index.ts         # TypeScript types
├── App.tsx
└── main.tsx
```

---

## การใช้งาน Import Excel

1. ไปที่เมนู **ตั้งค่า**
2. สร้างประเภทโค้ด (เช่น B2S, Moshi, WY)
3. เลือกประเภทโค้ด
4. กดเลือกไฟล์ Excel (.xlsx หรือ .xls)
5. ระบบจะค้นหาโค้ด 6 หลักโดยอัตโนมัติจากทุก cell
6. ยืนยันการนำเข้า
7. ดูสรุปผลการนำเข้า

---

## License

MIT
