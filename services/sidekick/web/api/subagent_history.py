"""Redacted persistent subagent history with bounded events and retention."""
from __future__ import annotations
import re, sqlite3, time
from pathlib import Path

_SECRET = re.compile(r"(?i)(token|secret|password|api[_-]?key)=\S+")
_PATH = re.compile(r"(?i)([A-Z]:\\|/home/|/Users/)[^\s,]+")

def _redact(value: object) -> str:
    text = str(value or "")
    text = _SECRET.sub(r"\1=<redacted>", text)
    text = _PATH.sub("<path>", text)
    return text[:500]

def _db(home: Path) -> Path:
    return Path(home) / "subagents.db"

def _schema(db: sqlite3.Connection) -> None:
    try:
        db.execute("PRAGMA journal_mode=WAL")
    except sqlite3.OperationalError as exc:
        # Simultaneous first children may contend while the other connection
        # enables WAL. Ordinary transactional writes still use SQLite's lock.
        if 'locked' not in str(exc).lower():
            raise
    db.execute("CREATE TABLE IF NOT EXISTS runs (subagent_id TEXT PRIMARY KEY, session_id TEXT, space_slug TEXT, status TEXT, summary TEXT, updated_at REAL, started_at REAL, finished_at REAL)")
    db.execute("CREATE TABLE IF NOT EXISTS events (subagent_id TEXT NOT NULL, sequence INTEGER NOT NULL, session_id TEXT, event_type TEXT NOT NULL, payload TEXT NOT NULL, created_at REAL NOT NULL, PRIMARY KEY(subagent_id, sequence), UNIQUE(subagent_id,event_type,payload))")
    db.execute("CREATE INDEX IF NOT EXISTS idx_runs_session_updated ON runs(session_id, updated_at DESC)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_events_run_sequence ON events(subagent_id, sequence)")

def record(home: Path, *, subagent_id: str, session_id: str, space_slug: str, status: str, summary: str = "", event_type: str | None = None, event_payload: object = "") -> None:
    path = _db(home); path.parent.mkdir(parents=True, exist_ok=True); now=time.time(); sid=subagent_id[:128]
    with sqlite3.connect(path) as db:
        _schema(db)
        prior=db.execute("SELECT started_at FROM runs WHERE subagent_id=?",(sid,)).fetchone()
        started=prior[0] if prior else now
        finished=now if status[:40] in {"completed","failed","interrupted","abandoned","cancelled"} else None
        db.execute("INSERT INTO runs(subagent_id,session_id,space_slug,status,summary,updated_at,started_at,finished_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(subagent_id) DO UPDATE SET session_id=excluded.session_id,space_slug=excluded.space_slug,status=excluded.status,summary=excluded.summary,updated_at=excluded.updated_at,finished_at=COALESCE(excluded.finished_at,runs.finished_at)", (sid,session_id[:128],space_slug[:128],status[:40],_redact(summary),now,started,finished))
        if event_type:
            payload=_redact(event_payload)
            seq=(db.execute("SELECT COALESCE(MAX(sequence),0)+1 FROM events WHERE subagent_id=?",(sid,)).fetchone()[0])
            db.execute("INSERT OR IGNORE INTO events VALUES(?,?,?,?,?,?)",(sid,seq,session_id[:128],event_type[:64],payload,now))
        cutoff=now-90*86400
        db.execute("DELETE FROM runs WHERE updated_at<?",(cutoff,))
        db.execute("DELETE FROM events WHERE created_at<?",(cutoff,))
        old=db.execute("SELECT subagent_id FROM runs ORDER BY updated_at DESC LIMIT -1 OFFSET 1000").fetchall()
        if old: db.executemany("DELETE FROM runs WHERE subagent_id=?",old)
        db.execute("DELETE FROM events WHERE subagent_id NOT IN (SELECT subagent_id FROM runs)")

