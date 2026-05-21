#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
wanyenreport.py
ดาวน์โหลดรายงานยอดขายประจำวันจาก Wanyen web system และอัพโหลดเข้า Supabase

วิธีติดตั้ง:
    pip install -r requirements.txt
    playwright install chromium

วิธีใช้:
    python wanyenreport.py                        # ดาวน์โหลดรายงาน เมื่อวาน
    python wanyenreport.py -d 2025-05-20          # ระบุวันที่
    python wanyenreport.py -o D:/Reports          # ระบุ folder เก็บไฟล์
    python wanyenreport.py --no-upload            # ดาวน์โหลดอย่างเดียว
    python wanyenreport.py --visible              # เปิด browser แบบเห็นหน้าจอ (debug)
    python wanyenreport.py --inspect              # ตรวจสอบโครงสร้างหน้าเว็บ
"""

import os
import sys
import asyncio
import argparse
import re
from datetime import datetime, timedelta
from pathlib import Path

# ---------------------------------------------------------------------------
# Dependency check
# ---------------------------------------------------------------------------
def _check_deps():
    missing = []
    for pkg in ["playwright", "pandas", "openpyxl", "dotenv", "supabase"]:
        try:
            __import__(pkg if pkg != "dotenv" else "dotenv")
        except ImportError:
            missing.append(pkg)
    if missing:
        print(f"[!] กรุณาติดตั้ง dependencies ก่อน:\n    pip install -r requirements.txt")
        sys.exit(1)

_check_deps()

import pandas as pd
from dotenv import load_dotenv, find_dotenv

# หา .env ในโฟลเดอร์ปัจจุบันและ parent ขึ้นไป
load_dotenv(find_dotenv(usecwd=True) or find_dotenv())

# ===========================================================================
# Config
# ===========================================================================
BASE_URL   = "http://45.154.25.199/webwanyen"
LOGIN_URL  = f"{BASE_URL}/login"
REPORT_URL = f"{BASE_URL}/frmReport"
TABLE_NAME = "daily_sales_report"

WEB_USER = os.getenv("WEB_USERNAME", "admin")
WEB_PASS = os.getenv("WEB_PASSWORD", "WY@2604")

# Map ชื่อคอลัมน์ภาษาไทย/ย่อ → ชื่อ field ใน database
COLUMN_MAP: dict[str, str] = {
    # วันที่ / เวลา
    "วันที่":           "sale_date",
    "date":             "sale_date",
    "เวลา":             "sale_time",
    "time":             "sale_time",
    "วันที่เวลา":       "sale_datetime",
    "datetime":         "sale_datetime",

    # สาขา
    "สาขา":             "branch_name",
    "branch":           "branch_name",
    "ชื่อสาขา":         "branch_name",
    "รหัสสาขา":         "branch_code",
    "branchcode":       "branch_code",
    "branchid":         "branch_code",

    # รายการ / สินค้า
    "เลขที่":           "transaction_no",
    "เลขที่ใบเสร็จ":    "transaction_no",
    "transactionno":    "transaction_no",
    "billno":           "transaction_no",
    "receiptno":        "transaction_no",
    "รหัสสินค้า":       "product_code",
    "productcode":      "product_code",
    "itemcode":         "product_code",
    "ชื่อสินค้า":       "product_name",
    "productname":      "product_name",
    "itemname":         "product_name",
    "สินค้า":           "product_name",
    "ประเภท":           "category",
    "หมวดหมู่":         "category",
    "category":         "category",

    # จำนวน / ราคา
    "จำนวน":            "quantity",
    "qty":              "quantity",
    "quantity":         "quantity",
    "ราคา":             "unit_price",
    "ราคาต่อหน่วย":     "unit_price",
    "unitprice":        "unit_price",
    "price":            "unit_price",
    "ส่วนลด":           "discount",
    "discount":         "discount",
    "ยอดรวม":           "total_amount",
    "ยอดขาย":           "total_amount",
    "totalamount":      "total_amount",
    "total":            "total_amount",
    "amount":           "total_amount",
    "ยอดชำระ":          "payment_amount",
    "ชำระเงิน":         "payment_amount",
    "paymentamount":    "payment_amount",

    # ช่องทางชำระ
    "ช่องทางชำระ":      "payment_method",
    "วิธีชำระ":         "payment_method",
    "paymentmethod":    "payment_method",
    "payment":          "payment_method",
    "paytype":          "payment_method",
}

# ===========================================================================
# Argument Parser
# ===========================================================================
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="ดาวน์โหลดรายงานยอดขายและอัพโหลดเข้า Supabase",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
ตัวอย่างการใช้งาน:
  python wanyenreport.py                         ดาวน์โหลดรายงาน เมื่อวาน
  python wanyenreport.py -d 2025-05-20           ระบุวันที่
  python wanyenreport.py -o D:/Reports           ระบุ folder เก็บไฟล์
  python wanyenreport.py --no-upload             ดาวน์โหลดอย่างเดียว ไม่อัพ Supabase
  python wanyenreport.py --visible               เปิด browser แบบเห็นหน้าจอ
  python wanyenreport.py --inspect               ตรวจสอบโครงสร้างหน้าเว็บ
  python wanyenreport.py -f report.xlsx          อ่านไฟล์ที่มีอยู่แล้ว (ไม่ดาวน์โหลดใหม่)
        """
    )
    parser.add_argument(
        "-d", "--date",
        metavar="YYYY-MM-DD",
        help="วันที่รายงาน (default: เมื่อวาน)",
        default=None,
    )
    parser.add_argument(
        "-o", "--output",
        metavar="DIR",
        help="folder เก็บไฟล์ (default: ./reports หรือ REPORT_OUTPUT_DIR ใน .env)",
        default=os.getenv("REPORT_OUTPUT_DIR", "./reports"),
    )
    parser.add_argument(
        "-f", "--file",
        metavar="FILE",
        help="ใช้ไฟล์ที่ดาวน์โหลดไว้แล้ว แทนการดาวน์โหลดใหม่",
        default=None,
    )
    parser.add_argument(
        "--no-upload",
        action="store_true",
        help="ดาวน์โหลดอย่างเดียว ไม่อัพ Supabase",
    )
    parser.add_argument(
        "--visible",
        action="store_true",
        help="เปิด browser แบบเห็นหน้าจอ (สำหรับ debug)",
    )
    parser.add_argument(
        "--inspect",
        action="store_true",
        help="ตรวจสอบโครงสร้าง HTML ของหน้าเว็บ แล้วออก",
    )
    return parser.parse_args()


