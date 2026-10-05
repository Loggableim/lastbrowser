"""Copied as sitecustomize.py only into the full-app probe's private PYTHONPATH.

The real uvicorn entry and routes are unchanged. This test guard denies external
networking and writes outside the explicitly owned temporary directory.
"""
from __future__ import annotations

import json
import os
import sys
import threading
from pathlib import Path

_owned = Path(os.environ['LASTBROWSER_FULL_APP_PROBE_ROOT']).resolve(strict=True)
_record = _owned / 'python-audit.jsonl'
_lock = threading.RLock()
_active = threading.local()


def _emit(row):
    if getattr(_active, 'writing', False):
        return
    _active.writing = True
    try:
        with _lock, _record.open('a', encoding='utf-8') as output:
            output.write(json.dumps({'pid': os.getpid(), **row}) + '\n')
    finally:
        _active.writing = False


def _audit(event, args):
    if getattr(_active, 'writing', False):
        return
    if event == 'socket.getaddrinfo' and args[0] not in {'127.0.0.1', 'localhost', '::1', None}:
        _emit({'event': 'denied_dns', 'host': str(args[0])[:253]})
        raise PermissionError('full_app_probe_external_dns_denied')
    if event == 'socket.connect':
        address = args[1]
        if isinstance(address, tuple) and address[0] not in {'127.0.0.1', 'localhost', '::1'}:
            _emit({'event': 'denied_connect', 'host': str(address[0])[:253]})
            raise PermissionError('full_app_probe_external_network_denied')
    if event == 'open':
        name, mode, flags = args
        if isinstance(name, (str, bytes)) and ((isinstance(mode, str) and any(c in mode for c in 'wax+'))
                or isinstance(flags, int) and flags & (os.O_WRONLY | os.O_RDWR | os.O_APPEND | os.O_CREAT | os.O_TRUNC)):
            target = Path(os.fsdecode(name)).resolve()
            if target != _owned and not target.is_relative_to(_owned):
                _emit({'event': 'denied_write', 'path': str(target)})
                raise PermissionError('full_app_probe_write_outside_owned_home_denied')
    if event in {'os.mkdir', 'os.remove', 'os.rmdir', 'os.rename', 'os.chmod', 'os.truncate'}:
        names = args[:2] if event == 'os.rename' else args[:1]
        for name in names:
            if isinstance(name, (str, bytes)):
                target = Path(os.fsdecode(name)).resolve()
                if target != _owned and not target.is_relative_to(_owned):
                    _emit({'event': 'denied_write', 'operation': event, 'path': str(target)})
                    raise PermissionError('full_app_probe_mutation_outside_owned_home_denied')


sys.addaudithook(_audit)
_emit({'event': 'bootstrap', 'python': sys.executable, 'cwd': os.getcwd(),
       'sidekickHome': os.environ.get('SIDEKICK_HOME'), 'baseHome': os.environ.get('SIDEKICK_BASE_HOME'),
       'stateHome': os.environ.get('SIDEKICK_WEBUI_STATE_DIR'), 'userHome': str(Path.home()),
       'isolated': bool(sys.flags.isolated), 'noUserSite': bool(sys.flags.no_user_site)})
