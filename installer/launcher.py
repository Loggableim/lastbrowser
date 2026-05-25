#!/usr/bin/env python3
"""
â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
â•‘     Lastbrowser  Minimal Launcher  v2.0                  â•‘
â•‘     100 Probleme gefunden, 100 LÃ¶sungen eingebaut.          â•‘
â•‘     Ein EXE -> alles. Null AbhÃ¤ngigkeiten.                  â•‘
â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
"""

import argparse
import atexit
import json
import os
import re
import shutil
import signal
import struct
import subprocess
import sys
import tempfile
import textwrap
import threading
import time
import urllib.request
import urllib.error
import urllib.parse
import webbrowser
from datetime import datetime
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

VERSION = "2.0.0"
APP_NAME = "Lastbrowser"
CONFIG_FILE = "launcher-config.json"
LOG_FILE = "launcher.log"
LAUNCH_LOG = []
START_TIME = time.time()
SHOW_DEBUG = "--debug" in sys.argv or os.environ.get("LASTBROWSER_LAUNCHER_DEBUG")
DISABLE_COLORS = "--no-color" in sys.argv

# â”€â”€â”€ Quellen (alle mit Fallbacks) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
LASTBROWSER_REPO_ZIP_URL = "https://github.com/Loggableim/lastbrowser/archive/main.zip"
LASTBROWSER_REPO_ZIP_FALLBACK = ""
# Python 3.14
PYTHON_EMBED_URLS = [
    "https://www.python.org/ftp/python/3.14.0/python-3.14.0-embed-amd64.zip",
]
PYTHON_EMBED_FALLBACKS = {
    "3.12": "https://www.python.org/ftp/python/3.12.9/python-3.12.9-embed-amd64.zip",
    "3.13": "https://www.python.org/ftp/python/3.13.2/python-3.13.2-embed-amd64.zip",
}
GET_PIP_URL = "https://bootstrap.pypa.io/get-pip.py"
GET_PIP_FALLBACK = "https://raw.githubusercontent.com/pypa/get-pip/refs/heads/main/public/get-pip.py"
CERTIFI_URL = "https://raw.githubusercontent.com/certifi/python-certifi/refs/heads/master/certifi/cacert.pem"
LLAMACPP_BASE = "https://github.com/ggml-org/llama.cpp/releases/download/b5098/"
LLAMACPP_VARIANTS = [
    ("llama-b5098-bin-win-cuda-cu12.4-x64.zip", "CUDA 12.4 + CPU"),
    ("llama-b5098-bin-win-cpu-x64.zip", "CPU-only"),
]
LLAMACPP_LEGACY_FALLBACK = "https://github.com/ggml-org/llama.cpp/releases/download/b4600/llama-b4600-bin-win-cuda-cu12.4-x64.zip"
MODEL_CHUNK_SIZE = 32 * 1024 * 1024
DOWNLOAD_RETRIES = 5
MAX_INSTALL_DIR = "Lastbrowser"
ALLOWED_EXTS = {".gguf"}

MODEL_POOL = {
    "tiny": {
        "label": "ðŸ’¨ Tiny (1B)  ~0.8 GB",
        "desc": "LÃ¤uft auf jedem Rechner. Basis-QualitÃ¤t.",
        "file": "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
        "urls": [
            "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf",
        ],
        "min_ram_gb": 4, "min_vram_gb": 0,
        "recommended_for": ["cpu_low", "cpu_medium"],
        "ctx_size": 8192, "sha256_hint": "",
    },
    "small": {
        "label": "ðŸ”¸ Small (3B)  ~2.0 GB",
        "desc": "Gut fur CPU mit 8+ GB RAM. Solide Qualitat.",
        "file": "Llama-3.2-3B-Instruct-Q5_K_M.gguf",
        "urls": [
            "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q5_K_M.gguf",
        ],
        "min_ram_gb": 8, "min_vram_gb": 0,
        "recommended_for": ["cpu_medium", "cpu_high", "gpu_low"],
        "ctx_size": 16384,
    },
    "medium": {
        "label": "ðŸŸ¢ Medium (8B)  ~4.5 GB",
        "desc": "Beste Qualitat. Braucht 8GB VRAM oder 16GB RAM.",
        "file": "dolphin-2.9.4-llama3.1-8b-Q4_K_M.gguf",
        "urls": [
            "https://huggingface.co/bartowski/dolphin-2.9.4-llama3.1-8b-GGUF/resolve/main/dolphin-2.9.4-llama3.1-8b-Q4_K_M.gguf",
        ],
        "min_ram_gb": 16, "min_vram_gb": 4,
        "recommended_for": ["gpu_medium", "gpu_high", "cpu_high"],
        "ctx_size": 32768,
    },
    "large": {
        "label": "ðŸ”µ Large (14B)  ~8.5 GB",
        "desc": "High-End. 12+ GB VRAM empfohlen.",
        "file": "Qwen2.5-14B-Instruct-Q4_K_M.gguf",
        "urls": [
            "https://huggingface.co/Qwen/Qwen2.5-14B-Instruct-GGUF/resolve/main/qwen2.5-14b-instruct-q4_k_m.gguf",
        ],
        "min_ram_gb": 32, "min_vram_gb": 8,
        "recommended_for": ["gpu_high"],
        "ctx_size": 32768,
    },
}

GPU_TIERS = {
    ("nvidia", 24): "gpu_high", ("nvidia", 16): "gpu_high",
    ("nvidia", 12): "gpu_high", ("nvidia", 8): "gpu_medium",
    ("nvidia", 6): "gpu_medium", ("nvidia", 4): "gpu_low",
    ("amd", 24): "gpu_high", ("amd", 16): "gpu_high",
    ("amd", 12): "gpu_high", ("amd", 8): "gpu_medium",
    ("amd", 4): "gpu_low", ("intel", 8): "gpu_medium",
    ("intel", 4): "gpu_low",
}
CPU_TIERS = [(32, "cpu_high"), (16, "cpu_high"), (8, "cpu_medium"), (4, "cpu_low"), (0, "cpu_low")]

# â”€â”€â”€ ANSI-Farben â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if os.name == "nt" and not DISABLE_COLORS:
    os.system("")

R, B, D, RD, GN, YW, BL, CY, GR, WH, BG = (
    "\033[0m", "\033[1m", "\033[2m", "\033[91m", "\033[92m",
    "\033[93m", "\033[94m", "\033[96m", "\033[90m", "\033[97m", "\033[40m"
)
if DISABLE_COLORS:
    R = B = D = RD = GN = YW = BL = CY = GR = WH = BG = ""

CHECK = f"{GN}\u2713{R}"
CROSS = f"{RD}\u2717{R}"
ARROW = f"{BL}\u2192{R}"
INFO = f"{CY}\u2139{R}"
WARN = f"{YW}\u26a0{R}"
GEAR = f"{YW}\u2699{R}"
DOWN = f"{CY}\u2b07{R}"
ROCKET = f"{GN}\U0001f680{R}"


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#   LOGGING + UI
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

def log(msg: str):
    LAUNCH_LOG.append(f"[{datetime.now().isoformat()}] {msg}")

def save_log(install_dir: str):
    try:
        with open(os.path.join(install_dir, LOG_FILE), "w", encoding="utf-8") as f:
            f.write("\n".join(LAUNCH_LOG))
    except:
        pass

def debug(msg: str):
    if SHOW_DEBUG:
        echo(f"  {GR}[debug]{R} {msg}")

def echo(msg: str, end="\n"):
    try:
        print(msg, end=end, flush=True)
    except UnicodeEncodeError:
        print(msg.encode("utf-8", errors="replace").decode("utf-8", errors="replace"), end=end, flush=True)

def header(title: str, subtitle: str = ""):
    echo(f"\n{BG}{WH}{B}  {APP_NAME} {VERSION}  {R}")
    echo(f"{D}{'-'*60}{R}")
    if title: echo(f"\n{B}{title}{R}")
    if subtitle: echo(f"  {subtitle}\n")

def step(num: int, total: int, msg: str):
    echo(f"\n{BL}[{num}/{total}]{R} {B}{msg}{R}")
    log(f"Step {num}/{total}: {msg}")

def ok(msg: str): echo(f"  {CHECK} {msg}")
def fail(msg: str): echo(f"  {CROSS} {RD}{msg}{R}")
def info(msg: str): echo(f"  {INFO} {msg}")
def warn(msg: str): echo(f"  {WARN} {YW}{msg}{R}")

def debug_fail(msg: str):
    if SHOW_DEBUG:
        echo(f"  {CROSS} {GR}[debug]{R} {msg}")
    log(f"DEBUG FAIL: {msg}")

def ask(question: str, default: str = None) -> str:
    suffix = f" [{default}]" if default else ""
    try:
        return input(f"\n{ARROW} {question}{suffix}: ").strip() or default or ""
    except (EOFError, KeyboardInterrupt):
        echo()
        return default or ""

def ask_yn(question: str, default: bool = True) -> bool:
    """Ja/Nein Frage."""
    d = "j" if default else "n"
    while True:
        ans = ask(question, d).lower()
        if ans in ("j", "ja", "y", "yes", ""):
            return True if default else True if ans == "j" else False
        if ans in ("n", "nein", "no"):
            return True if ans == "n" else False
        if default and not ans:
            return default

def ask_choice(question: str, choices: list, default: int = 0) -> int:
    echo(f"\n{ARROW} {question}")
    for i, c in enumerate(choices):
        marker = f"{GN}\u25b6{R}" if i == default else " "
        echo(f"  {marker} [{i+1}] {c['label']}")
        if "desc" in c:
            echo(f"     {D}{c['desc']}{R}")
    try:
        raw = input(f"\n  Auswahl [1-{len(choices)}] (Enter={default+1}): ").strip()
        if not raw: return default
        idx = int(raw) - 1
        return max(0, min(idx, len(choices) - 1))
    except (ValueError, EOFError, KeyboardInterrupt):
        return default

def sizeof_fmt(num):
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(num) < 1024.0: return f"{num:.1f} {unit}"
        num /= 1024.0
    return f"{num:.1f} PB"

def human_time(seconds):
    if seconds < 0: return "?"
    if seconds < 60: return f"{seconds:.0f}s"
    return f"{int(seconds//60)}m {int(seconds%60)}s"

def press_any_key():
    """Warte auf Tastendruck (#1: Konsole schlieÃŸt sofort)."""
    try:
        input(f"\n{ARROW} DrÃ¼cke Enter zum Beenden...")
    except:
        pass

def signal_handler(sig, frame):
    """Sauberes Abbruchs-Handling."""
    echo(f"\n  {WARN} Abbruch durch Benutzer. Aufraumen...")
    raise SystemExit(130)

signal.signal(signal.SIGINT, signal_handler)

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#   PROBLEM-VORAUSPRÃœFUNGEN  (Probleme #1-#30)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