def list_history(home: Path, *, session_id: str, limit: int = 50) -> list[dict[str, object]]:
    if not session_id: return []
    path=_db(home)
    if not path.is_file(): return []
    with sqlite3.connect(path) as db:
        _schema(db)
        rows=db.execute("SELECT subagent_id,session_id,space_slug,status,summary,updated_at,started_at,finished_at FROM runs WHERE session_id=? ORDER BY updated_at DESC LIMIT ?",(session_id[:128],max(1,min(int(limit),100)))).fetchall()
        out=[]
        for r in rows:
            ev=db.execute("SELECT sequence,event_type,payload,created_at FROM events WHERE subagent_id=? ORDER BY sequence LIMIT 200",(r[0],)).fetchall()
            out.append({"subagent_id":r[0],"session_id":r[1],"space_slug":r[2],"status":r[3],"summary":r[4],"updated_at":r[5],"started_at":r[6],"finished_at":r[7],"events":[{"sequence":e[0],"event_type":e[1],"payload":e[2],"created_at":e[3]} for e in ev]})
        return out


def reconcile_stale(home: Path, *, generation: str | None = None, confirmed_worker_turns=()) -> int:
    path = _db(home)
    if not path.is_file():
        return 0
    changed = 0
    with sqlite3.connect(path) as db:
        _child_schema(db)
        rows = db.execute("SELECT subagent_id, session_id, space_slug,child_binding,child_sequence,child_revision,child_answer,child_answer_truncated FROM runs WHERE status IN ('running','waiting','waiting_for_approval','paused','queued')").fetchall()
        for sid, session, space, binding, child_sequence, revision, answer, truncated in rows:
            now = time.time()
            if binding:
                value = json.loads(binding)
                actual_generation = value.get('processGeneration')
                if actual_generation and value.get('parentTurnId') not in confirmed_worker_turns and (generation is None or actual_generation == generation):
                    continue  # A private worker's live registry is in its process.
                # Only an explicit restart reconciliation may end an orphan;
                # a live in-process child always retains its actual status.
                from tools.delegate_tool import _active_subagents, _active_subagents_lock
                with _active_subagents_lock:
                    active = _active_subagents.get(sid, {}).get('context')
                if active is not None and active.parent.profile_home.resolve() == Path(home).resolve():
                    continue
                child_sequence = (child_sequence or 0) + 1
                revision = (revision or 0) + 1
                snapshot = _snapshot(binding, 'interrupted', child_sequence, revision, now, answer or '', truncated)
                snapshot['transcript'] = _transcript(binding)
                db.execute("UPDATE runs SET status='interrupted',child_state='interrupted',child_sequence=?,child_revision=?,updated_at=?,finished_at=? WHERE subagent_id=?", (child_sequence,revision,now,now,sid))
                db.execute('INSERT INTO child_events VALUES(?,?,?,?,?)', (sid,child_sequence,'completed',json.dumps({'status':'interrupted','snapshot':snapshot}),now))
                changed += 1
                continue
            db.execute("UPDATE runs SET status='abandoned', summary='server_restart', updated_at=? WHERE subagent_id=?", (now, sid))
            seq = db.execute("SELECT COALESCE(MAX(sequence),0)+1 FROM events WHERE subagent_id=?", (sid,)).fetchone()[0]
            db.execute("INSERT INTO events VALUES (?,?,?,?,?,?)", (sid, seq, session, 'abandoned', 'server_restart', now))
            changed += 1
    return changed

# Bound child streams use a separate additive event table: equal token deltas are
# distinct events, unlike the historical summary-event de-duplication contract.
import json
from datetime import datetime, timezone
from typing import Mapping
from runtime.independent.child_contracts import ChildParentContext, ChildRunContext

_TERMINAL = frozenset({'completed', 'failed', 'interrupted', 'abandoned', 'cancelled'})

def _child_schema(db):
    _schema(db)
    db.execute('BEGIN IMMEDIATE')
    columns = {row[1] for row in db.execute('PRAGMA table_info(runs)')}
    for name, declaration in {
        'child_binding': 'TEXT', 'child_sequence': 'INTEGER DEFAULT 0',
        'child_state': 'TEXT', 'child_revision': 'INTEGER DEFAULT 0',
        'child_answer': 'TEXT DEFAULT ""',
        'child_answer_truncated': 'INTEGER DEFAULT 0',
    }.items():
        if name not in columns:
            db.execute(f'ALTER TABLE runs ADD COLUMN {name} {declaration}')
    db.execute('CREATE TABLE IF NOT EXISTS child_events (subagent_id TEXT NOT NULL, sequence INTEGER NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL, created_at REAL NOT NULL, PRIMARY KEY(subagent_id,sequence))')
    db.commit()

