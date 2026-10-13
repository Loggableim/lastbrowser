"""Explicit live smoke: run against the authenticated bundled runtime in an isolated home."""
import json
import os
from pathlib import Path
import sys
import socket

home = Path(sys.argv[1]).resolve()
model = sys.argv[2]
os.environ["SIDEKICK_HOME"] = str(home / "agent-home")
os.environ["HERMES_HOME"] = str(home / "agent-home")
os.environ["TERMINAL_CWD"] = str(home)
os.environ['LASTBROWSER_LOCAL_AI_HOME'] = str(home)
os.environ['LASTBROWSER_LOCAL_AI_CATALOG'] = str(Path(__file__).resolve().parents[3] / 'apps/desktop/vendor/local-ai/models.json')
external_attempts = []
original_connect = socket.socket.connect
original_getaddrinfo = socket.getaddrinfo
def only_local_connect(sock, address):
    if isinstance(address, tuple) and address[0] not in {'127.0.0.1', '::1', 'localhost'}:
        external_attempts.append(str(address[0]))
        raise OSError('Offline smoke blocks external connections')
    return original_connect(sock, address)
def only_local_dns(host, *args, **kwargs):
    if host not in {'127.0.0.1', '::1', 'localhost', None}:
        external_attempts.append(str(host))
        raise OSError('Offline smoke blocks external DNS')
    return original_getaddrinfo(host, *args, **kwargs)
socket.socket.connect = only_local_connect
socket.getaddrinfo = only_local_dns
from run_agent import AIAgent

fixture = home / "read-fixture.txt"
fixture.write_text("Prüfwert: 73", encoding="utf-8")
agent = AIAgent(model=model, provider="custom", base_url="http://127.0.0.1:11435/v1",
                api_key=(home / "runtime.key").read_text().strip(), max_iterations=6,
                max_tokens=512, enabled_toolsets=["file"], quiet_mode=True,
                skip_memory=True, request_overrides={"extra_body": {"chat_template_kwargs": {"enable_thinking": False}}})
agent.tools = [tool for tool in agent.tools if tool.get("function", {}).get("name") == "read_file"]
agent.valid_tool_names = {"read_file"}
agent._config_context_length = 8192
agent.context_compressor.update_model(model=model, context_length=8192, base_url=agent.base_url, api_key=agent.api_key, provider="custom")
result = agent.run_conversation(f"Lies mit read_file die Datei {fixture.as_posix()}. Nenne ihren Prüfwert auf Deutsch.")
tools = [message for message in result.get('messages', []) if message.get('role') == 'tool']
passed = bool(tools) and '73' in result.get('final_response', '') and not external_attempts
print(json.dumps({"model": model, "passed": passed, "external_attempts": external_attempts, "final_response": result.get('final_response'), "tool_count": len(tools), "api_calls": result.get('api_calls')}, ensure_ascii=False))
sys.exit(0 if passed else 1)