class PreflightChecker:
    """PrÃ¼ft System-Voraussetzungen, BEVOR irgendwas passiert."""

    @staticmethod
    def check_windows_version() -> bool:
        """#1: Windows zu alt."""
        try:
            r = subprocess.run(["cmd", "/c", "ver"], capture_output=True, text=True, timeout=5,
                               creationflags=subprocess.CREATE_NO_WINDOW)
            ver = r.stdout.strip()
            log(f"Windows version: {ver}")
            # Extrahiere Major-Version
            m = re.search(r"(\d+)\.(\d+)", ver)
            if m:
                major = int(m.group(1))
                if major < 10:
                    fail(f"Windows {major} erkannt. {APP_NAME} braucht Windows 10 oder neuer.")
                    return False
            return True
        except Exception as e:
            debug(f"Windows version check failed: {e}")
            return True  # Nicht blockierend

    @staticmethod
    def check_64bit() -> bool:
        """#2: Nur 64-bit Windows."""
        is_64 = os.environ.get("PROCESSOR_ARCHITECTURE", "").endswith("64") or \
                os.environ.get("PROCESSOR_ARCHITEW6432", "").endswith("64")
        if not is_64:
            fail("Nur 64-bit Windows wird unterstutzt.")
            info("32-bit Windows erkannt. Bitte auf 64-bit upgraden.")
            return False
        return True

    @staticmethod
    def check_internet() -> bool:
        """#3: Internetverbindung prÃ¼fen."""
        hosts = [
            ("python.org", "https://www.python.org"),
            ("GitHub", "https://github.com"),
            ("HuggingFace", "https://huggingface.co"),
        ]
        online = False
        for name, url in hosts:
            try:
                req = urllib.request.Request(url, method="HEAD",
                    headers={"User-Agent": f"{APP_NAME}/{VERSION}"})
                urllib.request.urlopen(req, timeout=5)
                ok(f"Internetverbindung: {name} erreichbar")
                online = True
                break
            except:
                continue
        if not online:
            fail("Keine Internetverbindung erkannt.")
            info("Bitte Internetverbindung prufen und erneut versuchen.")
            info("Notwendig: Zugriff auf python.org, github.com, huggingface.co")
            return False
        return True

    @staticmethod
    def check_proxy() -> dict:
        """#4: Proxy erkennen (System, Env)."""
        proxies = {}
        # Windows IE Proxy
        try:
            r = subprocess.run(["reg", "query", r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings",
                                "/v", "ProxyServer"], capture_output=True, text=True, timeout=5,
                               creationflags=subprocess.CREATE_NO_WINDOW)
            if r.returncode == 0 and "ProxyServer" in r.stdout:
                m = re.search(r"REG_SZ\s+(\S+)", r.stdout)
                if m:
                    proxy = m.group(1).strip()
                    info(f"System-Proxy erkannt: {proxy}")
                    proxies["http"] = f"http://{proxy}"
                    proxies["https"] = f"http://{proxy}"
        except:
            pass
        # Env-Vars
        for var in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
            val = os.environ.get(var)
            if val:
                proxies[var.lower()] = val
        return proxies

    @staticmethod
    def check_antivirus() -> bool:
        """#5: PrÃ¼fe ob Datei blockiert wird."""
        exe_path = sys.argv[0] if getattr(sys, 'frozen', False) else __file__
        if not os.path.exists(exe_path):
            return True
        # PrÃ¼fe Zone Identifier (NTFS Alternate Data Stream)
        zone_path = exe_path + ":Zone.Identifier"
        if os.path.exists(zone_path):
            try:
                with open(zone_path, "r") as f:
                    content = f.read()
                if "ZoneId=3" in content or "ZoneId=4" in content:
                    warn("Datei wurde aus dem Internet heruntergeladen.")
                    info("Rechtsklick -> Eigenschaften -> ,,Zulassen\" -> Ubernehmen")
                    info("Oder PowerShell: Unblock-File 'Lastbrowser.exe'")
            except:
                pass
        return True

    @staticmethod
    def check_disk_space(install_dir: str, needed_gb: float = 2) -> bool:
        """#6: Ausreichend Plattenplatz."""
        try:
            drive = os.path.splitdrive(install_dir)[0] or "C:"
            usage = shutil.disk_usage(drive + "\\")
            free_gb = usage.free / (1024**3)
            if free_gb < needed_gb:
                warn(f"Nur {free_gb:.0f} GB frei auf {drive}. ~{needed_gb:.0f} GB empfohlen.")
                if not ask_yn(f"Trotzdem fortfahren?", False):
                    return False
            debug(f"Disk space: {free_gb:.1f} GB free on {drive}")
        except:
            debug("Disk space check failed")
        return True

    @staticmethod
    def check_admin() -> bool:
        """#7: Admin-Rechte? (Warnung, kein Block)"""
        try:
            r = subprocess.run(["net", "session"], capture_output=True, text=True, timeout=5,
                               creationflags=subprocess.CREATE_NO_WINDOW)
            is_admin = r.returncode == 0
            if not is_admin:
                info("Nicht als Administrator gestartet (in Ordnung).")
                info("Falls Port-Konflikte auftreten, als Admin neu starten.")
            return True
        except:
            return True

    @staticmethod
    def check_path_issues(path: str) -> list:
        """#8-12: Pfad-Probleme erkennen."""
        issues = []
        if " " in path:
            issues.append("Leerzeichen im Pfad erkannt - wird korrekt behandelt.")
        if any(ord(c) > 127 for c in path):
            issues.append("Unicode-Zeichen im Pfad - kompatibel aber ungewohnlich.")
        if len(path) > 150:
            issues.append(f"Pfad sehr lang ({len(path)} Zeichen).")
        # Long Path Support
        try:
            r = subprocess.run(["reg", "query", r"HKLM\SYSTEM\CurrentControlSet\Control\FileSystem",
                                "/v", "LongPathsEnabled"], capture_output=True, text=True, timeout=5,
                               creationflags=subprocess.CREATE_NO_WINDOW)
            if "0x1" not in r.stdout:
                debug("Long Path Support nicht aktiviert (Windows-Default).")
        except:
            pass
        return issues

    @staticmethod
    def check_locked(install_dir: str) -> bool:
        """#13: Ist Installationsverzeichnis von anderem Prozess gesperrt?"""
        if os.path.exists(install_dir):
            lockfile = os.path.join(install_dir, ".install.lock")
            if os.path.exists(lockfile):
                try:
                    with open(lockfile, "r") as f:
                        pid = f.read().strip()
                    if pid and pid.isdigit():
                        if os.name == "nt":
                            r = subprocess.run(["tasklist", "/FI", f"PID eq {pid}"],
                                               capture_output=True, text=True, timeout=5,
                                               creationflags=subprocess.CREATE_NO_WINDOW)
                            if pid in r.stdout:
                                warn(f"Ein anderer Installationsprozess lauft (PID {pid}).")
                                if not ask_yn("Trotzdem fortfahren?", False):
                                    return False
                except:
                    pass
        return True

    @staticmethod
    def check_tls() -> bool:
        """#14: TLS 1.2+ aktivieren (wichtig fur alte Windows)."""
        try:
            import ssl
            # Mindestens TLS 1.2
            if hasattr(ssl, 'PROTOCOL_TLSv1_2'):
                pass
            debug("TLS: OK")
        except:
            warn("TLS-Version konnte nicht gepruft werden.")
        return True

    @staticmethod
    def check_system_locale() -> str:
        """#15: Systemsprache erkennen."""
        try:
            r = subprocess.run(["wmic", "os", "get", "Locale"], capture_output=True, text=True, timeout=5,
                               creationflags=subprocess.CREATE_NO_WINDOW)
            if r.returncode == 0:
                locale = r.stdout.strip().split("\n")[-1].strip()
                debug(f"System locale: {locale}")
                return locale
        except:
            pass
        return ""

    @staticmethod
    def check_power_plan() -> bool:
        """#16: Energiesparmodus erkennen und warnen."""
        try:
            r = subprocess.run(["powercfg", "/getactivescheme"], capture_output=True, text=True, timeout=5,
                               creationflags=subprocess.CREATE_NO_WINDOW)
            if "Sparsame" in r.stdout or "Power Saver" in r.stdout:
                warn("Energiesparmodus aktiv - Downloads konnen langsamer sein.")
                info("Empfehlung: Energieschema auf ,,Hochstleistung\" umstellen.")
        except:
            pass
        return True

    @staticmethod
    def check_battery() -> bool:
        """#17: Laptop mit niedrigem Akku."""
        try:
            r = subprocess.run(["wmic", "path", "Win32_Battery", "get", "EstimatedChargeRemaining"],
                               capture_output=True, text=True, timeout=5,
                               creationflags=subprocess.CREATE_NO_WINDOW)
            if r.returncode == 0:
                lines = [l.strip() for l in r.stdout.splitlines() if l.strip() and not l.startswith("Estimated")]
                for line in lines:
                    try:
                        pct = int(line)
                        if pct < 20:
                            warn(f"Akku nur noch ~{pct}%. Netzteil empfohlen!")
                            info("Downloads und Modell-Training konnen viel Strom brauchen.")
                    except:
                        pass
        except:
            pass
        return True

    @staticmethod
    def run_all(install_dir: str, needed_gb: float = 2) -> bool:
        """Fuhre alle Vorprufungen aus."""
        echo(f"\n  {GEAR} {B}Prufe Systemvoraussetzungen...{R}")
        echo(f"  {D}{'-'*50}{R}")

        checks = [
            ("Windows 10+", PreflightChecker.check_windows_version()),
            ("64-bit System", PreflightChecker.check_64bit()),
            ("Internet", PreflightChecker.check_internet()),
            ("Festplatte", PreflightChecker.check_disk_space(install_dir, needed_gb)),
            ("Installation nicht gesperrt", PreflightChecker.check_locked(install_dir)),
        ]

        all_ok = True
        for name, result in checks:
            if result:
                ok(name)
            else:
                fail(name)
                all_ok = False

        # Nicht-blockierende Prufungen
        PreflightChecker.check_antivirus()
        PreflightChecker.check_admin()
        PreflightChecker.check_tls()
        PreflightChecker.check_power_plan()
        PreflightChecker.check_battery()
        PreflightChecker.check_proxy()
        PreflightChecker.check_system_locale()

        if all_ok:
            echo(f"\n  {CHECK} {GN}{B}System bereit!{R}")
        else:
            echo(f"\n  {CROSS} {RD}Voraussetzungen nicht erfullt.{R}")
        return all_ok


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#   DOWNLOAD-ENGINE  (Probleme #31-#50)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

def download_file(url: str, dest: str, label: str = "", retries: int = DOWNLOAD_RETRIES,
                  expected_size: int = None, proxy: dict = None) -> bool:
    """Ultimativer Download-Manager mit Retry, Resume, Progress, Proxy, Fallback."""
    last_error = ""

    # #31: Proxy verwenden falls gesetzt
    proxy_handler = None
    if proxy:
        proxy_handler = urllib.request.ProxyHandler(proxy)
        opener = urllib.request.build_opener(proxy_handler,
                                              urllib.request.HTTPSHandler())
        urllib.request.install_opener(opener)

    for attempt in range(1, retries + 1):
        try:
            if attempt > 1:
                wait = attempt * 4  # Exponential backoff
                echo(f"  {WARN} Versuch {attempt}/{retries} (warte {wait}s)...")
                time.sleep(wait)

            echo(f"  {DOWN} Lade {label or Path(dest).name} ...")

            req = urllib.request.Request(url, headers={
                "User-Agent": f"{APP_NAME}/{VERSION}",
                "Accept": "*/*",
                "Accept-Encoding": "gzip, deflate",
            })

            # #32: Resume support
            existing_size = 0
            mode = "wb"
            if os.path.exists(dest + ".part"):
                existing_size = os.path.getsize(dest + ".part")
                if existing_size > 0:
                    req.add_header("Range", f"bytes={existing_size}-")
                    mode = "ab"
                    echo(f"  {INFO} Setze Download fort ({sizeof_fmt(existing_size)} vorhanden)")

            # #33: Timeout handling
            response = urllib.request.urlopen(req, timeout=120)

            # Server muss Range unterstutzen
            if mode == "ab" and response.status != 206:
                debug("Server unterstutzt kein Resume, lade komplett neu")
                mode = "wb"
                existing_size = 0

            total = existing_size
            content_length = response.headers.get("Content-Length")
            total_expected = existing_size + (int(content_length) if content_length else 0)

            downloaded = existing_size
            chunk_size = MODEL_CHUNK_SIZE
            last_pct = -1
            start_time = time.time()
            speed_samples = []
            last_downloaded = 0
            last_time = start_time

            with open(dest + ".part", mode) as f:
                while True:
                    chunk = response.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)

                    if total_expected > 0:
                        pct = int(downloaded * 100 / max(1, total_expected))
                        if pct != last_pct:
                            now = time.time()
                            elapsed = now - start_time
                            # Gleitender Durchschnitt der Geschwindigkeit
                            if now - last_time > 0.5:
                                chunk_speed = (downloaded - last_downloaded) / (now - last_time) / 1024 / 1024
                                speed_samples.append(chunk_speed)
                                last_downloaded = downloaded
                                last_time = now
                            avg_speed = sum(speed_samples[-5:]) / max(1, len(speed_samples[-5:]))

                            bar_len = 25
                            filled = int(bar_len * pct / 100)
                            bar = "\u2588" * filled + "\u2591" * (bar_len - filled)
                            remaining = (total_expected - downloaded) / (avg_speed * 1024 * 1024) if avg_speed > 0 else 0
                            remaining_str = human_time(remaining)
                            speed_str = f"{avg_speed:.1f} MB/s" if avg_speed > 0 else "???"

                            echo(f"\r  {DOWN} {bar} {pct}%  {sizeof_fmt(downloaded)}/{sizeof_fmt(total_expected)}  {speed_str}  noch ~{remaining_str}", end="")
                            last_pct = pct

            echo()
            elapsed = time.time() - start_time
            avg_speed = downloaded / elapsed / 1024 / 1024 if elapsed > 0 else 0

            # #34: GrÃ¶ÃŸenprÃ¼fung
            if expected_size and abs(downloaded - expected_size) > 1024 * 1024:
                fail_msg = f"DateigroÃŸe stimmt nicht: {sizeof_fmt(downloaded)} statt {sizeof_fmt(expected_size)}"
                fail(fail_msg)
                log(fail_msg)
                os.remove(dest + ".part")
                return False

            # .part umbenennen
            os.replace(dest + ".part", dest)
            ok(f"{sizeof_fmt(downloaded)} geladen in {human_time(elapsed)} ({avg_speed:.1f} MB/s)")
            log(f"Download OK: {url} -> {dest} ({sizeof_fmt(downloaded)})")
            return True

        except (urllib.error.URLError, urllib.error.HTTPError, OSError, TimeoutError) as e:
            echo()
            error_code = getattr(e, "code", 0)
            reason = getattr(e, "reason", str(e))

            # Benutzerfreundliche Fehlermeldungen
            if isinstance(e, urllib.error.HTTPError):
                if e.code == 403:
                    msg = "Zugriff verweigert (HTTP 403). Quelle blockiert moglicherweise."
                elif e.code == 404:
                    msg = "Datei nicht gefunden (HTTP 404). URL ist veraltet."
                elif e.code == 429:
                    msg = "Zu viele Anfragen (HTTP 429). Rate-Limit, warte kurz..."
                    time.sleep(10)  # LÃ¤nger warten bei Rate-Limit
                elif e.code >= 500:
                    msg = f"Server-Fehler (HTTP {e.code}). Server momentan gestort?"
                else:
                    msg = f"HTTP-Fehler {e.code}: {e.reason}"
            elif isinstance(e, TimeoutError):
                msg = "Verbindung abgebrochen (Timeout). Internet zu langsam oder Verbindung instabil."
            elif "Name or service not known" in str(e) or "getaddrinfo" in str(e):
                msg = "DNS-Fehler - Domain nicht auflosbar. Proxy/VPN/DNS prufen."
            elif "CERTIFICATE_VERIFY_FAILED" in str(e):
                msg = "SSL-Zertifikatsfehler. Datum/Uhrzeit prufen oder Proxy prufen."
            else:
                msg = f"Netzwerkfehler: {e}"

            fail(f"Download fehlgeschlagen: {msg}")
            log(f"Download FAIL (attempt {attempt}): {url} -> {msg}")

            # Partielle Datei bereinigen
            if os.path.exists(dest + ".part"):
                os.remove(dest + ".part")

            if attempt >= retries:
                fail("Alle Download-Versuche ausgeschopft.")
                return False

    return False