def _binding(context):
    p = context.parent
    # Revalidate paths at use time, including a symlink introduced after capture.
    p.__post_init__()
    context.__post_init__()
    return json.dumps({
        'scope': p.scope.model_dump(mode='json', by_alias=True),
        'home': str(p.profile_home.resolve()), 'profile': p.profile_name,
        'sessionsDir': str(p.sessions_dir.resolve()),
        'parentSessionId': p.parent_session_id, 'parentTurnId': p.parent_turn_id,
        'parentSubagentId': p.parent_subagent_id,
        'processGeneration': p.process_generation,
        'subagentId': context.subagent_id, 'childSessionId': context.child_session_id,
        'depth': context.depth, 'model': context.model, 'modelProvider': context.model_provider,
        'sessionDbPath': str((context.session_db_path or p.profile_home / 'state.db').resolve()),
        'sessionParentId': context.session_parent_id or p.parent_session_id,
    }, sort_keys=True, separators=(',', ':'))

def _safe_db(home):
    path = _db(home)
    if path.is_symlink():
        raise ValueError('symlinked history database')
    return path

def _snapshot(binding, status, sequence, revision, observed_at=0, answer='', truncated=False):
    value = json.loads(binding)
    return {k: value[k] for k in ('scope','parentSessionId','parentTurnId','parentSubagentId','subagentId','childSessionId','depth','model','modelProvider')} | {'status': status, 'sequence': sequence, 'revision': revision, 'observedAt': datetime.fromtimestamp(observed_at, timezone.utc).isoformat(), 'answer': answer, 'truncated': bool(truncated)}

def child_snapshot_view(snapshot):
    """The renderer DTO contains actual transcript/deltas, never summary text."""
    observed = snapshot['observedAt']
    messages = snapshot.get('transcript', {}).get('messages', [])
    answer = snapshot.get('answer', '')
    source = snapshot.get('transcript', {}).get('sourceActuality', 'unavailable')
    # While streaming, SessionDB does not yet contain the current assistant row.
    persisted_answer = ''.join(row['content'] for row in messages if row['role'] == 'assistant')
    if answer and (snapshot['status'] not in _TERMINAL or persisted_answer != answer):
        messages = messages + [{'role': 'assistant', 'content': answer}]
        source = 'partial'
    return {k: snapshot[k] for k in ('scope','parentSessionId','parentTurnId','parentSubagentId','subagentId','childSessionId','depth','status','revision','observedAt')} | {
        'schemaVersion': 1, 'watermark': snapshot['sequence'],
        'truncated': snapshot.get('truncated', False) or snapshot.get('transcript', {}).get('sourceActuality') == 'partial',
        'sourceActuality': source,
        'model': {'provider': snapshot['modelProvider'], 'model': snapshot['model']},
        'messages': [{'id': row.get('id', f"answer:{snapshot['subagentId']}"), 'role': row['role'], 'content': row['content'], 'at': row.get('at', observed)} for row in messages],
    }

def child_event_view(event):
    snapshot = child_snapshot_view(event['snapshot'])
    payload = dict(event['payload'])
    if 'snapshot' in payload: payload['snapshot'] = snapshot
    return {k: snapshot[k] for k in ('schemaVersion','scope','parentSessionId','parentTurnId','parentSubagentId','subagentId','childSessionId','depth','model')} | {
        'sequence': event['sequence'], 'kind': event['type'], 'payload': payload, 'at': snapshot['observedAt'],
    }

