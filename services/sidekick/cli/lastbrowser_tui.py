"""In-tree full-screen TUI for the authenticated local Lastbrowser sidecar.

Uses the packaged prompt_toolkit dependency. No Node bundle, installation or
external repository is needed. The sidecar owns model credentials and sessions.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import time
import urllib.parse
import urllib.request


class LocalChat:
    def __init__(self, session_id: str = ""):
        self.base = os.getenv("LASTBROWSER_WEBUI_URL", "")
        parsed = urllib.parse.urlparse(self.base)
        if parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost", "::1"):
            raise ValueError("Lastbrowser TUI benötigt den lokalen Sidecar.")
        self.session_id = session_id
        self.stream_id = ""
        self.cancelled = False

    def request(self, path: str, body: dict | None = None) -> dict:
        headers = {"X-Sidekick-Session-Token": os.getenv("LASTBROWSER_TUI_TOKEN", "")}
        cookie = os.getenv("LASTBROWSER_TUI_COOKIE", "")
        if cookie:
            headers["Cookie"] = cookie
        data = None if body is None else json.dumps(body).encode()
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.base + path, data=data, headers=headers)
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.load(response)
        if payload.get("error"):
            raise RuntimeError(str(payload["error"]))
        return payload

    def send(self, message: str) -> str:
        self.cancelled = False
        if not self.session_id:
            payload = self.request("/api/session/new", {"workspace": os.getcwd()})
            self.session_id = payload["session"]["session_id"]
        scope = self.request("/api/session?" + urllib.parse.urlencode({"session_id": self.session_id}))["session"]
        started = self.request("/api/chat/start", {
            "session_id": self.session_id, "message": message,
            "workspace": scope.get("workspace", ""), "model": scope.get("model", ""),
            "model_provider": scope.get("model_provider"), "mode": "action", "chat_mode": "chat",
        })
        self.stream_id = started["stream_id"]
        if self.cancelled:
            self.cancel()
        deadline = time.monotonic() + 300
        try:
            while time.monotonic() < deadline and not self.cancelled:
                time.sleep(0.5)
                session = self.request("/api/session?" + urllib.parse.urlencode({"session_id": self.session_id}))["session"]
                if not session.get("active_stream_id") and not session.get("pending_user_message"):
                    for item in reversed(session.get("messages", [])):
                        if item.get("role") == "assistant":
                            return str(item.get("content", ""))
                    return "Keine Antwort verfügbar."
            if self.cancelled:
                return "Abgebrochen."
            self.cancel()
            raise TimeoutError("Zeitlimit erreicht; Anfrage wurde abgebrochen.")
        finally:
            self.stream_id = ""

    def cancel(self):
        self.cancelled = True
        if self.stream_id:
            self.request("/api/chat/cancel?" + urllib.parse.urlencode({"stream_id": self.stream_id}))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--session", default="")
    args = parser.parse_args()
    from prompt_toolkit import Application
    from prompt_toolkit.document import Document
    from prompt_toolkit.key_binding import KeyBindings
    from prompt_toolkit.layout import HSplit, Layout
    from prompt_toolkit.widgets import TextArea

    client = LocalChat(args.session)
    transcript = TextArea(text="Sidekick TUI · " + os.getcwd() + "\n", read_only=True, scrollbar=True, wrap_lines=True)
    entry = TextArea(height=3, prompt="> ", multiline=True)
    status = TextArea(height=1, text="Enter: senden · Esc: abbrechen · Ctrl+Q: schließen", read_only=True)
    keys = KeyBindings()
    busy = False
    app = None

    def append(text):
        transcript.buffer.set_document(Document(transcript.text + text), bypass_readonly=True)
        transcript.buffer.cursor_position = len(transcript.text)

    @keys.add("enter")
    def submit(event):
        nonlocal busy
        message = entry.text.strip()
        if busy or not message:
            return
        busy = True
        entry.text = ""
        append("\nDu: " + message + "\n")
        status.text = "Sidekick arbeitet… · Esc: abbrechen"

        async def run():
            nonlocal busy
            try:
                reply = await asyncio.to_thread(client.send, message)
                append("\nSidekick: " + reply + "\n")
            except Exception:
                append("\nVerbindung fehlgeschlagen. Sidecar und Anmeldung prüfen.\n")
            finally:
                busy = False
                status.text = "Enter: senden · Esc: abbrechen · Ctrl+Q: schließen"
                app.invalidate()
        event.app.create_background_task(run())

    @keys.add("escape")
    def cancel(event):
        if busy:
            event.app.create_background_task(asyncio.to_thread(client.cancel))

    @keys.add("c-q")
    @keys.add("c-c")
    def quit_tui(event):
        # Cancellation finishes before the terminal is closed.
        async def stop():
            try:
                await asyncio.to_thread(client.cancel)
            finally:
                event.app.exit()
        event.app.create_background_task(stop())

    app = Application(layout=Layout(HSplit([transcript, status, entry]), focused_element=entry), key_bindings=keys, full_screen=True)
    app.run()


if __name__ == "__main__":
    main()
