"""Offline stdio server used to verify Nova's real MCP transport."""
from mcp.server.fastmcp import FastMCP

server = FastMCP("lastbrowser-test")


@server.tool()
def echo(message: str) -> str:
    """Return the provided test message."""
    return message


if __name__ == "__main__":
    server.run(transport="stdio")