def emit_child_event(context: ChildRunContext, *, event_type: str, payload: Mapping[str, object]) -> dict | None:
    """Persist and return an actual event; late deltas/status after terminal return None."""
    if event_type not in {'started','answer_delta','tool','status','completed'}:
        raise ValueError('unsupported child event')
    binding = _binding(context)
    if not isinstance(payload, Mapping):
        raise ValueError('object payload required')
    if event_type == 'answer_delta':
        if not isinstance(payload.get('delta'), str):
            raise ValueError('delta must be actual text')
        clean = {'delta': payload['delta']}
    else:
        clean = {k: v for k, v in payload.items() if k in {'status','tool','label','error'} and isinstance(v, str)}
    encoded = json.dumps(clean, ensure_ascii=False)
    if len(encoded.encode('utf-8')) > 65536:
        raise ValueError('event payload too large')
    path = _safe_db(context.parent.profile_home)
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path, timeout=10) as db:
        _child_schema(db)
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT child_binding,child_sequence,child_state,child_revision,child_answer,child_answer_truncated FROM runs WHERE subagent_id=?', (context.subagent_id,)).fetchone()
        if row and row[0] != binding:
            raise ValueError('child identity binding mismatch')
        if row and (row[2] in _TERMINAL or event_type == 'started'):
            return None
        if not row and event_type != 'started':
            raise ValueError('child must start before events')
        now = time.time()
        sequence = (row[1] if row else 0) + 1
        revision = (row[3] if row else 0) + 1
        status = clean.get('status', row[2] if row else 'running')
        if event_type == 'completed':
            status = clean.get('status', 'completed')
            if status not in _TERMINAL:
                raise ValueError('completed event must be terminal')
        elif status in _TERMINAL:
            raise ValueError('terminal state requires completed event')
        db.execute('INSERT INTO runs(subagent_id,session_id,space_slug,status,summary,updated_at,started_at,finished_at,child_binding,child_sequence,child_state,child_revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(subagent_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,finished_at=excluded.finished_at,child_sequence=excluded.child_sequence,child_state=excluded.child_state,child_revision=excluded.child_revision', (context.subagent_id,context.parent.parent_session_id,'',status,'',now,now,now if status in _TERMINAL else None,binding,sequence,status,revision))
        answer = row[4] or '' if row else ''
        truncated = bool(row[5]) if row else False
        if event_type == 'answer_delta':
            truncated |= len(answer) + len(clean['delta']) > 65536
            answer = (answer + clean['delta'])[-65536:]
        db.execute('UPDATE runs SET child_answer=?,child_answer_truncated=? WHERE subagent_id=?', (answer, int(truncated), context.subagent_id))
        snapshot = _snapshot(binding,status,sequence,revision,now,answer,truncated)
        if event_type == 'completed': snapshot['transcript'] = _transcript(binding)
        if event_type in {'started','completed'}:
            clean['snapshot'] = snapshot
        db.execute('INSERT INTO child_events VALUES(?,?,?,?,?)', (context.subagent_id,sequence,event_type,json.dumps(clean,ensure_ascii=False),now))
        db.execute('DELETE FROM child_events WHERE subagent_id=? AND sequence<=?', (context.subagent_id,sequence-512))
        # Bound disk use without dropping active children merely because another
        # parent produced many children. Keep at most 1000 completed bindings.
        old = db.execute("SELECT subagent_id FROM runs WHERE child_state IN ('completed','failed','cancelled','interrupted','abandoned') ORDER BY updated_at DESC LIMIT -1 OFFSET 1000").fetchall()
        if old:
            db.executemany('DELETE FROM child_events WHERE subagent_id=?', old)
            db.executemany('DELETE FROM runs WHERE subagent_id=?', old)
        return {'type': event_type, 'subagentId': context.subagent_id, 'sequence': sequence, 'payload': clean, 'snapshot': snapshot}

