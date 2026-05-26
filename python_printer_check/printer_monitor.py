#!/usr/bin/env python3
"""
TSC T300A Printer Monitor
รองรับ: หลายเครื่องปริ้น | หลายสาขา | แจ้งเตือน Telegram | Test Print via Bartender | คำนวณสต็อกสติ๊กเกอร์
"""

import json
import time
import threading
import subprocess
import sys
import os
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path

# ── Base directory — PyInstaller-safe ────────────────────────────────────────
# เมื่อรันเป็น .exe (frozen) ให้ใช้ที่ตั้งของ .exe ไม่ใช่ temp folder
if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys.executable).parent
else:
    BASE_DIR = Path(__file__).parent

CONFIG_FILE = BASE_DIR / "config.json"
LOG_FILE    = BASE_DIR / "printer_monitor.log"

# ── File logger (สำคัญมากเมื่อรันเป็น --noconsole) ──────────────────────────
_log_handlers = [logging.FileHandler(LOG_FILE, encoding="utf-8")]
if sys.stdout:
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    _log_handlers.append(logging.StreamHandler(sys.stdout))
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=_log_handlers,
)
logger_sys = logging.getLogger("printer_monitor")


def log(msg: str):
    """ส่ง log ออกทั้ง console และ log file"""
    logger_sys.info(msg)


def log_err(msg: str):
    logger_sys.error(msg)


def _subprocess_hide_window_kwargs() -> dict:
    """Windows: ซ่อนหน้าต่าง cmd ชั่วคราวตอน tasklist / taskkill / ฯลฯ"""
    if sys.platform != "win32":
        return {}
    return {"creationflags": getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)}


def _fatal_startup(msg: str, code: int = 1):
    """แจ้ง error แล้วค่อยปิด — กัน double-click แล้วหายไปทันที"""
    log_err(msg)
    for h in logger_sys.handlers:
        try:
            h.flush()
        except Exception:
            pass
    if getattr(sys, "frozen", False):
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(
                0, msg, "Printer Monitor", 0x10)
        except Exception:
            pass
        time.sleep(8)
    else:
        try:
            print(msg, file=sys.stderr)
            input("กด Enter เพื่อปิด...")
        except Exception:
            time.sleep(8)
    sys.exit(code)


# ── Third-party imports (optional graceful fallback) ──────────────────────────
try:
    import puresnmp
    from datetime import timedelta as _snmp_td
    SNMP_AVAILABLE = True
except ImportError:
    SNMP_AVAILABLE = False
    log_err("puresnmp ไม่ได้ติดตั้ง — ไม่สามารถตรวจสอบปริ้นเตอร์ผ่าน SNMP ได้")

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False
    log_err("requests ไม่ได้ติดตั้ง — ไม่สามารถส่ง Telegram ได้")

try:
    from supabase import create_client
    SUPABASE_AVAILABLE = True
except Exception as e:
    SUPABASE_AVAILABLE = False
    log_err(f"supabase โหลดไม่ได้ — {e}")


def load_config() -> dict:
    log(f"BASE_DIR = {BASE_DIR}")
    log(f"CONFIG_FILE = {CONFIG_FILE}")
    if not CONFIG_FILE.exists():
        _fatal_startup(
            f"ไม่พบ config.json\n\nวางไฟล์ config.json ไว้ในโฟลเดอร์:\n{BASE_DIR}"
        )
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8-sig") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        hint = ""
        if "Invalid \\escape" in str(e):
            hint = (
                "\n\n💡 path Windows ใน JSON ต้องใช้ / แทน \\ "
                "เช่น E:/Wanyen Kiosk/... หรือ escape เป็น \\\\"
            )
        _fatal_startup(f"config.json อ่านไม่ได้ (JSON ผิดรูปแบบ):\n{e}{hint}")


# ── SNMP OIDs (RFC-1759 Printer MIB) ─────────────────────────────────────────
OID_HR_PRINTER_STATUS = "1.3.6.1.2.1.25.3.5.1.1.1"    # hrPrinterStatus
OID_PAGE_COUNT        = "1.3.6.1.2.1.43.10.2.1.4.1.1"  # prtMarkerLifeCount
OID_ALERT_DESCRIPTION = "1.3.6.1.2.1.43.18.1.1.8.1.1"  # prtAlertDescription


def snmp_get(ip: str, oid: str, community: str = "public",
             timeout: int = 3, retries: int = 1):
    """ดึงค่า SNMP OID เดียว — คืน int/str หรือ None ถ้าไม่สำเร็จ"""
    if not SNMP_AVAILABLE:
        return None
    for attempt in range(retries + 1):
        try:
            raw = puresnmp.get(ip, community, oid,
                               timeout=_snmp_td(seconds=timeout))
            try:
                return int(raw)
            except (ValueError, TypeError):
                return str(raw)
        except Exception:
            if attempt == retries:
                return None
    return None


# ── Status Constants ──────────────────────────────────────────────────────────
STATUS_ONLINE     = "online"       # เปิด/พร้อมใช้งาน
STATUS_PRINTING   = "printing"     # กำลังปริ้น
STATUS_OFFLINE    = "offline"      # ปิด/ไม่ตอบสนอง
STATUS_PAPER_OUT  = "paper_out"    # กระดาษหมด
STATUS_RIBBON_OUT = "ribbon_out"   # หมึกหมด
STATUS_ERROR      = "error"        # เครื่องมีปัญหาอื่น

STATUS_EMOJI = {
    STATUS_ONLINE:     "✅",
    STATUS_PRINTING:   "🖨️",
    STATUS_OFFLINE:    "🔴",
    STATUS_PAPER_OUT:  "📄",
    STATUS_RIBBON_OUT: "🎀",
    STATUS_ERROR:      "⚠️",
}

STATUS_TEXT = {
    STATUS_ONLINE:     "พร้อมใช้งาน",
    STATUS_PRINTING:   "กำลังปริ้น",
    STATUS_OFFLINE:    "ออฟไลน์ / ไม่ตอบสนอง",
    STATUS_PAPER_OUT:  "กระดาษหมด",
    STATUS_RIBBON_OUT: "หมึกหมด",
    STATUS_ERROR:      "เครื่องมีปัญหา",
}

# Keywords สำหรับแยกประเภท error จาก alert description
PAPER_KEYWORDS  = ["media", "paper", "label", "media out", "paper out",
                   "no media", "no paper", "media empty", "paper empty"]
RIBBON_KEYWORDS = ["ribbon", "ink", "ribbon end", "ribbon out",
                   "no ribbon", "marker", "ribbon empty"]


# ── HTTP status checker (TSC TA300 EZ web interface) ─────────────────────────
_HTTP_STATUS_KEYWORDS = [
    ("ready",         STATUS_ONLINE),
    ("printing",      STATUS_PRINTING),
    ("paper out",     STATUS_PAPER_OUT),
    ("out of paper",  STATUS_PAPER_OUT),
    ("no media",      STATUS_PAPER_OUT),
    ("media out",     STATUS_PAPER_OUT),
    ("ribbon out",    STATUS_RIBBON_OUT),
    ("ribbon end",    STATUS_RIBBON_OUT),
    ("no ribbon",     STATUS_RIBBON_OUT),
    ("head open",     STATUS_ERROR),
    ("pause",         STATUS_ERROR),
    ("error",         STATUS_ERROR),
]

# endpoint ที่มักคืนสถานะสด (หลังกด Refresh บนหน้าเว็บ)
_TSC_LIVE_PATHS = [
    "/cgi-bin/status.cgi",
    "/pStatus.asp",
]

# endpoint ที่อาจค้างค่าเก่า — อ่านหลัง trigger refresh เท่านั้น
_TSC_CACHED_PATHS = [
    "/title.asp",
    "/setup.htm",
    "/main.asp",
    "/",
    "/index.htm",
]

_TSC_NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma":        "no-cache",
}


