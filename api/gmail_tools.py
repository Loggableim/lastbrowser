"""
Gmail API — Hermes WebUI backend for Gmail operations.
Clean IMAP/SMTP access with RFC 2047 decoding.
No ctypes DNS patch needed — server Python has working DNS.
Multi-Account support: account query parameter on all endpoints.
"""
import json
import imaplib
import smtplib
import email
import logging
import re
import threading
import time
from email.message import EmailMessage
from email.header import decode_header
from datetime import datetime, timedelta
from urllib.parse import parse_qs
from api.helpers import j, bad

logger = logging.getLogger(__name__)

# ── Multi-Account Credentials ──
ACCOUNTS = {
    "dominik": ("dominikrnr@gmail.com", "utqu cmfz kjpt chmn"),
    "loggableim": ("loggableim@gmail.com", "ijjd iktm cvke ltkz"),
}
DEFAULT_ACCOUNT = "dominik"


# ── IMAP connection pool (per-account, thread-safe) ──
_conn_pool: dict[tuple[int, str], tuple[imaplib.IMAP4_SSL, float]] = {}
_CONN_POOL_LOCK = threading.Lock()
_CONN_MAX_AGE = 120
_CONN_POOL_MAX_SIZE = 12


def _decode_rfc2047(val):
    """Decode RFC 2047 encoded words like =?UTF-8?Q?St=C3=A4dte...?="""
    if not val:
        return ""
    if isinstance(val, bytes):
        val = val.decode("utf-8", "replace")
    try:
        parts = decode_header(val)
        result = []
        for chunk, charset in parts:
            if isinstance(chunk, bytes):
                try:
                    result.append(chunk.decode(charset or "utf-8", "replace"))
                except (LookupError, UnicodeDecodeError):
                    result.append(chunk.decode("utf-8", "replace"))
            else:
                result.append(chunk)
        return " ".join(result)
    except Exception:
        return val


def _s(val):
    """Safe string conversion from bytes or str."""
    if isinstance(val, str):
        return val
    if isinstance(val, bytes):
        return val.decode("utf-8", "replace")
    return str(val)


def _decode_header_safe(msg, header_name):
    """Get and decode a header value."""
    raw = msg.get(header_name, "")
    if not raw:
        return ""
    val = _decode_rfc2047(raw)
    val = re.sub(r'\s+', ' ', val).strip()
    return val


def _parse_date(date_str):
    """Parse email date string to a display-friendly format."""
    if not date_str:
        return ""
    try:
        parsed = email.utils.parsedate_to_datetime(date_str)
        if not parsed:
            return date_str[:16]
        now = datetime.now(parsed.tzinfo if parsed.tzinfo else None)
        diff = now - parsed
        if diff.total_seconds() < 0:
            return parsed.strftime("%d.%m.")
        if diff.total_seconds() < 3600:
            mins = int(diff.total_seconds() / 60)
            return f"vor {mins} Min." if mins > 0 else "gerade eben"
        if diff.total_seconds() < 86400:
            return parsed.strftime("%H:%M")
        if diff.total_seconds() < 172800:
            return "Gestern"
        if diff.total_seconds() < 604800:
            return parsed.strftime("%a")
        return parsed.strftime("%d.%m.%y")
    except Exception:
        return date_str[:16]


def _get_creds(account):
    """Get (user, password) for an account."""
    return ACCOUNTS.get(account, (account, None))


def _connect_imap(account=DEFAULT_ACCOUNT):
    """Get an IMAP connection for the current thread + account (pooled)."""
    user, pw = _get_creds(account)
    tid = (threading.get_ident(), account)
    now = time.time()

    with _CONN_POOL_LOCK:
        entry = _conn_pool.get(tid)
        if entry:
            conn, created_at = entry
            if (now - created_at) < _CONN_MAX_AGE:
                try:
                    conn.noop()
                    return conn, user
                except Exception:
                    pass
            _conn_pool.pop(tid, None)
            try:
                conn.logout()
            except Exception:
                pass

    conn = imaplib.IMAP4_SSL("imap.gmail.com", 993, timeout=15)
    conn.login(user, pw)

    with _CONN_POOL_LOCK:
        if len(_conn_pool) >= _CONN_POOL_MAX_SIZE:
            oldest_tid = min(_conn_pool.keys(), key=lambda k: _conn_pool[k][1])
            old_conn, _ = _conn_pool.pop(oldest_tid)
            try:
                old_conn.logout()
            except Exception:
                pass
        _conn_pool[tid] = (conn, time.time())

    return conn, user