def _transcript(binding):
    """Read the actual child session only; summaries never become answer bodies."""
    value = json.loads(binding)
    path = Path(value['sessionDbPath'])
    if not path.is_file() or any(p.is_symlink() for p in (path,*path.parents)) or not path.resolve().is_relative_to(Path(value['home'])):
        return {'sourceActuality':'unavailable','messages':[]}
    try:
        with sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=1) as db:
            row = db.execute('SELECT parent_session_id FROM sessions WHERE session_id=?', (value['childSessionId'],)).fetchone()
            if not row or row[0] != value.get('sessionParentId', value['parentSessionId']):
                return {'sourceActuality':'unavailable','messages':[]}
            columns = {r[1] for r in db.execute('PRAGMA table_info(messages)')}
            timestamp = 'timestamp' if 'timestamp' in columns else 'NULL'
            rows = db.execute(f'SELECT role,substr(content,1,8192),length(content),id,{timestamp} FROM messages WHERE session_id=? ORDER BY id DESC LIMIT 33', (value['childSessionId'],)).fetchall()
            messages = [{'role': r[0], 'content': r[1], 'id': f"{value['childSessionId']}:{r[3]}", 'at': datetime.fromtimestamp(r[4], timezone.utc).isoformat() if isinstance(r[4], (float,int)) else ''} for r in reversed(rows[:32]) if r[0] in {'assistant','user','tool'}]
            partial = len(rows)>32 or any(r[2]>8192 for r in rows)
            return {'sourceActuality':'partial' if partial else 'persisted', 'messages':messages}
    except sqlite3.Error:
        return {'sourceActuality':'unavailable','messages':[]}

def scoped_history(context: ChildParentContext, *, after_sequence: Mapping[str, int] | None = None, limit: int = 50) -> dict:
    """Replay only children bound to this exact captured parent turn/profile/scope."""
    context.__post_init__()
    path = _safe_db(context.profile_home)
    if not path.is_file():
        return {'runs':[], 'events':[], 'resyncNeeded':False}
    cursors = after_sequence or {}
    output = {'runs':[], 'events':[], 'resyncNeeded':False}
    with sqlite3.connect(path) as db:
        _child_schema(db)
        rows = db.execute('SELECT subagent_id,child_binding,child_state,child_sequence,child_revision,updated_at,child_answer,child_answer_truncated FROM runs WHERE session_id=? AND child_binding IS NOT NULL ORDER BY updated_at DESC LIMIT 1000', (context.parent_session_id,)).fetchall()
        for sid, binding, state, sequence, revision, observed_at, answer, truncated in rows:
            value = json.loads(binding)
            expected = {'scope':context.scope.model_dump(mode='json',by_alias=True), 'home':str(context.profile_home.resolve()),'profile':context.profile_name,'sessionsDir':str(context.sessions_dir.resolve()),'parentSessionId':context.parent_session_id,'parentTurnId':context.parent_turn_id}
            if any(value.get(k)!=v for k,v in expected.items()):
                continue
            if len(output['runs']) >= max(1,min(limit,100)):
                output['resyncNeeded'] = True
                break
            snapshot = _snapshot(binding,state,sequence,revision,observed_at,answer or '',truncated)
            snapshot['transcript'] = _transcript(binding)
            output['runs'].append(snapshot)
            cursor = cursors.get(sid,0)
            if type(cursor) is not int or cursor < 0:
                raise ValueError('invalid sequence cursor')
            ev = db.execute('SELECT sequence,event_type,payload,created_at FROM child_events WHERE subagent_id=? AND sequence>? ORDER BY sequence LIMIT 512', (sid,cursor)).fetchall()
            if cursor > sequence or (ev and ev[0][0] > cursor+1):
                output['resyncNeeded'] = True
            output['events'].extend({'subagentId':sid,'sequence':n,'type':kind,'payload':json.loads(p),'snapshot':_snapshot(binding,state,n,revision,at)} for n,kind,p,at in ev)
    return output

def scoped_child_history(context: ChildParentContext, *, after_sequence=None, limit=50):
    actual = scoped_history(context, after_sequence=after_sequence, limit=limit)
    return {'schemaVersion': 1, 'scope': context.scope.model_dump(mode='json', by_alias=True),
            'parentSessionId': context.parent_session_id, 'parentTurnId': context.parent_turn_id,
            'runs': [child_snapshot_view(row) for row in actual['runs']],
            'events': [child_event_view(event) for event in actual['events']],
            'resyncNeeded': actual['resyncNeeded']}