# ===========================================================================
# Path helpers
# ===========================================================================
def get_save_path(base_dir: str, report_date: datetime) -> Path:
    """สร้าง path: base_dir/YYYY/MM/YYYYMMDD.xlsx"""
    save_dir = Path(base_dir) / report_date.strftime("%Y") / report_date.strftime("%m")
    save_dir.mkdir(parents=True, exist_ok=True)
    return save_dir / (report_date.strftime("%Y%m%d") + ".xlsx")


# ===========================================================================
# Browser: Login
# ===========================================================================
async def _login(page) -> None:
    """เข้าสู่ระบบ – ลองหา username/password input แล้วกด submit"""
    Path("_tmp").mkdir(exist_ok=True)

    print(f"[+] กำลัง login: {LOGIN_URL}")
    await page.goto(LOGIN_URL, wait_until="networkidle", timeout=30_000)
    await page.wait_for_timeout(1_500)

    # ── Screenshot หน้า login ก่อนเสมอ ──────────────────────────────────
    await page.screenshot(path="_tmp/login_page.png")
    print("[+] Screenshot หน้า login → _tmp/login_page.png")

    # ── dump inputs ทั้งหมดบนหน้า ────────────────────────────────────────
    all_inputs = await page.evaluate("""() =>
        [...document.querySelectorAll('input')].map(el => ({
            type: el.type, id: el.id, name: el.name,
            placeholder: el.placeholder, cls: el.className
        }))
    """)
    print(f"[+] พบ input ทั้งหมด {len(all_inputs)} ช่อง:")
    for inp in all_inputs:
        print(f"      type='{inp['type']}'  id='{inp['id']}'  name='{inp['name']}'  placeholder='{inp['placeholder']}'")

    # ── หา username input (ลองทีละ selector) ─────────────────────────────
    user_input = None
    for sel in [
        "input[type='text'][id*='user' i]",
        "input[type='text'][name*='user' i]",
        "input[id*='username' i]",
        "input[name*='username' i]",
        "input[id*='txtUser' i]",
        "input[id*='login' i]",
        "input[name*='login' i]",
        "input[placeholder*='user' i]",
        "input[placeholder*='ชื่อ']",
        "input[placeholder*='Username']",
        "input[type='text']",          # fallback: text input ตัวแรก
    ]:
        user_input = await page.query_selector(sel)
        if user_input:
            print(f"[+] พบ username input: {sel}")
            break

    # ── หา password input ─────────────────────────────────────────────────
    pass_input = await page.query_selector("input[type='password']")
    if pass_input:
        print("[+] พบ password input")

    # ── ถ้าหาไม่เจอ → dump HTML แล้วหยุด ─────────────────────────────────
    if not user_input or not pass_input:
        html_snippet = await page.evaluate(
            "document.body ? document.body.innerHTML.substring(0,3000) : 'no body'"
        )
        print("\n── HTML snippet (3000 chars) ──────────────────────────────")
        print(html_snippet)
        raise RuntimeError(
            "ไม่พบช่อง username/password\n"
            "  → ดู screenshot: _tmp/login_page.png\n"
            "  → HTML ด้านบน ส่งมาให้ดูเพื่ออัพเดต selector"
        )

    # ── กรอกข้อมูล ────────────────────────────────────────────────────────
    await user_input.fill(WEB_USER)
    await pass_input.fill(WEB_PASS)

    # ── กด submit ─────────────────────────────────────────────────────────
    submit = None
    for sel in [
        "button:has-text('Sign in')",
        "button:has-text('Sign In')",
        "input[type='submit']",
        "button[type='submit']",
        "button:has-text('เข้าสู่ระบบ')",
        "button:has-text('Login')",
        "button:has-text('ล็อกอิน')",
        "button:has-text('OK')",
        "input[type='button']",
    ]:
        submit = await page.query_selector(sel)
        if submit:
            print(f"[+] พบปุ่ม submit: {sel}")
            break

    if submit:
        await submit.click()
    else:
        print("[+] ไม่พบปุ่ม submit – ใช้ Enter")
        await pass_input.press("Enter")

    # ── รอหน้าโหลดหลัง login ─────────────────────────────────────────────
    await page.wait_for_load_state("networkidle", timeout=15_000)
    await page.wait_for_timeout(1_000)

    # ── ตรวจว่า login สำเร็จ ─────────────────────────────────────────────
    current = page.url
    if "login" in current.lower() or "frmlogin" in current.lower():
        await page.screenshot(path="_tmp/login_failed.png")
        raise RuntimeError(
            f"Login ไม่สำเร็จ – ตรวจสอบ username/password\n"
            f"  WEB_USERNAME={WEB_USER}\n"
            f"  ดู screenshot: _tmp/login_failed.png"
        )
    print(f"[+] Login สำเร็จ → {current}")


