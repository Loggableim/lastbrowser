# Composio MCP — 0.1.57

User decision, 2026-10-13: add Composio as an MCP integration in the next version.

## Implementation

- Extension & Skills Hub includes a dedicated Composio setup card.
- Setup adds a draft using the official Composio Connect endpoint:
  `https://connect.composio.dev/mcp`, `auth: oauth`.
- Disabled by default; saving and enabling are explicit user actions.
- Existing MCP entries and unsaved valid drafts are preserved. An existing
  `composio` entry is never overwritten. Invalid drafts must be corrected first.
- Uses the existing native MCP configuration, Streamable HTTP and OAuth runtime;
  no extra CLI, npm bridge or embedded account credentials.
- MCP sampling is disabled in this preset. Remote app operations are cloud
  operations and follow the existing runtime authorization behavior.
- UI labels the connection Beta and not account-verified. A configured entry
  is not evidence of authenticated tools or successful app actions.

Official source: https://docs.composio.dev/docs/composio-connect

## Remaining acceptance

User-owned OAuth connection and an explicitly authorized app read have not been
performed. No accounts were connected and no external app actions executed.

## Public roadmap

Approved structure: Next release / Later / Under consideration. Content selection
still requires the user's public-content approval; this implementation request
does not automatically publish Composio or other 0.1.57 announcements.
