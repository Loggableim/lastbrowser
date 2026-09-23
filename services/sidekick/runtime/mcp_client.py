"""Model Context Protocol (MCP) stdio client and tool manager.

Implements JSON-RPC 2.0 protocol over stdio for external MCP servers
declared in mcp_servers.json. Adheres to the official MCP specification
(Anthropics / Linux Foundation Model Context Protocol).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

logger = logging.getLogger(__name__)

MCP_PROTOCOL_VERSION = "2024-11-05"
CLIENT_INFO = {"name": "lastbrowser-nova", "version": "0.1.31"}


@dataclass
class McpServerConfig:
    """Configuration for an individual MCP server."""
    name: str
    command: str
    args: List[str] = field(default_factory=list)
    env: Dict[str, str] = field(default_factory=dict)
    permissions: List[str] = field(default_factory=list)
    disabled: bool = False
    url: Optional[str] = None  # For SSE transport (if configured)


@dataclass
class McpTool:
    """Represents a discovered tool from an MCP server."""
    name: str
    description: str
    input_schema: Dict[str, Any]
    server_name: str


class McpError(Exception):
    """Base error for MCP client operations."""
    def __init__(self, message: str, code: Optional[int] = None, data: Any = None):
        super().__init__(message)
        self.code = code
        self.data = data


class McpStdioClient:
    """Async stdio client communicating via JSON-RPC 2.0 with an MCP server."""

    def __init__(self, config: McpServerConfig, request_timeout: float = 30.0):
        self.config = config
        self.request_timeout = request_timeout
        self.process: Optional[asyncio.subprocess.Process] = None
        self._request_id = 0
        self._pending_requests: Dict[int, asyncio.Future[Any]] = {}
        self._reader_task: Optional[asyncio.Task[None]] = None
        self._initialized = False
        self._lock = asyncio.Lock()

    @property
    def is_running(self) -> bool:
        return self.process is not None and self.process.returncode is None

    async def start(self) -> None:
        """Spawn the MCP server process and initialize the protocol handshake."""
        if self.is_running:
            return

        env = os.environ.copy()
        env.update(self.config.env)

        logger.info(
            "Spawning MCP server '%s': %s %s",
            self.config.name,
            self.config.command,
            " ".join(self.config.args),
        )

        try:
            self.process = await asyncio.create_subprocess_exec(
                self.config.command,
                *self.config.args,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
        except Exception as err:
            raise McpError(f"Failed to spawn MCP server '{self.config.name}': {err}") from err

        # Start background reader task
        self._reader_task = asyncio.create_task(self._read_stdout())

        # Perform JSON-RPC initialization handshake
        await self._handshake()

    async def _handshake(self) -> None:
        """Perform initialize handshake and send initialized notification."""
        init_params = {
            "protocolVersion": MCP_PROTOCOL_VERSION,
            "capabilities": {
                "tools": {"listChanged": False},
                "resources": {},
                "prompts": {},
            },
            "clientInfo": CLIENT_INFO,
        }

        try:
            response = await self._send_request("initialize", init_params)
            logger.debug("MCP server '%s' initialized: %s", self.config.name, response)
            await self._send_notification("notifications/initialized", {})
            self._initialized = True
        except Exception as err:
            await self.stop()
            raise McpError(f"Handshake failed with MCP server '{self.config.name}': {err}") from err

    async def list_tools(self) -> List[McpTool]:
        """Query tools/list from the server."""
        if not self.is_running or not self._initialized:
            await self.start()

        resp = await self._send_request("tools/list", {})
        raw_tools = resp.get("tools", []) if isinstance(resp, dict) else []

        tools: List[McpTool] = []
        for t in raw_tools:
            if isinstance(t, dict) and "name" in t:
                tools.append(
                    McpTool(
                        name=str(t["name"]),
                        description=str(t.get("description", "")),
                        input_schema=t.get("inputSchema", {}),
                        server_name=self.config.name,
                    )
                )
        return tools

    async def call_tool(self, name: str, arguments: Optional[Dict[str, Any]] = None) -> Any:
        """Execute tools/call on the server."""
        if not self.is_running or not self._initialized:
            await self.start()

        params = {"name": name, "arguments": arguments or {}}
        resp = await self._send_request("tools/call", params)
        return resp

    async def stop(self) -> None:
        """Terminate the server process cleanly."""
        if self._reader_task and not self._reader_task.done():
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass

        # Cancel any pending requests
        for fut in self._pending_requests.values():
            if not fut.done():
                fut.set_exception(McpError(f"MCP server '{self.config.name}' was stopped."))
        self._pending_requests.clear()

        if self.process and self.process.returncode is None:
            try:
                self.process.terminate()
                try:
                    await asyncio.wait_for(self.process.wait(), timeout=2.0)
                except asyncio.TimeoutError:
                    self.process.kill()
                    await self.process.wait()
            except Exception as err:
                logger.warning("Error stopping MCP server '%s': %s", self.config.name, err)

        self.process = None
        self._initialized = False

    async def _send_request(self, method: str, params: Dict[str, Any]) -> Any:
        """Send a JSON-RPC request and wait for the response future."""
        if not self.process or not self.process.stdin:
            raise McpError(f"Server '{self.config.name}' is not running.")

        async with self._lock:
            self._request_id += 1
            req_id = self._request_id

        payload = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method,
            "params": params,
        }

        loop = asyncio.get_running_loop()
        future: asyncio.Future[Any] = loop.create_future()
        self._pending_requests[req_id] = future

        msg_bytes = (json.dumps(payload) + "\n").encode("utf-8")
        try:
            self.process.stdin.write(msg_bytes)
            await self.process.stdin.drain()
        except Exception as err:
            self._pending_requests.pop(req_id, None)
            raise McpError(f"Failed to write to MCP server '{self.config.name}': {err}") from err

        try:
            return await asyncio.wait_for(future, timeout=self.request_timeout)
        except asyncio.TimeoutError:
            self._pending_requests.pop(req_id, None)
            raise McpError(f"Timeout ({self.request_timeout}s) waiting for response to '{method}' from '{self.config.name}'.")

    async def _send_notification(self, method: str, params: Dict[str, Any]) -> None:
        """Send a JSON-RPC notification (no response expected)."""
        if not self.process or not self.process.stdin:
            return

        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        }
        msg_bytes = (json.dumps(payload) + "\n").encode("utf-8")
        self.process.stdin.write(msg_bytes)
        await self.process.stdin.drain()

    async def _read_stdout(self) -> None:
        """Read line-delimited JSON-RPC messages from process stdout."""
        if not self.process or not self.process.stdout:
            return

        while True:
            try:
                line = await self.process.stdout.readline()
                if not line:
                    break
                line_str = line.decode("utf-8", errors="replace").strip()
                if not line_str:
                    continue

                try:
                    data = json.loads(line_str)
                except json.JSONDecodeError:
                    logger.debug("Received non-JSON from MCP server '%s': %s", self.config.name, line_str)
                    continue

                # Handle response
                if isinstance(data, dict) and "id" in data:
                    req_id = data["id"]
                    fut = self._pending_requests.pop(req_id, None)
                    if fut and not fut.done():
                        if "error" in data:
                            err_info = data["error"]
                            msg = err_info.get("message", "Unknown MCP error") if isinstance(err_info, dict) else str(err_info)
                            fut.set_exception(McpError(msg, code=err_info.get("code") if isinstance(err_info, dict) else None))
                        else:
                            fut.set_result(data.get("result"))

            except asyncio.CancelledError:
                break
            except Exception as err:
                logger.error("Error reading stdout of MCP server '%s': %s", self.config.name, err)
                break


def parse_mcp_config(config_data: Union[str, Path, Dict[str, Any]]) -> Dict[str, McpServerConfig]:
    """Parse an mcp_servers.json payload or file into McpServerConfig records."""
    raw_dict: Dict[str, Any] = {}
    if isinstance(config_data, (str, Path)):
        p = Path(config_data)
        if p.is_file():
            try:
                raw_dict = json.loads(p.read_text(encoding="utf-8"))
            except Exception as err:
                logger.error("Failed to parse MCP config file %s: %s", p, err)
                return {}
        else:
            try:
                raw_dict = json.loads(str(config_data))
            except Exception:
                return {}
    elif isinstance(config_data, dict):
        raw_dict = config_data

    # Accept both "mcpServers" and "servers" top-level keys
    servers_raw = raw_dict.get("mcpServers") or raw_dict.get("servers") or {}
    if not isinstance(servers_raw, dict):
        return {}

    configs: Dict[str, McpServerConfig] = {}
    for name, srv in servers_raw.items():
        if not isinstance(srv, dict):
            continue
        command = str(srv.get("command") or "").strip()
        url = str(srv.get("url") or "").strip() or None
        if not command and not url:
            continue

        raw_args = srv.get("args") or []
        args = [str(a) for a in raw_args] if isinstance(raw_args, list) else []

        raw_env = srv.get("env") or {}
        env = {str(k): str(v) for k, v in raw_env.items()} if isinstance(raw_env, dict) else {}

        raw_perms = srv.get("permissions") or []
        perms = [str(p) for p in raw_perms] if isinstance(raw_perms, list) else []

        configs[name] = McpServerConfig(
            name=name,
            command=command,
            args=args,
            env=env,
            permissions=perms,
            disabled=bool(srv.get("disabled", False)),
            url=url,
        )

    return configs


class McpManager:
    """Manages active MCP servers and multiplexes tool calls."""

    def __init__(self, config_source: Optional[Union[str, Path, Dict[str, Any]]] = None):
        self.configs: Dict[str, McpServerConfig] = {}
        self.clients: Dict[str, McpStdioClient] = {}
        if config_source:
            self.load_config(config_source)

    def load_config(self, config_source: Union[str, Path, Dict[str, Any]]) -> None:
        """Load or reload MCP servers configuration."""
        self.configs = parse_mcp_config(config_source)

    def get_client(self, server_name: str) -> Optional[McpStdioClient]:
        """Get or instantiate a client for the named server."""
        cfg = self.configs.get(server_name)
        if not cfg or cfg.disabled:
            return None
        if server_name not in self.clients:
            self.clients[server_name] = McpStdioClient(cfg)
        return self.clients[server_name]

    async def list_tools(self, server_name: Optional[str] = None) -> List[McpTool]:
        """Discover tools across one or all configured MCP servers."""
        if server_name:
            client = self.get_client(server_name)
            return await client.list_tools() if client else []

        all_tools: List[McpTool] = []
        for name, cfg in self.configs.items():
            if cfg.disabled or not cfg.command:
                continue
            client = self.get_client(name)
            if client:
                try:
                    tools = await client.list_tools()
                    all_tools.extend(tools)
                except Exception as err:
                    logger.warning("Failed to list tools from MCP server '%s': %s", name, err)
        return all_tools

    async def call_tool(self, server_name: str, tool_name: str, arguments: Optional[Dict[str, Any]] = None) -> Any:
        """Route tool call to the designated server."""
        client = self.get_client(server_name)
        if not client:
            raise McpError(f"Server '{server_name}' is not configured or disabled.")
        return await client.call_tool(tool_name, arguments)

    async def close_all(self) -> None:
        """Stop all running MCP servers."""
        for client in self.clients.values():
            await client.stop()
        self.clients.clear()