def _parse_tsc_status(html: str):
    """แยก (status, milage_mm) จาก HTML ของ TSC TA300 web interface"""
    import re
    lower = html.lower()
    status = None
    idx = lower.find("printer status")
    if idx >= 0:
        snippet = lower[idx: idx + 400]
        for keyword, mapped in _HTTP_STATUS_KEYWORDS:
            if keyword in snippet:
                status = mapped
                break
    milage_mm = None
    m = re.search(r'mile?age\D+([\d.]+)\s*km', lower)
    if m:
        milage_mm = int(float(m.group(1)) * 1_000_000)
    return status, milage_mm


def _tsc_merge_status(current_status, current_milage, new_status, new_milage):
    """รวมผล parse — ค่าใหม่ทับค่าเก่าเมื่อ parse ได้"""
    if new_status is not None:
        current_status = new_status
    if new_milage is not None:
        current_milage = new_milage
    return current_status, current_milage


def _tsc_trigger_refresh(session, ip: str, ts: int):
    """
    จำลองปุ่ม Refresh บนหน้า TSC TA300
    (หน้า title.asp แสดงสถานะค้างจนกว่าจะ refresh)
    """
    refresh_attempts = [
        ("POST", "/title.asp", {"Refresh": "Refresh"}),
        ("POST", "/title.asp", {"refresh": "1"}),
        ("GET",  f"/title.asp?Refresh=Refresh&_={ts}", None),
        ("GET",  f"/cgi-bin/status.cgi?refresh=1&_={ts}", None),
        ("GET",  f"/pStatus.asp?refresh=1&_={ts}", None),
    ]
    for method, path, data in refresh_attempts:
        try:
            url = f"http://{ip}{path}"
            if method == "POST":
                session.post(url, data=data, timeout=5)
            else:
                session.get(url, timeout=5)
        except Exception:
            pass


def _tsc_fetch_paths(session, ip: str, paths: list, ts: int):
    """GET หลาย path — คืน (status, milage_mm, http_up, frame_paths)"""
    import re as _re
    status = None
    milage = None
    http_up = False
    frame_paths = []
    for path in paths:
        sep = "&" if "?" in path else "?"
        url = f"http://{ip}{path}{sep}_={ts}"
        try:
            resp = session.get(url, timeout=5)
            if resp.status_code != 200:
                continue
            http_up = True
            for fsrc in _re.findall(
                    r'<frame[^>]+src\s*=\s*[\'"]?(/[^\'" >]+)',
                    resp.text, _re.IGNORECASE):
                if fsrc not in frame_paths:
                    frame_paths.append(fsrc)
            s, m = _parse_tsc_status(resp.text)
            status, milage = _tsc_merge_status(status, milage, s, m)
        except Exception:
            pass
    return status, milage, http_up, frame_paths


def get_printer_status(ip: str, community: str = "public") -> dict:
    """
    ตรวจสอบสถานะปริ้นเตอร์
    ลำดับ: HTTP web interface (TSC TA300) → SNMP fallback
    คืน dict: { status, page_count, alert_msg, raw_status_code, milage_mm }
    """
    # ── HTTP (TSC TA300 EZ) ──────────────────────────────────────────────
    if REQUESTS_AVAILABLE:
        ts = int(time.time() * 1000)
        session = requests.Session()
        session.headers.update(_TSC_NO_CACHE_HEADERS)

        # 1) กระตุ้นให้ print server อ่านสถานะล่าสุดจากเครื่องปริ้น
        _tsc_trigger_refresh(session, ip, ts)

        # 2) อ่าน endpoint สดก่อน
        _status, _milage, _http_up, frames = _tsc_fetch_paths(
            session, ip, _TSC_LIVE_PATHS, ts)

        # 3) อ่าน title.asp / หน้าหลัก (หลัง refresh แล้ว)
        s2, m2, up2, frames2 = _tsc_fetch_paths(
            session, ip, _TSC_CACHED_PATHS, ts)
        _status, _milage = _tsc_merge_status(_status, _milage, s2, m2)
        _http_up = _http_up or up2

        # 4) ตาม frame ที่พบ (เช่น frameset ของหน้า index)
        extra = [p for p in (frames + frames2)
                 if p not in _TSC_LIVE_PATHS + _TSC_CACHED_PATHS][:6]
        if extra:
            s3, m3, up3, _ = _tsc_fetch_paths(session, ip, extra, ts)
            _status, _milage = _tsc_merge_status(_status, _milage, s3, m3)
            _http_up = _http_up or up3

        if _http_up:
            return {"status": _status or STATUS_ONLINE, "page_count": None,
                    "alert_msg": "", "raw_status_code": None,
                    "milage_mm": _milage}

    # ── SNMP fallback ────────────────────────────────────────────────────
    raw_status = snmp_get(ip, OID_HR_PRINTER_STATUS, community)
    if raw_status is None:
        return {"status": STATUS_OFFLINE, "page_count": None,
                "alert_msg": "", "raw_status_code": None, "milage_mm": None}

    page_count = snmp_get(ip, OID_PAGE_COUNT, community)
    if isinstance(page_count, str):
        try:
            page_count = int(page_count)
        except (ValueError, TypeError):
            page_count = None

    alert_raw   = snmp_get(ip, OID_ALERT_DESCRIPTION, community)
    alert_msg   = str(alert_raw).strip() if alert_raw else ""
    alert_lower = alert_msg.lower()

    if raw_status == 4:
        status = STATUS_PRINTING
    elif raw_status in (6, 7) or alert_msg:
        if any(kw in alert_lower for kw in PAPER_KEYWORDS):
            status = STATUS_PAPER_OUT
        elif any(kw in alert_lower for kw in RIBBON_KEYWORDS):
            status = STATUS_RIBBON_OUT
        else:
            status = STATUS_ERROR
    else:
        status = STATUS_ONLINE

    return {"status": status, "page_count": page_count,
            "alert_msg": alert_msg, "raw_status_code": raw_status,
            "milage_mm": None}