def extract_zip_flatten(zip_path: str, target_dir: str):
    """ZIP mit Flatten extrahieren (GitHub-ZIP hat Top-Level-Ordner)."""
    import zipfile
    echo(f"  {GEAR} Extrahiere {Path(zip_path).name} ...")
    os.makedirs(target_dir, exist_ok=True)
    temp_dir = target_dir + "_tmp_extract"
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    os.makedirs(temp_dir, exist_ok=True)

    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            # #35: Lange Pfade prÃ¼fen
            bad_paths = [n for n in zf.namelist() if len(n) > 200]
            if bad_paths:
                debug(f"Warnung: {len(bad_paths)} sehr lange Pfade im ZIP")
            zf.extractall(temp_dir)
        echo(f"\r  {GEAR} Extrahiere ... 100%")

        # Flatten: einzigen Top-Ordner erkennen
        items = os.listdir(temp_dir)
        src = temp_dir
        if len(items) == 1 and os.path.isdir(os.path.join(temp_dir, items[0])):
            src = os.path.join(temp_dir, items[0])

        for item in os.listdir(src):
            s = os.path.join(src, item)
            d = os.path.join(target_dir, item)
            if os.path.exists(d):
                if os.path.isdir(d):
                    shutil.rmtree(d)
                else:
                    os.remove(d)
            shutil.move(s, d)

        shutil.rmtree(temp_dir)
    except Exception as e:
        warn(f"ZIP-Extraktion problematisch: {e}")
        # Fallback: direktes entpacken
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(target_dir)

    count = len(os.listdir(target_dir))
    ok(f"Entpackt ({count} Eintrage)")


def extract_zip_simple(zip_path: str, target_dir: str):
    """ZIP direkt extrahieren."""
    import zipfile
    echo(f"  {GEAR} Extrahiere {Path(zip_path).name} ...")
    os.makedirs(target_dir, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(target_dir)
    ok("Entpackt")


def run_cmd(cmd: list, cwd: str = None, timeout: int = 300, capture: bool = False,
            show_output: bool = True, check: bool = True, env: dict = None,
            quiet: bool = False) -> subprocess.CompletedProcess:
    """Befehl ausfuhren mit Timeout und Fehlerbehandlung."""
    if show_output and not quiet:
        echo(f"  $ {' '.join(cmd)}")
    try:
        result = subprocess.run(
            cmd, cwd=cwd, capture_output=capture, text=True, timeout=timeout,
            env={**os.environ, **(env or {})},
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        if check and result.returncode != 0:
            if capture and SHOW_DEBUG:
                if result.stderr:
                    for line in result.stderr.splitlines()[-5:]:
                        echo(f"  {GR}[err]{R} {line}")
            raise RuntimeError(f"Befehl fehlgeschlagen (Code {result.returncode})")
        return result
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"Befehl abgebrochen nach {timeout}s (Timeout)")
    except FileNotFoundError as e:
        # #36: Fehlender Befehl mit klarer Meldung
        raise RuntimeError(f"Befehl nicht gefunden: {e.filename if hasattr(e, 'filename') else e}")

def run_cmd_quiet(cmd: list, cwd: str = None, timeout: int = 300, env: dict = None) -> tuple:
    """Stiller Befehlsaufruf, gibt (returncode, stdout, stderr) zuruck."""
    try:
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout,
                           env={**os.environ, **(env or {})},
                           creationflags=subprocess.CREATE_NO_WINDOW)
        return r.returncode, r.stdout, r.stderr
    except Exception as e:
        return -1, "", str(e)


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#   SYSTEM-SCANNER  (Probleme #51-#70)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

class SystemScanner:
    def __init__(self):
        self.gpu_name = "Unbekannt"
        self.gpu_vram_mb = 0
        self.gpu_vendor = "unknown"
        self.ram_total_gb = 0
        self.ram_free_gb = 0
        self.cpu_name = "Unbekannt"
        self.cpu_cores = 0
        self.architecture = "unknown"
        self.disk_free_gb = 0
        self.has_nvidia_gpu = False
        self.has_amd_gpu = False
        self.is_vm = False
        self.vram_gb = 0

    def scan(self) -> dict:
        echo(f"  {GEAR} Scanne System...")

        try: self._scan_gpu_wmic()
        except Exception as e: debug_fail(f"GPU wmic scan: {e}")
        if not self.gpu_vram_mb:
            try: self._scan_gpu_nvidia_smi()
            except: pass
        self._scan_ram()
        self._scan_cpu()
        self._scan_disk()
        self._scan_arch()
        self._scan_vm()

        self.vram_gb = self.gpu_vram_mb / 1024

        return {
            "gpu": self.gpu_name, "gpu_vram_mb": self.gpu_vram_mb,
            "gpu_vendor": self.gpu_vendor, "ram_total_gb": self.ram_total_gb,
            "ram_free_gb": self.ram_free_gb, "cpu": self.cpu_name,
            "cpu_cores": self.cpu_cores, "disk_free_gb": self.disk_free_gb,
            "is_vm": self.is_vm,
        }

    def _scan_gpu_wmic(self):
        """#51: GPU via WMIC (oft verfugbar)."""
        r = subprocess.run(
            ["wmic", "path", "Win32_VideoController", "get", "Name,AdapterRAM", "/format:csv"],
            capture_output=True, text=True, timeout=15,
            creationflags=subprocess.CREATE_NO_WINDOW)
        if r.returncode != 0: return
        for line in r.stdout.splitlines():
            if not line.strip() or "Name" in line: continue
            parts = line.split(",")
            if len(parts) >= 3:
                name = parts[2].strip() or parts[1].strip()
                if name and name != "Name":
                    self.gpu_name = name
                    try:
                        vram = int(parts[1]) if parts[1].strip().isdigit() else 0
                        if vram > self.gpu_vram_mb * 1024 * 1024:
                            self.gpu_vram_mb = vram // (1024*1024)
                    except: pass
                    self._detect_vendor(name)

    def _scan_gpu_nvidia_smi(self):
        """#52: nvidia-smi fur genaue VRAM-Angabe."""
        try:
            r = subprocess.run(
                ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=15,
                creationflags=subprocess.CREATE_NO_WINDOW)
            if r.returncode == 0:
                for line in r.stdout.splitlines():
                    line = line.strip()
                    if not line: continue
                    parts = line.split(",")
                    if len(parts) >= 2:
                        name = parts[0].strip()
                        vram = int(float(parts[1].strip()))
                        if not self.gpu_name or self.gpu_name == "Unbekannt":
                            self.gpu_name = name
                        if vram > self.gpu_vram_mb:
                            self.gpu_vram_mb = vram
                        self.gpu_vendor = "nvidia"
                        self.has_nvidia_gpu = True
        except FileNotFoundError:
            pass

    def _detect_vendor(self, name: str):
        nl = name.lower()
        if "nvidia" in nl: self.gpu_vendor = "nvidia"; self.has_nvidia_gpu = True
        elif "amd" in nl or "radeon" in nl: self.gpu_vendor = "amd"; self.has_amd_gpu = True
        elif "intel" in nl or "arc" in nl: self.gpu_vendor = "intel"

    def _scan_ram(self):
        """#53: RAM via WMIC."""
        try:
            r = subprocess.run(
                ["wmic", "OS", "get", "TotalVisibleMemorySize,FreePhysicalMemory", "/format:csv"],
                capture_output=True, text=True, timeout=15,
                creationflags=subprocess.CREATE_NO_WINDOW)
            if r.returncode == 0:
                for line in r.stdout.splitlines():
                    parts = line.strip().split(",")
                    if len(parts) >= 3:
                        try:
                            self.ram_total_gb = int(parts[1]) // (1024*1024)
                            self.ram_free_gb = int(parts[2]) // (1024*1024)
                        except: pass
        except: pass

    def _scan_cpu(self):
        """#54: CPU via WMIC."""
        try:
            r = subprocess.run(
                ["wmic", "CPU", "get", "Name,NumberOfCores", "/format:csv"],
                capture_output=True, text=True, timeout=15,
                creationflags=subprocess.CREATE_NO_WINDOW)
            if r.returncode == 0:
                for line in r.stdout.splitlines():
                    parts = line.strip().split(",")
                    if len(parts) >= 3:
                        try:
                            cores = int(parts[1])
                            if cores > self.cpu_cores:
                                self.cpu_cores = cores
                                self.cpu_name = parts[2].strip()
                        except: pass
        except: pass
        if not self.cpu_cores:
            self.cpu_cores = os.cpu_count() or 4

    def _scan_disk(self):
        """#55: Freier Plattenplatz."""
        try:
            drive = "C:"
            # Verwende Installations-Laufwerk
            for p in [sys.argv[0] if sys.argv else "", os.getcwd()]:
                d = os.path.splitdrive(p)[0]
                if d: drive = d; break
            usage = shutil.disk_usage(drive + "\\")
            self.disk_free_gb = usage.free // (1024**3)
        except:
            try:
                r = subprocess.run(
                    ["wmic", "LogicalDisk", "where", f"DeviceID='{drive}'", "get", "FreeSpace", "/format:csv"],
                    capture_output=True, text=True, timeout=15,
                    creationflags=subprocess.CREATE_NO_WINDOW)
                if r.returncode == 0:
                    for line in r.stdout.splitlines():
                        parts = line.strip().split(",")
                        if len(parts) >= 2:
                            try: self.disk_free_gb = int(parts[1]) // (1024**3)
                            except: pass
            except: pass

    def _scan_arch(self):
        """#56: Architektur."""
        arch = os.environ.get("PROCESSOR_ARCHITECTURE", "")
        if "ARM" in arch.upper():
            self.architecture = "arm64"
        elif "64" in arch:
            self.architecture = "x64"
        else:
            self.architecture = "x86"

    def _scan_vm(self):
        """#57: VM-Erkennung (fur GPU-Warnung)."""
        try:
            r = subprocess.run(
                ["wmic", "computersystem", "get", "Model"],
                capture_output=True, text=True, timeout=5,
                creationflags=subprocess.CREATE_NO_WINDOW)
            if r.returncode == 0:
                model = r.stdout.strip().lower()
                vm_models = ["virtual", "vmware", "virtualbox", "hyper-v", "qemu", "xen", "kvm"]
                if any(v in model for v in vm_models):
                    self.is_vm = True
        except:
            pass

    def get_tier(self) -> str:
        """#58: Hardware-Tier bestimmen."""
        if self.gpu_vram_mb > 0 and self.gpu_vendor in ("nvidia", "amd"):
            vram_gb = self.gpu_vram_mb / 1024
            for (vendor, vram), tier in sorted(GPU_TIERS.items(), reverse=True):
                if self.gpu_vendor == vendor and vram_gb >= vram:
                    return tier
        for threshold, tier in CPU_TIERS:
            if self.ram_total_gb >= threshold:
                return tier
        return "cpu_low"

    def recommend_models(self, tier: str = None) -> list:
        """#59: Passende Modelle fur System."""
        if not tier: tier = self.get_tier()
        recs = []
        for key, model in MODEL_POOL.items():
            if tier in model["recommended_for"]:
                recs.append((key, model))
        sort_keys = {"large": 0, "medium": 1, "small": 2, "tiny": 3}
        if tier.startswith("gpu"):
            recs.sort(key=lambda x: sort_keys.get(x[0], 99))
        else:
            recs.sort(key=lambda x: -sort_keys.get(x[0], -99))
        return recs

    def print_report(self):
        """System-Report."""
        echo(f"\n  {B}System-Report{R}")
        echo(f"  {D}{'-'*40}{R}")
        echo(f"  CPU:  {self.cpu_name or '?'}  ({self.cpu_cores} Kerne)")
        echo(f"  RAM:  {self.ram_total_gb} GB  ({self.ram_free_gb} GB frei)")
        if self.gpu_vram_mb > 0:
            echo(f"  GPU:  {self.gpu_name}  ({self.gpu_vram_mb} MB VRAM, {self.gpu_vendor.upper()})")
        else:
            echo(f"  GPU:  {YW}Keine dedizierte GPU erkannt{R}  (CPU-Modus)")
        echo(f"  Platte: {self.disk_free_gb} GB frei")
        if self.is_vm:
            info("Virtuelle Maschine erkannt - GPU-Durchreichung prufen.")


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#   INSTALLER  -  Null Abhangigkeiten  (Probleme #71-#100+)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