def _close_thread_conn(account=DEFAULT_ACCOUNT):
    """Close and remove the IMAP connection for the current thread + account."""
    tid = (threading.get_ident(), account)
    with _CONN_POOL_LOCK:
        entry = _conn_pool.pop(tid, None)
    if entry:
        conn, _ = entry
        try:
            conn.logout()
        except Exception:
            pass


def _close_conn(conn):
    """Legacy: closes immediately (used by mutation endpoints)."""
    try:
        if conn:
            conn.logout()
    except Exception:
        pass


def _fetch_headers(conn, ids, fields="(FROM TO SUBJECT DATE)"):
    """Batch fetch headers for multiple message IDs."""
    if not ids:
        return []
    str_ids = [i.decode() if isinstance(i, bytes) else str(i) for i in ids]
    id_str = ",".join(str_ids)
    status, data = conn.fetch(id_str, f"BODY.PEEK[HEADER.FIELDS {fields}]")
    if status != "OK":
        return []

    results = []
    i = 0
    while i < len(data):
        entry = data[i]
        if isinstance(entry, tuple) and len(entry) >= 2:
            raw = entry[1]
            if raw:
                try:
                    msg = email.message_from_bytes(raw)
                    results.append(msg)
                except Exception:
                    pass
            i += 2
        else:
            i += 1
    return results


# ── Core operations (account-aware) ──


def _list_emails(max_r=25, folder="INBOX", account=DEFAULT_ACCOUNT):
    """List recent emails with decoded subjects, fast batch fetch."""
    conn, user = _connect_imap(account)
    try:
        status, data = conn.select(folder)
        if status != "OK":
            return {"error": f"Cannot select folder '{folder}'", "account": account}

        since = (datetime.now() - timedelta(days=60)).strftime("%d-%b-%Y")
        status, data = conn.search(None, f'(SINCE {since})')
        if status != "OK" or not data[0]:
            return {"emails": [], "count": 0, "folder": folder, "account": account}

        ids = data[0].split()
        ids = ids[-max_r:] if len(ids) > max_r else ids
        str_ids = [i.decode() if isinstance(i, bytes) else str(i) for i in ids]

        msg_list = _fetch_headers(conn, ids)
        results = []
        for i, msg in enumerate(reversed(msg_list)):
            fr = _decode_header_safe(msg, "From")
            results.append({
                "id": str_ids[-(i+1)] if i < len(str_ids) else str(i),
                "from": fr,
                "from_name": re.sub(r'\s*<[^>]+>\s*', '', fr).strip() or fr,
                "to": _decode_header_safe(msg, "To"),
                "subject": _decode_header_safe(msg, "Subject") or "(kein Betreff)",
                "date": _parse_date(_decode_header_safe(msg, "Date")),
                "date_raw": _decode_header_safe(msg, "Date"),
            })

        return {"emails": results, "count": len(results), "folder": folder, "account": account}
    except Exception:
        logger.exception("_list_emails failed")
        return {"error": "IMAP list failed", "emails": [], "count": 0, "folder": folder, "account": account}