# ── Stock Manager ─────────────────────────────────────────────────────────────
class StockManager:
    """
    คำนวณสต็อกสติ๊กเกอร์จาก SNMP page count
    บันทึกสถานะลงไฟล์ JSON เพื่อให้คงอยู่เมื่อรีสตาร์ท

    ขนาดสติ๊กเกอร์: สูง 11mm + ช่องไฟ 2mm = 13mm/แถว
    """

    def __init__(self, printer_id: str, initial_stock: int,
                 sticker_height_mm: float, gap_mm: float,
                 low_stock_threshold: int = 200, stock_file=None):
        self.printer_id          = printer_id
        self.sticker_height_mm   = sticker_height_mm
        self.gap_mm              = gap_mm
        self.mm_per_label        = sticker_height_mm + gap_mm
        self.low_stock_threshold = low_stock_threshold
        self.low_stock_warned    = False

        self.stock_file = (BASE_DIR / stock_file) if stock_file \
                          else BASE_DIR / f"stock_{printer_id}.json"

        # โหลด state ที่บันทึกไว้ หรือเริ่มใหม่
        state = self._load_state()
        if state:
            self.initial_stock          = state.get("initial_stock", initial_stock)
            self.baseline_page_count    = state.get("baseline_page_count")
            self.printed_since_baseline = state.get("printed_since_baseline", 0)
        else:
            self.initial_stock          = initial_stock
            self.baseline_page_count    = None
            self.printed_since_baseline = 0

    def _load_state(self):
        if self.stock_file.exists():
            try:
                with open(self.stock_file, "r", encoding="utf-8-sig") as f:
                    return json.load(f)
            except Exception:
                return None
        return None

    def _save_state(self):
        data = {
            "initial_stock":          self.initial_stock,
            "baseline_page_count":    self.baseline_page_count,
            "printed_since_baseline": self.printed_since_baseline,
            "updated_at":             datetime.now().isoformat(),
        }
        with open(self.stock_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    def update(self, current_page_count):
        """อัปเดตจำนวนที่ปริ้นไปแล้วจาก SNMP page count"""
        if current_page_count is None:
            return
        if self.baseline_page_count is None:
            self.baseline_page_count = current_page_count
            self._save_state()
            return
        delta = current_page_count - self.baseline_page_count
        if delta < 0:
            # counter reset (เปลี่ยนเครื่องหรือ reset) — ตั้ง baseline ใหม่
            self.baseline_page_count = current_page_count
            self._save_state()
            return
        if delta > 0:
            self.printed_since_baseline += delta
            self.baseline_page_count = current_page_count
            self._save_state()
            log(f"[Stock] {self.printer_id} — ตรวจพบปริ้น +{delta} แถว "
                f"(สะสม {self.printed_since_baseline} | คงเหลือ {self.get_remaining():,})")

    def get_remaining(self) -> int:
        return max(0, self.initial_stock - self.printed_since_baseline)

    def get_remaining_meters(self) -> float:
        return (self.get_remaining() * self.mm_per_label) / 1000.0

    def reset_stock(self, new_stock=None):
        """เรียกเมื่อเติมกระดาษม้วนใหม่"""
        if new_stock is not None:
            self.initial_stock = new_stock
        self.printed_since_baseline = 0
        self.low_stock_warned = False
        self._save_state()


# ── Telegram ──────────────────────────────────────────────────────────────────
BOT_COMMANDS = [
    {"command": "status", "description": "สถานะปริ้น — /status [branch_id]"},
    {"command": "stock", "description": "สต็อกสติ๊กเกอร์ — /stock [branch_id]"},
    {"command": "testprint", "description": "ทดสอบปริ้น — /testprint [branch] [เครื่อง] [จำนวน]"},
    {"command": "resetstock", "description": "รีเซ็ตสต็อก — /resetstock [branch] [เครื่อง] [แถว]"},
    {"command": "help", "description": "วิธีใช้คำสั่งทั้งหมด"},
]

CMD_ALIASES = {
    "/status":     "status",
    "/สถานะ":      "status",
    "/stock":      "stock",
    "/สต็อก":       "stock",
    "/testprint":  "testprint",
    "/test":       "testprint",
    "/resetstock": "resetstock",
    "/help":       "help",
    "/ช่วยเหลือ":   "help",
}


def _norm_branch_id(branch_id: str) -> str:
    return str(branch_id).strip()


def parse_telegram_command(text: str, require_branch: bool,
                           default_branch_id: str = None):
    """แปลงข้อความ Telegram → dict คำสั่ง หรือ None"""
    parts = text.strip().split()
    if not parts or not parts[0].startswith("/"):
        return None
    raw_cmd = parts[0].lower().split("@")[0]
    cmd = CMD_ALIASES.get(raw_cmd)
    if not cmd:
        return None
    args = parts[1:]

    if cmd in ("status", "stock"):
        if require_branch:
            if not args:
                return {"error": "missing_branch", "cmd": cmd}
            return {"cmd": cmd, "branch_id": _norm_branch_id(args[0]), "args": []}
        if args:
            return {"cmd": cmd, "branch_id": _norm_branch_id(args[0]), "args": []}
        if default_branch_id:
            return {"cmd": cmd, "branch_id": _norm_branch_id(default_branch_id),
                    "args": []}
        return {"error": "missing_branch", "cmd": cmd}

    if cmd == "testprint":
        if require_branch:
            if not args:
                return {"error": "missing_branch", "cmd": cmd}
            branch_id = _norm_branch_id(args[0])
            rest = args[1:]
        else:
            branch_id = _norm_branch_id(default_branch_id) if default_branch_id else None
            rest = args
        printer_idx = 0
        copies = 1
        if rest:
            try:
                printer_idx = int(rest[0]) - 1
            except ValueError:
                pass
        if len(rest) > 1:
            try:
                copies = max(1, int(rest[1]))
            except ValueError:
                pass
        if not branch_id:
            return {"error": "missing_branch", "cmd": cmd}
        return {"cmd": cmd, "branch_id": branch_id,
                "args": [printer_idx, copies]}

    if cmd == "resetstock":
        if require_branch:
            if len(args) < 2:
                return {"error": "missing_resetstock", "cmd": cmd}
            branch_id = _norm_branch_id(args[0])
            if len(args) == 2:
                try:
                    new_stock = int(args[1])
                except ValueError:
                    return {"error": "invalid_stock", "cmd": cmd}
                return {"cmd": cmd, "branch_id": branch_id, "args": [0, new_stock]}
            try:
                printer_idx = int(args[1]) - 1
                new_stock = int(args[2])
            except ValueError:
                return {"error": "invalid_resetstock", "cmd": cmd}
            return {"cmd": cmd, "branch_id": branch_id,
                    "args": [printer_idx, new_stock]}
        branch_id = _norm_branch_id(default_branch_id) if default_branch_id else None
        printer_idx = 0
        new_stock = None
        if len(args) == 1:
            try:
                new_stock = int(args[0])
            except ValueError:
                return {"error": "invalid_stock", "cmd": cmd}
        elif len(args) >= 2:
            try:
                printer_idx = int(args[0]) - 1
                new_stock = int(args[1])
            except ValueError:
                return {"error": "invalid_resetstock", "cmd": cmd}
        else:
            return {"error": "missing_resetstock", "cmd": cmd}
        if not branch_id:
            return {"error": "missing_branch", "cmd": cmd}
        return {"cmd": cmd, "branch_id": branch_id,
                "args": [printer_idx, new_stock]}

    if cmd == "help":
        return {"cmd": "help", "branch_id": None, "args": []}
    return None


class TelegramNotifier:
    def __init__(self, token: str, chat_id: str):
        self.token        = token
        self.chat_id      = str(chat_id)
        self.base_url     = f"https://api.telegram.org/bot{token}"
        self.last_update_id = None

    def send(self, message: str, parse_mode: str = "HTML") -> bool:
        if not REQUESTS_AVAILABLE:
            print(f"[Telegram] {message}")
            return False
        try:
            resp = requests.post(
                f"{self.base_url}/sendMessage",
                json={"chat_id": self.chat_id, "text": message,
                      "parse_mode": parse_mode},
                timeout=10
            )
            return resp.status_code == 200
        except Exception as e:
            log_err(f"[Telegram ERROR] {e}")
            return False

    def set_my_commands(self) -> bool:
        """ลงทะเบียนเมนูคำสั่ง — แสดงเมื่อกด / ใน Telegram"""
        if not REQUESTS_AVAILABLE:
            return False
        try:
            resp = requests.post(
                f"{self.base_url}/setMyCommands",
                json={"commands": BOT_COMMANDS},
                timeout=10
            )
            if resp.status_code == 200:
                log("[Telegram] ลงทะเบียนเมนูคำสั่ง (/) สำเร็จ")
                return True
            log_err(f"[Telegram] setMyCommands failed: {resp.text}")
        except Exception as e:
            log_err(f"[Telegram ERROR] setMyCommands: {e}")
        return False

    def get_updates(self, offset=None, timeout: int = 10) -> list:
        if not REQUESTS_AVAILABLE:
            return []
        try:
            params = {"timeout": timeout, "allowed_updates": ["message"]}
            if offset is not None:
                params["offset"] = offset
            resp = requests.get(
                f"{self.base_url}/getUpdates",
                params=params,
                timeout=timeout + 5
            )
            if resp.status_code == 200:
                return resp.json().get("result", [])
        except Exception:
            pass
        return []


# ── Bartender Print ───────────────────────────────────────────────────────────
class BartenderPrint:
    def __init__(self, exe_path: str):
        self.exe_path = exe_path

    def print_template(self, template_path: str,
                       printer_name: str = None,
                       copies: int = 1):
        """
        สั่งพิมพ์ผ่าน Bartender command line
        คืน (success: bool, message: str)
        """
        if not self.exe_path or not os.path.exists(self.exe_path):
            return False, f"ไม่พบโปรแกรม Bartender: {self.exe_path}"
        if not os.path.exists(template_path):
            return False, f"ไม่พบ Template: {template_path}"

        cmd = [self.exe_path, f"/AF={template_path}", "/P",
               f"/C={copies}", "/X"]
        if printer_name:
            cmd.append(f'/PRN={printer_name}')

        try:
            result = subprocess.run(
                cmd, timeout=30, capture_output=True,
                **_subprocess_hide_window_kwargs(),
            )
            if result.returncode == 0:
                return True, f"สั่งพิมพ์ {copies} ใบ สำเร็จ"
            return False, f"Bartender ส่งคืน exit code: {result.returncode}"
        except subprocess.TimeoutExpired:
            return False, "Timeout — Bartender ใช้เวลานานเกินไป"
        except Exception as e:
            return False, str(e)


# ── Kiosk UI Changer (st_sticker.exe) ─────────────────────────────────────────
class KioskUIChanger:
    """
    ปิด st_sticker.exe → คัดลอก UI จากโฟลเดอร์ rebuild → เปิดโปรแกรมใหม่
    path กำหนดใน config.json → kiosk
    """

    def __init__(self, cfg: dict = None):
        cfg = cfg or {}
        self.app_dir = Path(cfg.get("app_dir", "")).expanduser()
        exe_name = cfg.get("exe_name", "st_sticker.exe")
        self.exe_path = self.app_dir / exe_name
        self.ui_rebuild_dir = Path(cfg.get("ui_rebuild_dir", "")).expanduser()
        self.close_timeout_sec = int(cfg.get("close_timeout_sec", 15))
        self.start_timeout_sec = int(cfg.get("start_timeout_sec", 10))
        self.enabled = bool(str(cfg.get("app_dir", "")).strip())

    @property
    def exe_name(self) -> str:
        return self.exe_path.name

    def _is_running(self) -> bool:
        if sys.platform != "win32":
            return False
        try:
            result = subprocess.run(
                ["tasklist", "/FI", f"IMAGENAME eq {self.exe_name}", "/NH"],
                capture_output=True, text=True, timeout=10,
                **_subprocess_hide_window_kwargs(),
            )
            return self.exe_name.lower() in result.stdout.lower()
        except Exception:
            return False

    def _kill_app(self):
        if not self._is_running():
            log(f"[KioskUI] {self.exe_name} ไม่ได้รันอยู่ — ข้ามการปิด")
            return
        if sys.platform != "win32":
            raise RuntimeError("รองรับเฉพาะ Windows")
        subprocess.run(
            ["taskkill", "/F", "/IM", self.exe_name],
            capture_output=True, text=True, timeout=15,
            **_subprocess_hide_window_kwargs(),
        )
        deadline = time.time() + self.close_timeout_sec
        while time.time() < deadline:
            if not self._is_running():
                log(f"[KioskUI] ปิด {self.exe_name} สำเร็จ")
                return
            time.sleep(0.5)
        raise RuntimeError(
            f"ปิด {self.exe_name} ไม่สำเร็จภายใน {self.close_timeout_sec} วินาที"
        )

    def _find_ui_folder(self, product_name: str) -> Path:
        if not self.ui_rebuild_dir.is_dir():
            raise FileNotFoundError(
                f"ไม่พบโฟลเดอร์ UI rebuild: {self.ui_rebuild_dir}"
            )
        name = product_name.strip()
        if not name:
            raise ValueError("ไม่ได้ระบุชื่อสินค้า")
        exact = self.ui_rebuild_dir / name
        if exact.is_dir():
            return exact
        name_lower = name.lower()
        for child in self.ui_rebuild_dir.iterdir():
            if child.is_dir() and child.name.lower() == name_lower:
                return child
        available = sorted(
            c.name for c in self.ui_rebuild_dir.iterdir() if c.is_dir()
        )[:8]
        hint = f" (มี: {', '.join(available)}...)" if available else ""
        raise FileNotFoundError(
            f"ไม่พบโฟลเดอร์ UI ชื่อ '{name}' ใน {self.ui_rebuild_dir}{hint}"
        )

    def _copy_ui(self, src_dir: Path):
        if not self.app_dir.is_dir():
            raise FileNotFoundError(f"ไม่พบโฟลเดอร์โปรแกรม: {self.app_dir}")
        file_count = 0
        for item in src_dir.rglob("*"):
            if not item.is_file():
                continue
            rel = item.relative_to(src_dir)
            target = self.app_dir / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, target)
            file_count += 1
        if file_count == 0:
            raise RuntimeError(f"โฟลเดอร์ UI ว่างเปล่า: {src_dir}")
        log(f"[KioskUI] คัดลอก {file_count} ไฟล์จาก {src_dir.name} → {self.app_dir}")

    def _start_app(self):
        if not self.exe_path.is_file():
            raise FileNotFoundError(f"ไม่พบโปรแกรม: {self.exe_path}")
        subprocess.Popen(
            [str(self.exe_path)],
            cwd=str(self.app_dir),
            shell=False,
            **_subprocess_hide_window_kwargs(),
        )
        deadline = time.time() + self.start_timeout_sec
        while time.time() < deadline:
            if self._is_running():
                log(f"[KioskUI] เปิด {self.exe_name} สำเร็จ")
                return
            time.sleep(0.5)
        raise RuntimeError(
            f"เปิด {self.exe_name} แล้วแต่ไม่พบ process ภายใน "
            f"{self.start_timeout_sec} วินาที"
        )

    def change_ui(self, product_name: str) -> tuple:
        """
        คืน (success: bool, message: str, step: str)
        step = ขั้นที่ล้มเหลว หรือ 'done' เมื่อสำเร็จ
        """
        if not self.enabled:
            return False, "ไม่ได้กำหนด kiosk.app_dir ใน config.json", "config"

        try:
            self._kill_app()
        except Exception as e:
            log_err(f"[KioskUI ERROR] step=close_app: {e}")
            return False, str(e), "close_app"

        try:
            ui_src = self._find_ui_folder(product_name)
        except Exception as e:
            log_err(f"[KioskUI ERROR] step=find_ui: {e}")
            return False, str(e), "find_ui"

        try:
            self._copy_ui(ui_src)
        except Exception as e:
            log_err(f"[KioskUI ERROR] step=copy_ui: {e}")
            return False, str(e), "copy_ui"

        try:
            self._start_app()
        except Exception as e:
            log_err(f"[KioskUI ERROR] step=start_app: {e}")
            return False, str(e), "start_app"

        msg = (
            f"เปลี่ยน UI '{product_name.strip()}' สำเร็จ "
            f"({ui_src.name} → {self.app_dir})"
        )
        return True, msg, "done"


