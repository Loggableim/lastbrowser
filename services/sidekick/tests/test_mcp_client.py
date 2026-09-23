"""Unit tests for native Python MCP client and runner."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, Dict
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from runtime.mcp_client import (
    McpError,
    McpManager,
    McpServerConfig,
    McpStdioClient,
    McpTool,
    parse_mcp_config,
)


def test_parse_mcp_config_dict() -> None:
    data = {
        "mcpServers": {
            "github": {
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-github"],
                "env": {"GITHUB_PERSONAL_ACCESS_TOKEN": "mock-token"},
                "permissions": ["read_only", "network_outbound"],
            },
            "sqlite": {
                "command": "uvx",
                "args": ["mcp-server-sqlite", "--db-path", "test.db"],
                "permissions": ["read_only", "filesystem_write"],
                "disabled": True,
            },
        }
    }
    configs = parse_mcp_config(data)
    assert len(configs) == 2
    assert "github" in configs
    assert configs["github"].command == "npx"
    assert configs["github"].args == ["-y", "@modelcontextprotocol/server-github"]
    assert configs["github"].env == {"GITHUB_PERSONAL_ACCESS_TOKEN": "mock-token"}
    assert configs["github"].permissions == ["read_only", "network_outbound"]
    assert configs["github"].disabled is False

    assert "sqlite" in configs
    assert configs["sqlite"].disabled is True


def test_parse_mcp_config_file(tmp_path: Path) -> None:
    config_file = tmp_path / "mcp_servers.json"
    payload = {
        "servers": {
            "fetch": {
                "command": "python",
                "args": ["-m", "mcp_server_fetch"],
                "permissions": ["network_outbound"],
            }
        }
    }
    config_file.write_text(json.dumps(payload), encoding="utf-8")

    configs = parse_mcp_config(config_file)
    assert len(configs) == 1
    assert "fetch" in configs
    assert configs["fetch"].command == "python"
    assert configs["fetch"].args == ["-m", "mcp_server_fetch"]


def test_parse_mcp_config_invalid() -> None:
    assert parse_mcp_config("{invalid json") == {}
    assert parse_mcp_config({}) == {}
    assert parse_mcp_config("non_existent_file.json") == {}


class MockSubprocess:
    def __init__(self, responses: Dict[str, Any]):
        self.responses = responses
        self.written_lines: list[str] = []
        self.stdin = MagicMock()
        self.stdin.drain = AsyncMock()
        self.stdout = MagicMock()
        self.stderr = MagicMock()
        self.returncode = None

        self.stdin.write = self._handle_write
        self._output_queue: asyncio.Queue[bytes] = asyncio.Queue()
        self.stdout.readline = self._handle_readline

    def _handle_write(self, data: bytes) -> None:
        text = data.decode("utf-8")
        for line in text.strip().split("\n"):
            if not line:
                continue
            self.written_lines.append(line)
            try:
                msg = json.loads(line)
                method = msg.get("method")
                req_id = msg.get("id")
                if method and req_id is not None and method in self.responses:
                    resp = {
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "result": self.responses[method],
                    }
                    self._output_queue.put_nowait((json.dumps(resp) + "\n").encode("utf-8"))
                elif method and req_id is not None and method + "_error" in self.responses:
                    resp = {
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "error": self.responses[method + "_error"],
                    }
                    self._output_queue.put_nowait((json.dumps(resp) + "\n").encode("utf-8"))
            except Exception:
                pass

    async def _handle_readline(self) -> bytes:
        try:
            return await asyncio.wait_for(self._output_queue.get(), timeout=1.0)
        except asyncio.TimeoutError:
            return b""

    def terminate(self) -> None:
        self.returncode = 0

    def kill(self) -> None:
        self.returncode = -9

    async def wait(self) -> int:
        return self.returncode or 0


@pytest.mark.asyncio
async def test_mcp_stdio_client_handshake_and_tools_list() -> None:
    cfg = McpServerConfig(name="test-server", command="test-cmd")
    mock_proc = MockSubprocess(
        responses={
            "initialize": {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}},
            "tools/list": {
                "tools": [
                    {
                        "name": "read_query",
                        "description": "Execute a SELECT SQL query",
                        "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}}},
                    }
                ]
            },
        }
    )

    with patch("asyncio.create_subprocess_exec", AsyncMock(return_value=mock_proc)):
        client = McpStdioClient(cfg, request_timeout=2.0)
        tools = await client.list_tools()

        assert len(tools) == 1
        assert isinstance(tools[0], McpTool)
        assert tools[0].name == "read_query"
        assert tools[0].description == "Execute a SELECT SQL query"
        assert tools[0].server_name == "test-server"
        assert "query" in tools[0].input_schema.get("properties", {})

        # Verify notifications/initialized was sent
        sent_methods = [
            json.loads(l).get("method") for l in mock_proc.written_lines if "method" in json.loads(l)
        ]
        assert "initialize" in sent_methods
        assert "notifications/initialized" in sent_methods
        assert "tools/list" in sent_methods

        await client.stop()


@pytest.mark.asyncio
async def test_mcp_stdio_client_call_tool() -> None:
    cfg = McpServerConfig(name="test-server", command="test-cmd")
    mock_proc = MockSubprocess(
        responses={
            "initialize": {"protocolVersion": "2024-11-05"},
            "tools/call": {"content": [{"type": "text", "text": "Query success: 42 rows"}]},
        }
    )

    with patch("asyncio.create_subprocess_exec", AsyncMock(return_value=mock_proc)):
        client = McpStdioClient(cfg, request_timeout=2.0)
        result = await client.call_tool("read_query", {"query": "SELECT * FROM users"})

        assert isinstance(result, dict)
        content = result.get("content", [])
        assert len(content) == 1
        assert "Query success" in content[0].get("text", "")

        await client.stop()


@pytest.mark.asyncio
async def test_mcp_stdio_client_error_response() -> None:
    cfg = McpServerConfig(name="test-server", command="test-cmd")
    mock_proc = MockSubprocess(
        responses={
            "initialize": {"protocolVersion": "2024-11-05"},
            "tools/call_error": {"code": -32602, "message": "Invalid SQL syntax"},
        }
    )

    with patch("asyncio.create_subprocess_exec", AsyncMock(return_value=mock_proc)):
        client = McpStdioClient(cfg, request_timeout=2.0)
        with pytest.raises(McpError) as exc_info:
            await client.call_tool("read_query", {"query": "SYNTAX ERROR"})

        assert "Invalid SQL syntax" in str(exc_info.value)
        assert exc_info.value.code == -32602

        await client.stop()


@pytest.mark.asyncio
async def test_mcp_manager_multi_server() -> None:
    manager = McpManager(
        {
            "mcpServers": {
                "server_a": {"command": "cmd_a", "disabled": False},
                "server_b": {"command": "cmd_b", "disabled": True},
            }
        }
    )

    mock_proc_a = MockSubprocess(
        responses={
            "initialize": {"protocolVersion": "2024-11-05"},
            "tools/list": {"tools": [{"name": "tool_a", "description": "Tool A"}]},
        }
    )

    with patch("asyncio.create_subprocess_exec", AsyncMock(return_value=mock_proc_a)):
        tools = await manager.list_tools()
        assert len(tools) == 1
        assert tools[0].name == "tool_a"
        assert tools[0].server_name == "server_a"

        # Disabled server returns None
        assert manager.get_client("server_b") is None

        await manager.close_all()
        assert len(manager.clients) == 0