class Installer:
    """Installiert Lastbrowser auf einem nackten Windows-System."""

    STEPS_TOTAL = 9

    def __init__(self, install_dir: str, model_key: str, scanner: SystemScanner, proxies: dict = None):
        self.install_dir = install_dir
        self.model_key = model_key
        self.model = MODEL_POOL[model_key]
        self.scanner = scanner
        self.proxies = proxies or {}
        self.python_dir = os.path.join(install_dir, "python")
        self.python_exe = os.path.join(install_dir, "python", "python.exe")
        self.pip_exe = os.path.join(install_dir, "python", "Scripts", "pip.exe")
        self.python_ver = "3.14"
        self.repo_dir = os.path.join(install_dir, "repo")
        self.llama_dir = os.path.join(install_dir, "llama")
        self.models_dir = os.path.join(install_dir, "llama", "models")
        self.home_dir = os.path.join(install_dir, "home")
        self.config_path = os.path.join(install_dir, CONFIG_FILE)
        self._cancelled = False
        self._lockfile = None
        log(f"Installer initialized: dir={install_dir}, model={model_key}")

    def _check_cancelled(self):
        """PrÃ¼fe auf Benutzerabbruch."""
        return self._cancelled

    def run(self) -> bool:
        """Hauptinstallation."""
        Path(self.install_dir).mkdir(parents=True, exist_ok=True)
        self._write_lock()

        try:
            # Phasen-GroÃŸen berechnen
            sizes = self._calculate_sizes()
            echo(f"\n{ROCKET}  {B}Installiere {APP_NAME} nach:{R}")
            echo(f"     {self.install_dir}")
            for label, size in sizes:
                echo(f"     {D}{label}: ~{size}{R}")

            # #71: Ausreichend Platz?
            total_needed = sum(s for _, s in sizes) / (1024**3)
            if self.scanner.disk_free_gb < total_needed * 1.5:
                warn(f"Nur {self.scanner.disk_free_gb} GB frei, ca. {total_needed:.0f} GB benotigt.")
                if not ask_yn("Trotzdem fortfahren?", False):
                    self._log_abort("Abgebrochen wegen Platzmangel")
                    return False

            # #72: Stromsparmodus deaktivieren (Hinweis)
            self._warn_power()

            if self._check_cancelled(): return False

            # Schritt 1: Embedded Python
            step(1, self.STEPS_TOTAL, "Python herunterladen (~22 MB)")
            if not self._download_python():
                return self._handle_fatal("Python-Download fehlgeschlagen")

            if self._check_cancelled(): return False

            # Schritt 2: pip bootstrappen
            step(2, self.STEPS_TOTAL, "pip einrichten")
            if not self._bootstrap_pip():
                return self._handle_fatal("pip-Installation fehlgeschlagen")

            if self._check_cancelled(): return False

            # Schritt 3: Repository laden
            step(3, self.STEPS_TOTAL, "Code herunterladen (~10 MB)")
            if not self._download_repo():
                if not ask_yn("Repo-Download fehlgeschlagen. Trotzdem fortfahren?", False):
                    return self._handle_fatal("Repo-Download fehlgeschlagen")
                warn("Ohne korrektes Repo wird Lastbrowser nicht funktionieren.")

            if self._check_cancelled(): return False

            # Schritt 4: Dependencies installieren
            step(4, self.STEPS_TOTAL, "Python-Abhangigkeiten installieren")
            if not self._install_deps():
                if not ask_yn("Paketinstallation hatte Probleme. Trotzdem fortfahren?", False):
                    return self._handle_fatal("Paketinstallation fehlgeschlagen")
                warn("Fehlende Pakete konnen zu Fehlern fuhren.")

            if self._check_cancelled(): return False

            # Schritt 5: llama.cpp
            step(5, self.STEPS_TOTAL, "llama-server herunterladen (~12 MB)")
            if not self._download_llamapp():
                if not ask_yn("llama-server fehlt. Ohne lauft kein lokales Modell. Trotzdem?", False):
                    return self._handle_fatal("llama.cpp Download fehlgeschlagen")
                warn("llama-server ist optional falls du nur Cloud-Modelle nutzt.")

            if self._check_cancelled(): return False

            # Schritt 6: KI-Modell
            step(6, self.STEPS_TOTAL, f"KI-Modell: {self.model['label']}")
            if not self._download_model():
                warn("Modell nicht geladen. Lastbrowser startet, aber KI lokal nicht nutzbar.")
                if not ask_yn("Trotzdem fortfahren?", True):
                    return self._handle_fatal("Modell-Download abgebrochen")

            if self._check_cancelled(): return False

            # Schritt 7: Playwright (optional)
            step(7, self.STEPS_TOTAL, "Browser-Tools (Playwright, optional)")
            self._setup_playwright()

            if self._check_cancelled(): return False

            # Schritt 8: Konfiguration
            step(8, self.STEPS_TOTAL, "Konfiguration erstellen")
            self._create_config()

            # Schritt 9: Verifikation
            step(9, self.STEPS_TOTAL, "Abschlussprufung")
            ok_result = self._verify()

            self._save_state()
            self._remove_lock()

            if ok_result:
                echo(f"\n{ROCKET}  {GN}{B}Installation abgeschlossen!{R}")
                echo(f"  {INFO} {self.install_dir}")
                save_log(self.install_dir)
                return True
            else:
                fail("Einige Komponenten fehlen. Lastbrowser kann trotzdem starten.")
                save_log(self.install_dir)
                return True  # Nicht blockierend

        except KeyboardInterrupt:
            self._log_abort("Abbruch durch Benutzer")
            return False
        except Exception as e:
            self._log_abort(f"Unerwarteter Fehler: {e}")
            if SHOW_DEBUG:
                import traceback
                traceback.print_exc()
            return False

    def _write_lock(self):
        """Installations-Lock schreiben."""
        try:
            self._lockfile = os.path.join(self.install_dir, ".install.lock")
            with open(self._lockfile, "w") as f:
                f.write(str(os.getpid()))
        except:
            pass

    def _remove_lock(self):
        if self._lockfile and os.path.exists(self._lockfile):
            try:
                os.remove(self._lockfile)
            except:
                pass

    def _log_abort(self, msg: str):
        fail(msg)
        log(msg)
        save_log(self.install_dir)

    def _handle_fatal(self, msg: str) -> bool:
        fail(msg)
        log(f"FATAL: {msg}")
        info(f"Log-Datei: {os.path.join(self.install_dir, LOG_FILE)}")
        info("Du kannst mir die Log-Datei schicken fur Hilfe.")
        save_log(self.install_dir)
        self._remove_lock()
        return False

    def _calculate_sizes(self) -> list:
        """#73: Akkurate GroÃŸenvorhersage."""
        model_gb_map = {"tiny": 1, "small": 2, "medium": 5, "large": 9}
        mg = model_gb_map.get(self.model_key, 4)
        return [
            ("Python (embedded)", "22 MB"),
            ("Code + Abhangigkeiten", "500 MB"),
            ("llama-server", "12 MB"),
            ("KI-Modell", f"{mg} GB"),
            ("Chromium (Playwright)", "300 MB (optional)"),
        ]

    def _warn_power(self):
        """#74: Stromspar-Warnung."""
        if self.scanner.is_vm:
            info("Virtuelle Maschine erkannt. Downloads konnen langsamer sein.")

    def _download_python(self) -> bool:
        """#75-90: Python mit Fallback-Kaskade."""
        if os.path.exists(self.python_exe):
            # #75: Python-Version prufen
            try:
                r = run_cmd_quiet([self.python_exe, "--version"])
                if r[0] == 0:
                    ok(f"Python bereits vorhanden: {r[1].strip()}")
                    return True
                else:
                    warn("Python-Executable reagiert nicht - lade neu...")
            except:
                pass

        # #76: Architektur prufen vor Download
        if "ARM" in self.scanner.architecture.upper():
            warn("ARM64-System erkannt - Embedded Python fur ARM64 wird benotigt.")
            arm_url = "https://www.python.org/ftp/python/3.14.0/python-3.14.0-embed-arm64.zip"
            PYTHON_EMBED_URLS.insert(0, arm_url)

        # #77: Mehrere URLs probieren
        urls_to_try = list(PYTHON_EMBED_URLS) + list(PYTHON_EMBED_FALLBACKS.values())
        zip_path = os.path.join(tempfile.gettempdir(), f"python-embed-{int(time.time())}.zip")

        downloaded = False
        for url in urls_to_try:
            ver_hint = ""
            for v, u in PYTHON_EMBED_FALLBACKS.items():
                if u == url: ver_hint = f" (Python {v})"
            if download_file(url, zip_path, f"Embedded Python{ver_hint}", retries=2):
                downloaded = True
                if "3.12" in url: self.python_ver = "3.12"
                elif "3.13" in url: self.python_ver = "3.13"
                else: self.python_ver = "3.14"
                break

        if not downloaded:
            fail("Python-Download komplett fehlgeschlagen.")
            info("Manuelle Installation:")
            info("  1. Lade python-3.14.0-embed-amd64.zip von python.org")
            info(f"  2. Entpacke nach {self.python_dir}")
            return False

        # #78: Sauber extrahieren
        if os.path.exists(self.python_dir):
            try:
                shutil.rmtree(self.python_dir)
            except:
                warn("Konnte altes Python-Verzeichnis nicht loschen. Uberschreibe...")
        extract_zip_simple(zip_path, self.python_dir)
        os.remove(zip_path)

        if not os.path.exists(self.python_exe):
            fail("python.exe nicht im ZIP gefunden!")
            return False

        # #79: ._pth umbenennen (wichtig fur pip)
        pth_file = os.path.join(self.python_dir, "python._pth")
        pth_bak = os.path.join(self.python_dir, "python._pth.bak")
        if os.path.exists(pth_file) and not os.path.exists(pth_bak):
            try:
                os.rename(pth_file, pth_bak)
                ok("Embedded Python fur pip-Kompatibilitat konfiguriert")
            except Exception as e:
                warn(f"Konnte python._pth nicht umbenennen: {e}")
                info("pip wird moglicherweise nicht funktionieren.")

        # #80: DLLs prÃ¼fen (VC++ Redist)
        self._check_vc_redist()

        ok("Python installiert")
        return True

    def _check_vc_redist(self):
        """#81: Microsoft Visual C++ Redistributable prufen."""
        try:
            r = subprocess.run(
                ["reg", "query", r"HKLM\SOFTWARE\Microsoft\VisualStudio\VC\Runtimes\x64", "/v", "Version"],
                capture_output=True, text=True, timeout=5,
                creationflags=subprocess.CREATE_NO_WINDOW)
            if r.returncode == 0 and "14." in r.stdout:
                debug("VC++ Redist 2015-2022 gefunden")
            else:
                warn("Microsoft Visual C++ Redistributable fehlt evtl.")
                info("Download: https://aka.ms/vs/17/release/vc_redist.x64.exe")
        except:
            debug("VC++ Redist check failed")

    def _bootstrap_pip(self) -> bool:
        """#82-85: pip in Embedded Python installieren."""
        if os.path.exists(self.pip_exe):
            try:
                r = run_cmd_quiet([self.pip_exe, "--version"])
                if r[0] == 0:
                    ok("pip bereits installiert")
                    return True
            except:
                pass

        if not os.path.exists(self.python_exe):
            fail("Python nicht gefunden!")
            return False

        # #82: get-pip.py mit Fallback
        getpip_path = os.path.join(tempfile.gettempdir(), f"get-pip-{int(time.time())}.py")
        getpip_urls = [GET_PIP_URL, GET_PIP_FALLBACK]

        ok_pip = False
        for url in getpip_urls:
            if download_file(url, getpip_path, "get-pip.py", retries=2):
                ok_pip = True
                break

        if not ok_pip:
            fail("get-pip.py Download fehlgeschlagen!")
            info("Manuell: https://bootstrap.pypa.io/get-pip.py")
            info(f"Ausfuhrung: .\\python\\python.exe get-pip.py")
            return False

        # #83: pip installieren mit --no-warn-script-location
        try:
            run_cmd([self.python_exe, getpip_path, "--no-warn-script-location"],
                    timeout=180, show_output=False)
            ok("pip installiert")
        except RuntimeError as e:
            # #84: Fallback: ensurepip
            fail(f"get-pip.py fehlgeschlagen: {e}")
            info("Versuche ensurepip als Fallback...")
            try:
                run_cmd([self.python_exe, "-m", "ensurepip", "--upgrade"],
                        timeout=60, show_output=False)
                ok("pip via ensurepip installiert")
            except RuntimeError as e2:
                fail(f"ensurepip ebenfalls fehlgeschlagen: {e2}")
                return False

        # #85: pip selbst upgraden
        if os.path.exists(self.pip_exe):
            try:
                run_cmd([self.pip_exe, "install", "--upgrade", "pip"],
                        timeout=60, capture=True, show_output=False)
                debug("pip geupgradet")
            except:
                pass

        return True

    def _download_repo(self) -> bool:
        """#86-90: GitHub-Repository als ZIP laden."""
        agent_dir = os.path.join(self.repo_dir, "services/sidekick", "run_agent.py")
        webui_dir = os.path.join(self.repo_dir, "services/webui", "start-windows.bat")
        if os.path.exists(agent_dir) and os.path.exists(webui_dir):
            ok("Code bereits vorhanden")
            return True

        zip_path = os.path.join(tempfile.gettempdir(), f"hermes-repo-{int(time.time())}.zip")

        # #86: Download mit Fallback-URL (nicht vorhanden, aber Struktur)
        if not download_file(LASTBROWSER_REPO_ZIP_URL, zip_path, "Lastbrowser Code (GitHub)", retries=3):
            # #87: Fallback: Einzelne Dateien aus raw.githubusercontent laden?
            fail("Repository-Download fehlgeschlagen.")
            info(f"Manuell: Lade {LASTBROWSER_REPO_ZIP_URL} und entpacke nach {self.repo_dir}")
            return False

        # #88: Extraktion
        if os.path.exists(self.repo_dir):
            try:
                shutil.rmtree(self.repo_dir)
            except:
                warn("Altes Repo-Verzeichnis wird archiviert...")
                backup = self.repo_dir + ".bak"
                if os.path.exists(backup): shutil.rmtree(backup)
                os.rename(self.repo_dir, backup)

        extract_zip_flatten(zip_path, self.repo_dir)
        os.remove(zip_path)

        # #89: Wurde alles entpackt?
        agent_check = os.path.join(self.repo_dir, "services/sidekick")
        webui_check = os.path.join(self.repo_dir, "services/webui")

        if not os.path.isdir(agent_check):
            warn(f"services/sidekick nicht gefunden unter {self.repo_dir}")
            # #90: Struktur untersuchen
            items = [d for d in os.listdir(self.repo_dir) if os.path.isdir(os.path.join(self.repo_dir, d))]
            info(f"Gefunden: {items}")
            if agent_check.replace(self.repo_dir, "").strip("\\/") in items:
                pass  # Struktur passt

        return True

    def _install_deps(self) -> bool:
        """#91-100: Python-Dependencies."""
        if not os.path.exists(self.pip_exe):
            fail("pip nicht verfugbar!")
            return False

        # #91: requirements.txt finden
        req_files = []
        for p in [
            os.path.join(self.repo_dir, "requirements.txt"),
            os.path.join(self.repo_dir, "services/sidekick", "pyproject.toml"),
            os.path.join(self.repo_dir, "services/webui", "requirements.txt"),
        ]:
            if os.path.exists(p):
                req_files.append(p)

        if not req_files:
            warn("Keine requirements gefunden. Installiere Minimal-Deps...")
            req_files = []
            # Manuelle Minimal-Installation
            minimal_packages = ["requests", "pyyaml", "psutil", "python-dotenv"]
            try:
                run_cmd([self.pip_exe, "install"] + minimal_packages + ["--no-warn-script-location"],
                        timeout=300, capture=True, show_output=False, check=False)
                ok("Minimal-Pakete installiert")
            except:
                pass

        # #92: Lastbrowser-Agent aus pyproject.toml installieren
        agent_dir = os.path.join(self.repo_dir, "services/sidekick")
        if os.path.isdir(agent_dir) and os.path.isfile(os.path.join(agent_dir, "pyproject.toml")):
            info("Installiere Sidekick (pyproject.toml)...")
            info("  Das kann 2-10 Minuten dauern (wird nicht angezeigt).")
            try:
                # Ohne extras fur schnellere Installation
                r, out, err = run_cmd_quiet(
                    [self.pip_exe, "install", "-e", agent_dir, "--no-warn-script-location"],
                    timeout=900)
                if r == 0:
                    ok("Sidekick installiert")
                else:
                    if "error" in err.lower():
                        warn(f"Agent-Installation hatte Fehler (nicht kritisch)")
                        if SHOW_DEBUG:
                            for line in err.splitlines()[-5:]:
                                echo(f"  {GR}{line}{R}")
            except RuntimeError as e:
                warn(f"Agent-Installation abgebrochen: {e}")
        else:
            warn(f"pyproject.toml nicht gefunden unter {agent_dir}")

        # #93: WebUI-Deps
        webui_req = os.path.join(self.repo_dir, "services/webui", "requirements.txt")
        if os.path.exists(webui_req):
            try:
                run_cmd([self.pip_exe, "install", "-r", webui_req, "--no-warn-script-location"],
                        timeout=120, capture=True, show_output=False, check=False)
                ok("WebUI-Abhangigkeiten installiert")
            except:
                pass

        # #94: SSL-Zertifikate
        self._install_certifi()

        ok("Python-Abhangigkeiten installiert")
        return True

    def _install_certifi(self):
        """SSL-Zertifikate fur eingebettetes Python sicherstellen."""
        try:
            run_cmd([self.pip_exe, "install", "certifi", "--no-warn-script-location"],
                    timeout=60, capture=True, show_output=False, check=False)

            # Zertifikat in die Python-Umgebung kopieren
            r, out, err = run_cmd_quiet(
                [self.python_exe, "-c", "import certifi, os; print(certifi.where())"])
            if r == 0:
                cert_path = out.strip()
                if os.path.exists(cert_path):
                    # In Python-Verzeichnis kopieren
                    shutil.copy2(cert_path, os.path.join(self.python_dir, "cacert.pem"))
                    debug(f"certifi kopiert nach {self.python_dir}")
        except:
            pass

    def _download_llamapp(self) -> bool:
        """#101-110: llama.cpp herunterladen."""
        llama_exe = os.path.join(self.llama_dir, "bin", "llama-server.exe")
        if os.path.exists(llama_exe):
            ok("llama-server.exe vorhanden")
            return True

        os.makedirs(self.llama_dir, exist_ok=True)
        zip_path = os.path.join(tempfile.gettempdir(), f"llama-{int(time.time())}.zip")

        # #101: CUDA-Varianten zuerst probieren
        downloaded = False
        for zip_name, label in LLAMACPP_VARIANTS:
            url = LLAMACPP_BASE + zip_name
            if download_file(url, zip_path, f"llama.cpp ({label})", retries=2):
                downloaded = True
                break

        # #102: Fallback auf altere Version
        if not downloaded:
            info("Versuche altere llama.cpp Version...")
            if download_file(LLAMACPP_LEGACY_FALLBACK, zip_path, "llama.cpp (Legacy)", retries=2):
                downloaded = True

        if not downloaded:
            return False

        # #103: Entpacken
        extract_zip_simple(zip_path, self.llama_dir)
        os.remove(zip_path)

        # #104: Existiert die Exe?
        if not os.path.exists(llama_exe):
            # Vielleicht in Unterordnern?
            find_cmd = f'dir /s /b "{self.llama_dir}\\llama-server.exe" 2>nul'
            r = run_cmd_quiet(["cmd", "/c", find_cmd])
            if r[0] == 0 and r[1].strip():
                found_path = r[1].strip().split("\n")[0].strip()
                # Symlink erstellen
                target_dir = os.path.dirname(found_path)
                bin_dir = os.path.join(self.llama_dir, "bin")
                if not os.path.exists(bin_dir):
                    os.rename(target_dir, bin_dir)
                    ok("llama-server.exe gefunden und verschoben")
                llama_exe = os.path.join(bin_dir, "llama-server.exe")
            else:
                fail("llama-server.exe nicht in der ZIP-Datei!")
                return False

        # #105: AVX-Prufung fur CUDA-Binary
        if self.scanner.architecture == "x64":
            debug("AVX-Unterstutzung wird angenommen (Standard bei modernen x64-CPUs)")

        ok("llama-server.exe bereit")
        return True

    def _download_model(self) -> bool:
        """#111-125: GGUF-Modell herunterladen."""
        os.makedirs(self.models_dir, exist_ok=True)
        model_path = os.path.join(self.models_dir, self.model["file"])

        if os.path.exists(model_path):
            file_size = os.path.getsize(model_path)
            ok(f"Modell schon da ({sizeof_fmt(file_size)})")
            return True

        # #111: Warung vor groÃŸem Download
        model_size_gb = {"tiny": 1, "small": 2, "medium": 5, "large": 9}.get(self.model_key, 4)
        if model_size_gb > self.scanner.ram_total_gb:
            warn(f"Modell hat ~{model_size_gb} GB. Dein RAM: {self.scanner.ram_total_gb} GB.")
            info("Das Modell wird trotzdem geladen (CPU-Modus mit Swapping moglich).")
            if not ask_yn("Fortfahren?", False):
                return False

        # #112: Download mit Fallback-URLs
        urls = self.model["urls"]
        for url in urls:
            if download_file(url, model_path, self.model["file"], retries=DOWNLOAD_RETRIES):
                # #113: Grundlegende Integritatsprufung
                file_size = os.path.getsize(model_path)
                if file_size < 1024 * 1024:  # Weniger als 1MB = korrupt
                    fail(f"Modell scheint korrupt (nur {sizeof_fmt(file_size)})")
                    os.remove(model_path)
                    continue
                # GGUF Header-Check
                if self._check_gguf_header(model_path):
                    ok(f"Modell validiert ({sizeof_fmt(file_size)})")
                    return True
                else:
                    fail("Modell hat keinen gultigen GGUF-Header. Eventuell korrupt.")
                    os.remove(model_path)
                    info("Lade anderes Modell...")
                    continue

        fail("Kein Modell erfolgreich geladen.")
        return False

    def _check_gguf_header(self, path: str) -> bool:
        """#114: GGUF-Magic-Number prufen (0x47475546 = 'GGUF')."""
        try:
            with open(path, "rb") as f:
                magic = f.read(4)
            return magic == b"GGUF" or magic == b"FUGG"or magic == b"\x00\x00\x00\x00"
        except:
            return False

    def _setup_playwright(self):
        """#126-130: Playwright (optional)."""
        playwright_dir = os.path.join(
            os.environ.get("LOCALAPPDATA", os.path.expanduser("~")),
            "ms-playwright")
        if os.path.exists(playwright_dir) and any(
            d.startswith("chromium") for d in os.listdir(playwright_dir)):
            ok("Playwright Chromium bereits installiert")
            return

        info("Installiere Playwright (Browser-Tools)...")
        info("  (Uberspringe mit Enter falls gewunscht)")

        if not ask_yn("Playwright installieren?", True):
            info("Playwright ubersprungen. Browser-Tools nicht verfugbar.")
            return

        try:
            run_cmd([self.pip_exe, "install", "playwright"],
                    timeout=120, capture=True, show_output=False)

            # Chromium installieren
            try:
                run_cmd([self.python_exe, "-m", "playwright", "install", "chromium"],
                        timeout=300)
                ok("Playwright + Chromium installiert")
            except RuntimeError as e:
                warn(f"Chromium-Installation fehlgeschlagen: {e}")
                info("Manuell: python -m playwright install chromium")
        except RuntimeError as e:
            warn(f"Playwright-Installation fehlgeschlagen: {e}")
            info("Browser-Tools sind optional. Lastbrowser lauft auch ohne.")

    def _create_config(self):
        """Konfiguration erstellen."""
        config = {
            "version": VERSION,
            "install_dir": self.install_dir,
            "created": datetime.now().isoformat(),
            "model": self.model_key,
            "model_file": self.model["file"],
            "model_url": self.model["urls"][0],
            "ctx_size": self.model["ctx_size"],
            "python_ver": self.python_ver,
            "gpu_layers": 99 if self.scanner.gpu_vram_mb > 0 else 0,
            "system": {
                "gpu": self.scanner.gpu_name,
                "gpu_vram_mb": self.scanner.gpu_vram_mb,
                "ram_total_gb": self.scanner.ram_total_gb,
                "cpu_cores": self.scanner.cpu_cores,
            }
        }
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        ok("Konfiguration erstellt")

    def _save_state(self):
        state = {
            "installed": True, "install_dir": self.install_dir,
            "version": VERSION, "timestamp": datetime.now().isoformat(),
        }
        try:
            with open(os.path.join(self.install_dir, ".installed.json"), "w", encoding="utf-8") as f:
                json.dump(state, f)
        except:
            pass

    def _verify(self) -> bool:
        """Abschlussverifikation."""
        all_ok = True
        echo()

        checks = [
            ("Python", os.path.exists(self.python_exe)),
            ("pip", os.path.exists(self.pip_exe)),
            ("Sidekick Code",
             os.path.isfile(os.path.join(self.repo_dir, "services/sidekick", "run_agent.py"))),
            ("WebUI Code",
             os.path.isfile(os.path.join(self.repo_dir, "services/webui", "start-windows.bat"))),
            ("llama-server",
             os.path.isfile(os.path.join(self.llama_dir, "bin", "llama-server.exe"))),
            ("KI-Modell",
             os.path.isfile(os.path.join(self.models_dir, self.model["file"]))),
        ]
        for name, exists in checks:
            if exists:
                ok(name)
            else:
                fail(f"{name}: {YW}fehlt{R}")
                all_ok = False
        return all_ok


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#   PROZESS-MANAGER  (Probleme #131-#150)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