# ── Supabase Logger ───────────────────────────────────────────────────────────
class SupabaseLogger:
    def __init__(self, url: str, key: str, table_name: str):
        self.client     = None
        self.table_name = table_name
        if SUPABASE_AVAILABLE and url and key:
            try:
                self.client = create_client(url, key)
                log(f"[Supabase] เชื่อมต่อสำเร็จ → {table_name}")
            except Exception as e:
                log_err(f"[Supabase ERROR] {e}")

    def log(self, branch_id: str, branch_name: str,
            printer_id: str, printer_name: str, printer_ip: str,
            status: str, page_count, alert_msg: str,
            event: str, stock_remaining=None, product_name=None):
        if not self.client:
            return
        try:
            row = {
                "branch_id":       branch_id,
                "branch_name":     branch_name,
                "printer_id":      printer_id,
                "printer_name":    printer_name,
                "printer_ip":      printer_ip,
                "status":          status,
                "page_count":      page_count,
                "alert_msg":       alert_msg,
                "event":           event,
                "stock_remaining": stock_remaining,
                "timestamp":       datetime.now(timezone.utc).isoformat(),
            }
            if product_name:
                row["product_name"] = product_name
            self.client.table(self.table_name).insert(row).execute()
        except Exception as e:
            log_err(f"[Supabase ERROR] log: {e}")