# ===========================================================================
# Browser: Inspect mode
# ===========================================================================
async def inspect_page(url: str) -> None:
    """พิมพ์ข้อมูล HTML elements ในหน้าเว็บ เพื่อช่วย debug"""
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page    = await browser.new_page()

        Path("_tmp").mkdir(exist_ok=True)
        await _login(page)

        print(f"\n[INSPECT] กำลังโหลด: {url}")
        await page.goto(url, wait_until="networkidle", timeout=30_000)
        await page.wait_for_timeout(2_000)

        info = await page.evaluate("""() => {
            const r = { selects: [], buttons: [], inputs: [], links: [] };
            document.querySelectorAll('select').forEach(el => {
                r.selects.push({
                    id: el.id, name: el.name,
                    options: [...el.options].map(o => ({ v: o.value, t: o.text.trim() }))
                });
            });
            document.querySelectorAll('button, input[type=button], input[type=submit]').forEach(el => {
                r.buttons.push({ id: el.id, type: el.type, text: (el.innerText||el.value||'').trim(), cls: el.className });
            });
            document.querySelectorAll('input:not([type=button]):not([type=submit]):not([type=hidden])').forEach(el => {
                r.inputs.push({ id: el.id, name: el.name, type: el.type, placeholder: el.placeholder });
            });
            document.querySelectorAll('a[href]').forEach(el => {
                const t = el.innerText.trim();
                if (t) r.links.push({ href: el.href, text: t });
            });
            return r;
        }""")

        print("\n── SELECT ELEMENTS ─────────────────────────────────")
        for s in info["selects"]:
            print(f"  id='{s['id']}'  name='{s['name']}'")
            for o in s["options"][:15]:
                print(f"      value='{o['v']}'  text='{o['t']}'")

        print("\n── BUTTONS ──────────────────────────────────────────")
        for b in info["buttons"]:
            print(f"  id='{b['id']}'  type='{b['type']}'  text='{b['text']}'  class='{b['cls']}'")

        print("\n── INPUT FIELDS ─────────────────────────────────────")
        for i in info["inputs"]:
            print(f"  id='{i['id']}'  name='{i['name']}'  type='{i['type']}'  placeholder='{i['placeholder']}'")

        await page.screenshot(path="inspect_screenshot.png", full_page=True)
        print("\n[INSPECT] บันทึก screenshot → inspect_screenshot.png")

        input("\nกด Enter เพื่อปิด browser …")
        await browser.close()