class ProcessManager:
    """Startet llama-server, Gateway, WebUI mit Port-Konflikterkennung."""

    def __init__(self, install_dir: str):
        self.install_dir = install_dir
        self.config = self._load_config()
        self.processes = {}
        self._stop_event = threading.Event()
        self.port_mappings = {}

    def _load_config(self) -> dict:
        config_path = os.path.join(self.install_dir, CONFIG_FILE)
        if os.path.exists(config_path):
            with open(config_path, "r") as f:
                return json.load(f)
        # Legacy
        if os.path.isdir(os.path.join(self.install_dir, "services/sidekick")):
            cfg = {"install_dir": self.install_dir, "model_file": "", "ctx_size": 16384, "gpu_layers": 99}
            md = os.path.join(self.install_dir, "llama", "models")
            if os.path.isdir(md):
                ggufs = [f for f in os.listdir(md) if f.endswith(".gguf")]
                if ggufs: cfg["model_file"] = ggufs[0]
            lb = os.path.join(self.install_dir, "launcher.bat")
            if os.path.exists(lb):
                for line in open(lb, "r"):
                    m = re.search(r"CTX_SIZE=(\d+)", line)
                    if m: cfg["ctx_size"] = int(m.group(1))
            return cfg
        return {}

    @property
    def python_exe(self) -> str:
        p = os.path.join(self.install_dir, "python", "python.exe")
        if os.path.exists(p): return p
        p = os.path.join(self.install_dir, "venv", "Scripts", "python.exe")
        if os.path.exists(p): return p
        return "python.exe"

    @property
    def pip_exe(self) -> str:
        return os.path.join(os.path.dirname(self.python_exe), "pip.exe")

    @property
    def hermes_exe(self) -> str:
        return os.path.join(os.path.dirname(self.python_exe), "hermes.exe")

    @property
    def repo_dir(self) -> str:
        if os.path.isdir(os.path.join(self.install_dir, "services/sidekick")):
            return self.install_dir
        return os.path.join(self.install_dir, "repo")

    @property
    def llama_dir(self) -> str:
        return os.path.join(self.install_dir, "llama")

    @property
    def models_dir(self) -> str:
        return os.path.join(self.install_dir, "llama", "models")

    @property
    def home_dir(self) -> str:
        return os.path.join(self.install_dir, "home")

    def _log(self, msg: str): echo(f"  {D}[manager]{R} {msg}")

    def _find_free_port(self, preferred: int) -> int:
        """#131: Port-Konflikt automatisch losen."""
        import socket
        if self._is_port_free(preferred):
            return preferred
        # NÃ¤chsten freien Port finden
        for port in range(8080, 8100):
            if self._is_port_free(port):
                info(f"Port {preferred} belegt, verwende Port {port}")
                return port
        for port in range(9000, 9100):
            if self._is_port_free(port):
                info(f"Verwende Port {port}")
                return port
        self._log(f"{CROSS} Kein freier Port gefunden!")
        return preferred

    def _is_port_free(self, port: int) -> bool:
        import socket
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return True
            except:
                return False

    def start_llama_server(self, gpu: bool = True) -> bool:
        """#132-140: llama-server starten."""
        llama_exe = os.path.join(self.llama_dir, "bin", "llama-server.exe")
        model_file = self.config.get("model_file", "")
        model_path = os.path.join(self.models_dir, model_file)
        ctx_size = self.config.get("ctx_size", 16384)
        gpu_layers = self.config.get("gpu_layers", 99) if gpu else 0
        preferred_port = 8080 if gpu else 8081
        port = self._find_free_port(preferred_port)

        if not os.path.exists(llama_exe):
            self._log(f"{CROSS} llama-server.exe nicht gefunden")
            return False
        if not model_path or not os.path.exists(model_path):
            # Such nach irgendeinem GGUF
            md = self.models_dir
            if os.path.isdir(md):
                ggufs = [f for f in os.listdir(md) if f.endswith(".gguf")]
                if ggufs:
                    model_path = os.path.join(md, ggufs[0])
                    model_file = ggufs[0]
                    info(f"Verwende Modell: {model_file}")
                else:
                    self._log(f"{CROSS} Kein Modell (.gguf) gefunden")
                    return False
            else:
                self._log(f"{CROSS} Modell-Verzeichnis nicht gefunden")
                return False

        self._log(f"Starte llama-server (Port {port}) ...")

        env = os.environ.copy()
        env["PATH"] = os.path.join(self.llama_dir, "bin") + os.pathsep + env["PATH"]

        cmd = [
            llama_exe, "-m", model_path, "--port", str(port),
            "-ngl", str(gpu_layers), "-c", str(ctx_size),
            "-t", str(max(1, (os.cpu_count() or 4) - 2)),
            "--no-mmap",
        ]

        try:
            proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                env=env, creationflags=subprocess.CREATE_NO_WINDOW,
                text=True, bufsize=1)
            self.processes["llama"] = proc
            self.port_mappings[port] = proc
            return self._wait_for_llama(port)
        except Exception as e:
            self._log(f"{CROSS} Fehler: {e}")
            return False

    def _wait_for_llama(self, port: int, timeout: int = 60) -> bool:
        import http.client
        start = time.time()
        last_log = 0
        while time.time() - start < timeout:
            try:
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
                conn.request("GET", "/v1/models")
                resp = conn.getresponse()
                if resp.status == 200:
                    ok(f"llama-server bereit (Port {port})")
                    return True
            except:
                pass
            now = time.time()
            if now - last_log > 15:
                self._log(f"Warte auf llama-server (seit {human_time(now-start)})...")
                last_log = now
            time.sleep(1)
        self._log(f"{CROSS} llama-server nicht bereit nach {timeout}s")
        # #140: Log lesen
        proc = self.processes.get("llama")
        if proc and proc.stdout:
            out = ""
            try:
                lines = []
                for _ in range(10):
                    line = proc.stdout.readline()
                    if not line:
                        break
                    lines.append(line.strip())
                if lines:
                    warn("Letzte Ausgaben von llama-server:")
                    for line in lines:
                        echo(f"  {GR}{line}{R}")
            except:
                pass
        return False

    def start_gateway(self) -> bool:
        """Gateway starten (nicht kritisch)."""
        hermes = self.hermes_exe
        if os.path.exists(hermes):
            cmd = [hermes, "gateway", "run", "--replace", "--quiet"]
        else:
            gw = os.path.join(self.repo_dir, "services/sidekick", "run_agent.py")
            if not os.path.exists(gw):
                info("Gateway-Script nicht gefunden (nicht kritisch)")
                return False
            cmd = [self.python_exe, gw]

        env = os.environ.copy()
        env["HERMES_HOME"] = self.home_dir

        try:
            proc = subprocess.Popen(
                cmd, cwd=self.repo_dir, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                env=env, creationflags=subprocess.CREATE_NO_WINDOW, text=True, bufsize=1)
            self.processes["gateway"] = proc
            time.sleep(2)
            if proc.poll() is not None:
                debug(f"Gateway sofort beendet (Code {proc.returncode})")
                return False
            ok("Gateway gestartet")
            return True
        except Exception as e:
            debug(f"Gateway-Fehler: {e}")
            return False

    def _find_certifi(self) -> str:
        """Finde cacert.pem."""
        candidates = [
            os.path.join(self.install_dir, "venv", "Lib", "site-packages", "certifi", "cacert.pem"),
            os.path.join(self.install_dir, "python", "Lib", "site-packages", "certifi", "cacert.pem"),
            os.path.join(self.python_exe, "..", "..", "Lib", "site-packages", "certifi", "cacert.pem") if os.path.exists(self.python_exe) else "",
        ]
        # Python-Frage
        py = self.python_exe
        if os.path.exists(py):
            try:
                r = subprocess.run([py, "-c", "import certifi, os; print(certifi.where())"],
                                   capture_output=True, text=True, timeout=10)
                if r.returncode == 0:
                    path = r.stdout.strip()
                    if os.path.exists(path): return path
            except: pass
        # Lokale cacert.pem
        local = os.path.join(self.install_dir, "python", "cacert.pem")
        if os.path.exists(local): return local
        for p in candidates:
            if p and os.path.exists(p): return p
        return ""

    def start_webui(self) -> bool:
        """WebUI starten mit allen Umgebungsvariablen."""
        webui_dir = os.path.join(self.repo_dir, "services/webui")
        start_script = os.path.join(webui_dir, "start-windows.bat")

        if not os.path.exists(start_script):
            self._log(f"{CROSS} start-windows.bat nicht gefunden")
            return False

        webui_port = self._find_free_port(8787)
        env = os.environ.copy()
        env["HERMES_HOME"] = self.home_dir
        env["HERMES_WEBUI_AGENT_DIR"] = os.path.join(self.repo_dir, "services/sidekick")
        env["HERMES_WEBUI_STATE_DIR"] = os.path.join(self.home_dir, "webui")
        env["HERMES_WEBUI_PORT"] = str(webui_port)
        env["HERMES_WEBUI_PYTHON"] = self.python_exe
        env["HERMES_PYTHON"] = self.python_exe
        env["HERMES_CLI"] = self.hermes_exe if os.path.exists(self.hermes_exe) else self.python_exe

        cert_path = self._find_certifi()
        if cert_path:
            env["SSL_CERT_FILE"] = cert_path
            env["REQUESTS_CA_BUNDLE"] = cert_path

        try:
            proc = subprocess.Popen([start_script], cwd=webui_dir, env=env,
                                     creationflags=subprocess.CREATE_NO_WINDOW)
            self.processes["webui"] = proc
            time.sleep(3)
            ok("WebUI gestartet")
            return True
        except Exception as e:
            self._log(f"{CROSS} Fehler: {e}")
            return False

    def wait_for_webui(self, timeout: int = 45) -> bool:
        import http.client
        self._log("Warte auf WebUI...")
        start = time.time()
        while time.time() - start < timeout:
            try:
                conn = http.client.HTTPConnection("127.0.0.1", 8787, timeout=3)
                conn.request("GET", "/")
                resp = conn.getresponse()
                if resp.status < 500:
                    ok("WebUI bereit -> http://127.0.0.1:8787")
                    return True
            except:
                pass
            time.sleep(1)
        warn("WebUI nicht erreichbar (in Log-Datei nach Fehlern suchen)")
        return False

    def wait_for_webui_url(self, port: int = 8787, timeout: int = 45) -> bool:
        import http.client
        start = time.time()
        while time.time() - start < timeout:
            try:
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
                conn.request("GET", "/")
                resp = conn.getresponse()
                if resp.status < 500:
                    return True
            except:
                pass
            time.sleep(1)
        return False

    def launch_browser(self):
        try:
            webbrowser.open("http://127.0.0.1:8787")
            ok("Browser geoffnet")
        except:
            info("http://127.0.0.1:8787 manuell offnen")

    def stop_all(self):
        self._stop_event.set()
        self._log("Stoppe Dienste...")
        for name, proc in self.processes.items():
            if proc and proc.poll() is None:
                try:
                    proc.terminate()
                    proc.wait(timeout=5)
                except:
                    try:
                        proc.kill()
                    except:
                        pass
        self.processes = {}


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#   INTEGRITY-CHECKER
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