# ── Supabase Command Queue ────────────────────────────────────────────────────
class SupabaseCommandQueue:
    """Hub insert คำสั่ง | สาขา poll แล้ว execute"""

    TABLE = "printer_command_queue"

    def __init__(self, url: str, key: str):
        self.client = None
        if SUPABASE_AVAILABLE and url and key:
            try:
                self.client = create_client(url, key)
                log(f"[Supabase] Command queue พร้อมใช้งาน → {self.TABLE}")
            except Exception as e:
                log_err(f"[Supabase ERROR] command queue: {e}")

    @property
    def available(self) -> bool:
        return self.client is not None

    def enqueue(self, branch_id: str, command: str, args: list,
                chat_id: str = None) -> bool:
        if not self.client:
            log_err("[Supabase ERROR] enqueue: client ไม่พร้อม")
            return False
        try:
            resp = self.client.table(self.TABLE).insert({
                "branch_id": branch_id,
                "command":   command,
                "args":      args,
                "status":    "pending",
                "chat_id":   chat_id,
            }).execute()
            row_id = resp.data[0]["id"] if resp.data else "?"
            log(f"[Supabase] enqueue OK id={row_id} "
                f"branch={branch_id} cmd={command} args={args}")
            return True
        except Exception as e:
            log_err(f"[Supabase ERROR] enqueue: {e}")
            return False

    def fetch_pending(self, branch_id: str, limit: int = 5) -> list:
        if not self.client:
            return []
        try:
            resp = (
                self.client.table(self.TABLE)
                .select("*")
                .eq("branch_id", branch_id)
                .eq("status", "pending")
                .order("created_at")
                .limit(limit)
                .execute()
            )
            return resp.data or []
        except Exception as e:
            log_err(f"[Supabase ERROR] fetch_pending: {e}")
            return []

    def mark_done(self, row_id: int, error_msg: str = None):
        if not self.client:
            return
        try:
            self.client.table(self.TABLE).update({
                "status":       "failed" if error_msg else "done",
                "error_msg":    error_msg,
                "processed_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", row_id).eq("status", "pending").execute()
            state = "failed" if error_msg else "done"
            log(f"[Supabase] queue id={row_id} → {state}")
        except Exception as e:
            log_err(f"[Supabase ERROR] mark_done: {e}")


# ── Printer Worker ────────────────────────────────────────────────────────────
class PrinterWorker:
    """จัดการการตรวจสอบและแจ้งเตือนของปริ้นเตอร์แต่ละเครื่อง"""

    def __init__(self, printer_cfg: dict, branch: dict,
                 telegram: TelegramNotifier,
                 logger: SupabaseLogger,
                 bartender: BartenderPrint,
                 alert_cfg: dict = None):
        self.cfg       = printer_cfg
        self.branch    = branch
        self.telegram  = telegram
        self.logger    = logger
        self.bartender = bartender

        alert_cfg = alert_cfg or {}
        self.offline_confirm_checks = alert_cfg.get("offline_confirm_checks", 3)
        self.alert_cooldown_sec     = alert_cfg.get("cooldown_minutes", 30) * 60

        self.last_status    = None   # สถานะที่ยืนยันแล้ว
        self.offline_count  = 0      # นับ offline ติดกัน
        self.last_log_time  = 0.0
        self.last_alert_times = {}   # status → timestamp สำหรับ cooldown

        # Stock Manager
        sticker = printer_cfg.get("sticker", {})
        self.stock = StockManager(
            printer_id          = printer_cfg["id"],
            initial_stock       = sticker.get("initial_stock", 1000),
            sticker_height_mm   = sticker.get("height_mm", 11),
            gap_mm              = sticker.get("gap_mm", 2),
            low_stock_threshold = sticker.get("low_stock_threshold", 200),
            stock_file          = sticker.get("stock_count_file"),
        )

    def _should_alert(self, status: str) -> bool:
        """คืน True ถ้าผ่าน cooldown แล้ว (ยังไม่เคยส่ง หรือ ส่งไปนานพอแล้ว)"""
        last = self.last_alert_times.get(status, 0)
        return (time.time() - last) >= self.alert_cooldown_sec

    def _mark_alerted(self, status: str):
        self.last_alert_times[status] = time.time()

    # ── check loop ──────────────────────────────────────────────────────────
    def check_once(self, log_interval: int):
        info       = get_printer_status(self.cfg["ip"],
                                        self.cfg.get("snmp_community", "public"))
        raw_status = info["status"]
        alert_msg  = info["alert_msg"]

        # แปลง milage → page count สำหรับ HTTP mode (TSC TA300)
        if info["page_count"] is None and info.get("milage_mm"):
            info["page_count"] = int(info["milage_mm"] / self.stock.mm_per_label)
        page_count = info["page_count"]

        self.stock.update(page_count)
        remaining = self.stock.get_remaining()

        # ─ Offline confirmation ───────────────────────────────────────────
        # ไม่แจ้งทันที ต้องนับติดกัน N รอบก่อน (ป้องกัน network กระพริบ)
        if raw_status == STATUS_OFFLINE:
            self.offline_count += 1
            if self.offline_count < self.offline_confirm_checks:
                # ยังไม่ถึง threshold — ใช้สถานะเดิม (ไม่แจ้ง)
                effective_status = self.last_status or STATUS_ONLINE
            else:
                effective_status = STATUS_OFFLINE
        else:
            self.offline_count = 0
            effective_status = raw_status

        self._print_console(effective_status, page_count, remaining,
                            offline_count=self.offline_count
                            if raw_status == STATUS_OFFLINE else 0,
                            milage_mm=info.get("milage_mm"))

        is_error = effective_status not in (STATUS_ONLINE, STATUS_PRINTING)

        # ─ State change ───────────────────────────────────────────────────
        if effective_status != self.last_status:
            if is_error:
                # Critical alert — ส่งทันที ไม่มี cooldown ตอนเปลี่ยนสถานะใหม่
                self._send_alert(effective_status, page_count, alert_msg, remaining)
                self._mark_alerted(effective_status)
                self._log(info, "error", remaining)
            elif self.last_status is not None:
                # กลับมาปกติ — แจ้งเสมอ ไม่มี cooldown
                self._send_recovered(page_count, remaining)
                self._log(info, "recovered", remaining)
            self.last_status = effective_status

        elif is_error:
            # สถานะเดิม ยังเป็น error — re-alert ถ้าผ่าน cooldown แล้ว
            if self._should_alert(effective_status):
                self._send_alert(effective_status, page_count, alert_msg, remaining)
                self._mark_alerted(effective_status)
            self._log(info, "error", remaining)

        elif (time.time() - self.last_log_time) >= log_interval:
            # ปกติ — log ลง Supabase เงียบๆ ไม่ส่ง Telegram
            self._log(info, "routine", remaining)

        # ─ เตือนสต็อกต่ำ (critical) ──────────────────────────────────────
        if 0 < remaining <= self.stock.low_stock_threshold:
            if not self.stock.low_stock_warned:
                self._send_low_stock(remaining)
                self.stock.low_stock_warned = True
        elif remaining > self.stock.low_stock_threshold:
            self.stock.low_stock_warned = False

    def _print_console(self, status: str, page_count, remaining: int,
                       offline_count: int = 0, milage_mm=None):
        text  = STATUS_TEXT.get(status, status)
        extra = f" (offline {offline_count}/{self.offline_confirm_checks})" \
                if offline_count > 0 else ""
        milage_str = f"{milage_mm / 1_000_000:.3f}km" if milage_mm else "-"
        log(f"{self.branch['name']:12s} | "
            f"{self.cfg['name']:14s} ({self.cfg['ip']:15s}) | "
            f"{text:20s}{extra} | "
            f"Milage: {milage_str:>9s} | Pages: {str(page_count):>8s} | "
            f"Stock: {remaining:>6,} rows")

    def _send_alert(self, status: str, page_count, alert_msg: str, remaining: int):
        emoji = STATUS_EMOJI.get(status, "⚠️")
        text  = STATUS_TEXT.get(status, status)
        msg = (
            f"🚨 <b>แจ้งเตือนปริ้นเตอร์</b>\n"
            f"🏪 สาขา: <b>{self.branch['name']}</b>\n"
            f"🖨️ เครื่อง: {self.cfg['name']} ({self.cfg['ip']})\n"
            f"{emoji} สถานะ: <b>{text}</b>\n"
            f"📦 สต็อกคงเหลือ: {remaining:,} แถว\n"
            f"📊 ปริ้นสะสม: {page_count or '-'} ใบ\n"
        )
        if alert_msg:
            msg += f"⚡ รายละเอียด: {alert_msg}\n"
        msg += f"🕐 {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}"
        self.telegram.send(msg)

    def _send_recovered(self, page_count, remaining: int):
        msg = (
            f"✅ <b>ปริ้นเตอร์กลับมาพร้อมใช้งาน</b>\n"
            f"🏪 สาขา: <b>{self.branch['name']}</b>\n"
            f"🖨️ เครื่อง: {self.cfg['name']} ({self.cfg['ip']})\n"
            f"📦 สต็อกคงเหลือ: {remaining:,} แถว\n"
            f"📊 ปริ้นสะสม: {page_count or '-'} ใบ\n"
            f"🕐 {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}"
        )
        self.telegram.send(msg)

    def _send_low_stock(self, remaining: int):
        msg = (
            f"⚠️ <b>สต็อกสติ๊กเกอร์ใกล้หมด</b>\n"
            f"🏪 สาขา: <b>{self.branch['name']}</b>\n"
            f"🖨️ เครื่อง: {self.cfg['name']} ({self.cfg['ip']})\n"
            f"📦 คงเหลือ: <b>{remaining:,} แถว</b> "
            f"(≈ {self.stock.get_remaining_meters():.2f} เมตร)\n"
            f"🕐 {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}"
        )
        self.telegram.send(msg)

    def _log(self, info: dict, event: str, remaining: int):
        self.logger.log(
            branch_id       = self.branch["id"],
            branch_name     = self.branch["name"],
            printer_id      = self.cfg["id"],
            printer_name    = self.cfg["name"],
            printer_ip      = self.cfg["ip"],
            status          = info["status"],
            page_count      = info["page_count"],
            alert_msg       = info["alert_msg"],
            event           = event,
            stock_remaining = remaining,
            product_name    = self.cfg.get("product_name") or None,
        )
        self.last_log_time = time.time()

    def test_print(self, copies: int = 1):
        template = self.cfg.get("bartender_template", "")
        if not template:
            return False, "ไม่ได้กำหนด bartender_template ใน config"
        return self.bartender.print_template(template, self.cfg["name"], copies)


# ขั้นตอนเปลี่ยน UI — ใช้ใน error message
CHANGE_UI_STEP_LABELS = {
    "close_app": "ปิดโปรแกรม",
    "find_ui":   "ค้นหาโฟลเดอร์ UI",
    "copy_ui":   "คัดลอกไฟล์",
    "start_app": "เปิดโปรแกรม",
    "config":    "ตั้งค่า",
}


# ── Command Executor ──────────────────────────────────────────────────────────
class CommandExecutor:
    """รันคำสั่ง Telegram / Web queue สำหรับสาขานี้"""

    def __init__(self, telegram: TelegramNotifier,
                 printers: list, branch: dict,
                 require_branch: bool = True,
                 kiosk_changer: KioskUIChanger = None):
        self.telegram       = telegram
        self.printers       = printers
        self.branch         = branch
        self.require_branch = require_branch
        self.kiosk_changer  = kiosk_changer
        self.my_branch_id   = _norm_branch_id(branch["id"])

    def error_message(self, error: str, cmd: str = None) -> str:
        if error == "missing_branch":
            return (
                "❌ กรุณาระบุ <b>branch_id</b> (รหัสสาขา)\n\n"
                "ตัวอย่าง:\n"
                "/status 02\n"
                "/stock 05\n"
                "/testprint 02 1\n"
                "/testprint 02 1 3\n"
                "/resetstock 02 1 5000"
            )
        if error == "missing_resetstock":
            return (
                "❌ รูปแบบ /resetstock\n\n"
                "/resetstock [branch_id] [จำนวนแถว]\n"
                "/resetstock [branch_id] [เครื่อง] [จำนวนแถว]\n\n"
                "ตัวอย่าง: /resetstock 02 1 5000"
            )
        if error == "invalid_stock":
            return "❌ จำนวนแถวไม่ถูกต้อง"
        if error == "invalid_resetstock":
            return "❌ รูปแบบ /resetstock ไม่ถูกต้อง"
        return "❌ คำสั่งไม่ถูกต้อง"

    def run_parsed(self, parsed: dict) -> bool:
        """รันคำสั่ง — คืน True ถ้ารันแล้ว, False ถ้าไม่ใช่สาขานี้"""
        if parsed.get("error"):
            self.telegram.send(self.error_message(parsed["error"], parsed.get("cmd")))
            return True
        cmd = parsed["cmd"]
        if cmd == "help":
            self._cmd_help()
            return True
        branch_id = parsed.get("branch_id")
        if branch_id and _norm_branch_id(branch_id) != self.my_branch_id:
            return False
        args = parsed.get("args", [])
        if cmd == "status":
            self._cmd_status()
        elif cmd == "stock":
            self._cmd_stock()
        elif cmd == "testprint":
            self._cmd_testprint(args[0], args[1])
        elif cmd == "resetstock":
            self._cmd_reset_stock(args[0], args[1])
        elif cmd == "changeui":
            self._cmd_changeui(args[0] if args else "")
        return True

    def run_from_text(self, text: str) -> bool:
        parsed = parse_telegram_command(
            text, self.require_branch, self.my_branch_id)
        if not parsed:
            return False
        return self.run_parsed(parsed)

    def _cmd_status(self):
        lines = [f"📊 <b>สถานะปริ้นเตอร์ — {self.branch['name']}</b>\n"]
        for i, pw in enumerate(self.printers, 1):
            info = get_printer_status(pw.cfg["ip"],
                                      pw.cfg.get("snmp_community", "public"))
            if info["page_count"] is None and info.get("milage_mm"):
                info["page_count"] = int(info["milage_mm"] / pw.stock.mm_per_label)
            emoji = STATUS_EMOJI.get(info["status"], "?")
            text = STATUS_TEXT.get(info["status"], info["status"])
            remaining = pw.stock.get_remaining()
            lines.append(
                f"<b>{i}. {pw.cfg['name']}</b> ({pw.cfg['ip']})\n"
                f"   {emoji} {text}\n"
                f"   📦 สต็อก: {remaining:,} แถว  "
                f"📊 ปริ้นสะสม: {info['page_count'] or '-'}\n"
            )
        lines.append(f"🕐 {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
        self.telegram.send("\n".join(lines))

    def _cmd_stock(self):
        lines = [f"📦 <b>สต็อกสติ๊กเกอร์ — {self.branch['name']}</b>\n"]
        for i, pw in enumerate(self.printers, 1):
            remaining = pw.stock.get_remaining()
            meters = pw.stock.get_remaining_meters()
            low_mark = " ⚠️ ใกล้หมด!" \
                if remaining <= pw.stock.low_stock_threshold else ""
            lines.append(
                f"<b>{i}. {pw.cfg['name']}</b>\n"
                f"   แถวคงเหลือ: {remaining:,} แถว{low_mark}\n"
                f"   ≈ กระดาษ: {meters:.2f} เมตร\n"
            )
        self.telegram.send("\n".join(lines))

    def _cmd_testprint(self, printer_idx: int, copies: int):
        if not self.printers:
            self.telegram.send("❌ สาขานี้ไม่มีปริ้นเตอร์ใน config")
            return
        if not (0 <= printer_idx < len(self.printers)):
            n = len(self.printers)
            self.telegram.send(
                f"❌ ไม่พบปริ้นเตอร์เครื่องที่ {printer_idx + 1} "
                f"(มีทั้งหมด {n} เครื่อง)\n"
                f"ใช้: /testprint {self.my_branch_id} [1–{n}] [จำนวน]"
            )
            return
        pw = self.printers[printer_idx]
        self.telegram.send(
            f"🖨️ กำลังสั่งพิมพ์ทดสอบ <b>{pw.cfg['name']}</b> "
            f"({self.branch['name']}) จำนวน {copies} ใบ..."
        )
        ok, msg = pw.test_print(copies)
        icon = "✅" if ok else "❌"
        self.telegram.send(f"{icon} <b>{pw.cfg['name']}</b>: {msg}")

    def _cmd_reset_stock(self, printer_idx: int, new_stock):
        if not self.printers:
            self.telegram.send("❌ สาขานี้ไม่มีปริ้นเตอร์ใน config")
            return
        if not (0 <= printer_idx < len(self.printers)):
            n = len(self.printers)
            self.telegram.send(
                f"❌ ไม่พบปริ้นเตอร์เครื่องที่ {printer_idx + 1}\n"
                f"ใช้: /resetstock {self.my_branch_id} [1–{n}] [จำนวนแถว]"
            )
            return
        if new_stock is None or new_stock <= 0:
            self.telegram.send(
                f"❌ กรุณาระบุจำนวนแถว\n"
                f"ตัวอย่าง: /resetstock {self.my_branch_id} 1 5000"
            )
            return
        pw = self.printers[printer_idx]
        pw.stock.reset_stock(new_stock)
        self.telegram.send(
            f"✅ รีเซ็ตสต็อก <b>{pw.cfg['name']}</b> ({self.branch['name']})\n"
            f"📦 สต็อกใหม่: {pw.stock.get_remaining():,} แถว"
        )

    def _cmd_changeui(self, product_name):
        if not self.kiosk_changer or not self.kiosk_changer.enabled:
            raise RuntimeError(
                "[ตั้งค่า] ไม่ได้กำหนด kiosk.app_dir ใน config.json"
            )
        name = str(product_name).strip() if product_name is not None else ""
        ok, msg, step = self.kiosk_changer.change_ui(name)
        if not ok:
            label = CHANGE_UI_STEP_LABELS.get(step, step)
            raise RuntimeError(f"[{label}] {msg}")
        log(f"[changeui] {msg}")
        self.telegram.send(
            f"✅ <b>เปลี่ยน UI สำเร็จ</b>\n"
            f"🏪 สาขา: <b>{self.branch['name']}</b>\n"
            f"🏷️ สินค้า: {name}\n"
            f"📝 {msg}\n"
            f"🕐 {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}"
        )

    def _cmd_help(self):
        n = len(self.printers)
        self.telegram.send(
            f"📖 <b>คำสั่ง Printer Monitor</b>\n\n"
            f"<b>ระบุ branch_id ทุกคำสั่ง</b> (รหัสสาขาใน config)\n\n"
            f"/status [branch_id]\n"
            f"   ดูสถานะปริ้นเตอร์\n"
            f"   ตัวอย่าง: /status 02\n\n"
            f"/stock [branch_id]\n"
            f"   ดูสต็อกสติ๊กเกอร์\n"
            f"   ตัวอย่าง: /stock 02\n\n"
            f"/testprint [branch_id] [เครื่อง] [จำนวน]\n"
            f"   ทดสอบปริ้น\n"
            f"   ตัวอย่าง: /testprint 02 1\n"
            f"   ตัวอย่าง: /testprint 02 2 3\n\n"
            f"/resetstock [branch_id] [เครื่อง] [แถว]\n"
            f"   รีเซ็ตสต็อกเมื่อเปลี่ยนม้วนกระดาษ\n"
            f"   ตัวอย่าง: /resetstock 02 1 5000\n\n"
            f"/help — แสดงคำสั่งนี้\n\n"
            f"🏪 สาขานี้: <b>{self.branch['name']}</b> "
            f"(id: <code>{self.my_branch_id}</code>)\n"
            f"🖨️ ปริ้นเตอร์: {n} เครื่อง (N = 1–{n})\n\n"
            f"💡 กด <b>/</b> ในแชทเพื่อเลือกคำสั่งจากเมนู"
        )


# ── Telegram Hub (รันเครื่องเดียว — รับคำสั่งแล้วส่งเข้า Supabase queue) ─────
class TelegramHub:
    def __init__(self, telegram: TelegramNotifier,
                 command_queue: SupabaseCommandQueue,
                 require_branch: bool = True,
                 default_branch_id: str = None):
        self.telegram          = telegram
        self.command_queue     = command_queue
        self.require_branch    = require_branch
        self.default_branch_id = default_branch_id
        self._running          = True
        self._executor         = CommandExecutor(
            telegram, [], {"id": "hub", "name": "Command Hub"}, require_branch)

    def start(self):
        self._ensure_polling_mode()
        self.telegram.set_my_commands()
        t = threading.Thread(target=self._poll_loop,
                             daemon=True, name="TelegramHub")
        t.start()
        log("[Telegram Hub] เริ่มรับคำสั่ง → Supabase queue")
        log("[Telegram Hub] ทดสอบ: ส่ง /status 18 ใน group (branch_id ตาม config)")

    def _ensure_polling_mode(self):
        """getUpdates ใช้ได้เมื่อไม่มี webhook — ลบ webhook ถ้ามี"""
        if not REQUESTS_AVAILABLE:
            return
        try:
            base = self.telegram.base_url
            info = requests.get(f"{base}/getWebhookInfo", timeout=10).json()
            if info.get("result", {}).get("url"):
                requests.get(f"{base}/deleteWebhook", timeout=10)
                log("[Telegram Hub] ลบ webhook เพื่อใช้ polling")
        except Exception as e:
            log_err(f"[Telegram Hub] deleteWebhook: {e}")

    def stop(self):
        self._running = False

    def _poll_loop(self):
        while self._running:
            try:
                offset = (self.telegram.last_update_id + 1) \
                    if self.telegram.last_update_id is not None else None
                updates = self.telegram.get_updates(offset=offset, timeout=10)
                for update in updates:
                    self.telegram.last_update_id = update["update_id"]
                    msg = update.get("message", {})
                    chat = str(msg.get("chat", {}).get("id", ""))
                    if chat != self.telegram.chat_id:
                        continue
                    text = msg.get("text", "").strip()
                    if text.startswith("/"):
                        log(f"[Telegram Hub] รับคำสั่ง: {text}")
                        self._handle(text, chat)
            except Exception as e:
                log_err(f"[Telegram Hub ERROR] {e}")
                time.sleep(5)

    def _handle(self, text: str, chat_id: str):
        parsed = parse_telegram_command(
            text, self.require_branch, self.default_branch_id)
        if not parsed:
            return
        if parsed.get("error"):
            self.telegram.send(
                self._executor.error_message(parsed["error"], parsed.get("cmd")))
            return
        if parsed["cmd"] == "help":
            self._send_hub_help()
            return
        branch_id = parsed.get("branch_id")
        if not branch_id:
            self.telegram.send(self._executor.error_message("missing_branch"))
            return
        if not self.command_queue.enqueue(
                branch_id, parsed["cmd"], parsed.get("args", []), chat_id):
            self.telegram.send("❌ ไม่สามารถส่งคำสั่งได้ — ตรวจ Supabase")
            return
        cmd_labels = {
            "status": "ดูสถานะ", "stock": "ดูสต็อก",
            "testprint": "ทดสอบปริ้น", "resetstock": "รีเซ็ตสต็อก",
        }
        label = cmd_labels.get(parsed["cmd"], parsed["cmd"])
        self.telegram.send(
            f"📤 ส่งคำสั่ง <b>{label}</b> → สาขา "
            f"<code>{branch_id}</code> แล้ว\n"
            f"⏳ รอสาขาตอบกลับ..."
        )

    def _send_hub_help(self):
        self.telegram.send(
            "📖 <b>คำสั่ง Printer Monitor (160 สาขา)</b>\n\n"
            "<b>ระบุ branch_id ทุกคำสั่ง</b> (รหัสสาขาใน config แต่ละสาขา)\n\n"
            "/status [branch_id]\n"
            "   ตัวอย่าง: /status 02\n\n"
            "/stock [branch_id]\n"
            "   ตัวอย่าง: /stock 02\n\n"
            "/testprint [branch_id] [เครื่อง] [จำนวน]\n"
            "   ตัวอย่าง: /testprint 02 1\n"
            "   ตัวอย่าง: /testprint 02 2 3\n\n"
            "/resetstock [branch_id] [เครื่อง] [แถว]\n"
            "   ตัวอย่าง: /resetstock 02 1 5000\n\n"
            "/help — แสดงคำสั่งนี้\n\n"
            "💡 กด <b>/</b> ในแชทเพื่อเลือกคำสั่งจากเมนู"
        )


# ── Branch Queue Poller (สาขาดึงคำสั่งจาก Supabase) ───────────────────────────
class BranchQueuePoller:
    def __init__(self, executor: CommandExecutor,
                 command_queue: SupabaseCommandQueue,
                 poll_interval: int = 5):
        self.executor      = executor
        self.command_queue = command_queue
        self.poll_interval = poll_interval
        self._running      = True

    def start(self):
        if not self.command_queue.available:
            log_err("[Command Queue] Supabase ไม่พร้อม — ไม่ poll คำสั่ง")
            return
        t = threading.Thread(target=self._poll_loop,
                             daemon=True, name="BranchQueuePoll")
        t.start()
        log(f"[Command Queue] Poll สาขา {self.executor.my_branch_id} "
            f"ทุก {self.poll_interval} วินาที")

    def stop(self):
        self._running = False

    def _poll_loop(self):
        while self._running:
            try:
                rows = self.command_queue.fetch_pending(
                    self.executor.my_branch_id)
                for row in rows:
                    parsed = {
                        "cmd":       row["command"],
                        "branch_id": row["branch_id"],
                        "args":      row.get("args") or [],
                    }
                    try:
                        self.executor.run_parsed(parsed)
                        self.command_queue.mark_done(row["id"])
                    except Exception as e:
                        log_err(f"[Command Queue ERROR] {e}")
                        self.command_queue.mark_done(row["id"], str(e))
            except Exception as e:
                log_err(f"[Command Queue Poll ERROR] {e}")
            time.sleep(self.poll_interval)


# ── Direct Command Handler (โหมดเดิม — สาขาเดียว / ไม่ใช้ queue) ─────────────
class DirectCommandHandler:
    def __init__(self, executor: CommandExecutor):
        self.executor = executor
        self._running = True

    def start(self):
        self.executor.telegram.set_my_commands()
        t = threading.Thread(target=self._poll_loop,
                             daemon=True, name="TelegramPoll")
        t.start()
        log("[Telegram] โหมด direct — polling คำสั่ง (สาขาเดียว)")

    def stop(self):
        self._running = False

    def _poll_loop(self):
        while self._running:
            try:
                offset = (self.executor.telegram.last_update_id + 1) \
                    if self.executor.telegram.last_update_id is not None else None
                updates = self.executor.telegram.get_updates(
                    offset=offset, timeout=10)
                for update in updates:
                    self.executor.telegram.last_update_id = update["update_id"]
                    msg = update.get("message", {})
                    chat = str(msg.get("chat", {}).get("id", ""))
                    if chat != self.executor.telegram.chat_id:
                        continue
                    text = msg.get("text", "").strip()
                    if text.startswith("/"):
                        self.executor.run_from_text(text)
            except Exception as e:
                log_err(f"[Telegram Poll ERROR] {e}")
                time.sleep(5)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    cfg = load_config()

    branch         = cfg["branch"]
    tg_cfg         = cfg.get("telegram", {})
    sb_cfg         = cfg.get("supabase", {})
    bt_cfg         = cfg.get("bartender", {})
    kiosk_cfg      = cfg.get("kiosk", {})
    check_interval = int(cfg.get("check_interval", 60))
    log_interval   = int(cfg.get("log_interval", 300))

    command_mode   = tg_cfg.get("command_mode", "branch")
    command_hub    = bool(tg_cfg.get("command_hub", False))
    require_branch = bool(tg_cfg.get("require_branch", True))
    queue_poll_sec = int(tg_cfg.get("queue_poll_seconds", 5))

    # ── Init services ──────────────────────────────────────────────────────
    telegram = TelegramNotifier(
        tg_cfg.get("bot_token", ""), tg_cfg.get("chat_id", ""))
    logger = SupabaseLogger(
        sb_cfg.get("url", ""), sb_cfg.get("key", ""),
        sb_cfg.get("table_name", "printer_log")
    )
    command_queue = SupabaseCommandQueue(
        sb_cfg.get("url", ""), sb_cfg.get("key", ""))
    bartender = BartenderPrint(bt_cfg.get("exe_path", ""))
    kiosk_changer = KioskUIChanger(kiosk_cfg)

    # ── Init printer workers ───────────────────────────────────────────────
    alert_cfg = cfg.get("alert", {})
    printers = []
    for p_cfg in cfg.get("printers", []):
        printers.append(
            PrinterWorker(p_cfg, branch, telegram, logger, bartender, alert_cfg)
        )

    is_hub_only = command_hub and not printers
    if not printers and not command_hub:
        _fatal_startup(
            "config.json ไม่มี printers และ command_hub ไม่ได้เปิด\n\n"
            "สาขา: ใส่ printers\n"
            "Hub: ตั้ง telegram.command_hub = true (printers ว่างได้)"
        )

    cmd_executor = CommandExecutor(
        telegram, printers, branch, require_branch, kiosk_changer)
    hub_handler = None
    queue_poller = None
    direct_handler = None

    # ── Telegram: Hub (เครื่องเดียว — 160 สาขาใช้ bot/group เดียวกัน) ───
    if command_hub:
        if not command_queue.available:
            _fatal_startup(
                "command_hub ต้องใช้ Supabase — ตรวจ url/key และ migration 014"
            )
        hub_handler = TelegramHub(
            telegram, command_queue, require_branch, branch.get("id"))
        hub_handler.start()

    # ── Telegram: สาขาดึงคำสั่งจาก Supabase queue ───────────────────────
    if command_mode == "branch" and not command_hub:
        queue_poller = BranchQueuePoller(
            cmd_executor, command_queue, queue_poll_sec)
        queue_poller.start()
    elif command_mode == "direct":
        direct_handler = DirectCommandHandler(cmd_executor)
        direct_handler.start()
    elif command_mode == "branch" and command_hub and printers:
        # เครื่องที่เป็น hub + สาขา — ยัง poll คิวสำหรับสาขาตัวเอง
        queue_poller = BranchQueuePoller(
            cmd_executor, command_queue, queue_poll_sec)
        queue_poller.start()

    # ── Startup banner ─────────────────────────────────────────────────────
    sep = "=" * 65
    log(sep)
    log("  TSC T300A Printer Monitor")
    log(f"  สาขา      : {branch['name']} ({branch['id']})")
    log(f"  ปริ้นเตอร์ : {len(printers)} เครื่อง")
    log(f"  คำสั่ง TG  : mode={command_mode} hub={command_hub} "
        f"require_branch={require_branch}")
    if not is_hub_only:
        log(f"  ตรวจสอบทุก {check_interval} วินาที | Log ทุก {log_interval} วินาที")
    log(f"  Log file   : {LOG_FILE}")
    log(sep)

    if cfg.get("alert", {}).get("notify_startup", False):
        telegram.send(
            f"🟢 <b>Printer Monitor เริ่มทำงาน</b>\n"
            f"🏪 สาขา: <b>{branch['name']}</b>\n"
            f"🖨️ ปริ้นเตอร์: {len(printers)} เครื่อง\n"
            f"🕐 {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}"
        )

    # ── Main loop ──────────────────────────────────────────────────────────
    try:
        if is_hub_only:
            while True:
                time.sleep(60)
        else:
            while True:
                for pw in printers:
                    try:
                        pw.check_once(log_interval)
                    except Exception as e:
                        log_err(f"[ERROR] {pw.cfg['name']}: {e}")
                time.sleep(check_interval)

    except KeyboardInterrupt:
        log("หยุดโปรแกรม...")
        if hub_handler:
            hub_handler.stop()
        if queue_poller:
            queue_poller.stop()
        if direct_handler:
            direct_handler.stop()
        telegram.send(
            f"🔴 <b>Printer Monitor หยุดทำงาน</b>\n"
            f"🏪 สาขา: {branch['name']}\n"
            f"🕐 {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}"
        )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        import traceback
        err_text = traceback.format_exc()
        log_err("=" * 60)
        log_err("โปรแกรม crash ด้วย error:")
        log_err(err_text)
        log_err("=" * 60)
        _fatal_startup(
            f"Printer Monitor หยุดทำงานด้วย error:\n\n{exc}\n\n"
            f"ดูรายละเอียดใน:\n{LOG_FILE}"
        )