# ===========================================================================
# Browser: Download report
# ===========================================================================
async def download_report(
    report_date: datetime,
    output_dir: str,
    headless: bool = True,
) -> Path:
    """เปิดเว็บ เลือกวันที่ เลือกสาขา All → ค้นหา → export Excel"""
    from playwright.async_api import async_playwright

    tmp_dir = Path(output_dir) / "_tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)

    date_str = report_date.strftime("%d/%m/%Y")   # dd/MM/yyyy

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=headless,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
            downloads_path=str(tmp_dir),
        )
        context = await browser.new_context(
            accept_downloads=True,
            locale="th-TH",
        )
        page = await context.new_page()

        await _login(page)

        print(f"[+] กำลังโหลด: {REPORT_URL}")
        await page.goto(REPORT_URL, wait_until="networkidle", timeout=30_000)
        await page.wait_for_timeout(1_500)

        # ── ใส่วันที่ด้วย ID ที่รู้แน่นอน ─────────────────────────────────
        await page.fill("#ContentPlaceHolder1_txtStart", date_str)
        await page.fill("#ContentPlaceHolder1_txtEnd",   date_str)
        print(f"[+] ใส่วันที่: {date_str}")

        # ── เลือกสาขา All (value='0') ─────────────────────────────────────
        await page.select_option("#ContentPlaceHolder1_ddlYear", value="0")
        print("[+] เลือกสาขา: All")

        await page.screenshot(path=str(tmp_dir / "before_search.png"))

        # ── คลิก ค้นหา ────────────────────────────────────────────────────
        await page.click("#Button1")
        print("[+] คลิก ค้นหา – รอ report render …")
        await page.wait_for_load_state("networkidle", timeout=30_000)
        await page.wait_for_timeout(4_000)   # SSRS ใช้เวลา render

        await page.screenshot(path=str(tmp_dir / "after_search.png"))
        print("[+] Screenshot หลังค้นหา → _tmp/after_search.png")

        # ── dump ReportViewer elements เพื่อหาปุ่ม export ─────────────────
        rv_elements = await page.evaluate("""() => {
            const r = [];
            document.querySelectorAll('[id*="ReportViewer"], [id*="myBtn"]').forEach(el => {
                r.push({
                    id:   el.id,
                    tag:  el.tagName,
                    type: el.type  || '',
                    text: (el.title || el.alt || el.innerText || el.value || '').trim().substring(0, 60),
                    src:  el.src   || '',
                    cls:  el.className || ''
                });
            });
            return r;
        }""")
        print(f"[+] ReportViewer elements ({len(rv_elements)} รายการ):")
        for el in rv_elements:
            print(f"      id='{el['id']}'  tag={el['tag']}  type='{el['type']}'  text='{el['text']}'")

        # ── Export Excel ───────────────────────────────────────────────────
        save_path = get_save_path(output_dir, report_date)

        # 1) คลิกปุ่ม dropdown "Export drop down menu"
        export_dropdown_btn = "#ctl00_ContentPlaceHolder1_ReportViewer1_ctl05_ctl04_ctl00_ButtonLink"
        await page.click(export_dropdown_btn)
        print("[+] เปิด export dropdown")
        await page.wait_for_timeout(800)   # รอ menu popup

        # 2) คลิก Excel จาก menu (ใช้ text=Excel ภายใน Menu div)
        excel_menu_id = "#ctl00_ContentPlaceHolder1_ReportViewer1_ctl05_ctl04_ctl00_Menu"
        excel_link = page.locator(f"{excel_menu_id} >> text=Excel").first

        print("[+] คลิก Excel …")
        try:
            async with page.expect_download(timeout=30_000) as dl_info:
                await excel_link.click()
            download = await dl_info.value
            await download.save_as(str(save_path))
            print(f"[+] ดาวน์โหลดสำเร็จ: {save_path}")
        except Exception as e:
            await page.screenshot(path=str(tmp_dir / "export_failed.png"))
            raise RuntimeError(
                f"Export Excel ล้มเหลว: {e}\n"
                f"  → ดู screenshot: _tmp/export_failed.png"
            )

        await browser.close()

    print(f"[+] บันทึกไฟล์: {save_path}")
    return save_path


