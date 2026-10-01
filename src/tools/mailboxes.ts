import { z } from "zod";
import { encodePath, type InboundClient } from "../client.js";
import {
	type AnyTool,
	addressList,
	attachmentsInput,
	compact,
	pagination,
	ToolInputError,
	tool,
} from "../tool.js";
import { attachmentContent } from "./attachment-content.js";

export const MCP_URL = "https://inbound.new/mcp";

interface Mailbox {
	id: string;
	loginAddress: string;
	accessMode: "read" | "read_write";
	sendingMode: "identity" | "scoped_domains";
	sendingName: string | null;
	sendingAddress: string | null;
	allowedSendingDomains: string[];
}

interface MessageDetail {
	id: string;
	folder: "inbox" | "archive" | "sent";
	isRead: boolean;
}

const scopeInput = z
	.array(
		z.object({
			type: z.enum(["address", "domain"]),
			value: z
				.string()
				.describe("An address (agent@example.com) or a domain (example.com) on a verified domain"),
		}),
	)
	.min(1)
	.max(100);

async function domainIds(api: InboundClient): Promise<Map<string, string>> {
	const ids = new Map<string, string>();
	for (let offset = 0; offset < 1000; offset += 100) {
		const page = await api.get<{ data: Array<{ id: string; domain: string }> }>("/domains", {
			limit: 100,
			offset,
		});
		for (const domain of page.data) ids.set(domain.domain.toLowerCase(), domain.id);
		if (page.data.length < 100) break;
	}
	return ids;
}

async function resolveScopes(
	api: InboundClient,
	scopes: Array<{ type: "address" | "domain"; value: string }>,
) {
	const ids = await domainIds(api);
	return scopes.map((scope) => {
		const value = scope.value.trim().toLowerCase();
		const domain = scope.type === "address" ? value.slice(value.lastIndexOf("@") + 1) : value;
		const domainId = ids.get(domain);
		if (!domainId) {
			throw new ToolInputError(
				`${domain} is not a domain on this account. Add and verify it first (create_domain).`,
			);
		}
		return scope.type === "address"
			? { type: "address" as const, domainId, address: value }
			: { type: "domain" as const, domainId };
	});
}

function connectionInfo(loginAddress: string, password: string) {
	return {
		password,
		passwordNote: "Shown once. Store it securely; rotate_mailbox_password issues a new one.",
		mcp: {
			url: MCP_URL,
			headers: { Authorization: `Bearer ${password}` },
			note: "An agent connected with this password only sees and sends as this mailbox.",
		},
		imap: { host: "imap.inboundemail.com", port: 993, tls: true, username: loginAddress },
		smtp: { host: "smtp.inboundemail.com", port: 465, tls: true, username: loginAddress },
	};
}

export const mailboxAdminTools = [
	tool({
		name: "list_mailboxes",
		title: "List mailboxes",
		description:
			"List the account's mailboxes: virtual email accounts with their own login address, sending identity and scopes, usable over MCP, IMAP and SMTP.",
		readOnly: true,
		input: pagination,
		run: (args, { api }) => api.get("/mailboxes", args),
	}),
	tool({
		name: "create_mailbox",
		title: "Create mailbox",
		description:
			"Create a mailbox (a virtual email account), e.g. for an AI agent. By default it reads mail sent to its address and sends as that address. Returns a password, shown once, that works as an MCP bearer token (mailbox-only access) and for IMAP/SMTP. The address must be on a verified domain.",
		input: {
			address: z.string().describe("Login address, e.g. agent@example.com"),
			name: z.string().optional().describe("Label shown in the dashboard (default: the address)"),
			sending_name: z.string().optional().describe('Display name for sent mail, e.g. "Support Agent"'),
			sending_address: z.string().optional().describe("Address to send as (default: the login address)"),
			access_mode: z
				.enum(["read_write", "read"])
				.optional()
				.describe("read_write (default) can mark, archive and reply; read can only read"),
			scopes: scopeInput
				.optional()
				.describe("Mail the mailbox can see (default: only its own address)"),
			send_as_any_scoped_domain: z
				.boolean()
				.optional()
				.describe("Allow sending as any address on its scoped domains instead of one identity"),
			smtp_only: z.boolean().optional().describe("Create a send-only SMTP credential instead"),
		},
		run: async (args, { api }) => {
			const address = args.address.trim().toLowerCase();
			const scopes = await resolveScopes(
				api,
				args.scopes ?? [{ type: "address", value: address }],
			);
			const scopedDomains = args.send_as_any_scoped_domain === true;
			const created = await api.post<{ data: Record<string, unknown>; password: string }>(
				"/mailboxes",
				{
					name: args.name ?? address,
					loginAddress: address,
					type: args.smtp_only ? "smtp" : "mailbox",
					accessMode: args.access_mode ?? "read_write",
					sendingMode: scopedDomains ? "scoped_domains" : "identity",
					sendingName: args.sending_name ?? null,
					sendingAddress: scopedDomains ? null : (args.sending_address ?? address),
					scopes,
				},
			);
			return { mailbox: created.data, ...connectionInfo(address, created.password) };
		},
	}),
	tool({
		name: "update_mailbox",
		title: "Update mailbox",
		description:
			"Change a mailbox's name, sending identity, access mode or scopes, or disable/enable it. Only the fields you pass change; scopes replace the existing list.",
		idempotent: true,
		input: {
			mailbox_id: z.string(),
			name: z.string().optional(),
			enabled: z.boolean().optional(),
			access_mode: z.enum(["read_write", "read"]).optional(),
			sending_name: z.string().nullable().optional(),
			sending_address: z.string().nullable().optional(),
			send_as_any_scoped_domain: z.boolean().optional(),
			scopes: scopeInput.optional(),
		},
		run: async (args, { api }) => {
			const scopes = args.scopes ? await resolveScopes(api, args.scopes) : undefined;
			return api.put(
				`/mailboxes/${encodePath(args.mailbox_id)}`,
				compact({
					name: args.name,
					enabled: args.enabled,
					accessMode: args.access_mode,
					sendingName: args.sending_name,
					sendingAddress: args.sending_address,
					sendingMode:
						args.send_as_any_scoped_domain === undefined
							? undefined
							: args.send_as_any_scoped_domain
								? "scoped_domains"
								: "identity",
					scopes,
				}),
			);
		},
	}),
	tool({
		name: "delete_mailbox",
		title: "Delete mailbox",
		description:
			"Delete a mailbox and revoke its password. Its mail stays in the account. Cannot be undone.",
		destructive: true,
		input: { mailbox_id: z.string() },
		run: (args, { api }) => api.delete(`/mailboxes/${encodePath(args.mailbox_id)}`),
	}),
	tool({
		name: "rotate_mailbox_password",
		title: "Rotate mailbox password",
		description:
			"Issue a new mailbox password and revoke the old one immediately. Agents and mail clients using the old password stop working.",
		destructive: true,
		input: { mailbox_id: z.string() },
		run: async (args, { api }) => {
			const result = await api.post<{ data?: { loginAddress?: string }; password: string }>(
				`/mailboxes/${encodePath(args.mailbox_id)}/rotate-password`,
			);
			return {
				...result,
				...connectionInfo(result.data?.loginAddress ?? "", result.password),
			};
		},
	}),
];

