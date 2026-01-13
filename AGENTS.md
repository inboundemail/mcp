# AGENTS.md - Inbound MCP Server

This document provides guidelines for AI coding agents working in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server for the Inbound Email API, built with the `xmcp` framework. It exposes tools for managing domains, endpoints, emails, and threads via the MCP protocol.

**Tech Stack:**
- Runtime: Node.js with Bun support
- Language: TypeScript (strict mode)
- Framework: xmcp (MCP server framework)
- Validation: Zod
- API Client: inboundemail SDK

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Development mode with hot reload
pnpm dev

# Build for production
pnpm build

# Start HTTP server (after build)
pnpm start:http

# Start STDIO server (after build)
pnpm start:stdio

# Type check only
npx tsc --noEmit
```

**Note:** This project has no test suite currently. There is no lint command configured.

## Project Structure

```
src/
├── lib/
│   └── client.ts          # Inbound API client initialization & helpers
├── tools/                  # MCP tool definitions (auto-discovered)
│   ├── domains/
│   ├── emails/
│   ├── endpoints/
│   └── threads/
└── prompts/               # MCP prompt definitions (auto-discovered)
    └── getting-started.ts

xmcp.config.ts             # xmcp framework configuration
```

## Code Style Guidelines

### File Structure for Tools

Each tool file must export three things:
1. `schema` - Zod schema object defining input parameters
2. `metadata` - Tool metadata (name, description, annotations)
3. `default function` - Async function implementing the tool

```typescript
import { z } from "zod";
import type { InferSchema, ToolMetadata } from "xmcp";
import { getClientContext } from "../../lib/client";

export const schema = {
  id: z.string().describe("Description for the parameter"),
};

export const metadata: ToolMetadata = {
  name: "tool_name",  // snake_case
  description: "Tool description for LLM context",
  annotations: {
    title: "Human Readable Title",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
};

export default async function toolName({ id }: InferSchema<typeof schema>) {
  const { client, domain } = getClientContext();
  // Implementation
  return JSON.stringify(result, null, 2);
}
```

### TypeScript Conventions

- **Strict mode enabled** - No implicit any, strict null checks
- **Target:** ES2022 with ESNext modules
- **Type imports:** Use `import type` for type-only imports
- **Inference:** Prefer `InferSchema<typeof schema>` over manual types

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Tool names | snake_case | `list_emails`, `send_email` |
| Function names | camelCase | `listEmails`, `sendEmail` |
| File names | kebab-case | `list-emails.ts`, `get-thread.ts` |
| Interfaces | PascalCase | `ClientContext`, `ToolMetadata` |
| Constants | camelCase | `schema`, `metadata` |

### Import Order

1. External packages (`zod`, `xmcp`)
2. Type imports from external packages
3. Internal imports (`../../lib/client`)

```typescript
import { z } from "zod";
import type { InferSchema, ToolMetadata } from "xmcp";
import type { EndpointCreateParams } from "inboundemail/resources/endpoints";
import { getClientContext, validateDomainAccess } from "../../lib/client";
```

### Formatting

- **Indentation:** Tabs
- **Quotes:** Double quotes for strings
- **Trailing commas:** Yes
- **Semicolons:** Yes
- **Line length:** ~80 chars preferred, no hard limit

### Error Handling

Return errors as JSON strings, do not throw:
```typescript
if (!url) {
  return JSON.stringify({
    error: "URL is required for webhook endpoints",
  });
}
```

For validation errors from domain checks, catch and return:
```typescript
try {
  validateDomainAccess(from, domain);
} catch (error) {
  return JSON.stringify({
    error: error instanceof Error ? error.message : "Validation failed",
  });
}
```

### Return Values

All tools must return JSON strings with pretty printing:
```typescript
return JSON.stringify(
  {
    id: response.id,
    message: "Success message",
  },
  null,
  2,
);
```

### Zod Schema Patterns

- Always add `.describe()` to every field for LLM context
- Use `.optional()` for non-required fields
- Use `z.enum()` for fixed choices
- Use `z.union([z.string(), z.array(z.string())])` for single-or-array fields

```typescript
export const schema = {
  type: z
    .enum(["webhook", "email", "email_group"])
    .describe("Type of endpoint"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum results (1-100, default 50)"),
};
```

### Tool Metadata Annotations

Set hints accurately for LLM decision making:
- `readOnlyHint: true` - Tool only reads data (list, get operations)
- `destructiveHint: true` - Tool deletes or irreversibly modifies data
- `idempotentHint: true` - Multiple calls produce same result

### Client Context Pattern

Always use `getClientContext()` to get the authenticated client:
```typescript
const { client, domain } = getClientContext();
```

The `domain` value filters results when `x-inbound-domain` header is set.

## Adding New Tools

1. Create file in appropriate `src/tools/<category>/` directory
2. Export `schema`, `metadata`, and default async function
3. Run `pnpm dev` - xmcp auto-discovers new tools
4. Tool name in metadata becomes the MCP tool name

## Adding New Prompts

1. Create file in `src/prompts/` directory
2. Export `metadata` with name, title, description
3. Export default function returning prompt string
