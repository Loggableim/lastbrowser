"""Model Context Protocol (MCP) JSON-RPC 2.0 client and tool manager.

Implements JSON-RPC 2.0 protocol over:
1. stdio (subprocess I/O pipes via npx, python, uvx)
2. sse (HTTP Server-Sent Events to remote MCP endpoints)

Adheres to the official Model Context Protocol (MCP) specification
(Anthropic / Linux Foundation Model Context Protocol).
Provides dynamic tool transformation into the Nova AI function-calling schema
with a 4-tier security confirmation model (read_only, filesystem_write,
terminal_execute, network_outbound).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple, Union
from urllib.parse import urljoin

logger = logging.getLogger(__name__)

MCP_PROTOCOL_VERSION = "2024-11-05"
CLIENT_INFO = {"name": "lastbrowser-nova", "version": "0.1.31"}

# Security permission categories
MCP_PERMISSION_READ_ONLY = "read_only"
MCP_PERMISSION_FS_WRITE = "filesystem_write"
MCP_PERMISSION_TERMINAL_EXEC = "terminal_execute"
MCP_PERMISSION_NETWORK_OUTBOUND = "network_outbound"
MCP_PERMISSION_AGENT_AUTONOMY = "agent_autonomy"

MCP_PERMISSIONS: Tuple[str, ...] = (
    MCP_PERMISSION_READ_ONLY,
    MCP_PERMISSION_FS_WRITE,
    MCP_PERMISSION_TERMINAL_EXEC,
    MCP_PERMISSION_NETWORK_OUTBOUND,
    MCP_PERMISSION_AGENT_AUTONOMY,
)

MCP_PERMISSION_BADGES: Dict[str, str] = {
    MCP_PERMISSION_READ_ONLY: "🛡️",
    MCP_PERMISSION_FS_WRITE: "⚠️",
    MCP_PERMISSION_TERMINAL_EXEC: "🚨",
    MCP_PERMISSION_NETWORK_OUTBOUND: "🌐",
    MCP_PERMISSION_AGENT_AUTONOMY: "🤖",
}

# Heuristic patterns for automatic security classification
_TERMINAL_KEYWORDS = {
    "terminal", "bash", "sh", "shell", "cmd", "run_command", "spawn",
    "subprocess", "powershell", "execute_command", "execute_code", "execute_script", "conpty"
}
_FS_WRITE_KEYWORDS = {
    "write", "create", "delete", "remove", "unlink", "overwrite", "edit",
    "update", "mkdir", "rmdir", "rename", "move", "patch", "modify", "save", "put_file"
}
_NETWORK_KEYWORDS = {
    "fetch", "http", "https", "request", "download", "curl", "get_url", "post",
    "webhook", "api", "browse", "scrape", "search"
}


@dataclass
class McpServerConfig:
    """Configuration for an individual MCP server."""
    name: str
    command: Optional[str] = None
    args: List[str] = field(default_factory=list)
    env: Dict[str, str] = field(default_factory=dict)
    headers: Dict[str, str] = field(default_factory=dict)
    permissions: List[str] = field(default_factory=list)
    disabled: bool = False
    url: Optional[str] = None  # For SSE transport
    timeout: float = 30.0

    @property
    def transport(self) -> str:
        if self.url and not self.command:
            return "sse"
        return "stdio"


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


def classify_tool_permission(tool: McpTool, server_cfg: Optional[McpServerConfig] = None) -> str:
    """Classify the security permission tier for a given MCP tool.

    Priority:
    1. If server explicitly restricts to read_only, return read_only.
    2. Heuristic inspection of tool name and description.
    3. Intersection with server declared permissions.
    4. Fallback to read_only.
    """
    text = f"{tool.name.lower()} {tool.description.lower()}"
    words = set(re.findall(r"[a-z0-9_]+", text))

    if words & _TERMINAL_KEYWORDS:
        inferred = MCP_PERMISSION_TERMINAL_EXEC
    elif words & _FS_WRITE_KEYWORDS:
        inferred = MCP_PERMISSION_FS_WRITE
    elif words & _NETWORK_KEYWORDS:
        inferred = MCP_PERMISSION_NETWORK_OUTBOUND
    else:
        inferred = MCP_PERMISSION_READ_ONLY

    if server_cfg and server_cfg.permissions:
        if inferred in server_cfg.permissions:
            return inferred
        for p in [MCP_PERMISSION_TERMINAL_EXEC, MCP_PERMISSION_FS_WRITE, MCP_PERMISSION_NETWORK_OUTBOUND]:
            if p in server_cfg.permissions and (words & _TERMINAL_KEYWORDS or words & _FS_WRITE_KEYWORDS or words & _NETWORK_KEYWORDS):
                return p
        if MCP_PERMISSION_READ_ONLY in server_cfg.permissions:
            return MCP_PERMISSION_READ_ONLY

    return inferred


def requires_confirmation(permission: str) -> bool:
    """Determine whether human confirmation is required for a permission level."""
    return permission in {
        MCP_PERMISSION_FS_WRITE,
        MCP_PERMISSION_TERMINAL_EXEC,
        MCP_PERMISSION_AGENT_AUTONOMY,
    }


def mcp_tools_to_nova_schema(
    tools: List[McpTool],
    configs: Optional[Dict[str, McpServerConfig]] = None,
) -> List[Dict[str, Any]]:
    """Transform raw MCP tools into the Nova / OpenAI function-calling schema.

    Attaches permission metadata and badge annotations to the function description.
    """
    configs_map = configs or {}
    schema_list: List[Dict[str, Any]] = []

    for tool in tools:
        server_cfg = configs_map.get(tool.server_name)
        perm = classify_tool_permission(tool, server_cfg)
        badge = MCP_PERMISSION_BADGES.get(perm, "🛡️")
        needs_confirm = requires_confirmation(perm)

        desc_prefix = f"[{badge} {perm.upper()}] "
        clean_desc = tool.description.strip()
        final_desc = f"{desc_prefix}{clean_desc}" if clean_desc else f"{desc_prefix}MCP Tool: {tool.name}"

        # Standard OpenAI / Nova function definition
        schema_list.append({
            "type": "function",
            "function": {
                "name": f"mcp__{tool.server_name}__{tool.name}",
                "description": final_desc,
                "parameters": tool.input_schema if isinstance(tool.input_schema, dict) and tool.input_schema else {
                    "type": "object",
                    "properties": {},
                },
            },
            "mcp_meta": {
                "server": tool.server_name,
                "tool": tool.name,
                "permission": perm,
                "requires_confirmation": needs_confirm,
                "badge": badge,
            },
        })

    return schema_list


def parse_nova_tool_name(function_name: str) -> Tuple[Optional[str], Optional[str]]:
    """Extract (server_name, tool_name) from a formatted Nova function name."""
    if function_name.startswith("mcp__"):
        parts = function_name.split("__", 2)
        if len(parts) == 3:
            return parts[1], parts[2]
    return None, None


class McpStdioClient:
    """Async stdio client communicating via JSON-RPC 2.0 with an MCP server."""

    def __init__(self, config: McpServerConfig, request_timeout: Optional[float] = None):
        self.config = config
        self.request_timeout = request_timeout or config.timeout
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

        cmd = self.config.command or ""
        logger.info(
            "Spawning MCP stdio server '%s': %s %s",
            self.config.name,
            cmd,
            " ".join(self.config.args),
        )

        try:
            self.process = await asyncio.create_subprocess_exec(
                cmd,
                *self.config.args,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
        except Exception as err:
            raise McpError(f"Failed to spawn MCP server '{self.config.name}': {err}") from err

        self._reader_task = asyncio.create_task(self._read_stdout())
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


class McpSseClient:
    """Async SSE client communicating via HTTP Server-Sent Events with an MCP server.

    Connects to an SSE endpoint (e.g. GET /sse), reads the message endpoint event,
    and dispatches JSON-RPC requests via POST.
    """

    def __init__(self, config: McpServerConfig, request_timeout: Optional[float] = None):
        self.config = config
        self.request_timeout = request_timeout or config.timeout
        self.base_url = config.url or ""
        self.post_url: Optional[str] = None
        self._request_id = 0
        self._pending_requests: Dict[int, asyncio.Future[Any]] = {}
        self._sse_task: Optional[asyncio.Task[None]] = None
        self._http_client: Any = None
        self._initialized = False
        self._endpoint_ready = asyncio.Event()
        self._lock = asyncio.Lock()

    @property
    def is_running(self) -> bool:
        return self._sse_task is not None and not self._sse_task.done()

    async def start(self) -> None:
        """Start the SSE event stream listener and initialize MCP handshake."""
        if self.is_running:
            return

        import httpx

        headers = {
            "Accept": "text/event-stream",
            "User-Agent": "Lastbrowser-Nova/0.1.31",
            **self.config.headers,
        }

        self._endpoint_ready.clear()
        self._http_client = httpx.AsyncClient(headers=headers, timeout=self.request_timeout)
        self._sse_task = asyncio.create_task(self._listen_sse())

        # Wait for the endpoint event from the SSE stream
        try:
            await asyncio.wait_for(self._endpoint_ready.wait(), timeout=min(10.0, self.request_timeout))
        except asyncio.TimeoutError:
            # Fallback: if no explicit endpoint event, default to base URL
            if not self.post_url:
                self.post_url = self.base_url

        await self._handshake()

    async def _listen_sse(self) -> None:
        """Connect to SSE stream and dispatch incoming events."""
        import httpx

        try:
            async with self._http_client.stream("GET", self.base_url) as response:
                if response.status_code >= 400:
                    raise McpError(f"HTTP {response.status_code} connecting to MCP SSE endpoint {self.base_url}")

                event_type = "message"
                data_lines: List[str] = []

                async for line in response.aiter_lines():
                    line = line.strip()
                    if not line:
                        # Empty line signals end of event
                        if data_lines:
                            data_str = "\n".join(data_lines)
                            self._handle_sse_event(event_type, data_str)
                            data_lines = []
                        event_type = "message"
                        continue

                    if line.startswith("event:"):
                        event_type = line[len("event:"):].strip()
                    elif line.startswith("data:"):
                        data_lines.append(line[len("data:"):].strip())

        except asyncio.CancelledError:
            pass
        except Exception as err:
            logger.error("SSE stream error on '%s': %s", self.config.name, err)
            # Propagate error to pending requests
            for fut in list(self._pending_requests.values()):
                if not fut.done():
                    fut.set_exception(McpError(f"SSE stream closed: {err}"))

    def _handle_sse_event(self, event_type: str, data: str) -> None:
        """Handle individual parsed SSE event."""
        if event_type == "endpoint":
            # Endpoint event delivers the POST URL for JSON-RPC messages
            raw_url = data.strip()
            self.post_url = urljoin(self.base_url, raw_url)
            logger.debug("Received MCP SSE message endpoint: %s", self.post_url)
            self._endpoint_ready.set()
            return

        if event_type == "message":
            try:
                msg = json.loads(data)
                if isinstance(msg, dict) and "id" in msg:
                    req_id = msg["id"]
                    fut = self._pending_requests.pop(req_id, None)
                    if fut and not fut.done():
                        if "error" in msg:
                            err_info = msg["error"]
                            err_msg = err_info.get("message", "Unknown MCP error") if isinstance(err_info, dict) else str(err_info)
                            fut.set_exception(McpError(err_msg, code=err_info.get("code") if isinstance(err_info, dict) else None))
                        else:
                            fut.set_result(msg.get("result"))
            except Exception as e:
                logger.debug("Failed to parse SSE JSON-RPC message: %s", e)

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
            logger.debug("MCP SSE server '%s' initialized: %s", self.config.name, response)
            await self._send_notification("notifications/initialized", {})
            self._initialized = True
        except Exception as err:
            await self.stop()
            raise McpError(f"Handshake failed with MCP SSE server '{self.config.name}': {err}") from err

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
        return await self._send_request("tools/call", params)

    async def stop(self) -> None:
        """Close the SSE connection and cleanup resources."""
        if self._sse_task and not self._sse_task.done():
            self._sse_task.cancel()
            try:
                await self._sse_task
            except asyncio.CancelledError:
                pass
        self._sse_task = None

        if self._http_client:
            try:
                await self._http_client.aclose()
            except Exception:
                pass
            self._http_client = None

        for fut in self._pending_requests.values():
            if not fut.done():
                fut.set_exception(McpError(f"MCP server '{self.config.name}' was stopped."))
        self._pending_requests.clear()
        self._initialized = False

    async def _send_request(self, method: str, params: Dict[str, Any]) -> Any:
        """Send a JSON-RPC request via POST."""
        if not self.post_url:
            self.post_url = self.base_url

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

        post_headers = {
            "Content-Type": "application/json",
            **self.config.headers,
        }

        try:
            res = await self._http_client.post(self.post_url, json=payload, headers=post_headers)
            if res.status_code >= 400:
                self._pending_requests.pop(req_id, None)
                raise McpError(f"HTTP {res.status_code} posting JSON-RPC request to {self.post_url}: {res.text}")

            # If response returned inline JSON
            if res.text.strip():
                try:
                    data = res.json()
                    if isinstance(data, dict) and "result" in data:
                        self._pending_requests.pop(req_id, None)
                        return data["result"]
                    elif isinstance(data, dict) and "error" in data:
                        self._pending_requests.pop(req_id, None)
                        err_info = data["error"]
                        err_msg = err_info.get("message", "MCP error") if isinstance(err_info, dict) else str(err_info)
                        raise McpError(err_msg, code=err_info.get("code") if isinstance(err_info, dict) else None)
                except json.JSONDecodeError:
                    pass

        except Exception as err:
            self._pending_requests.pop(req_id, None)
            raise McpError(f"Failed to post to MCP SSE server '{self.config.name}': {err}") from err

        # Await result dispatched via SSE event stream
        try:
            return await asyncio.wait_for(future, timeout=self.request_timeout)
        except asyncio.TimeoutError:
            self._pending_requests.pop(req_id, None)
            raise McpError(f"Timeout ({self.request_timeout}s) waiting for response from '{self.config.name}'.")

    async def _send_notification(self, method: str, params: Dict[str, Any]) -> None:
        """Send a JSON-RPC notification via POST without awaiting response."""
        if not self.post_url or not self._http_client:
            return

        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        }
        try:
            await self._http_client.post(self.post_url, json=payload, headers=self.config.headers)
        except Exception as err:
            logger.debug("Failed to send notification to MCP server '%s': %s", self.config.name, err)


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

    servers_raw = raw_dict.get("mcpServers") or raw_dict.get("servers") or {}
    if not isinstance(servers_raw, dict):
        return {}

    configs: Dict[str, McpServerConfig] = {}
    for name, srv in servers_raw.items():
        if not isinstance(srv, dict):
            continue
        command = str(srv.get("command") or "").strip() or None
        url = str(srv.get("url") or "").strip() or None
        if not command and not url:
            continue

        raw_args = srv.get("args") or []
        args = [str(a) for a in raw_args] if isinstance(raw_args, list) else []

        raw_env = srv.get("env") or {}
        env = {str(k): str(v) for k, v in raw_env.items()} if isinstance(raw_env, dict) else {}

        raw_headers = srv.get("headers") or {}
        headers = {str(k): str(v) for k, v in raw_headers.items()} if isinstance(raw_headers, dict) else {}

        raw_perms = srv.get("permissions") or []
        perms = [str(p) for p in raw_perms] if isinstance(raw_perms, list) else []

        configs[name] = McpServerConfig(
            name=name,
            command=command,
            args=args,
            env=env,
            headers=headers,
            permissions=perms,
            disabled=bool(srv.get("disabled", False)),
            url=url,
            timeout=float(srv.get("timeout", 30.0)),
        )

    return configs


class McpManager:
    """Manages active MCP servers (stdio and sse) and multiplexes tool calls."""

    def __init__(self, config_source: Optional[Union[str, Path, Dict[str, Any]]] = None):
        self.configs: Dict[str, McpServerConfig] = {}
        self.clients: Dict[str, Union[McpStdioClient, McpSseClient]] = {}
        if config_source:
            self.load_config(config_source)

    def load_config(self, config_source: Union[str, Path, Dict[str, Any]]) -> None:
        """Load or reload MCP servers configuration."""
        self.configs = parse_mcp_config(config_source)

    def get_client(self, server_name: str) -> Optional[Union[McpStdioClient, McpSseClient]]:
        """Get or instantiate a client for the named server."""
        cfg = self.configs.get(server_name)
        if not cfg or cfg.disabled:
            return None
        if server_name not in self.clients:
            if cfg.transport == "sse":
                self.clients[server_name] = McpSseClient(cfg)
            else:
                self.clients[server_name] = McpStdioClient(cfg)
        return self.clients[server_name]

    async def list_tools(self, server_name: Optional[str] = None) -> List[McpTool]:
        """Discover tools across one or all configured MCP servers."""
        if server_name:
            client = self.get_client(server_name)
            return await client.list_tools() if client else []

        all_tools: List[McpTool] = []
        for name, cfg in self.configs.items():
            if cfg.disabled:
                continue
            client = self.get_client(name)
            if client:
                try:
                    tools = await client.list_tools()
                    all_tools.extend(tools)
                except Exception as err:
                    logger.warning("Failed to list tools from MCP server '%s': %s", name, err)
        return all_tools

    async def list_nova_tools(self, server_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """Discover tools and return them formatted in the Nova function calling schema."""
        tools = await self.list_tools(server_name)
        return mcp_tools_to_nova_schema(tools, self.configs)

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


def resolve_default_mcp_config_path() -> Path:
    """Resolve the default mcp_servers.json configuration path."""
    env_path = os.environ.get("LASTBROWSER_MCP_CONFIG") or os.environ.get("SIDEKICK_MCP_CONFIG")
    if env_path:
        return Path(env_path).resolve()

    # Workspace specific
    workspace_cfg = Path.cwd() / ".lastbrowser" / "mcp_servers.json"
    if workspace_cfg.is_file():
        return workspace_cfg.resolve()

    # User profile / AppData
    appdata = os.environ.get("APPDATA") or os.environ.get("LOCALAPPDATA") or str(Path.home())
    default_appdata = Path(appdata) / "Lastbrowser" / "mcp_servers.json"
    if default_appdata.is_file():
        return default_appdata.resolve()

    home_dir = os.environ.get("SIDEKICK_HOME") or os.environ.get("LASTBROWSER_HOME")
    if home_dir:
        sidekick_cfg = Path(home_dir) / "mcp_servers.json"
        if sidekick_cfg.is_file():
            return sidekick_cfg.resolve()

    return default_appdata


_MCP_MANAGER_INSTANCE: Optional[McpManager] = None


def get_mcp_manager() -> McpManager:
    """Get or instantiate global McpManager singleton."""
    global _MCP_MANAGER_INSTANCE
    if _MCP_MANAGER_INSTANCE is None:
        cfg_path = resolve_default_mcp_config_path()
        _MCP_MANAGER_INSTANCE = McpManager(cfg_path if cfg_path.is_file() else None)
    return _MCP_MANAGER_INSTANCE

