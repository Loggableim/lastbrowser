"""A fast chat turn must remain subscribable after its worker finishes."""

from __future__ import annotations


def test_late_subscriber_replays_finished_stream_tail():
    from web.api.config import (
        RECENT_CHAT_STREAMS,
        STREAMS,
        STREAMS_LOCK,
        StreamChannel,
        get_chat_stream_channel,
        retain_completed_chat_stream,
    )

    stream_id = "late-subscriber-regression"
    channel = StreamChannel()
    channel.put_nowait(("token", {"text": "OK"}))
    channel.put_nowait(("stream_end", {"session_id": "session-1"}))
    with STREAMS_LOCK:
        STREAMS[stream_id] = channel

    try:
        retain_completed_chat_stream(stream_id)
        with STREAMS_LOCK:
            STREAMS.pop(stream_id, None)  # worker has completed

        replay = get_chat_stream_channel(stream_id)
        assert replay is channel
        subscriber = replay.subscribe()
        assert subscriber.get_nowait() == ("token", {"text": "OK"})
        assert subscriber.get_nowait() == ("stream_end", {"session_id": "session-1"})
        replay.unsubscribe(subscriber)
    finally:
        with STREAMS_LOCK:
            STREAMS.pop(stream_id, None)
            RECENT_CHAT_STREAMS.pop(stream_id, None)


def test_terminal_event_replays_after_connected_subscriber_and_unsubscribe():
    from web.api.config import StreamChannel

    channel = StreamChannel()
    original = channel.subscribe()
    channel.put_nowait(("token", {"text": "partial"}))
    terminal = ("stream_end", {"session_id": "session-2"})
    channel.put_nowait(terminal)

    assert original.get_nowait() == ("token", {"text": "partial"})
    assert original.get_nowait() == terminal

    while_connected = channel.subscribe()
    assert while_connected.get_nowait() == terminal
    channel.unsubscribe(original)
    channel.unsubscribe(while_connected)

    after_unsubscribe = channel.subscribe()
    assert after_unsubscribe.get_nowait() == terminal
    assert after_unsubscribe.empty()
    channel.unsubscribe(after_unsubscribe)


def test_terminal_replay_keeps_offline_history_bounded_and_unduplicated():
    from web.api.config import StreamChannel

    channel = StreamChannel()
    channel._max_backlog = 3
    for index in range(8):
        channel.put_nowait(("token", {"text": str(index)}))
    terminal = ("stream_end", {"session_id": "session-3"})
    channel.put_nowait(terminal)

    assert len(channel._offline_buffer) == 3
    subscriber = channel.subscribe()
    replay = [subscriber.get_nowait() for _ in range(3)]
    assert replay == [
        ("token", {"text": "6"}),
        ("token", {"text": "7"}),
        terminal,
    ]
    assert sum(event == terminal for event in replay) == 1
    assert subscriber.empty()
    channel.unsubscribe(subscriber)


def test_connected_terminal_apperror_replays_to_late_subscriber():
    from web.api.config import StreamChannel

    channel = StreamChannel()
    original = channel.subscribe()
    terminal = ("apperror", {"message": "provider unavailable"})
    channel.put_nowait(terminal)

    assert original.get_nowait() == terminal
    channel.unsubscribe(original)

    reconnected = channel.subscribe()
    assert reconnected.get_nowait() == terminal
    assert reconnected.empty()
    channel.unsubscribe(reconnected)


def test_chat_sse_route_exits_and_unsubscribes_after_apperror(monkeypatch, capsys):
    import io
    from types import SimpleNamespace

    import web.api.config as config
    from web.api import routes

    terminal = ("apperror", {"message": "provider unavailable"})

    class Subscriber:
        calls = 0

        def get(self, timeout):
            self.calls += 1
            if self.calls == 1:
                return terminal
            raise AssertionError("SSE route read past the terminal apperror")

    class Channel:
        def __init__(self):
            self.subscriber = Subscriber()
            self.unsubscribed = None

        def subscribe(self):
            return self.subscriber

        def unsubscribe(self, subscriber):
            self.unsubscribed = subscriber

    class Handler:
        def __init__(self):
            self.wfile = io.BytesIO()
            self.headers = []
            self.status = None
            self.chat_transport_trace = 7

        def send_response(self, status):
            self.status = status

        def send_header(self, name, value):
            self.headers.append((name, value))

        def end_headers(self):
            pass

    channel = Channel()
    monkeypatch.setenv("LASTBROWSER_DEBUG_CHAT_TRANSPORT", "1")
    monkeypatch.setattr(config, "get_chat_stream_channel", lambda _stream_id: channel)
    handler = Handler()

    assert routes._handle_sse_stream(handler, SimpleNamespace(query="stream_id=test")) is True
    assert handler.status == 200
    assert b"event: apperror\n" in handler.wfile.getvalue()
    assert channel.subscriber.calls == 1
    assert channel.unsubscribed is channel.subscriber
    trace = capsys.readouterr().err
    assert '"stage":"subscriber_event"' in trace
    assert '"kind":"heartbeat"' in trace
    assert '"kind":"apperror"' in trace
    assert "provider unavailable" not in trace


def test_finished_stream_replay_expires(monkeypatch):
    import web.api.config as config

    stream_id = "expired-stream-regression"
    channel = config.StreamChannel()
    with config.STREAMS_LOCK:
        config.RECENT_CHAT_STREAMS[stream_id] = (channel, 0.0)

    try:
        assert config.get_chat_stream_channel(stream_id) is None
        with config.STREAMS_LOCK:
            assert stream_id not in config.RECENT_CHAT_STREAMS
    finally:
        with config.STREAMS_LOCK:
            config.RECENT_CHAT_STREAMS.pop(stream_id, None)