async def _select_date(page, report_date: datetime) -> None:
    """(ไม่ใช้แล้ว – ใช้ fill โดยตรงใน download_report แทน)"""
    pass


async def _select_branch_all(page) -> None:
    """(ไม่ใช้แล้ว – ใช้ select_option โดยตรงใน download_report แทน)"""
    pass


async def _click_download(page) -> None:
    """คลิกปุ่ม Export / Download"""
    keywords = [
        "ดาวน์โหลด", "Download", "Export", "ส่งออก",
        "Excel", "รายงาน", "ค้นหา", "Search", "แสดงรายงาน",
    ]
    for kw in keywords:
        loc = page.locator(
            f"button:has-text('{kw}'), "
            f"a:has-text('{kw}'), "
            f"input[value='{kw}']"
        ).first
        if await loc.count() > 0:
            await loc.click()
            print(f"[+] คลิกปุ่ม: '{kw}'")
            return

    # fallback: submit button
    sub = page.locator("input[type='submit'], button[type='submit']").first
    if await sub.count() > 0:
        await sub.click()
        print("[+] คลิก submit button")
        return

    raise RuntimeError(
        "ไม่พบปุ่มดาวน์โหลด – ลองรัน: python wanyenreport.py --inspect"
    )


# ===========================================================================
# Parse downloaded file
# ===========================================================================
def parse_report_file(file_path: Path, report_date: datetime) -> list[dict]:
    """อ่านไฟล์ Excel/CSV แล้วแปลงเป็น list of dict พร้อม upload"""
    print(f"[+] กำลังอ่านไฟล์: {file_path}")
    ext = file_path.suffix.lower()

    if ext in (".xlsx", ".xls"):
        engine = "openpyxl" if ext == ".xlsx" else "xlrd"
        # ลอง header ที่แถวต่างๆ กัน (บางไฟล์มี header ไม่ใช่แถวแรก)
        df = _try_read_excel(file_path, engine)
    elif ext == ".csv":
        df = pd.read_csv(file_path, encoding="utf-8-sig")
    else:
        raise ValueError(f"ไม่รองรับนามสกุลไฟล์: {ext}")

    df.dropna(how="all", inplace=True)
    df.dropna(axis=1, how="all", inplace=True)

    print(f"[+] พบข้อมูล: {len(df)} แถว | คอลัมน์: {list(df.columns)}")

    # Map ชื่อคอลัมน์
    rename_map = {}
    for col in df.columns:
        key = re.sub(r"\s+", "", str(col)).lower()
        if key in COLUMN_MAP:
            rename_map[col] = COLUMN_MAP[key]
    if rename_map:
        df.rename(columns=rename_map, inplace=True)
        print(f"[+] Mapped คอลัมน์: {rename_map}")

    # กรองแถว summary/total ออก (SSRS มักเพิ่ม grand total row ท้ายไฟล์)
    # เก็บเฉพาะแถวที่มีค่าใน transaction_no หรือ sale_date อย่างน้อยหนึ่งคอลัมน์
    id_cols = [c for c in df.columns if c in {"transaction_no", "sale_date"}]
    if id_cols:
        before = len(df)
        # สร้าง mask: แถวที่มี id_col ที่ไม่ใช่ null และไม่ใช่ string ว่าง
        def _has_value(series: pd.Series) -> pd.Series:
            return series.notna() & (series.astype(str).str.strip() != "") & (series.astype(str).str.strip().str.lower() != "nan")
        mask = pd.concat([_has_value(df[c]) for c in id_cols], axis=1).any(axis=1)
        df = df[mask]
        removed = before - len(df)
        if removed > 0:
            print(f"[+] กรองแถว summary/total ออก {removed} แถว (ไม่มี transaction_no / sale_date)")

    # เก็บข้อมูลดิบทุกคอลัมน์เป็น raw_data (ใช้ชื่อคอลัมน์เดิม)
    raw_rows = df.where(pd.notnull(df), None).to_dict(orient="records")

    # Normalize column names (snake_case)
    df.columns = [_to_snake(c) for c in df.columns]

    # คอลัมน์ที่มีใน DB schema จริง (ถ้าไม่อยู่ในนี้จะเก็บใน raw_data แทน)
    DB_COLUMNS = {
        "branch_code", "branch_name", "transaction_no",
        "sale_date", "sale_time", "sale_datetime",
        "product_code", "product_name", "category",
        "quantity", "unit_price", "discount",
        "total_amount", "payment_amount", "payment_method",
    }

    # เพิ่ม metadata
    date_str    = report_date.strftime("%Y-%m-%d")
    imported_at = datetime.now(tz=__import__("datetime").timezone.utc).isoformat()

    records = []
    for row_dict, raw in zip(
        df.where(pd.notnull(df), None).to_dict(orient="records"), raw_rows
    ):
        rec: dict = {"report_date": date_str, "imported_at": imported_at}
        # ใส่เฉพาะคอลัมน์ที่มีใน DB schema
        for col, val in row_dict.items():
            if col in DB_COLUMNS:
                rec[col] = val
        # เก็บข้อมูลทั้งหมดใน raw_data
        rec["raw_data"] = {
            str(k): (str(v) if v is not None else None)
            for k, v in raw.items()
        }
        records.append(rec)

    return records