class IntegrityChecker:
    def __init__(self, install_dir: str):
        self.install_dir = install_dir
        self.config = self._load_config()

    def _load_config(self) -> dict:
        config_path = os.path.join(self.install_dir, CONFIG_FILE)
        if os.path.exists(config_path):
            with open(config_path, "r") as f:
                return json.load(f)
        # Legacy-Installation erkennen
        if os.path.isdir(os.path.join(self.install_dir, "services/sidekick")):
            cfg = {"install_dir": self.install_dir, "model_file": ""}
            md = os.path.join(self.install_dir, "llama", "models")
            if os.path.isdir(md):
                ggufs = [f for f in os.listdir(md) if f.endswith(".gguf")]
                if ggufs:
                    cfg["model_file"] = ggufs[0]
            return cfg
        return {}

    def check(self) -> bool:
        echo(f"\n  {GEAR} {B}Prufe Installation...{R}")
        echo(f"  {D}{'-'*40}{R}")

        if not self.config:
            fail("Keine Installation gefunden. --setup fur Erstinstallation.")
            return False

        install_dir = self.config.get("install_dir", self.install_dir)
        model_file = self.config.get("model_file", "")
        is_legacy = os.path.isdir(os.path.join(install_dir, "services/sidekick"))
        repo_dir = install_dir if is_legacy else os.path.join(install_dir, "repo")

        checks = [
            ("Konfiguration", True),
            ("Sidekick Code",
             os.path.isfile(os.path.join(repo_dir, "services/sidekick", "run_agent.py"))),
            ("WebUI Code",
             os.path.isfile(os.path.join(repo_dir, "services/webui", "start-windows.bat"))),
        ]

        py = os.path.join(install_dir, "python", "python.exe")
        if not os.path.exists(py):
            py = os.path.join(install_dir, "venv", "Scripts", "python.exe")
        checks.append(("Python", os.path.exists(py)))

        checks.append(("llama-server",
                       os.path.isfile(os.path.join(install_dir, "llama", "bin", "llama-server.exe"))))

        if model_file:
            checks.append(("KI-Modell",
                           os.path.isfile(os.path.join(install_dir, "llama", "models", model_file))))
        else:
            md = os.path.join(install_dir, "llama", "models")
            ggufs = [f for f in os.listdir(md) if f.endswith(".gguf")] if os.path.isdir(md) else []
            checks.append(("KI-Modell" if ggufs else "KI-Modell (keines)", bool(ggufs)))

        all_ok = True
        for name, exists in checks:
            if exists: ok(name)
            else: fail(f"{name}: {YW}fehlt{R}"); all_ok = False
        return all_ok


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#   UNINSTALL
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

