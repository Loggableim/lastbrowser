"""Space-scoped IMAP/SMTP plugin. Secrets stay encrypted in the local runtime."""
from __future__ import annotations
import hashlib
import json
import os
import re
import threading
from urllib.parse import parse_qs
from cryptography.fernet import Fernet
from web.api._home import get_webui_home
from web.api.helpers import j, bad
_LOCK = threading.RLock()
def _root():
    root = get_webui_home() / "mail-plugin"
    root.mkdir(parents=True, exist_ok=True)
    return root
def _cipher():
    path = _root() / "secret.key"
    if not path.exists():
        # Exclusive creation prevents replacing the key used by other Spaces.
        try:
            with path.open("xb") as file:
                file.write(Fernet.generate_key())
            path.chmod(0o600)
        except FileExistsError:
            pass
    return Fernet(path.read_bytes())
def _path(workspace):
    if not isinstance(workspace, str) or not workspace.strip() or len(workspace) > 4096:
        raise ValueError("Ein Space muss ausgewählt sein.")
    # Space paths can contain Windows separators; never use them as filenames.
    return _root() / (hashlib.sha256(workspace.encode()).hexdigest() + ".json")
def load(workspace, secrets=False):
    with _LOCK:
        path = _path(workspace)
        cfg = json.loads(path.read_text("utf-8")) if path.exists() else {"enabled": False, "accounts": {}}
        accounts = {}
        for key, stored in cfg.get("accounts", {}).items():
            account = {k: v for k, v in stored.items() if k != "secret"}
            account["has_password"] = bool(stored.get("secret"))
            if secrets and stored.get("secret"):
                account["password"] = _cipher().decrypt(stored["secret"].encode()).decode()
            accounts[key] = account
        return {"enabled": bool(cfg.get("enabled")), "accounts": accounts, "workspace": workspace}
def save(workspace, body):
    with _LOCK:
        path = _path(workspace)
        cfg = json.loads(path.read_text("utf-8")) if path.exists() else {"enabled": False, "accounts": {}}
        if "enabled" in body:
            if not isinstance(body["enabled"], bool):
                raise ValueError("enabled muss ein Boolean sein.")
            cfg["enabled"] = body["enabled"]
        if body.get("remove"):
            cfg["accounts"].pop(str(body["remove"]), None)
        if "account" in body:
            if not isinstance(body["account"], dict):
                raise ValueError("Ungültige Kontokonfiguration.")
            account = dict(body["account"])
            key = str(account.get("id", "")).strip()
            if not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", key):
                raise ValueError("Ungültige Konto-ID.")
            address = str(account.get("email", "")).strip()
            if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", address):
                raise ValueError("Eine gültige Mailadresse eingeben.")
            gmail = account.get("provider") == "gmail"
            stored = {"id": key, "email": address, "username": str(account.get("username") or address), "provider": "gmail" if gmail else "imap"}
            for kind, host, port, security in [("imap", "imap.gmail.com", 993, "ssl"), ("smtp", "smtp.gmail.com", 587, "starttls")]:
                server = host if gmail else str(account.get(kind + "_host", "")).strip()
                number = port if gmail else int(account.get(kind + "_port", port))
                tls = security if gmail else account.get(kind + "_security", security)
                if not server or not re.fullmatch(r"[a-zA-Z0-9.-]+", server) or not 1 <= number <= 65535 or tls not in ("ssl", "starttls"):
                    raise ValueError("Server, Port und TLS-Einstellung prüfen.")
                stored.update({kind + "_host": server, kind + "_port": number, kind + "_security": tls})
            password = str(account.get("password", ""))
            if gmail:
                password = password.replace(" ", "")
            stored["secret"] = _cipher().encrypt(password.encode()).decode() if password else cfg["accounts"].get(key, {}).get("secret", "")
            if not stored["secret"]:
                raise ValueError("Ein Passwort oder App-Passwort eingeben.")
            cfg["accounts"][key] = stored
        temp = path.with_suffix(".tmp")
        temp.write_text(json.dumps(cfg), "utf-8")
        temp.chmod(0o600)
        os.replace(temp, path)
        return load(workspace)