def _try_read_excel(path: Path, engine: str) -> pd.DataFrame:
    """ลองอ่าน Excel โดย auto-detect header row
    - หาแถวที่มีชื่อคอลัมน์จริง (ไม่ใช่ Unnamed ทั้งหมด)
    """
    for skip in range(15):
        try:
            df = pd.read_excel(path, engine=engine, skiprows=skip)
            df.dropna(how="all", inplace=True)
            if len(df) == 0:
                continue
            # นับ Unnamed columns
            unnamed = sum(1 for c in df.columns if str(c).startswith("Unnamed"))
            total   = len(df.columns)
            # ถือว่าเจอ header จริงถ้า Unnamed < ครึ่งหนึ่ง
            if total > 1 and unnamed < total / 2:
                return df
        except Exception:
            continue
    # fallback: อ่านตามปกติ
    return pd.read_excel(path, engine=engine)


def _to_snake(name: str) -> str:
    """แปลงชื่อคอลัมน์เป็น snake_case"""
    name = str(name).strip()
    name = re.sub(r"[\s\-/\\\.]+", "_", name)
    name = re.sub(r"[^\w]", "", name)
    name = name.lower().strip("_")
    return name or "col_unknown"


# ===========================================================================
# Supabase Upload
# ===========================================================================
def _clean_record(rec: dict) -> dict:
    """แปลง NaN / Inf → None ให้ JSON รับได้"""
    import math
    cleaned = {}
    for k, v in rec.items():
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            cleaned[k] = None
        elif isinstance(v, dict):
            # raw_data: ทำซ้ำใน nested dict
            cleaned[k] = {
                dk: (None if isinstance(dv, float) and (math.isnan(dv) or math.isinf(dv)) else dv)
                for dk, dv in v.items()
            }
        else:
            cleaned[k] = v
    return cleaned