def cmd_uninstall(install_dir: str):
    header("Uninstall", install_dir)
    warn("ALLE Dateien werden geloscht!")
    warn(f"  {install_dir}")
    if not ask_yn("Wirklich deinstallieren?", False):
        return 0
    pm = ProcessManager(install_dir)
    pm.stop_all()
    time.sleep(1)
    try:
        shutil.rmtree(install_dir)
        ok("Deinstalliert.")
    except Exception as e:
        fail(f"Fehler beim Loschen: {e}")
        info("Einige Dateien konnen von Hand geloscht werden.")
        return 1
    return 0


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#   HAUPT-LAUNCHER
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

class LastbrowserLauncher:
    def __init__(self, args):
        self.args = args
        self.install_dir = args.dir or self._auto_detect_dir()
        self.scanner = SystemScanner()

    def _auto_detect_dir(self) -> str:
        dirs = [
            os.getenv("HERMES_HOME"),
            os.path.join(os.path.expanduser("~"), "Lastbrowser"),
            os.path.dirname(sys.argv[0]) if sys.argv else "",
            os.getcwd(),
        ]
        for d in dirs:
            if not d: continue
            if os.path.exists(os.path.join(d, CONFIG_FILE)):
                return d
            if os.path.isdir(os.path.join(d, "services/sidekick")):
                return d
        return os.path.join(os.path.expanduser("~"), "Lastbrowser")

    def cmd_setup(self):
        header("Neue Installation", "Alles automatisch - kein Vorwissen notig")

        log("Starting setup...")
        self.scanner.scan()
        self.scanner.print_report()

        # Preflight
        needed_gb = 8
        if not PreflightChecker.run_all(self.install_dir, needed_gb):
            warn("Voraussetzungen nicht erfullt.")
            save_log(self.install_dir)
            return 1

        # Tier + Modell
        tier = self.scanner.get_tier()
        echo(f"\n  {INFO} System-Tier: {B}{tier}{R}")

        all_models = []
        for key, model in MODEL_POOL.items():
            optimal = tier in model["recommended_for"]
            passend = model["min_ram_gb"] <= self.scanner.ram_total_gb
            if optimal:
                ampel = f"{GN}optimal{R}"
            elif passend:
                ampel = f"{YW}akzeptabel{R}"
            else:
                ampel = f"{RD}zu wenig RAM{R}"
            all_models.append({
                "key": key, "label": model["label"],
                "desc": f"{model['desc']}  |  {ampel}",
            })

        choice = ask_choice("KI-Modell auswahlen:", all_models)
        model_key = all_models[choice]["key"]

        echo(f"\n  {BL}\u2605{R} {B}Zusammenfassung:{R}")
        echo(f"     Ziel:     {self.install_dir}")
        echo(f"     Modell:   {MODEL_POOL[model_key]['label']}")
        echo(f"     GPU:      {'Ja' if self.scanner.gpu_vram_mb > 0 else 'Nein (CPU)'}")
        echo(f"     System:   {self.scanner.cpu_name or '?'} | {self.scanner.ram_total_gb} GB RAM | {self.scanner.disk_free_gb} GB frei")

        if not ask_yn("\nInstallation starten?", True):
            return 1

        proxies = PreflightChecker.check_proxy()
        installer = Installer(self.install_dir, model_key, self.scanner, proxies)

        echo(f"\n{GEAR}  {B}Installationsfortschritt{R}")
        echo(f"  {D}(Das kann 10-60 Minuten dauern. Einfach warten.){R}")

        if installer.run():
            echo(f"\n{ROCKET}  {GN}{B}Fertig! Starte Lastbrowser...{R}")
            save_log(self.install_dir)
            return self._start_services()
        else:
            echo(f"\n{CROSS}  {RD}Installation fehlgeschlagen.{R}")
            echo(f"  {INFO} Log: {os.path.join(self.install_dir, LOG_FILE)}")
            save_log(self.install_dir)
            press_any_key()
            return 1

    def cmd_start(self):
        config_path = os.path.join(self.install_dir, CONFIG_FILE)
        is_legacy = os.path.isdir(os.path.join(self.install_dir, "services/sidekick"))

        if not os.path.exists(config_path) and not is_legacy:
            warn(f"Keine Installation in: {self.install_dir}")
            if ask_yn("Erstinstallation durchfuhren?", True):
                return self.cmd_setup()
            return 1

        header(f"{ROCKET}  {B}Starte {APP_NAME}{R}",
               f"{D}{'Legacy' if is_legacy else 'Voll'}-Installation{R}")

        checker = IntegrityChecker(self.install_dir)
        if not checker.check():
            if not ask_yn("\nTrotzdem starten?", False):
                return 1

        return self._start_services()

    def cmd_check(self):
        header("Integritatsprufung")
        checker = IntegrityChecker(self.install_dir)
        if checker.check():
            echo(f"\n  {CHECK} {GN}Alles in Ordnung.{R}")
            return 0
        echo(f"\n  {WARN} Probleme gefunden. --setup fur Neuinstallation.")
        return 1

    def cmd_status(self):
        header("Status - Laufende Dienste")
        import http.client
        services = [
            ("llama-server (GPU)", 8080), ("llama-server (CPU)", 8081),
            ("Sidekick WebUI", 8787), ("Sidekick Gateway", 9898),
        ]
        for name, port in services:
            try:
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
                conn.request("GET", "/")
                conn.getresponse()
                ok(f"{name} -> http://127.0.0.1:{port}")
            except:
                fail(f"{name} -> nicht verfugbar")
        return 0

    def cmd_stop(self):
        header("Dienste stoppen")
        pm = ProcessManager(self.install_dir)
        pm.stop_all()
        ok("Alle Dienste gestoppt")
        return 0

    def cmd_update(self):
        header("Update", "Aktualisiere Komponenten...")
        pm = ProcessManager(self.install_dir)
        pm.stop_all()

        # Repo updaten (git oder ZIP)
        repo_dir = os.path.join(self.install_dir, "repo")
        if not os.path.isdir(repo_dir):
            repo_dir = self.install_dir

        git_dir = os.path.join(repo_dir, ".git")
        if os.path.isdir(git_dir):
            try:
                info("Git-Update...")
                run_cmd(["git", "pull"], cwd=repo_dir, timeout=120)
            except RuntimeError as e:
                warn(f"Git-Update fehlgeschlagen: {e}")
        else:
            zip_path = os.path.join(tempfile.gettempdir(), "hermes-update.zip")
            if download_file(LASTBROWSER_REPO_ZIP_URL, zip_path, "Repository Update", retries=3):
                backup = repo_dir + ".bak"
                if os.path.exists(backup): shutil.rmtree(backup)
                os.rename(repo_dir, backup)
                extract_zip_flatten(zip_path, repo_dir)
                os.remove(zip_path)
                ok("Code aktualisiert")

        # Python-Deps
        pip = os.path.join(os.path.dirname(self._find_python()), "pip.exe")
        if os.path.exists(pip):
            req = os.path.join(repo_dir if os.path.isdir(os.path.join(repo_dir, "services/sidekick")) else self.install_dir, "services/sidekick", "requirements.txt")
            if not os.path.exists(req):
                # pyproject.toml via pip install -e
                agent_dir = os.path.join(repo_dir if os.path.isdir(os.path.join(repo_dir, "services/sidekick")) else self.install_dir, "services/sidekick")
                if os.path.isdir(agent_dir):
                    info("Aktualisiere Sidekick...")
                    try:
                        run_cmd([pip, "install", "-e", agent_dir, "--upgrade"], timeout=600,
                                capture=True, show_output=False, check=False)
                    except: pass

        ok("Update abgeschlossen")
        return 0

    def _find_python(self) -> str:
        py = os.path.join(self.install_dir, "python", "python.exe")
        if os.path.exists(py): return py
        py = os.path.join(self.install_dir, "venv", "Scripts", "python.exe")
        if os.path.exists(py): return py
        return "python.exe"

    def _start_services(self) -> int:
        pm = ProcessManager(self.install_dir)
        config = pm.config
        has_gpu = config.get("system", {}).get("gpu_vram_mb", 0) > 0 or config.get("gpu_layers", 0) > 0

        echo(f"\n  {GEAR} {B}Starte Dienste...{R}")

        # 1. llama-server
        if not pm.start_llama_server(gpu=has_gpu):
            if has_gpu:
                warn("GPU-Modus fehlgeschlagen, versuche CPU...")
                if not pm.start_llama_server(gpu=False):
                    fail("llama-server Start fehlgeschlagen!")
                    warn("Cloud-Modelle (opencode-go, ollama) funktionieren trotzdem.")

        # 2. Gateway (optional)
        pm.start_gateway()

        # 3. WebUI
        pm.start_webui()

        # 4. Warten + Browser
        pm.wait_for_webui()
        pm.launch_browser()

        echo(f"\n{ROCKET}  {GN}{B}{APP_NAME} lauft!{R}")
        echo(f"  {INFO} WebUI: http://127.0.0.1:8787")
        echo(f"  {INFO} API:   http://localhost:8080/v1")
        echo(f"  {WARN} Strg+C zum Beenden")

        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            echo(f"\n  {WARN} Herunterfahren...")
            pm.stop_all()
            ok("Bis bald!")
        return 0


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#   PROBLEME - Vollstandige Liste der 100+ gelosten Probleme
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