def settings(workspace, account):
    cfg = load(workspace, secrets=True)
    if not cfg["enabled"]:
        raise ValueError("Mail ist in diesem Space deaktiviert.")
    selected = cfg["accounts"].get(account)
    if not selected:
        raise ValueError("Das Mailkonto ist in diesem Space nicht eingerichtet.")
    return selected
def handle(handler, parsed, body=None):
    from web.api import gmail_tools as mail
    query = parse_qs(parsed.query)
    workspace = str((body or {}).get("workspace") or (query.get("workspace") or [""])[0])
    path = parsed.path
    try:
        if path == "/api/mail/config":
            return j(handler, load(workspace) if body is None else save(workspace, body))
        cfg = load(workspace)
        account = str((body or {}).get("account") or (query.get("account") or [""])[0])
        if path == "/api/mail/accounts":
            return j(handler, {"accounts": list(cfg["accounts"].values()), "enabled": cfg["enabled"]})
        settings(workspace, account)
        # Existing RFC2047/UTF7 and MIME handling is shared, without a global fallback.
        mail._REQUEST_WORKSPACE_LOCAL.mail_workspace = workspace
        if path == "/api/mail/test" and body is not None:
            conn, _ = mail._connect_imap(account)
            conn.noop()
            import smtplib, ssl
            selected = settings(workspace, account)
            klass = smtplib.SMTP_SSL if selected["smtp_security"] == "ssl" else smtplib.SMTP
            with klass(selected["smtp_host"], selected["smtp_port"], timeout=15) as smtp:
                if selected["smtp_security"] == "starttls":
                    smtp.starttls(context=ssl.create_default_context())
                smtp.login(selected["username"], selected["password"])
            return j(handler, {"ok": True, "imap": True, "smtp": True})
        if path == "/api/mail/send" and body is not None:
            attachments = body.get("attachments") or []
            import base64
            if len(attachments) > 10 or sum(len(base64.b64decode(item.get("content_b64", ""), validate=True)) for item in attachments) > 10 * 1024 * 1024:
                raise ValueError("Anhänge sind auf 10 Dateien und insgesamt 10 MB begrenzt.")
            result = mail._send_email(body.get("to", ""), body.get("subject", ""), body.get("body", ""), account, attachments)
            if result.get("error"):
                return bad(handler, "Mail konnte nicht gesendet werden. Anmeldung und Empfänger prüfen.", status=502)
            return j(handler, result)
        if path == "/api/mail/attachment" and body is None:
            import email, base64
            conn, _ = mail._connect_imap(account)
            conn.select(mail._imap_mailbox_arg((query.get("folder") or ["INBOX"])[0]), readonly=True)
            status, data = conn.uid("fetch", (query.get("id") or [""])[0], "(BODY.PEEK[])")
            if status != "OK":
                raise ValueError("Nachricht nicht gefunden.")
            message = email.message_from_bytes(data[0][1])
            index = int((query.get("index") or ["0"])[0])
            parts = [part for part in message.walk() if part.get_content_disposition() == "attachment" and part.get_filename()]
            if not 0 <= index < len(parts):
                raise ValueError("Anhang nicht gefunden.")
            part = parts[index]
            content = part.get_payload(decode=True) or b""
            if len(content) > 10 * 1024 * 1024:
                raise ValueError("Dieser Anhang überschreitet 10 MB.")
            return j(handler, {"filename": mail._decode_rfc2047(part.get_filename()), "mimetype": part.get_content_type(), "content_b64": base64.b64encode(content).decode()})
        alias = parsed._replace(path=path.replace("/api/mail/", "/api/gmail/", 1))
        return mail.handle_gmail_get(handler, alias) if body is None else mail.handle_gmail_post(handler, alias, body)
    except ValueError as exc:
        return bad(handler, str(exc), status=400)
    except Exception:
        # Providers may echo credentials in errors; never forward raw exceptions.
        return bad(handler, "Mail-Verbindung fehlgeschlagen. Anmeldung, Server und TLS prüfen.", status=502)
    finally:
        mail._REQUEST_WORKSPACE_LOCAL.mail_workspace = None
        mail._REQUEST_WORKSPACE_LOCAL.slug = None