def upload_to_supabase(records: list[dict], report_date: datetime) -> None:
    """ลบข้อมูลเดิมของวันนั้น แล้ว insert ใหม่"""
    from supabase import create_client

    url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")

    if not url or not key:
        raise EnvironmentError(
            "กรุณาตั้งค่า SUPABASE_URL และ SUPABASE_KEY ในไฟล์ .env\n"
            "  ดูตัวอย่าง: .env.example"
        )

    client = create_client(url, key)
    date_str = report_date.strftime("%Y-%m-%d")

    # ลบข้อมูลวันนั้น (idempotent re-run)
    print(f"[+] ลบข้อมูลเดิม report_date = {date_str} …")
    client.table(TABLE_NAME).delete().eq("report_date", date_str).execute()

    # Insert เป็น batch
    batch_size = 500
    total = len(records)
    print(f"[+] กำลัง insert {total} แถว …")
    for i in range(0, total, batch_size):
        batch = [_clean_record(r) for r in records[i : i + batch_size]]
        client.table(TABLE_NAME).insert(batch).execute()
        done = min(i + batch_size, total)
        print(f"    {done}/{total}")

    print(f"[✓] อัพโหลดสำเร็จ: {total} แถว → {TABLE_NAME}")


# ===========================================================================
# Main
# ===========================================================================
async def main() -> None:
    args = parse_args()

    # กำหนดวันที่รายงาน
    if args.date:
        try:
            report_date = datetime.strptime(args.date, "%Y-%m-%d")
        except ValueError:
            print("[!] รูปแบบวันที่ไม่ถูกต้อง ใช้ YYYY-MM-DD เช่น 2025-05-20")
            sys.exit(1)
    else:
        report_date = datetime.now() - timedelta(days=1)

    print()
    print("=" * 52)
    print("  Wanyen Daily Sales Report")
    print("=" * 52)
    print(f"  วันที่รายงาน  : {report_date.strftime('%d/%m/%Y (%A)')}")
    print(f"  บันทึกไฟล์ที่ : {Path(args.output).resolve()}")
    print(f"  Upload Supabase: {'ไม่' if args.no_upload else 'ใช่'}")
    print("=" * 52)
    print()

    # ── Inspect mode ──────────────────────────────────────────────────────
    if args.inspect:
        await inspect_page(REPORT_URL)
        return

    # ── ดาวน์โหลดหรือใช้ไฟล์ที่มีอยู่ ────────────────────────────────────
    if args.file:
        file_path = Path(args.file)
        if not file_path.exists():
            print(f"[!] ไม่พบไฟล์: {file_path}")
            sys.exit(1)
        print(f"[+] ใช้ไฟล์ที่มีอยู่: {file_path}")
    else:
        file_path = await download_report(
            report_date=report_date,
            output_dir=args.output,
            headless=not args.visible,
        )

    # ── Upload Supabase ────────────────────────────────────────────────────
    if not args.no_upload:
        records = parse_report_file(file_path, report_date)
        if records:
            upload_to_supabase(records, report_date)
        else:
            print("[!] ไม่พบข้อมูลในไฟล์")
    else:
        print("[+] ข้ามการ upload (--no-upload)")

    print()
    print("[✓] เสร็จสิ้น")


if __name__ == "__main__":
    asyncio.run(main())