def _read_email(email_id, account=DEFAULT_ACCOUNT):
    """Read full email content."""
    conn, user = _connect_imap(account)
    try:
        conn.select("INBOX")
        status, data = conn.fetch(str(email_id), "(BODY[])")
        if status != "OK":
            return {"error": "Fetch failed", "account": account}

        raw = data[0][1] if isinstance(data[0], tuple) else data[0]
        msg = email.message_from_bytes(raw)

        body = ""
        attachments = []
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_disposition() == "attachment":
                    fn = part.get_filename()
                    if fn:
                        attachments.append(_decode_rfc2047(fn))
                ct = part.get_content_type()
                if ct == "text/plain" and not body:
                    payload = part.get_payload(decode=True)
                    if payload:
                        try:
                            body = payload.decode("utf-8", "replace")
                        except Exception:
                            body = payload.decode("latin-1", "replace")
                elif ct == "text/html" and not body:
                    payload = part.get_payload(decode=True)
                    if payload:
                        try:
                            body = payload.decode("utf-8", "replace")
                        except Exception:
                            body = payload.decode("latin-1", "replace")
        else:
            payload = msg.get_payload(decode=True)
            if payload:
                try:
                    body = payload.decode("utf-8", "replace")
                except Exception:
                    body = payload.decode("latin-1", "replace")

        return {
            "id": email_id,
            "from": _decode_header_safe(msg, "From"),
            "to": _decode_header_safe(msg, "To"),
            "subject": _decode_header_safe(msg, "Subject") or "(kein Betreff)",
            "date": _decode_header_safe(msg, "Date"),
            "body": body.strip()[:15000] if body else "",
            "attachments": attachments,
            "account": account,
        }
    except Exception:
        logger.exception("_read_email failed")
        return {"error": "IMAP read failed", "account": account}


def _search_emails(query, max_r=25, account=DEFAULT_ACCOUNT):
    """Search emails by Gmail-style query syntax."""
    q = query.lower().strip()
    if q.startswith("from:"):
        imap_q = f'(FROM "{q[5:].strip()}")'
    elif q.startswith("subject:"):
        imap_q = f'(SUBJECT "{q[8:].strip()}")'
    elif q.startswith("has:attachment"):
        imap_q = '(OR (HEADER Content-Type "multipart/mixed") (HEADER Content-Type "application/"))'
    else:
        imap_q = f'(TEXT "{query}")'

    conn, user = _connect_imap(account)
    try:
        conn.select("INBOX")
        status, data = conn.search(None, imap_q)
        if status != "OK" or not data[0]:
            return {"emails": [], "count": 0, "query": query, "account": account}

        ids = data[0].split()
        ids = ids[-max_r:] if len(ids) > max_r else ids
        str_ids = [i.decode() if isinstance(i, bytes) else str(i) for i in ids]

        msg_list = _fetch_headers(conn, ids)
        results = []
        for i, msg in enumerate(reversed(msg_list)):
            fr = _decode_header_safe(msg, "From")
            results.append({
                "id": str_ids[-(i+1)] if i < len(str_ids) else str(i),
                "from": fr,
                "from_name": re.sub(r'\s*<[^>]+>\s*', '', fr).strip() or fr,
                "subject": _decode_header_safe(msg, "Subject") or "(kein Betreff)",
                "date": _parse_date(_decode_header_safe(msg, "Date")),
            })

        return {"emails": results, "count": len(results), "query": query, "account": account}
    except Exception:
        logger.exception("_search_emails failed")
        return {"error": "IMAP search failed", "emails": [], "count": 0, "account": account}


def _list_folders(account=DEFAULT_ACCOUNT):
    """List all Gmail folders/labels."""
    conn, user = _connect_imap(account)
    try:
        status, data = conn.list()
        if status != "OK":
            return {"error": "Failed to list folders", "account": account}

        known_system = {"INBOX", "[Gmail]/Gesendet", "[Gmail]/Papierkorb",
                        "[Gmail]/Entwürfe", "[Gmail]/Spam", "[Gmail]/Wichtig",
                        "[Gmail]/Alle Nachrichten"}
        folders = []
        for f in data:
            try:
                decoded = f.decode("utf-8", "replace") if isinstance(f, bytes) else f
                parts = decoded.split('"')
                if len(parts) >= 3:
                    name = parts[-2]
                    if name:
                        folders.append({
                            "name": name,
                            "system": name in known_system or name.startswith("[Gmail]"),
                        })
            except Exception:
                continue

        folders.sort(key=lambda x: (0 if x["system"] else 1, x["name"]))
        return {"folders": folders, "account": account}
    except Exception:
        logger.exception("_list_folders failed")
        return {"error": "IMAP list folders failed", "account": account}


def _send_email(to, subject, body, account=DEFAULT_ACCOUNT):
    """Send email via Gmail SMTP."""
    user, pw = _get_creds(account)
    msg = EmailMessage()
    msg.set_content(body)
    msg["From"] = user
    msg["To"] = to
    msg["Subject"] = subject

    conn = smtplib.SMTP("smtp.gmail.com", 587, timeout=30)
    try:
        conn.starttls()
        conn.login(user, pw)
        conn.send_message(msg)
        return {"status": "sent", "to": to, "subject": subject, "account": account}
    except Exception as e:
        logger.exception("gmail send failed")
        return {"error": str(e), "account": account}
    finally:
        try:
            conn.quit()
        except Exception:
            pass


