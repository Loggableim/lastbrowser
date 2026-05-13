"""
Freelancer.com Browser-Service — Playwright Firefox separat.
Einmal starten, Screenshot/Click/Fill/Form via API steuern.
"""
import base64
import json
import logging
import os
import threading
import time

logger = logging.getLogger(__name__)

PROFILE_DIR = os.path.expanduser('~/.freelancer_browser_profile')
COOKIES_FILE = os.path.join(PROFILE_DIR, 'cookies.json')

_playwright = None
_browser = None
_context = None
_page = None
_lock = threading.Lock()
_started = False

def get_status():
    with _lock:
        if not _started:
            return {'running': False}
        try:
            url = _page.url if _page else ''
            return {
                'running': True,
                'url': url[:120],
                'logged_in': 'login' not in url.lower() if url else False,
                'title': _page.title() if _page else '',
            }
        except Exception as e:
            return {'running': True, 'error': str(e)[:80]}

def _init_playwright():
    global _playwright, _browser, _context, _page, _started
    from playwright.sync_api import sync_playwright
    os.makedirs(PROFILE_DIR, exist_ok=True)
    _playwright = sync_playwright().start()
    _browser = _playwright.firefox.launch(headless=False, args=['--no-sandbox'])
    _context = _browser.new_context(
        viewport={'width': 1280, 'height': 900}, locale='de-DE',
        user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0',
    )
    if os.path.exists(COOKIES_FILE):
        try:
            with open(COOKIES_FILE) as f:
                _context.add_cookies(json.load(f))
            logger.info(f'Cookies geladen')
        except: pass
    _page = _context.new_page()
    _page.set_default_timeout(30000)
    _started = True
    logger.info('Playwright Firefox gestartet')
    return _browser

def start():
    with _lock:
        if _started:
            return {'status': 'already_running'}
        try:
            _init_playwright()
            return {'status': 'started'}
        except Exception as e:
            return {'status': 'error', 'error': str(e)[:100]}

def navigate(url):
    with _lock:
        _ensure_page()
        _page.goto(url, wait_until='domcontentloaded')
        time.sleep(2)
        return {'url': _page.url}

def screenshot():
    with _lock:
        _ensure_page()
        data = _page.screenshot(type='png', full_page=False)
        return base64.b64encode(data).decode()

def click(x, y):
    with _lock:
        _ensure_page()
        _page.mouse.click(x, y)
        time.sleep(1)
        return {'x': x, 'y': y, 'url': _page.url}

def evaluate(js):
    with _lock:
        _ensure_page()
        result = _page.evaluate(js)
        return {'result': result}

def form_fields():
    with _lock:
        _ensure_page()
        fields = _page.evaluate("""
            () => {
                const m = document.querySelector('fl-modal');
                const root = m || document;
                return Array.from(root.querySelectorAll('input:not([type=hidden]):not([type=checkbox]), textarea, select'))
                    .filter(el => el.offsetParent !== null)
                    .map(el => ({
                        id: el.id || el.name || '',
                        tag: el.tagName,
                        type: el.type || '',
                        placeholder: (el.placeholder || '').slice(0, 50),
                        value: (el.value || '').slice(0, 50),
                        label: (() => {
                            const l = root.querySelector('label[for="' + (el.id||'') + '"]');
                            return l ? l.innerText.slice(0,50) : '';
                        })(),
                        rect: {
                            x: Math.round(el.getBoundingClientRect().x),
                            y: Math.round(el.getBoundingClientRect().y),
                            w: Math.round(el.getBoundingClientRect().width),
                            h: Math.round(el.getBoundingClientRect().height),
                        },
                    }));
            }
        """)
        return {'fields': fields, 'count': len(fields)}

def _ensure_page():
    global _page, _browser, _context
    if not _started or _page is None:
        raise RuntimeError('Browser not started')
    try:
        _page.title()
    except Exception:
        _context = _browser.new_context()
        _page = _context.new_page()

def save_session():
    if _page is None: return
    try:
        cookies = _context.cookies()
        with open(COOKIES_FILE, 'w') as f:
            json.dump(cookies, f)
        logger.info(f'{len(cookies)} Cookies gespeichert')
    except: pass

def stop():
    global _started, _browser, _playwright, _page, _context
    with _lock:
        save_session()
        try: _browser.close()
        except: pass
        try: _playwright.stop()
        except: pass
        _page = _context = _browser = _playwright = None
        _started = False

# Workaround: fill via evaluate (nicht locator.fill, wegen Angular)
def fill(selector, text):
    with _lock:
        _ensure_page()
        escaped = text.replace("'", "\\'").replace('\\n', '\\\\n')
        result = _page.evaluate(f"""
            () => {{
                try {{
                    const el = document.querySelector('{selector}');
                    if(!el) return {{ok: false, error: 'not found'}};
                    const proto = el.tagName==='TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
                    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
                    setter.call(el, '{escaped}');
                    el.dispatchEvent(new Event('input', {{bubbles: true}}));
                    el.dispatchEvent(new Event('change', {{bubbles: true}}));
                    return {{ok: true}};
                }} catch(e) {{ return {{ok: false, error: e.message}}; }}
            }}
        """)
        return result

# Native selectOption via Playwright (funktioniert wo evaluate nicht reicht)
def select_option(selector, value):
    with _lock:
        _ensure_page()
        try:
            _page.select_option(selector, value=value)
            return {'ok': True, 'value': value}
        except Exception as e:
            return {'ok': False, 'error': str(e)[:100]}
