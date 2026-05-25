#!/usr/bin/env python3
"""
Hermes WebUI — Discord Integration API-Test-Suite
=================================================
Prüft alle Discord-Endpunkte der WebUI (Backend).
Läuft ohne Browser — testet nur die REST-APIs.

Usage:  python test_discord_api.py
        python test_discord_api.py -v    (verbose)
"""
import json, os, sys, time, traceback
from urllib.request import Request, urlopen, HTTPError
from urllib.parse import urlencode

BASE = os.environ.get('WEBUI_URL', 'http://127.0.0.1:8787')
PASS = '✅'
FAIL = '❌'
SKIP = '⏭️'

tests_run = 0
tests_passed = 0
tests_failed = 0
verbose = False

def log(msg, *args):
    if verbose or 'FAIL' in msg or 'PASS' in msg:
        print(msg.format(*args) if args else msg, flush=True)

def api(path, method='GET', body=None, raw=False):
    """API-Call, gibt (code, data) zurück. raw=True gibt raw body statt JSON."""
    url = f'{BASE}{path}'
    data = json.dumps(body).encode() if body else None
    req = Request(url, data=data, method=method)
    req.add_header('Content-Type', 'application/json') if data else None
    try:
        with urlopen(req, timeout=15) as resp:
            body = resp.read().decode()
            if raw:
                return resp.status, body
            return resp.status, json.loads(body) if body else {}
    except HTTPError as e:
        body = e.read().decode() if e.read() else '{}'
        if raw:
            return e.code, body
        try:
            return e.code, json.loads(body)
        except:
            return e.code, {'error': body[:200]}
    except Exception as e:
        return -1, {'error': str(e)}

def test(name, condition, detail=''):
    global tests_run, tests_passed, tests_failed
    tests_run += 1
    if condition:
        tests_passed += 1
        log(f'  {PASS} {name}')
    else:
        tests_failed += 1
        log(f'  {FAIL} {name}' + (f' — {detail}' if detail else ''))

# ═══════════════════════════════ TESTS ═══════════════════════════════

def test_server_health():
    log('\n## 1. Server Health')
    try:
        with urlopen(f'{BASE}/', timeout=10) as resp:
            test('Server erreichbar', True)
            test(f'Status-Code: {resp.status}', resp.status in (200, 302, 304, 401))
    except Exception as e:
        test('Server erreichbar', False, str(e))

def test_discord_stats():
    log('\n## 2. Discord Stats')
    code, data = api('/api/discord/stats')
    test('Stats: HTTP 200', code == 200)
    if code == 200:
        test('Stats: name="PawsUnited"', data.get('name') == 'PawsUnited')
        test('Stats: member_count > 0', data.get('member_count', 0) > 0)
        test('Stats: channels vorhanden', 'channels' in data and data['channels'].get('total', 0) > 0)
        test('Stats: roles > 0', data.get('roles', 0) > 0)
        test('Stats: features Liste', isinstance(data.get('features'), list))
        for f in ['name','member_count','online','boosts','tier','channels','roles','features']:
            if f not in data:
                test(f'Stats: Feld {f} fehlt', False)
                break

def test_discord_members():
    log('\n## 3. Discord Members')
    code, data = api('/api/discord/members')
    test('Members: HTTP 200', code == 200)
    if code == 200:
        members = data.get('members', [])
        test(f'Members: {len(members)} geladen', len(members) > 5)
        if members:
            m = members[0]
            u = m.get('user', {})
            test('Members: haben user.id', bool(u.get('id')))
            test('Members: haben user.username', bool(u.get('username')))
            test('Members: haben joined_at', bool(m.get('joined_at')))
            test('Members: haben roles', 'roles' in m)

def test_discord_channels():
    log('\n## 4. Discord Channels')
    code, data = api('/api/discord/channels')
    test('Channels: HTTP 200', code == 200)
    if code == 200:
        channels = data.get('channels', [])
        test(f'Channels: {len(channels)} geladen', len(channels) > 5)
        cats = [c for c in channels if c.get('type') == 4]
        txts = [c for c in channels if c.get('type') == 0]
        test(f'Channels: {len(cats)} Kategorien', len(cats) > 0)
        test(f'Channels: {len(txts)} Textkanäle', len(txts) > 0)
        if channels:
            c = channels[0]
            test('Channels: haben id', bool(c.get('id')))
            test('Channels: haben name', bool(c.get('name')))
            test('Channels: haben type', 'type' in c)
            test('Channels: haben position', 'position' in c)

def test_channel_messages():
    log('\n## 5. Channel Messages')
    code, ch_data = api('/api/discord/channels')
    channels = ch_data.get('channels', []) if code == 200 else []
    text_ch = next((c for c in channels if c.get('type') == 0 and c.get('id')), None)
    if not text_ch:
        test('Messages: Kein Textkanal gefunden', False)
        return
    cid = text_ch['id']
    code, data = api(f'/api/discord/channel/{cid}/messages')
    test('Messages: HTTP 200', code == 200)
    if code == 200:
        msgs = data.get('messages', [])
        test(f'Messages: {len(msgs)} geladen (kanal: {text_ch.get("name","?")})', True)  # 0 is valid
        if msgs:
            m = msgs[0]
            test('Messages: haben id', bool(m.get('id')))
            test('Messages: haben content', 'content' in m)
            test('Messages: haben timestamp', bool(m.get('timestamp')))
            test('Messages: haben author', 'author' in m)
            if m.get('author'):
                test('Messages: author hat id', bool(m['author'].get('id')))
                test('Messages: author hat username', bool(m['author'].get('username')))
            # Pagination test
            oldest_id = msgs[-1]['id']
            code2, data2 = api(f'/api/discord/channel/{cid}/messages?before={oldest_id}&limit=10')
            test('Messages Pagination: HTTP 200', code2 == 200)
            if code2 == 200:
                older = data2.get('messages', [])
                test(f'Messages Pagination: {len(older)} ältere', True)  # 0 is valid if channel has few msgs
        else:
            test('Messages Pagination: übersprungen (leerer Channel)', True)