/**
 * Tools that act as one mailbox. In account mode they take a mailbox_id; in
 * mailbox mode (authenticated with the mailbox password) they act on "me" and
 * use shorter names.
 */
export function mailboxAccessTools(mode: "account" | "mailbox"): AnyTool[] {
	const account = mode === "account";
	// Typed as always present; in mailbox mode the field is omitted and "me" is used.
	const target = (
		account ? { mailbox_id: z.string().describe("Mailbox ID from list_mailboxes") } : {}
	) as { mailbox_id: z.ZodString };
	const idOf = (args: { mailbox_id: string }) =>
		encodePath(account ? args.mailbox_id : "me");
	const name = (accountName: string, mailboxName: string) =>
		account ? accountName : mailboxName;
	const subject = account ? "the mailbox" : "your mailbox";

	const getMailbox = (api: InboundClient, id: string) =>
		api.get<Mailbox>(`/mailboxes/${id}`);

	function senderFor(mailbox: Mailbox, fromAddress?: string): string {
		const address =
			fromAddress?.trim().toLowerCase() ?? mailbox.sendingAddress ?? mailbox.loginAddress;
		if (mailbox.sendingMode === "identity" && address !== mailbox.sendingAddress) {
			throw new ToolInputError(`This mailbox can only send as ${mailbox.sendingAddress}`);
		}
		if (
			mailbox.sendingMode === "scoped_domains" &&
			!mailbox.allowedSendingDomains.includes(address.slice(address.lastIndexOf("@") + 1))
		) {
			throw new ToolInputError(
				`This mailbox can send from: ${mailbox.allowedSendingDomains.join(", ")}`,
			);
		}
		return mailbox.sendingName ? `${mailbox.sendingName} <${address}>` : address;
	}

	return [
		tool({
			name: name("get_mailbox", "whoami"),
			title: account ? "Get mailbox" : "Who am I",
			description: `Get ${subject}'s address, sending identity, access mode, scopes and unread count.`,
			readOnly: true,
			input: target,
			run: (args, { api }) => getMailbox(api, idOf(args)),
		}),
		tool({
			name: name("list_mailbox_messages", "list_messages"),
			title: account ? "List mailbox messages" : "List messages",
			description: `Check ${subject}: list messages in a folder, newest first. Use read${account ? "_mailbox" : ""}_message for the full body.`,
			readOnly: true,
			input: {
				...target,
				folder: z
					.enum(["inbox", "archive", "sent"])
					.optional()
					.describe("inbox (default), archive or sent"),
				unread_only: z.boolean().optional(),
				search: z.string().optional().describe("Match subject or sender"),
				...pagination,
			},
			run: (args, { api }) =>
				api.get(`/mailboxes/${idOf(args)}/messages`, {
					folder: args.folder,
					unread: args.unread_only ? "true" : undefined,
					search: args.search,
					limit: args.limit,
					offset: args.offset,
				}),
		}),
		tool({
			name: name("read_mailbox_message", "read_message"),
			title: account ? "Read mailbox message" : "Read message",
			description:
				"Read one message with its full text and HTML body and attachment list. Marks a received message as read unless mark_as_read is false.",
			input: {
				...target,
				message_id: z.string(),
				mark_as_read: z.boolean().optional().describe("Default true"),
			},
			run: async (args, { api }) => {
				const path = `/mailboxes/${idOf(args)}/messages/${encodePath(args.message_id)}`;
				const message = await api.get<MessageDetail>(path);
				if (args.mark_as_read !== false && message.folder !== "sent" && !message.isRead) {
					try {
						await api.patch(path, { isRead: true });
						message.isRead = true;
					} catch {
						// Read-only mailboxes can't change flags; still return the message.
					}
				}
				return message;
			},
		}),
		tool({
			name: name("update_mailbox_message", "update_message"),
			title: account ? "Mark mailbox message" : "Mark message",
			description: "Mark a received message read/unread or archive/unarchive it.",
			idempotent: true,
			input: {
				...target,
				message_id: z.string(),
				is_read: z.boolean().optional(),
				is_archived: z.boolean().optional(),
			},
			run: (args, { api }) =>
				api.patch(
					`/mailboxes/${idOf(args)}/messages/${encodePath(args.message_id)}`,
					compact({ isRead: args.is_read, isArchived: args.is_archived }),
				),
		}),
		tool({
			name: name("get_mailbox_thread", "get_thread"),
			title: account ? "Get mailbox thread" : "Get thread",
			description: "Get a whole conversation (the threadId of a message), oldest first.",
			readOnly: true,
			input: { ...target, thread_id: z.string() },
			run: (args, { api }) =>
				api.get(`/mailboxes/${idOf(args)}/threads/${encodePath(args.thread_id)}`),
		}),
		tool({
			name: name("send_from_mailbox", "send_email"),
			title: account ? "Send from mailbox" : "Send email",
			description: `Send a new email as ${subject}'s identity.`,
			input: {
				...target,
				to: addressList,
				subject: z.string(),
				text: z.string().optional(),
				html: z.string().optional(),
				cc: addressList.optional(),
				bcc: addressList.optional(),
				reply_to: addressList.optional(),
				attachments: attachmentsInput,
				scheduled_at: z
					.string()
					.optional()
					.describe('ISO 8601 or natural language like "tomorrow at 9am"'),
				from_address: z
					.string()
					.optional()
					.describe("Only for mailboxes allowed to send as any address on their domains"),
			},
			run: async (args, { api }) => {
				if (!args.text && !args.html) throw new ToolInputError("Provide text or html");
				const mailbox = await getMailbox(api, idOf(args));
				return api.post(
					"/emails",
					compact({
						from: senderFor(mailbox, args.from_address),
						to: args.to,
						subject: args.subject,
						text: args.text,
						html: args.html,
						cc: args.cc,
						bcc: args.bcc,
						reply_to: args.reply_to,
						attachments: args.attachments,
						scheduled_at: args.scheduled_at,
					}),
				);
			},
		}),
		tool({
			name: name("reply_from_mailbox", "reply"),
			title: account ? "Reply from mailbox" : "Reply",
			description: `Reply to a received message as ${subject}'s identity, keeping the conversation threaded.`,
			input: {
				...target,
				message_id: z.string().describe("A received message ID"),
				text: z.string().optional(),
				html: z.string().optional(),
				reply_all: z.boolean().optional(),
				attachments: attachmentsInput,
				from_address: z
					.string()
					.optional()
					.describe("Only for mailboxes allowed to send as any address on their domains"),
			},
			run: async (args, { api }) => {
				if (!args.text && !args.html) throw new ToolInputError("Provide text or html");
				const id = idOf(args);
				const [mailbox, message] = await Promise.all([
					getMailbox(api, id),
					api.get<MessageDetail>(`/mailboxes/${id}/messages/${encodePath(args.message_id)}`),
				]);
				if (message.folder === "sent") {
					throw new ToolInputError("That is a sent message; reply to a received message instead");
				}
				return api.post(
					`/emails/${encodePath(message.id)}/reply`,
					compact({
						from: senderFor(mailbox, args.from_address),
						text: args.text,
						html: args.html,
						reply_all: args.reply_all,
						attachments: args.attachments,
					}),
				);
			},
		}),
		tool({
			name: name("download_mailbox_attachment", "download_attachment"),
			title: "Download attachment",
			description:
				"Download an attachment of a received message by index (from the message's attachments list).",
			readOnly: true,
			input: { ...target, message_id: z.string(), index: z.number().int().min(0) },
			run: async (args, { api }) =>
				attachmentContent(
					await api.binary(
						`/mailboxes/${idOf(args)}/messages/${encodePath(args.message_id)}/attachments/${args.index}`,
					),
					`inbound://mailboxes/${idOf(args)}/messages/${args.message_id}/attachments/${args.index}`,
				),
		}),
	];
}