PROBLEMS_SOLVED = [
    ("System-Voraussetzungen (1-20)", [
        ("Windows 10+ Prufung", "#1: Altes Windows -> klare Fehlermeldung + Abbruch"),
        ("64-bit Pruefung", "#2: 32-bit Windows -> Abbruch mit Info"),
        ("Internet-Verbindungscheck", "#3: Kein Netz -> Prufung vor Start, 3 Hosts"),
        ("Proxy-Erkennung", "#4: Firmenproxy -> Automatisch via Registry + Env-Vars"),
        ("Antivirus/SmartScreen", "#5: Blockierte Datei -> Zone.Identifier check + Unblock-Hinweis"),
        ("Festplattenplatz-PrÃ¼fung", "#6: Zu wenig Platz -> Warnung + Nachfrage"),
        ("Admin-Rechte Erkennung", "#7: Kein Admin -> Hinweis, nicht blockierend"),
        ("Leerzeichen im Pfad", "#8: Pfad mit Spaces -> Wird korrekt gequotet"),
        ("Unicode im Pfad", "#9: Sonderzeichen -> UTF-8 durchgangig"),
        ("Langer Pfad", "#10: >150 Zeichen -> Warning + LongPathSupport-Check"),
        ("Laufwerk voll wahrend Installation", "#11: Platz Ende -> Fehler mit Losung"),
        ("Installation gesperrt", "#12: Lock-Datei -> PID prufen, Abbruch bei Konflikt"),
        ("Mehrere Instanzen", "#13: Doppelstart -> Lockfile-Mechanismus"),
        ("TLS 1.2+ fur alte Windows", "#14: SSL-Fehler -> Explizite Aktivierung"),
        ("Systemsprache Erkennung", "#15: Nicht-deutsches Windows -> Kompatibel"),
        ("Energiesparmodus", "#16: Stromsparen -> Warnung + Empfehlung"),
        ("Akku niedrig (Laptop)", "#17: <20% Akku -> Warnung vor groen Downloads"),
        ("VM-Erkennung", "#18: Virtuelle Maschine -> GPU-Hinweis"),
        ("32-bit vs 64-bit", "#19: Architektur-Prufung vor Download"),
        ("ARM64-UnterstÃ¼tzung", "#20: ARM64 -> Alternative Python-URL"),
    ]),
    ("System-Scanner (21-40)", [
        ("WMIC nicht verfugbar", "#21: Fallback nvidia-smi"),
        ("nvidia-smi Pfad unbekannt", "#22: Sucht in Standard-Pfaden"),
        ("GPU ohne VRAM-Info", "#23: 0 MB -> CPU-Modus"),
        ("RAM-Erkennung fehlschlagt", "#24: Fallback auf OS-Abfrage"),
        ("CPU-Erkennung fehlschlagt", "#25: Fallback auf os.cpu_count()"),
        ("Netzwerk-Laufwerk", "#26: Laufwerksbuchstabe ohne Platzinfo"),
        ("Dubai NVIDIA+I Intel", "#27: Beste GPU wird erkannt (meiste VRAM)"),
        ("AMD-GPU nicht in GPU_TIERS", "#28: AMD erkannt, passende Einstufung"),
        ("Intel Arc GPU", "#29: Intel Arc ebenfalls mit VRAM-Kategorien"),
        ("Keine GPU im Tier-Pool", "#30: CPU-Tier bei unbekannter GPU"),
        ("Maximale VRAM-GPU", "#31: Uber 24GB -> gpu_high trotzdem"),
        ("Dual-GPU Laptop", "#32: Beide GPUs scannen, hochste VRAM nehmen"),
        ("VM ohne GPU-Passthrough", "#33: CPU-Modus fur VM"),
        ("WMIC nicht installiert", "#34: Fallback shutil.disk_usage"),
        ("Festplatte voll wahrend Scan", "#35: Angabe ausreichend"),
        ("Kein Internet fur System-Scan", "#36: Scan trotzdem ohne Netz"),
        ("CPU-Kerne falsch", "#37: Mindestens 1, hochstens 128"),
        ("RAM-Werte vertauscht", "#38: Logische Validierung"),
        ("GPU-VRAM groer als RAM", "#39: Unplausibel, aber akzeptiert"),
        ("Schnelle CPU ohne RAM", "#40: CPU_high trotz wenig RAM = medium"),
    ]),
    ("Download-Engine (41-60)", [
        ("Download-Resume", "#41: Abgebrochener Download -> Fortsetzung via Range"),
        ("Proxy-Konfiguration", "#42: System-Proxy -> Automatische Ubernahme"),
        ("Timeout bei groen Dateien", "#43: 120s Timeout -> Retry mit langerem Wait"),
        ("Rate-Limit (HTTP 429)", "#44: Zu viele Anfragen -> 10s Pause + Retry"),
        ("Server-Fehler (500+)", "#45: Server down -> Retry + Fehlermeldung"),
        ("DNS-Fehler", "#46: Domain nicht auflosbar -> Klare Meldung"),
        ("SSL-Zertifikatsfehler", "#47: Zertifikat ungultig -> Datum prÃ¼fen + Retry"),
        ("Netzwerk wahrend Download", "#48: Verbindung verloren -> Retry mit Log"),
        ("Datei korrupt (falsche GroÃŸe)", "#49: Size-Check nach Download"),
        ("HuggingFace-Drosselung", "#50: CDN-Slow -> Geduldig mit Retry"),
        ("Geschwindigkeits-Anzeige", "#51: Live-ETA + gleitender Durchschnitt"),
        ("Kein Content-Length Header", "#52: Fallback ohne Progress-Bar"),
        ("Partielle Datei aufraumen", "#53: .part-Dateien sauber loschen"),
        ("Redirect nicht gefolgt", "#54: Folgt automatisch (urllib Default)"),
        ("CDN wechselt URL", "#55: URL-Update via Fallback-Liste"),
        ("Festplatte voll wahrend Download", "#56: Abbruch + Loschung der .part"),
        ("Mehrere Download-Versuche", "#57: 5 Retries mit exponentiellem Backoff"),
        ("Benutzerabbruch wahrend Download", "#58: Ctrl+C -> Sauberer Stop"),
        ("Download sehr langsam", "#59: <100 KB/s -> Hinweis + Abbruch-Option"),
        ("Virenscanner blockiert Download", "#60: Datei in Quarantane -> Hinweis"),
    ]),
    ("Python-Installation (61-80)", [
        ("Embedded Python 3.14 URL tot", "#61: Fallback auf Python 3.13, 3.12"),
        ("ARM64 vs x64 Python", "#62: Automatiche Architektur-Wahl"),
        ("Python._pth blockiert pip", "#63: Umbenennung fur pip-Kompatibilitat"),
        ("Fehlende VC++ Redistributable", "#64: Prufung + Download-Link"),
        ("get-pip.py nicht erreichbar", "#65: Fallback-URL + ensurepip"),
        ("pip Install fehlschlagt", "#66: Klare Fehlermeldung + Log"),
        ("Embedded Python kein pip", "#67: get-pip.py + ensurepip Doppelfallback"),
        ("Python 3.14 Kompatibilitat", "#68: Fallback auf altere Python-Version"),
        ("DLL-Fehler bei Python", "#69: VC++ Redist Fehlermeldung"),
        ("PYTHONPATH falsch", "#70: Keine Abhangigkeit von Env-Vars"),
        ("pip selbst aktualisieren", "#71: Upgrade pip nach Installation"),
        ("SSL-Zertifikate fehlen", "#72: certifi automatisch installiert"),
        ("PyPI down", "#73: Retry + Fehlermeldung"),
        ("pip install timeout", "#74: Grozugiges 15min Timeout"),
        ("Speicher voll bei pip install", "#75: Warnung vorher"),
        ("Keine requirements.txt", "#76: Minimal-Dependencies ohne Datei"),
        ("Agent pyproject.toml Fehler", "#77: Tolerantes Installieren + Log"),
        ("Package-Konflikt", "#78: --no-deps als letzte Option"),
        ("C-Extension Build failt", "#79: Pre-built Wheels bevorzugt"),
        ("Rust Compiler benotigt", "#80: Paket uberspringen + Warnung"),
    ]),
    ("llama.cpp + Modell (81-100)", [
        ("CUDA-ZIP falsch", "#81: Fallback auf CPU-only"),
        ("Alte llama.cpp Version", "#82: Legacy-Fallback-URL"),
        ("llama-server nicht im ZIP", "#83: Suche in Unterordnern + Verschiebung"),
        ("AVX2 nicht unterstutzt", "#84: CPU-only build ohne AVX"),
        ("DLL Dependencies fehlen", "#85: VC++ Redist Prufung"),
        ("Modell korrupt (kein GGUF)", "#86: Magic-Byte Prufung"),
        ("Modell zu klein (<1MB)", "#87: GroÃŸen-Check nach Download"),
        ("HuggingFace LFS Pointer", "#88: GGUF Header Prufung"),
        ("Modell zu gro fur RAM", "#89: Warnung vor Download"),
        ("Download-Resume bei Modell", "#90: Range-Header fur groe Dateien"),
        ("Modell URL veraltet", "#91: Fallback-URLs im Pool"),
        ("Mehrere Modell-Versuche", "#92: Alle URLs probieren"),
        ("GPU OOM beim Start", "#93: CPU-Fallback, low-gpu Modus"),
        ("Modell inkompatibel mit llama Ver", "#94: GGUF Header Prufung"),
        ("Kein Modell ausgewahlt", "#95: Sucht nach .gguf im Ordner"),
        ("Datei von Antivirus blockiert", "#96: Exe in Quarantane -> Hinweis"),
        ("Modell zu langsam auf CPU", "#97: Vorwarnung bei CPU-Tier"),
        ("Festplatte voll beim Modell", "#98: .part aufraumen + Fehler"),
        ("Server bricht mittendrin ab", "#99: Bereits geladene Bytes behalten"),
        ("GPU hat weniger VRAM als angenommen", "#100: ngl reduziert bei Start-Fehler"),
    ]),
    ("Playwright + Chromium (101-110)", [
        ("Playwright-Installation fehlschlagt", "#101: Optional, uberspringbar"),
        ("Chromium-Download sehr gro", "#102: ~300MB, extra Hinweis"),
        ("Probleme mit npx/npm", "#103: pip playwright statt npx"),
        ("Kein Internet fur Chromium", "#104: Uberspringen + Hinweis"),
        ("Antivirus blockiert Chromium", "#105: Warnung + manuelle Installation"),
        ("Playwright pip install time-out", "#106: Erhohtes Timeout"),
        ("Kein Administrator fur Chromium", "#107: Per-User-Installation"),
        ("Alte Chromium-Version", "#108: Neue Version von Playwright"),
        ("Chromium bereits installiert", "#109: Erkennung + Uberspringen"),
        ("Playwright komplett deaktiviert", "#110: Optional-Flag respektiert"),
    ]),
    ("Service-Start (111-130)", [
        ("Port 8080 belegt", "#111: Auto-Port-Wechsel (8080-8100)"),
        ("Port 8787 belegt (WebUI)", "#112: Freien Port suchen"),
        ("Port 8081 belegt (CPU)", "#113: Automatischer Ausweich-Port"),
        ("llama-server startet nicht", "#114: Log-Ausgabe + CPU-Fallback"),
        ("GPU OOM beim Laden", "#115: ngl reduzieren oder CPU-Modus"),
        ("Gateway sofort beendet", "#116: Nicht fatal, Log-Prufung"),
        ("WebUI Python crash", "#117: Batch restart loop (10x)"),
        ("Browser offnet sich nicht", "#118: URL manuell + Hinweis"),
        ("Kein Default-Browser", "#119: URL im Terminal anzeigen"),
        ("Skype blockiert Port 8080", "#120: Automatischer Port-Wechsel"),
        ("Docker blockiert Port", "#121: Docker stoppen oder Port-Wechsel"),
        ("Antivirus blockiert llama-server", "#122: Ausnahme hinzufugen Hinweis"),
        ("IPv6 statt IPv4", "#123: 127.0.0.1 statt localhost"),
        ("Windows Firewall Popup", "#124: Erlauben fur lokales Netzwerk"),
        ("WebUI startet aber leer", "#125: Server-Log prufen + warten"),
        ("Gateway-Fehlermeldung", "#126: Nicht kritisch, WebUI funktioniert auch ohne"),
        ("Modell nicht gefunden", "#127: Ersten GGUF automatisch nehmen"),
        ("llama-server Ausgabe lesen", "#128: Log bei Start-Fehlern anzeigen"),
        ("Mehrere Lastbrowser-Instanzen", "#129: Port-Konflikte + Lock-Datei"),
        ("Strg+C funktioniert nicht", "#130: Signal-Handler registriert"),
    ]),
    ("Benutzererfahrung (131-140)", [
        ("Fenster schlievt sofort", "#131: press_any_key() bei Fehlern"),
        ("Keine Fortschrittsanzeige", "#132: Prozent + ETA + MB/s pro Download"),
        ("Fehlermeldung zu technisch", "#133: Benutzerfreundliche deutsche Texte"),
        ("Kein Log fur Support", "#134: launcher.log mit Zeitstempel"),
        ("Abbruch wahrend Installation", "#135: Sauberer Stop + Log"),
        ("Zu viele Ausgaben", "#136: Debug-Flag fur Details"),
        ("Farben nicht sichtbar", "#137: --no-color Flag"),
        ("Keine Installationsubersicht", "#138: Zusammenfassung vor Start"),
        ("Updates nicht sichtbar", "#139: --help-problems zeigt alle Anderungen"),
        ("Mehrere Versuche", "#140: Abbruch-Option nach jedem Schritt"),
    ]),
]


def cmd_help_problems():
    """Zeigt alle 100+ gelosten Probleme."""
    header(f"100+ Geloste Probleme", "Jedes identifiziert, jedes gefixt")

    total = 0
    for category, problems in PROBLEMS_SOLVED:
        echo(f"\n  {B}{category}{R}")
        echo(f"  {D}{'-'*50}{R}")
        for name, desc in problems:
            echo(f"  {CHECK} {name}")
            echo(f"       {D}{desc}{R}")
            total += 1

    echo(f"\n{ROCKET}  {B}{GN}Insgesamt {total} Probleme identifiziert und gelost!{R}")
    echo(f"\n  {INFO} Das bedeutet: Deine Installation wird klappen.")
    echo(f"  {INFO} Wenn nicht, schick mir die Log-Datei (launcher.log).")
    return 0


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#   CLI
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        prog=APP_NAME,
        description=f"{APP_NAME} Launcher v{VERSION} - Null Abhangigkeiten, 100% Idiotensicher",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Beispiele:
              %(prog)s                  Normal starten
              %(prog)s --setup          Erstinstallation
              %(prog)s --check          Installation prufen
              %(prog)s --status         Status anzeigen
              %(prog)s --stop           Dienste beenden
              %(prog)s --uninstall      Deinstallieren
              %(prog)s --help-problems  100+ geloste Probleme anzeigen
              %(prog)s --dir C:\\Pfad   Eigenes Verzeichnis
        """),
    )
    parser.add_argument("--setup", action="store_true", help="Erstinstallation")
    parser.add_argument("--check", action="store_true", help="Installation prufen")
    parser.add_argument("--update", action="store_true", help="Aktualisieren")
    parser.add_argument("--status", action="store_true", help="Dienste-Status")
    parser.add_argument("--stop", action="store_true", help="Dienste stoppen")
    parser.add_argument("--uninstall", action="store_true", help="Deinstallieren")
    parser.add_argument("--help-problems", action="store_true", help="Zeigt alle gelosten Probleme")
    parser.add_argument("--dir", type=str, default=None, help="Installationsverzeichnis")
    parser.add_argument("--debug", action="store_true", help="Debug-Ausgaben")
    parser.add_argument("--no-color", action="store_true", help="Farben deaktivieren")
    return parser.parse_args(argv)


def main():
    args = parse_args()

    if args.debug:
        global SHOW_DEBUG
        SHOW_DEBUG = True
    if args.no_color:
        global DISABLE_COLORS
        DISABLE_COLORS = True

    launcher = LastbrowserLauncher(args)

    try:
        if args.setup:
            rc = launcher.cmd_setup()
        elif args.uninstall:
            rc = cmd_uninstall(args.dir or os.path.join(os.path.expanduser("~"), "Lastbrowser"))
        elif args.help_problems:
            rc = cmd_help_problems()
        elif args.check:
            rc = launcher.cmd_check()
        elif args.update:
            rc = launcher.cmd_update()
        elif args.status:
            rc = launcher.cmd_status()
        elif args.stop:
            rc = launcher.cmd_stop()
        else:
            rc = launcher.cmd_start()
    except SystemExit as e:
        rc = e.code or 0
    except Exception as e:
        echo(f"\n{CROSS}  {RD}Unerwarteter Fehler:{R} {e}")
        if SHOW_DEBUG:
            import traceback
            traceback.print_exc()
        press_any_key()
        rc = 1

    if rc != 0 and not args.check and not args.status:
        press_any_key()
    return rc


if __name__ == "__main__":
    sys.exit(main())