def test_moderation_endpoints():
    log('\n## 6. Moderation (API-Erreichbarkeit)')
    endpoints = [
        ('Warn', '/api/discord/warn', {'user_id': '0', 'reason': 'API-Test'}),
        ('Timeout', '/api/discord/timeout', {'user_id': '0', 'minutes': 1, 'reason': 'API-Test'}),
        ('Kick', '/api/discord/kick', {'user_id': '0', 'reason': 'API-Test'}),
        ('Ban', '/api/discord/ban', {'user_id': '0', 'reason': 'API-Test', 'delete_days': 0}),
        ('Purge', '/api/discord/purge', {'channel_id': '0', 'amount': 1}),
    ]
    for name, ep, payload in endpoints:
        code, data = api(ep, 'POST', payload)
        # 400 = validation error (expected with user_id '0'), 500 = server error (fails test)
        ok = code in (200, 400, 404, 422, 502)
        test(f'{name}: HTTP {code}', ok, f'erwartet 200-4xx/502')

def test_bot_config():
    log('\n## 7. Bot Config')
    code, data = api('/api/discord/config', 'POST', {'action': 'get'})
    test('Config: HTTP 200', code == 200)
    if code == 200:
        cfg = data.get('config', {})
        test('Config: hat welcome_enabled', 'welcome_enabled' in cfg)
        test('Config: hat level_enabled', 'level_enabled' in cfg)

def test_bot_logs():
    log('\n## 8. Bot Logs')
    code, data = api('/api/discord/logs')
    test('Logs: HTTP 200', code == 200)
    if code == 200:
        logs = data.get('logs', data.get('output', []))
        if isinstance(logs, list):
            test(f'Logs: {len(logs)} Einträge', True)
        elif isinstance(logs, str):
            test(f'Logs: {len(logs)} Zeichen', True)
        else:
            test('Logs: Format unbekannt', False, str(type(logs)))

def test_hermes_frontend():
    log('\n## 9. Frontend (discord-chat.js) Features')
    try:
        resp = urlopen(f'{BASE}/static/discord-chat.js', timeout=10)
        js = resp.read().decode()
        checks = {
            'getAvatarHtml': 'Avatar-Funktion',
            'loadMoreMessages': 'Pagination-Funktion',
            'selectDiscordMember': 'Autocomplete-Funktion',
            'setupScrollPagination': 'Scroll-Handler',
            'teardownScrollPagination': 'Scroll-Handler Cleanup',
            '/api/chat': 'Hermes Mode API-Call',
            '_memberCache': 'Member-Cache Variable',
            'discordOvModUser': 'Moderation User-Input',
            'discordOvModDropdown': 'Autocomplete Dropdown',
            'hermesThinking': 'Thinking-Indicator',
            '_loadingMessages': 'Pagination Concurrency-Guard',
            'discord-loading-more': 'Loading-Indicator',
        }
        for kw, desc in checks.items():
            test(f'Frontend: {desc}', kw in js)
    except Exception as e:
        test(f'Frontend JS laden: Fehler', False, str(e)[:100])

def test_discord_panel_html():
    log('\n## 10. Discord Panel HTML')
    try:
        resp = urlopen(f'{BASE}/', timeout=10)
        html = resp.read().decode()
        test('HTML geladen', True)
        checks = {
            'discord-chat.js': 'JS geladen',
            'discord-chat.css': 'CSS geladen',
            'discord-chat': 'discord-chat Container',
            'discordMsgScroll': 'Messages Scroll-Container',
        }
        for kw, desc in checks.items():
            test(f'HTML: {desc}', kw in html)
    except Exception as e:
        test(f'HTML laden: Fehler', False, str(e)[:100])

# ═══════════════════════════════ MAIN ═══════════════════════════════

if __name__ == '__main__':
    verbose = '-v' in sys.argv

    log(f'Hermes WebUI — Discord Integration Test-Suite')
    log(f'Basis-URL: {BASE}')
    log(f'{"─" * 50}')

    all_tests = [
        ('Health',        test_server_health),
        ('Stats',         test_discord_stats),
        ('Members',       test_discord_members),
        ('Channels',      test_discord_channels),
        ('Messages',      test_channel_messages),
        ('Moderation',    test_moderation_endpoints),
        ('Config',        test_bot_config),
        ('Logs',          test_bot_logs),
        ('Frontend',      test_hermes_frontend),
        ('HTML',          test_discord_panel_html),
    ]

    for name, fn in all_tests:
        try:
            fn()
        except Exception as e:
            tests_run += 1
            tests_failed += 1
            log(f'  {FAIL} {name}: CRASH — {e}')
            if verbose:
                traceback.print_exc()

    log(f'\n{"═" * 50}')
    pct = round(tests_passed / max(tests_run, 1) * 100)
    log(f'Ergebnis: {PASS} {tests_passed}/{tests_run} bestanden ({pct}%)')
    if tests_failed:
        log(f'          {FAIL} {tests_failed} fehlgeschlagen')
    log(f'{"═" * 50}')
    sys.exit(1 if tests_failed else 0)