def _delete_email(email_id, folder="INBOX", account=DEFAULT_ACCOUNT):
    """Move email to trash (reversible)."""
    conn, user = _connect_imap(account)
    try:
        conn.select(folder)
        for trash in ["[Gmail]/Papierkorb", "[Gmail]/Trash", "Trash"]:
            status, _ = conn.copy(str(email_id), trash)
            if status == "OK":
                break
        else:
            return {"error": "Could not find Trash folder", "account": account}

        conn.store(str(email_id), "+FLAGS", "\\Deleted")
        conn.expunge()
        return {"status": "trashed", "id": email_id, "account": account}
    finally:
        _close_conn(conn)


def _move_email(email_id, to_folder, from_folder="INBOX", account=DEFAULT_ACCOUNT):
    """Move email to another folder."""
    conn, user = _connect_imap(account)
    try:
        conn.select(from_folder)
        status, _ = conn.copy(str(email_id), to_folder)
        if status != "OK":
            return {"error": f"Folder '{to_folder}' not found", "account": account}

        conn.store(str(email_id), "+FLAGS", "\\Deleted")
        conn.expunge()
        return {"status": "moved", "id": email_id, "to": to_folder, "account": account}
    finally:
        _close_conn(conn)


def _list_accounts():
    """Return available accounts."""
    return {
        "accounts": [
            {"id": k, "email": ACCOUNTS[k][0], "default": k == DEFAULT_ACCOUNT}
            for k in ACCOUNTS
        ]
    }


# ── HTTP Handlers ──

def _get_account(parsed):
    """Extract account from query params."""
    qs = parse_qs(parsed.query)
    return (qs.get("account") or [DEFAULT_ACCOUNT])[0]


def handle_gmail_get(handler, parsed) -> bool:
    path = parsed.path
    qs = parse_qs(parsed.query)
    account = _get_account(parsed)
    try:
        if path == "/api/gmail/accounts":
            return j(handler, _list_accounts())

        if path == "/api/gmail/list":
            max_r = min(int((qs.get("max") or [25])[0]), 100)
            folder = (qs.get("folder") or ["INBOX"])[0]
            return j(handler, _list_emails(max_r, folder, account))

        if path == "/api/gmail/read":
            email_id = (qs.get("id") or [""])[0]
            if not email_id:
                return bad(handler, "Missing email id")
            return j(handler, _read_email(email_id, account))

        if path == "/api/gmail/search":
            query = (qs.get("query") or [""])[0]
            max_r = min(int((qs.get("max") or [25])[0]), 100)
            if not query:
                return bad(handler, "Missing query")
            return j(handler, _search_emails(query, max_r, account))

        if path == "/api/gmail/folders":
            return j(handler, _list_folders(account))

        return False
    except Exception as e:
        logger.exception("gmail GET %s failed", path)
        return j(handler, {"error": f"Gmail error: {str(e)}"}, status=500)


def handle_gmail_post(handler, parsed, body) -> bool:
    path = parsed.path
    if body is None:
        try:
            cl = int(handler.headers.get("Content-Length", 0))
            body = json.loads(handler.rfile.read(cl)) if cl > 0 else {}
        except Exception:
            body = {}
    account = body.get("account", DEFAULT_ACCOUNT)

    try:
        if path == "/api/gmail/send":
            return j(handler, _send_email(
                body.get("to", ""), body.get("subject", ""), body.get("body", ""), account
            ))

        if path == "/api/gmail/delete":
            return j(handler, _delete_email(
                body.get("id", ""), body.get("folder", "INBOX"), account
            ))

        if path == "/api/gmail/move":
            return j(handler, _move_email(
                body.get("id", ""), body.get("to_folder", ""), body.get("from_folder", "INBOX"), account
            ))

        return False
    except Exception as e:
        logger.exception("gmail POST %s failed", path)
        return j(handler, {"error": f"Gmail error: {str(e)}"}, status=500)
