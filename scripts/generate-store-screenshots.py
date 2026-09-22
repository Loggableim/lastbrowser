"""
Generate the 6 official 1920x1080 Microsoft Store screenshots for Lastbrowser.
Specification: docs/store-listing.md Section 4.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT_DIR = Path("assets/store")
OUT_DIR.mkdir(parents=True, exist_ok=True)

W, H = 1920, 1080

# Colors (Brand Guide Tokens)
NEAR_BLACK = (7, 10, 18)
MIDNIGHT = (7, 17, 31)
SURFACE = (16, 24, 39)
PANEL = (14, 22, 40)
STROKE = (42, 53, 80)
TEXT_WHITE = (247, 250, 255)
MUTED = (170, 180, 198)
ELECTRIC_BLUE = (37, 99, 255)
CYAN = (0, 229, 255)
MAGENTA = (255, 45, 143)
PURPLE = (138, 63, 252)
YELLOW = (255, 200, 0)
GREEN = (124, 255, 107)

def get_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    paths = [
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
    ]
    for p in paths:
        if Path(p).exists():
            return ImageFont.truetype(p, size=size)
    return ImageFont.load_default()

FONT_TITLE = get_font(32, bold=True)
FONT_HEADING = get_font(24, bold=True)
FONT_SUB = get_font(18, bold=True)
FONT_BODY = get_font(16, bold=False)
FONT_BOLD = get_font(16, bold=True)
FONT_SMALL = get_font(13, bold=False)
FONT_MONO = get_font(14, bold=False)

def create_base_canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGBA", (W, H), NEAR_BLACK + (255,))
    draw = ImageDraw.Draw(img)
    # Background radial glow
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((W//2 - 600, -200, W//2 + 600, 700), fill=(37, 99, 255, 28))
    glow_draw.ellipse((W - 500, H//2 - 200, W + 300, H//2 + 500), fill=(255, 45, 143, 20))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    img.alpha_composite(glow)
    return img, ImageDraw.Draw(img)

def draw_window_frame(draw: ImageDraw.ImageDraw, img: Image.Image, url: str = "https://lastbrowser.com/dashboard") -> tuple[int, int, int, int]:
    # Window rect: 40px margin
    x1, y1, x2, y2 = 40, 40, W - 40, H - 40
    # Window border & shadow
    draw.rounded_rectangle((x1, y1, x2, y2), radius=16, fill=SURFACE, outline=STROKE, width=1)
    
    # Titlebar (44px)
    tb_h = 44
    draw.rounded_rectangle((x1, y1, x2, y1 + tb_h), radius=16, fill=(10, 14, 24))
    draw.rectangle((x1, y1 + tb_h - 16, x2, y1 + tb_h), fill=(10, 14, 24))
    draw.line((x1, y1 + tb_h, x2, y1 + tb_h), fill=STROKE, width=1)
    
    # Window control dots (left)
    draw.ellipse((x1 + 18, y1 + 16, x1 + 30, y1 + 28), fill=(255, 95, 86))
    draw.ellipse((x1 + 38, y1 + 16, x1 + 50, y1 + 28), fill=(255, 189, 46))
    draw.ellipse((x1 + 58, y1 + 16, x1 + 70, y1 + 28), fill=(39, 201, 63))
    
    # Omnibox
    ob_x1, ob_x2 = x1 + 180, x2 - 280
    ob_y1, ob_y2 = y1 + 7, y1 + 37
    draw.rounded_rectangle((ob_x1, ob_y1, ob_x2, ob_y2), radius=8, fill=(14, 20, 34), outline=STROKE, width=1)
    draw.text((ob_x1 + 14, ob_y1 + 6), f"🔒 {url}", fill=MUTED, font=FONT_SMALL)
    
    # Shield badge in Omnibox
    shield_txt = "🛡️ 3,420 Ads blocked · 1.2 GB RAM saved"
    draw.text((ob_x2 - 270, ob_y1 + 6), shield_txt, fill=GREEN, font=FONT_SMALL)
    
    # Titlebar Right info
    draw.text((x2 - 240, y1 + 12), "⚡ Nova AI: gemini-3.8-flash", fill=CYAN, font=FONT_SMALL)
    
    body_y1 = y1 + tb_h
    return x1, body_y1, x2, y2

# ─────────────────────────────────────────────────────────────────
# 1. SCREENSHOT 1: Zen-Browseransicht (Vertikale Tabs & Pinned Apps)
# ─────────────────────────────────────────────────────────────────
def make_screenshot_1():
    img, draw = create_base_canvas()
    x1, y1, x2, y2 = draw_window_frame(draw, img, "https://github.com/Loggableim/lastbrowser")
    
    # Sidebar (width 260px)
    sb_w = 260
    draw.rectangle((x1, y1, x1 + sb_w, y2), fill=PANEL, outline=STROKE, width=1)
    
    # Workspace selector
    draw.rounded_rectangle((x1 + 14, y1 + 14, x1 + sb_w - 14, y1 + 50), radius=8, fill=SURFACE, outline=STROKE)
    draw.text((x1 + 24, y1 + 22), "📂 Workspace: Sprint Planning ▾", fill=TEXT_WHITE, font=FONT_SMALL)
    
    # Pinned Apps Header
    draw.text((x1 + 16, y1 + 64), "ANGEPINNTE APPS (TOP 64)", fill=CYAN, font=get_font(11, bold=True))
    
    # 4x2 Pinned App grid
    apps = [("💬", "WhatsApp"), ("🎮", "Discord"), ("🎨", "Figma"), ("🐙", "GitHub"),
            ("📝", "Notion"), ("⚡", "Linear"), ("🎵", "Spotify"), ("➕", "Katalog")]
    for idx, (icon, name) in enumerate(apps):
        row = idx // 4
        col = idx % 4
        px = x1 + 16 + col * 56
        py = y1 + 84 + row * 52
        draw.rounded_rectangle((px, py, px + 46, py + 44), radius=10, fill=SURFACE, outline=STROKE)
        draw.text((px + 14, py + 12), icon, font=FONT_SUB)
    
    # Tabs Header
    draw.text((x1 + 16, y1 + 200), "VERTIKALE TABS", fill=MUTED, font=get_font(11, bold=True))
    tabs = [
        ("🌐 Lastbrowser / GitHub Repository", True),
        ("📊 Q3 Performance & Memory Benchmarks", False),
        ("🤖 Sidekick Agent API Documentation", False),
        ("🎨 Design Tokens & Pop-Art System", False),
        ("📝 Release Notes v0.1.31", False),
    ]
    for idx, (title, active) in enumerate(tabs):
        ty = y1 + 222 + idx * 42
        fill_bg = (24, 38, 66) if active else (16, 24, 39, 0)
        outline_bg = (0, 229, 255, 120) if active else None
        if active:
            draw.rounded_rectangle((x1 + 12, ty, x1 + sb_w - 12, ty + 36), radius=8, fill=fill_bg, outline=outline_bg)
            draw.text((x1 + 22, ty + 9), title, fill=TEXT_WHITE, font=FONT_BOLD)
        else:
            draw.text((x1 + 22, ty + 9), title, fill=MUTED, font=FONT_BODY)
    
    # New Tab button
    draw.rounded_rectangle((x1 + 14, y2 - 48, x1 + sb_w - 14, y2 - 14), radius=8, fill=SURFACE, outline=STROKE)
    draw.text((x1 + 70, y2 - 36), "+ Neuer Tab (Ctrl+T)", fill=CYAN, font=FONT_SMALL)
    
    # Main Webview area
    content_x = x1 + sb_w + 30
    draw.text((content_x, y1 + 30), "Loggableim / lastbrowser", fill=CYAN, font=FONT_SUB)
    draw.text((content_x, y1 + 65), "The AI-Native Windows Browser with Built-in Nova & Sidekick", fill=TEXT_WHITE, font=FONT_TITLE)
    
    # Repository stats bar
    draw.rounded_rectangle((content_x, y1 + 130, x2 - 40, y1 + 190), radius=12, fill=SURFACE, outline=STROKE)
    draw.text((content_x + 24, y1 + 148), "⭐ 499 Unit Tests Passed  ·  🚀 0.1.31 Release Ready  ·  🛡️ 100% Local-First  ·  ⚡ ConPTY Terminal", fill=TEXT_WHITE, font=FONT_BODY)
    
    # Big promotional banner inside web area
    card_y = y1 + 220
    draw.rounded_rectangle((content_x, card_y, x2 - 40, y2 - 40), radius=16, fill=(11, 18, 32), outline=STROKE)
    draw.text((content_x + 30, card_y + 30), "✨ Zen-Browser Ästhetik trifft auf autonome Agenten", fill=YELLOW, font=FONT_HEADING)
    desc = (
        "• Befreien Sie Ihren Viewport: Horizontale Tab-Leisten entfallen zugunsten der einklappbaren Sidebar.\n"
        "• Drei flexible Modi: 240px Ausgeklappt, 48px Slim-Dock oder 0px Zen-Modus via Ctrl+B.\n"
        "• Top-64 Pinned Apps Grid: Beliebte Web-Dienste mit 1-Klick und Shortcuts (Ctrl+1 bis Ctrl+8).\n"
        "• Integriertes Smart Tab Discarding spart bis zu 1,5 GB Arbeitsspeicher."
    )
    draw.multiline_text((content_x + 30, card_y + 80), desc, fill=MUTED, font=FONT_BODY, spacing=14)
    
    img.convert("RGB").save(OUT_DIR / "store-screen-1-zen-sidebar.png", "PNG", quality=95)
    print("[OK] Created store-screen-1-zen-sidebar.png")

# ─────────────────────────────────────────────────────────────────
# 2. SCREENSHOT 2: 70/30 Copilot Split-View
# ─────────────────────────────────────────────────────────────────
def make_screenshot_2():
    img, draw = create_base_canvas()
    x1, y1, x2, y2 = draw_window_frame(draw, img, "https://developer.mozilla.org/en-US/docs/Web/API")
    
    split_w = int((x2 - x1) * 0.70)
    web_x2 = x1 + split_w
    copilot_x1 = web_x2
    
    # 70% Left Web Content
    draw.rectangle((x1, y1, web_x2, y2), fill=(10, 15, 26))
    draw.line((web_x2, y1, web_x2, y2), fill=STROKE, width=1)
    
    draw.text((x1 + 36, y1 + 36), "Web APIs Documentation", fill=CYAN, font=FONT_SUB)
    draw.text((x1 + 36, y1 + 70), "Modern Web Architecture & Electron Sandboxing", fill=TEXT_WHITE, font=FONT_TITLE)
    
    # Web doc card
    doc_y = y1 + 130
    draw.rounded_rectangle((x1 + 36, doc_y, web_x2 - 36, y2 - 40), radius=14, fill=SURFACE, outline=STROKE)
    draw.text((x1 + 60, doc_y + 30), "Overview: Multi-Process Execution Model", fill=TEXT_WHITE, font=FONT_HEADING)
    doc_text = (
        "Lastbrowser runs isolated guest webviews with Chromium site-per-process protection.\n"
        "All DOM extraction and Agentic Workflows operate strictly on user request, preserving\n"
        "complete client-side isolation without sending data to third-party endpoints."
    )
    draw.multiline_text((x1 + 60, doc_y + 70), doc_text, fill=MUTED, font=FONT_BODY, spacing=10)
    
    # 30% Right Nova AI Copilot
    draw.rectangle((copilot_x1, y1, x2, y2), fill=PANEL)
    
    # Copilot Header
    draw.rounded_rectangle((copilot_x1 + 16, y1 + 16, x2 - 16, y1 + 56), radius=10, fill=SURFACE, outline=STROKE)
    draw.text((copilot_x1 + 28, y1 + 25), "🤖 Nova AI Copilot", fill=CYAN, font=FONT_BOLD)
    draw.text((x2 - 180, y1 + 27), "Gemini 3.8 Flash ▾", fill=YELLOW, font=FONT_SMALL)
    
    # Copilot Message 1 (User)
    draw.rounded_rectangle((copilot_x1 + 16, y1 + 76, x2 - 16, y1 + 130), radius=12, fill=(24, 34, 56), outline=STROKE)
    draw.text((copilot_x1 + 28, y1 + 86), "👤 Du", fill=MUTED, font=FONT_SMALL)
    draw.text((copilot_x1 + 28, y1 + 104), "Erstelle ein TypeScript Interface für diese API-Rückgabe.", fill=TEXT_WHITE, font=FONT_BODY)
    
    # Copilot Message 2 (Assistant)
    msg_y = y1 + 146
    draw.rounded_rectangle((copilot_x1 + 16, msg_y, x2 - 16, y2 - 90), radius=12, fill=SURFACE, outline=(0, 229, 255, 80))
    draw.text((copilot_x1 + 28, msg_y + 14), "🤖 Nova AI", fill=CYAN, font=FONT_SMALL)
    draw.text((copilot_x1 + 28, msg_y + 36), "Hier ist das passende TypeScript Interface:", fill=TEXT_WHITE, font=FONT_BODY)
    
    # Code block inside message
    code_y = msg_y + 70
    draw.rounded_rectangle((copilot_x1 + 28, code_y, x2 - 28, msg_y + 240), radius=8, fill=(7, 10, 18), outline=STROKE)
    code_text = (
        "export interface WebviewPayload {\n"
        "  readonly tabId: string;\n"
        "  url: string;\n"
        "  isIncognito: boolean;\n"
        "  tokensUsed: number;\n"
        "}"
    )
    draw.multiline_text((copilot_x1 + 40, code_y + 16), code_text, fill=GREEN, font=FONT_MONO, spacing=8)
    
    # AI Feedback & reporting toolbar (Microsoft Store GenAI policy)
    tb_y = msg_y + 252
    draw.text((copilot_x1 + 28, tb_y), "📋 Kopieren  ·  👍 Hilfreich  ·  👎 Feedback / Melden", fill=MUTED, font=FONT_SMALL)
    
    # Copilot Input prompt
    draw.rounded_rectangle((copilot_x1 + 16, y2 - 70, x2 - 16, y2 - 20), radius=10, fill=SURFACE, outline=STROKE)
    draw.text((copilot_x1 + 28, y2 - 50), "Frage an Nova stellen (z.B. @tabs oder /workflow)...", fill=MUTED, font=FONT_SMALL)
    
    img.convert("RGB").save(OUT_DIR / "store-screen-2-copilot-splitview.png", "PNG", quality=95)
    print("[OK] Created store-screen-2-copilot-splitview.png")

# ─────────────────────────────────────────────────────────────────
# 3. SCREENSHOT 3: Deep Tab Intelligence (@tabs)
# ─────────────────────────────────────────────────────────────────
def make_screenshot_3():
    img, draw = create_base_canvas()
    x1, y1, x2, y2 = draw_window_frame(draw, img, "https://store.example.com/product-compare")
    
    split_w = int((x2 - x1) * 0.55)
    web_x2 = x1 + split_w
    copilot_x1 = web_x2
    
    # Left: Web page with Grounding Anchor highlight
    draw.rectangle((x1, y1, web_x2, y2), fill=(10, 15, 26))
    draw.line((web_x2, y1, web_x2, y2), fill=STROKE, width=1)
    
    draw.text((x1 + 36, y1 + 36), "Online Store & Preisübersicht", fill=CYAN, font=FONT_SUB)
    draw.text((x1 + 36, y1 + 70), "Laptop Workstation Pro X15", fill=TEXT_WHITE, font=FONT_TITLE)
    
    # In-page grounding anchor glowing box
    anchor_y = y1 + 150
    draw.rounded_rectangle((x1 + 36, anchor_y, web_x2 - 36, anchor_y + 110), radius=10, fill=(0, 229, 255, 30), outline=CYAN, width=2)
    draw.text((x1 + 50, anchor_y + 16), "🎯 Grounding Anchor (Aktive Zitat-Fundstelle)", fill=YELLOW, font=FONT_BOLD)
    draw.text((x1 + 50, anchor_y + 44), "Preis: 1.499,00 € inkl. 32 GB RAM, 1 TB NVMe SSD, 14h Akkulaufzeit", fill=TEXT_WHITE, font=FONT_BODY)
    draw.text((x1 + 50, anchor_y + 70), "Lieferzeit: Sofort versandfertig · 30 Tage Rückgaberecht", fill=MUTED, font=FONT_SMALL)
    
    # Right: Copilot Deep Tab Intelligence
    draw.rectangle((copilot_x1, y1, x2, y2), fill=PANEL)
    draw.rounded_rectangle((copilot_x1 + 16, y1 + 16, x2 - 16, y1 + 56), radius=10, fill=SURFACE, outline=STROKE)
    draw.text((copilot_x1 + 28, y1 + 25), "⚡ Deep Tab Intelligence (@tabs)", fill=CYAN, font=FONT_BOLD)
    
    # User prompt with @tabs
    draw.rounded_rectangle((copilot_x1 + 16, y1 + 76, x2 - 16, y1 + 130), radius=12, fill=(24, 34, 56), outline=STROKE)
    draw.text((copilot_x1 + 28, y1 + 86), "👤 Du", fill=MUTED, font=FONT_SMALL)
    draw.text((copilot_x1 + 28, y1 + 104), "@tabs Vergleiche Preise und Akkulaufzeit der 3 offenen Shops in einer Tabelle.", fill=TEXT_WHITE, font=FONT_BODY)
    
    # Assistant synthesized response
    resp_y = y1 + 146
    draw.rounded_rectangle((copilot_x1 + 16, resp_y, x2 - 16, y2 - 30), radius=12, fill=SURFACE, outline=STROKE)
    draw.text((copilot_x1 + 28, resp_y + 16), "🤖 Nova Tab-Synthese", fill=CYAN, font=FONT_BOLD)
    draw.text((copilot_x1 + 28, resp_y + 42), "Hier ist der tabellarische Vergleich der 3 offenen Tabs:", fill=TEXT_WHITE, font=FONT_BODY)
    
    # Markdown Table inside copilot
    tbl_y = resp_y + 80
    draw.rounded_rectangle((copilot_x1 + 28, tbl_y, x2 - 28, tbl_y + 190), radius=8, fill=(7, 10, 18), outline=STROKE)
    
    headers = "Shop / Modell                 │ Preis       │ Akku   │ Zitat-Quelle"
    row1    = "Shop A: Workstation Pro X15   │ 1.499,00 €  │ 14 Std │ [Tab 1: Shop A] ↗"
    row2    = "Shop B: UltraBook Pro 15      │ 1.589,00 €  │ 12 Std │ [Tab 2: Shop B] ↗"
    row3    = "Shop C: Creator Laptop 15     │ 1.429,00 €  │ 10 Std │ [Tab 3: Shop C] ↗"
    
    draw.text((copilot_x1 + 40, tbl_y + 14), headers, fill=YELLOW, font=FONT_MONO)
    draw.line((copilot_x1 + 40, tbl_y + 42, x2 - 40, tbl_y + 42), fill=STROKE, width=1)
    draw.text((copilot_x1 + 40, tbl_y + 54), row1, fill=TEXT_WHITE, font=FONT_MONO)
    draw.text((copilot_x1 + 40, tbl_y + 90), row2, fill=MUTED, font=FONT_MONO)
    draw.text((copilot_x1 + 40, tbl_y + 126), row3, fill=MUTED, font=FONT_MONO)
    
    draw.text((copilot_x1 + 28, tbl_y + 210), "[*] Klick auf ein Zitat-Badge springt direkt zur Fundstelle im jeweiligen Tab.", fill=CYAN, font=FONT_SMALL)
    
    img.convert("RGB").save(OUT_DIR / "store-screen-3-tab-intelligence.png", "PNG", quality=95)
    print("[OK] Created store-screen-3-tab-intelligence.png")

# ─────────────────────────────────────────────────────────────────
# 4. SCREENSHOT 4: PowerShell ConPTY Terminal & sidekick doctor
# ─────────────────────────────────────────────────────────────────
def make_screenshot_4():
    img, draw = create_base_canvas()
    x1, y1, x2, y2 = draw_window_frame(draw, img, "lastbrowser://terminal/conpty")
    
    draw.rectangle((x1, y1, x2, y2), fill=(8, 12, 20))
    
    # Terminal toolbar
    draw.rounded_rectangle((x1 + 24, y1 + 16, x2 - 24, y1 + 60), radius=10, fill=SURFACE, outline=STROKE)
    draw.text((x1 + 40, y1 + 26), "💻 Lastbrowser ConPTY Terminal (PowerShell 7 & Sidekick TUI)", fill=TEXT_WHITE, font=FONT_BOLD)
    draw.text((x2 - 320, y1 + 28), "[ Doctor ]   [ Status ]   [ --fix ]   [ TUI Mode ]", fill=CYAN, font=FONT_SMALL)
    
    # Terminal console body
    term_y = y1 + 80
    draw.rounded_rectangle((x1 + 24, term_y, x2 - 24, y2 - 24), radius=12, fill=(4, 6, 12), outline=STROKE)
    
    term_lines = [
        ("PS C:\\Users\\Developer> sidekick doctor", YELLOW),
        ("", TEXT_WHITE),
        ("==================================================================", MUTED),
        ("                      SIDEKICK SYSTEM DIAGNOSTICS                 ", CYAN),
        ("==================================================================", MUTED),
        ("  [OK] [Python Environment]       Python 3.12.7 embedded (64-bit)", GREEN),
        ("  [OK] [Node.js Toolchain]        v22.10.0 runtime verified", GREEN),
        ("  [OK] [Chromium Core Engine]     Electron v37.10.3 / Chrome 134", GREEN),
        ("  [OK] [ConPTY Pseudo-Terminal]   VT100 ANSI support active", GREEN),
        ("  [OK] [Google Gemini CLI Auth]   Logged in: dominikrnr@gmail.com (Round-Robin active)", GREEN),
        ("  [OK] [Local Storage & DB]       SQLite WAL active in %APPDATA%\\Lastbrowser", GREEN),
        ("  [OK] [Network & Gateway Daemon] Ports 8000 & 9222 clear; 0 service collisions", GREEN),
        ("  [OK] [Security Guardrails]      Prompt-injection filters operational", GREEN),
        ("", TEXT_WHITE),
        ("Result: 8/8 diagnostic checks passed. System is fully healthy & release ready.", GREEN),
        ("PS C:\\Users\\Developer> _", TEXT_WHITE),
    ]
    
    for idx, (line, color) in enumerate(term_lines):
        draw.text((x1 + 48, term_y + 24 + idx * 26), line, fill=color, font=FONT_MONO)
        
    img.convert("RGB").save(OUT_DIR / "store-screen-4-conpty-terminal.png", "PNG", quality=95)
    print("[OK] Created store-screen-4-conpty-terminal.png")

# ─────────────────────────────────────────────────────────────────
# 5. SCREENSHOT 5: WebExtensions & Add-on Store (Manifest V3)
# ─────────────────────────────────────────────────────────────────
def make_screenshot_5():
    img, draw = create_base_canvas()
    x1, y1, x2, y2 = draw_window_frame(draw, img, "lastbrowser://settings/extensions")
    
    draw.rectangle((x1, y1, x2, y2), fill=NEAR_BLACK)
    
    # Section Header
    draw.text((x1 + 40, y1 + 30), "Erweiterungen & Add-ons (Manifest V3)", fill=TEXT_WHITE, font=FONT_TITLE)
    draw.text((x1 + 40, y1 + 75), "Installieren Sie essenzielle Browser-Erweiterungen mit 1-Klick direkt auf Ihrem PC.", fill=MUTED, font=FONT_BODY)
    
    # Buttons bar
    draw.rounded_rectangle((x2 - 320, y1 + 30, x2 - 40, y1 + 72), radius=10, fill=SURFACE, outline=STROKE)
    draw.text((x2 - 300, y1 + 42), "📂 Entpackte Erweiterung laden", fill=CYAN, font=FONT_SMALL)
    
    # 2x2 Extensions Grid
    ext_list = [
        ("🌙 Dark Reader", "Automatischer augenschonender Dunkelmodus für jede aufgerufene Webseite.", "v4.9.96 · Aktiviert", GREEN),
        ("🛡️ uBlock Origin Lite", "Effizienter, ressourcenschonender Werbe- und Content-Blocker (DeclarativeNetRequest).", "v2025.1.2 · Aktiviert", GREEN),
        ("🔑 Bitwarden", "Sicherer Open-Source Passwort-Manager mit lokaler Autofill-Unterstützung.", "v2024.12.0 · Installiert", CYAN),
        ("🔗 ClearURLs", "Entfernt Tracking-Parameter und Tracking-Hashes aus allen besuchten Hyperlinks.", "v1.26.1 · Aktiviert", GREEN),
    ]
    
    grid_y = y1 + 120
    for idx, (title, desc, status, st_color) in enumerate(ext_list):
        row = idx // 2
        col = idx % 2
        card_w = (x2 - x1 - 100) // 2
        card_h = 160
        cx = x1 + 40 + col * (card_w + 20)
        cy = grid_y + row * (card_h + 20)
        
        draw.rounded_rectangle((cx, cy, cx + card_w, cy + card_h), radius=14, fill=SURFACE, outline=STROKE)
        draw.text((cx + 24, cy + 22), title, fill=TEXT_WHITE, font=FONT_HEADING)
        draw.text((cx + 24, cy + 58), desc, fill=MUTED, font=FONT_BODY)
        draw.text((cx + 24, cy + 110), f"Status: {status}", fill=st_color, font=FONT_BOLD)
        
        # Toggle Switch on right
        draw.rounded_rectangle((cx + card_w - 70, cy + 106, cx + card_w - 24, cy + 130), radius=12, fill=CYAN)
        draw.ellipse((cx + card_w - 46, cy + 108, cx + card_w - 26, cy + 128), fill=NEAR_BLACK)
        
    img.convert("RGB").save(OUT_DIR / "store-screen-5-webextensions.png", "PNG", quality=95)
    print("[OK] Created store-screen-5-webextensions.png")

# ─────────────────────────────────────────────────────────────────
# 6. SCREENSHOT 6: Privacy, Adblock Shield & Clear Browsing Data
# ─────────────────────────────────────────────────────────────────
def make_screenshot_6():
    img, draw = create_base_canvas()
    x1, y1, x2, y2 = draw_window_frame(draw, img, "lastbrowser://settings/privacy")
    
    draw.rectangle((x1, y1, x2, y2), fill=NEAR_BLACK)
    
    # Left: Privacy & Security Metrics
    draw.text((x1 + 40, y1 + 30), "Datenschutz, Adblock-Schild & Speicherbereinigung", fill=TEXT_WHITE, font=FONT_TITLE)
    draw.text((x1 + 40, y1 + 75), "100% Local-First Architektur: Alle Profile und Surfdaten verbleiben unter %APPDATA%\\Lastbrowser.", fill=MUTED, font=FONT_BODY)
    
    # 3 Stat Cards
    stat_cards = [
        ("3.420", "Blockierte Tracker & Ads", CYAN),
        ("1,2 GB", "Eingesparter Arbeitsspeicher", GREEN),
        ("0 KB", "Übertragene Telemetriedaten", YELLOW),
    ]
    for idx, (val, label, col) in enumerate(stat_cards):
        bx = x1 + 40 + idx * 260
        by = y1 + 120
        draw.rounded_rectangle((bx, by, bx + 240, by + 100), radius=12, fill=SURFACE, outline=STROKE)
        draw.text((bx + 20, by + 16), val, fill=col, font=FONT_TITLE)
        draw.text((bx + 20, by + 60), label, fill=MUTED, font=FONT_SMALL)
        
    # Modal Dialog "Browserdaten bereinigen" (Store Policy 10.2) in center
    modal_w, modal_h = 620, 360
    mx1 = (W - modal_w) // 2
    my1 = y1 + 260
    mx2 = mx1 + modal_w
    my2 = my1 + modal_h
    
    # Modal shadow & background
    draw.rounded_rectangle((mx1 - 4, my1 - 4, mx2 + 4, my2 + 4), radius=18, fill=(0, 0, 0, 160))
    draw.rounded_rectangle((mx1, my1, mx2, my2), radius=16, fill=(12, 18, 30), outline=(0, 229, 255, 140), width=2)
    
    draw.text((mx1 + 30, my1 + 24), "Browserdaten & Cache bereinigen", fill=TEXT_WHITE, font=FONT_HEADING)
    draw.text((mx1 + 30, my1 + 58), "Gemäß Microsoft Store Policy 10.2 und DSGVO Art. 17 (Recht auf Vergessenwerden).", fill=MUTED, font=FONT_SMALL)
    
    items = [
        ("[x]  Browser-Verlauf und Sitzungs-Snapshots löschen", True),
        ("[x]  HTTP-Cache und temporäre Bilddateien leeren", True),
        ("[x]  Cookies, Web-Storage und IndexedDB entfernen", True),
        ("[ ]  Gespeicherte Lesezeichen behalten", False),
    ]
    for idx, (item, checked) in enumerate(items):
        iy = my1 + 100 + idx * 36
        draw.text((mx1 + 36, iy), item, fill=TEXT_WHITE if checked else MUTED, font=FONT_BODY)
        
    # Modal Buttons
    draw.rounded_rectangle((mx2 - 280, my2 - 60, mx2 - 160, my2 - 20), radius=8, fill=SURFACE, outline=STROKE)
    draw.text((mx2 - 250, my2 - 44), "Abbrechen", fill=MUTED, font=FONT_SMALL)
    
    draw.rounded_rectangle((mx2 - 140, my2 - 60, mx2 - 24, my2 - 20), radius=8, fill=ELECTRIC_BLUE)
    draw.text((mx2 - 120, my2 - 44), "Jetzt löschen", fill=TEXT_WHITE, font=FONT_BOLD)
    
    img.convert("RGB").save(OUT_DIR / "store-screen-6-privacy-shield.png", "PNG", quality=95)
    print("[OK] Created store-screen-6-privacy-shield.png")

if __name__ == "__main__":
    make_screenshot_1()
    make_screenshot_2()
    make_screenshot_3()
    make_screenshot_4()
    make_screenshot_5()
    make_screenshot_6()
    print("All 6 Microsoft Store screenshots generated successfully in assets/store/!")
