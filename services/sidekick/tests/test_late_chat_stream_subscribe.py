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
