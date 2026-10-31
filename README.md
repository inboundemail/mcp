# Inbound MCP server

Connect any MCP client (Claude, Cursor, OpenCode, ChatGPT, agents) to [Inbound](https://inbound.new): manage domains, endpoints, addresses, emails, Guard rules and **mailboxes**, which are virtual email accounts that agents can read and send from.

**Endpoint:** `https://inbound.new/mcp` (Streamable HTTP, stateless)

## Three ways to connect

| Credential | What the agent gets |
|---|---|
| **OAuth** (just add the URL; the client opens Inbound to sign in) | All account tools, including creating mailboxes and acting as any of them |
| **Account API key** (from [inbound.new/settings](https://inbound.new/settings)) | The same as OAuth, for scripts and clients without OAuth |
| **Mailbox password** (`mail_…`, returned by `create_mailbox`) | Only that mailbox: `whoami`, `list_messages`, `read_message`, `update_message`, `get_thread`, `send_email`, `reply`, `download_attachment`, plus the folder and folder-message tools [listed below](#tools-account-key), without `mailbox_id` |

The mailbox password is enforced by the Inbound API, not by this server. An agent holding it can only see mail within the mailbox's scopes and can only send as its identity. The same password also works for IMAP (`imap.inboundemail.com:993`) and SMTP (`smtp.inboundemail.com:465`).

```json
{
  "mcpServers": {
    "inbound": {
      "type": "http",
      "url": "https://inbound.new/mcp",
      "headers": { "Authorization": "Bearer <api key or mailbox password>" }
    }
  }
}
```

Leave out `headers` to use OAuth. Discovery follows the MCP authorization spec: the `401` points to `https://inbound.new/.well-known/oauth-protected-resource/mcp`, the authorization server is `https://inbound.new/api/auth` (dynamic client registration, PKCE), and tokens carry the `inbound:account` scope for the `https://inbound.new/mcp` audience. This server verifies them against Inbound's JWKS and forwards them to the API.

`x-inbound-api-key: <key>` is also accepted. Clients that only speak STDIO can use `npx mcp-remote https://inbound.new/mcp --header "Authorization:Bearer ${INBOUND_API_KEY}"`.

### Limit the tool list

Add `?toolsets=` (or an `x-inbound-toolsets` header) with any of `domains,endpoints,addresses,emails,mailboxes,guard`, e.g. `https://inbound.new/mcp?toolsets=mailboxes,emails`.

## Give an agent its own inbox

1. With the account key: `create_mailbox { "address": "agent@yourdomain.com", "sending_name": "Support Agent" }`.
2. Give the returned password to the agent as its bearer token.
3. The agent loops: `list_messages { unread_only: true }` → `read_message` → `reply` → `update_message { is_archived: true }`.

Mailboxes, read state and sent mail are stored by Inbound, so they show up in the dashboard and over IMAP too.

## Tools (account key)

- **Domains:** `list_domains`, `get_domain`, `create_domain`, `update_domain`, `delete_domain`, `enable_domain_dkim`
- **Endpoints:** `list_endpoints`, `get_endpoint`, `create_endpoint`, `update_endpoint`, `delete_endpoint`, `test_endpoint`
- **Addresses:** `list_email_addresses`, `get_email_address`, `create_email_address`, `update_email_address`, `delete_email_address`
- **Emails:** `list_emails`, `get_email`, `send_email`, `reply_to_email`, `update_email`, `cancel_scheduled_email`, `pause_scheduled_email`, `resume_scheduled_email`, `retry_email_delivery`, `list_threads`, `get_thread`, `list_attachments`, `download_attachment`
- **Mailboxes:** `list_mailboxes`, `create_mailbox`, `update_mailbox`, `delete_mailbox`, `rotate_mailbox_password`, `get_mailbox`, `list_mailbox_messages`, `read_mailbox_message`, `update_mailbox_message`, `get_mailbox_thread`, `send_from_mailbox`, `reply_from_mailbox`, `download_mailbox_attachment`
- **Mailbox folders:** `list_mailbox_folders`, `create_mailbox_folder`, `rename_mailbox_folder`, `delete_mailbox_folder`
- **Folder messages (by folder path and UID, not account email ID):** `list_folder_messages`, `get_folder_message`, `get_folder_message_raw`, `set_message_flags`, `move_message`, `copy_message`, `delete_folder_message`, `expunge_folder`, `append_message`, `list_folder_message_attachments`, `download_folder_message_attachment`
- **Guard:** `list_guard_rules`, `get_guard_rule`, `create_guard_rule`, `update_guard_rule`, `delete_guard_rule`, `check_guard_rule`, `generate_guard_rule`

## Development

```bash
bun install
bun run dev        # http://localhost:5454/mcp, against production unless INBOUND_API_URL is set
bun run typecheck
INBOUND_API_KEY=... bun run stdio   # STDIO transport
```

Deployed on Vercel (team `inbound`, project `inbound-mcp`) as one function, `api/mcp.ts`. `inbound.new/mcp` rewrites to it from the main app.
