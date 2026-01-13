# @inbound/mcp

MCP (Model Context Protocol) server for the [Inbound Email API](https://inbound.new). Give your AI agent its own email address to send, receive, and manage emails.

## Quick Start: Agent Mailbox

The primary use case is giving an AI agent its own email identity. Set the `x-inbound-mailbox` header to your agent's email address:

```json
{
  "mcpServers": {
    "inbound": {
      "url": "http://localhost:5454/mcp",
      "headers": {
        "x-inbound-api-key": "your-api-key",
        "x-inbound-mailbox": "Support Agent <support@yourdomain.com>"
      }
    }
  }
}
```

The header supports both formats:
- With display name: `Support Agent <support@yourdomain.com>`
- Email only: `support@yourdomain.com`

### Mailbox Tools

| Tool | Description |
|------|-------------|
| `check_mailbox` | Check incoming emails for your mailbox (defaults to unread) |
| `get_mailbox_threads` | Get conversation threads where your mailbox is a participant |
| `send_from_mailbox` | Send emails - `from` is automatically set to your mailbox |
| `reply_from_mailbox` | Reply to emails/threads - `from` is automatically set to your mailbox |

### Agent Workflow

1. **Check for new emails**: `check_mailbox` returns unread emails with IDs
2. **Read email details**: Use `get_email` with the email ID to read full content
3. **Reply to emails**: `reply_from_mailbox` sends replies with your agent identity
4. **Send new emails**: `send_from_mailbox` sends emails as your agent

When sending, the display name (e.g., "Support Agent") is included so recipients see a friendly sender name.

## Installation

```bash
npm install @inbound/mcp
# or
pnpm add @inbound/mcp
# or
bun add @inbound/mcp
```

## Configuration

### Claude Desktop (STDIO)

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "inbound": {
      "command": "npx",
      "args": ["-y", "@inbound/mcp"],
      "env": {
        "INBOUND_API_KEY": "your-api-key",
        "INBOUND_MAILBOX": "Agent <agent@yourdomain.com>"
      }
    }
  }
}
```

### Cursor / Other MCP Clients (HTTP)

Start the server:

```bash
npx @inbound/mcp start:http
```

Then configure your client:

```json
{
  "mcpServers": {
    "inbound": {
      "url": "http://localhost:5454/mcp",
      "headers": {
        "x-inbound-api-key": "your-api-key",
        "x-inbound-mailbox": "Agent <agent@yourdomain.com>"
      }
    }
  }
}
```

## Authentication

The MCP server authenticates using your Inbound API key:

- **Environment variable**: `INBOUND_API_KEY`
- **HTTP header**: `x-inbound-api-key`

### Optional: Domain Restriction

To restrict all operations to a single domain:

- **Environment variable**: `INBOUND_DOMAIN`
- **HTTP header**: `x-inbound-domain`

## All Available Tools

### Mailbox (Agent Mode)
- `check_mailbox` - Check incoming emails for your mailbox
- `get_mailbox_threads` - Get conversation threads for your mailbox
- `send_from_mailbox` - Send an email from your mailbox
- `reply_from_mailbox` - Reply to an email from your mailbox

### Emails
- `list_emails` - List sent, received, and scheduled emails
- `get_email` - Get detailed information about a specific email
- `send_email` - Send or schedule an email
- `reply_email` - Reply to an email or thread
- `retry_email` - Retry delivery of a failed email

### Threads
- `list_threads` - List email conversations
- `get_thread` - Get all messages in a thread

### Domains
- `list_domains` - List all domains in your account

### Endpoints
- `list_endpoints` - List webhook and email forwarding endpoints
- `create_endpoint` - Create a webhook, email forward, or email group endpoint

## Available Prompts

- `getting-started` - Learn how to use Inbound Email API

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build for production
pnpm build
```

## License

Apache-2.0
