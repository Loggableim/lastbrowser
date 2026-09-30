"""Cache lifecycle tests for auxiliary provider SDK clients."""

from __future__ import annotations

import asyncio
import hashlib
from unittest.mock import AsyncMock, Mock


def test_provider_cache_keys_fingerprint_credentials_without_retaining_them():
    from runtime import auxiliary_client

    credential = "ollama-cloud-cache-test-credential"
    key = auxiliary_client._client_cache_key(
        "ollama-cloud",
        async_mode=False,
        base_url="https://ollama.com/v1",
        api_key=credential,
    )
    other_key = auxiliary_client._client_cache_key(
        "ollama-cloud",
        async_mode=False,
        base_url="https://ollama.com/v1",
        api_key=credential + "-rotated",
    )
    auto_key = auxiliary_client._client_cache_key(
        "auto",
        async_mode=False,
        main_runtime={"provider": "ollama-cloud", "api_key": credential},
    )

    assert credential not in repr(key)
    assert credential not in repr(auto_key)
    assert key[3] == hashlib.sha256(credential.encode("utf-8")).hexdigest()
    assert auto_key[5][3] == hashlib.sha256(credential.encode("utf-8")).hexdigest()
    assert key != other_key


def test_provider_eviction_closes_sync_and_async_clients_without_awaiting():
    from openai import AsyncOpenAI, OpenAI
    from runtime import auxiliary_client

    sync_client = OpenAI(api_key="sync-test-credential", base_url="https://example.test/v1")
    async_client = AsyncOpenAI(api_key="async-test-credential", base_url="https://example.test/v1")
    unrelated_client = OpenAI(api_key="unrelated-test-credential", base_url="https://other.test/v1")
    sync_close = Mock(wraps=sync_client.close)
    async_close = AsyncMock(wraps=async_client.close)
    sync_client.close = sync_close
    async_client.close = async_close
    sync_key = auxiliary_client._client_cache_key(
        "ollama-cloud", async_mode=False, base_url="https://example.test/v1"
    )
    async_key = auxiliary_client._client_cache_key(
        "ollama-cloud", async_mode=True, base_url="https://example.test/v1"
    )
    unrelated_key = auxiliary_client._client_cache_key(
        "openrouter", async_mode=False, base_url="https://other.test/v1"
    )
    auxiliary_client._store_cached_client(sync_key, sync_client, "sync-model")
    auxiliary_client._store_cached_client(async_key, async_client, "async-model")
    auxiliary_client._store_cached_client(unrelated_key, unrelated_client, "other-model")

    try:
        async def evict_inside_running_loop():
            auxiliary_client._evict_cached_clients("ollama-cloud")

        asyncio.run(evict_inside_running_loop())

        assert sync_key not in auxiliary_client._client_cache
        assert async_key not in auxiliary_client._client_cache
        assert unrelated_key in auxiliary_client._client_cache
        assert sync_client._client.is_closed
        sync_close.assert_called_once_with()
        async_close.assert_not_called()
        assert async_client._client.is_closed
        assert not unrelated_client._client.is_closed
    finally:
        auxiliary_client._force_close_async_httpx(async_client)
        with auxiliary_client._client_cache_lock:
            auxiliary_client._client_cache.pop(sync_key, None)
            auxiliary_client._client_cache.pop(async_key, None)
            auxiliary_client._client_cache.pop(unrelated_key, None)
        sync_client.close()
        unrelated_client.close()
