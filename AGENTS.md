# AGENTS.md: Inbound MCP server

Stateless MCP server for the Inbound e2 API, served at `https://inbound.new/mcp`.

## Layout

- `api/mcp.ts`: Vercel function entry (Web `Request` → `Response`).
- `src/http.ts`: Streamable HTTP handling, CORS, auth header extraction. One `McpServer` per request, JSON responses, no sessions.
- `src/server.ts`: builds the server. A `mail_`/`imap_` token selects **mailbox mode** (mailbox tools only); any other token selects **account mode** (all toolsets).
- `src/client.ts`: thin `fetch` client for `https://inbound.new/api/e2` (override with `INBOUND_API_URL`).
- `src/tool.ts`: `tool({...})` definitions and registration; shared input fragments.
- `src/tools/*.ts`: tool groups. `mailboxAccessTools(mode)` serves both modes.
- `src/stdio.ts`, `src/dev-server.ts`: local entry points (Bun).

## Rules

- Every tool maps to public e2 API calls; never add database access here. If a capability is missing, add it to the API in `inboundemail/inbound` first.
- Security boundaries belong to the API. Checks in this server (for example sender identity) are only for clearer errors.
- Tool names are snake_case. Inputs are snake_case and get translated to the API's field names in `run`.
- Mark tools `readOnly`, `destructive` or `idempotent` accurately; clients use these hints to decide on confirmations.
- Run `bun run typecheck` before committing. Test against production with a test account's API key and mailbox password.
