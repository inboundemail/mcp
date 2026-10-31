import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DEFAULT_API_URL, InboundClient } from "./client.js";
import { type AnyTool, type Mode, registerTools } from "./tool.js";
import { addressTools } from "./tools/addresses.js";
import { domainTools } from "./tools/domains.js";
import { emailTools } from "./tools/emails.js";
import { endpointTools } from "./tools/endpoints.js";
import { guardTools } from "./tools/guard.js";
import { mailboxFolderTools } from "./tools/mailbox-folders.js";
import { mailboxAccessTools, mailboxAdminTools } from "./tools/mailboxes.js";

export const VERSION = "1.0.0";

export const TOOLSETS = [
	"domains",
	"endpoints",
	"addresses",
	"emails",
	"mailboxes",
	"guard",
] as const;
export type Toolset = (typeof TOOLSETS)[number];

const ACCOUNT_INSTRUCTIONS = `Inbound is email infrastructure: send, receive and route email on your own domains.
- Domains must be verified before they send or receive (create_domain, then get_domain with check_dns).
- Received mail is stored and readable with list_emails/get_email or list_threads/get_thread, and can be delivered to endpoints (webhook, forward, group) via email addresses or a domain catch-all.
- Mailboxes are virtual email accounts. create_mailbox gives an agent its own address; use the *_mailbox_* tools to read and send as it, or hand the returned password to another agent as its MCP bearer token for mailbox-only access.
- Ask before deleting anything or sending email on the user's behalf.`;

const MAILBOX_INSTRUCTIONS = `You are connected to one Inbound mailbox: your own email account.
- whoami shows your address and what you can do.
- list_messages checks your inbox (unread_only for new mail); read_message opens one; get_thread shows the conversation.
- reply answers a received message; send_email starts a new one. Both send as your mailbox identity.
- Mark handled mail with update_message (is_archived) to keep the inbox clean.`;

export function parseToolsets(value: string | null | undefined): Set<Toolset> | null {
	if (!value) return null;
	const requested = value
		.split(",")
		.map((entry) => entry.trim().toLowerCase())
		.filter((entry): entry is Toolset => (TOOLSETS as readonly string[]).includes(entry));
	return requested.length ? new Set(requested) : null;
}

export function isMailboxToken(token: string): boolean {
	return token.startsWith("mail_") || token.startsWith("imap_");
}

export function createInboundServer(options: {
	token: string;
	apiUrl?: string;
	toolsets?: Set<Toolset> | null;
}): McpServer {
	const mode: Mode = isMailboxToken(options.token) ? "mailbox" : "account";
	const server = new McpServer(
		{ name: "inbound", title: "Inbound", version: VERSION, websiteUrl: "https://inbound.new" },
		{ instructions: mode === "mailbox" ? MAILBOX_INSTRUCTIONS : ACCOUNT_INSTRUCTIONS },
	);
	const api = new InboundClient(options.token, options.apiUrl ?? DEFAULT_API_URL);
	const mailboxTools = [...mailboxAccessTools(mode), ...mailboxFolderTools(mode)];

	let tools: AnyTool[];
	if (mode === "mailbox") {
		tools = mailboxTools;
	} else {
		const sets: Record<Toolset, AnyTool[]> = {
			domains: domainTools,
			endpoints: endpointTools,
			addresses: addressTools,
			emails: emailTools,
			mailboxes: [...mailboxAdminTools, ...mailboxTools],
			guard: guardTools,
		};
		const enabled = options.toolsets ?? new Set(TOOLSETS);
		tools = TOOLSETS.filter((set) => enabled.has(set)).flatMap((set) => sets[set]);
	}
	registerTools(server, { api, mode }, tools);
	return server;
}
