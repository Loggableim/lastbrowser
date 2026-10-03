"""Tests for batching and executor isolation in the route bridge SSE writer."""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
import threading

import pytest

from web.api.fastapi_bridge import _ResponseWriter


def _collect(writer: _ResponseWriter) -> list[bytes]:
    async def run() -> list[bytes]:
        return [chunk async for chunk in writer.stream()]

    return asyncio.run(run())


def test_burst_is_batched_and_content_preserved() -> None:
    writer = _ResponseWriter()
    expected = b""
    for index in range(10):
        payload = f"chunk-{index}|".encode()
        expected += payload
        writer.write(payload)
    writer.finish()

    chunks = _collect(writer)

    assert b"".join(chunks) == expected
    assert len(chunks) == 1, f"a queued burst should yield once, got {len(chunks)}"


def test_opt_in_transport_trace_reports_writer_and_asgi_counts_without_payload(monkeypatch, capsys) -> None:
    monkeypatch.setenv("LASTBROWSER_DEBUG_CHAT_TRANSPORT", "1")
    writer = _ResponseWriter(chat_trace=7)
    writer.write(b"private-payload")
    writer.finish()

    assert b"".join(_collect(writer)) == b"private-payload"
    trace = capsys.readouterr().err
    assert '"stage":"writer_write"' in trace
    assert '"stage":"asgi_yield"' in trace
    assert '"trace":7' in trace
    assert '"bytes":15' in trace
    assert "private-payload" not in trace


def test_transport_trace_is_silent_without_opt_in(monkeypatch, capsys) -> None:
    monkeypatch.delenv("LASTBROWSER_DEBUG_CHAT_TRANSPORT", raising=False)
    writer = _ResponseWriter(chat_trace=7)
    writer.write(b"payload")
    writer.finish()

    _collect(writer)
    assert capsys.readouterr().err == ""


def test_live_chunks_are_delivered_in_order() -> None:
    writer = _ResponseWriter()

    async def scenario() -> list[bytes]:
        received: list[bytes] = []

        async def consume() -> None:
            async for chunk in writer.stream():
                received.append(chunk)

        task = asyncio.create_task(consume())
        await asyncio.sleep(0.05)
        for index in range(5):
            writer.write(f"live-{index}|".encode())
            await asyncio.sleep(0.02)
        writer.finish()
        await task
        return received

    chunks = asyncio.run(scenario())

    assert b"".join(chunks) == b"".join(f"live-{i}|".encode() for i in range(5))


def test_legacy_thread_wakes_waiting_async_reader_in_order() -> None:
    """Cross-thread writes wake the ASGI reader, including a prebuffered chunk."""

    async def scenario() -> list[bytes]:
        writer = _ResponseWriter()
        writer.write(b"buffered|")
        received: list[bytes] = []

        async def consume() -> None:
            async for chunk in writer.stream():
                received.append(chunk)

        reader = asyncio.create_task(consume())
        # Let stream() bind its event-loop wakeup and enter its idle wait.
        await asyncio.sleep(0)
        producer = threading.Thread(
            target=lambda: (
                writer.write(b"legacy-1|"),
                writer.write(b"legacy-2|"),
                writer.finish(),
            ),
            daemon=True,
        )
        producer.start()
        producer.join(timeout=1)
        assert not producer.is_alive(), "legacy writer thread did not finish"
        await asyncio.wait_for(reader, timeout=1)
        return received

    chunks = asyncio.run(scenario())
    assert b"".join(chunks) == b"buffered|legacy-1|legacy-2|"


def test_cancelled_async_reader_closes_writer_and_releases_wakeup() -> None:
    writer = _ResponseWriter()

    async def scenario() -> None:
        async def consume() -> None:
            async for _chunk in writer.stream():
                pass

        reader = asyncio.create_task(consume())
        await asyncio.sleep(0)
        reader.cancel()
        with pytest.raises(asyncio.CancelledError):
            await reader
        assert writer.is_closed()

    asyncio.run(scenario())


def test_idle_streams_do_not_starve_default_executor() -> None:
    """Idle SSE readers must leave executor capacity for ordinary API work."""

    async def scenario() -> None:
        loop = asyncio.get_running_loop()
        loop.set_default_executor(ThreadPoolExecutor(max_workers=4))
        writers = [_ResponseWriter() for _ in range(12)]
        readers = [asyncio.create_task(_collect_async(writer)) for writer in writers]
        # Each reader runs through its initial queue drain and then waits idle.
        await asyncio.sleep(0)

        probe_completed = False
        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(lambda: "executor available"), timeout=1
            )
            probe_completed = result == "executor available"
        except asyncio.TimeoutError:
            pass
        finally:
            for writer in writers:
                writer.finish()
            await asyncio.gather(*readers)

        assert probe_completed, "idle SSE streams occupied the default executor"

    async def _collect_async(writer: _ResponseWriter) -> list[bytes]:
        return [chunk async for chunk in writer.stream()]

    asyncio.run(scenario())


def test_finish_terminates_the_stream_without_hanging() -> None:
    writer = _ResponseWriter()
    writer.finish()

    async def run() -> list[bytes]:
        return await asyncio.wait_for(
            _collect_async(writer), timeout=5
        )

    async def _collect_async(w: _ResponseWriter) -> list[bytes]:
        return [chunk async for chunk in w.stream()]

    assert asyncio.run(run()) == []


def test_close_wakes_an_idle_stream() -> None:
    writer = _ResponseWriter()

    async def run() -> list[bytes]:
        task = asyncio.create_task(_collect_async(writer))
        await asyncio.sleep(0)
        writer.close()
        return await asyncio.wait_for(task, timeout=1)

    async def _collect_async(w: _ResponseWriter) -> list[bytes]:
        return [chunk async for chunk in w.stream()]

    assert asyncio.run(run()) == []


def test_batching_does_not_use_executor_thread_hops(monkeypatch) -> None:
    """The queue bridge should deliver chunks without executor work."""
    hops: list[int] = []
    original = asyncio.to_thread

    async def counting(fn, *args, **kwargs):
        hops.append(1)
        return await original(fn, *args, **kwargs)

    monkeypatch.setattr(asyncio, "to_thread", counting)

    writer = _ResponseWriter()
    for _ in range(20):
        writer.write(b"x")
    writer.finish()
    _collect(writer)

    assert not hops, f"SSE queue unexpectedly used {len(hops)} executor thread hops"
