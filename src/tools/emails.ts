import { z } from "zod";
import { encodePath } from "../client.js";
import {
	addressList,
	attachmentsInput,
	compact,
	tagsInput,
	tool,
} from "../tool.js";
import { attachmentContent } from "./attachment-content.js";

const body = {
	text: z.string().optional().describe("Plain-text body"),
	html: z.string().optional().describe("HTML body"),
};

export const emailTools = [
	tool({
		name: "list_emails",
		title: "List emails",
		description:
			"List sent, received and scheduled emails across the account, newest first, with filters.",
		readOnly: true,
		input: {
			type: z.enum(["all", "sent", "received", "scheduled"]).optional(),
			status: z
				.enum([
					"all",
					"delivered",
					"pending",
					"failed",
					"bounced",
					"scheduled",
					"cancelled",
					"paused",
					"unread",
					"read",
					"archived",
				])
				.optional(),
			time_range: z.enum(["1h", "24h", "7d", "30d", "90d", "all"]).optional(),
			search: z.string().optional().describe("Match subject, sender or recipients"),
			domain: z.string().optional().describe("Domain name or ID"),
			address: z.string().optional().describe("Email address or address ID"),
			limit: z.number().int().min(1).max(100).optional(),
			offset: z.number().int().min(0).optional(),
		},
		run: (args, { api }) => api.get("/emails", args),
	}),
	tool({
		name: "get_email",
		title: "Get email",
		description:
			"Get one sent, received or scheduled email with full text and HTML bodies, headers, attachments and delivery status.",
		readOnly: true,
		input: { email_id: z.string() },
		run: (args, { api }) => api.get(`/emails/${encodePath(args.email_id)}`),
	}),
	tool({
		name: "send_email",
		title: "Send email",
		description:
			"Send an email now, or schedule it with scheduled_at. from must be on a verified domain, e.g. \"Support <support@example.com>\".",
		input: {
			from: z.string(),
			to: addressList,
			subject: z.string(),
			...body,
			cc: addressList.optional(),
			bcc: addressList.optional(),
			reply_to: addressList.optional(),
			headers: z.record(z.string(), z.string()).optional().describe("Custom headers"),
			attachments: attachmentsInput,
			tags: tagsInput,
			scheduled_at: z
				.string()
				.optional()
				.describe('ISO 8601 time or natural language like "in 2 hours" / "tomorrow at 9am"'),
			timezone: z.string().optional().describe("IANA timezone for natural-language scheduled_at"),
			idempotency_key: z.string().optional().describe("Prevents duplicate sends on retry"),
		},
		run: ({ idempotency_key, ...args }, { api }) =>
			api.post(
				"/emails",
				compact(args),
				idempotency_key ? { "Idempotency-Key": idempotency_key } : undefined,
			),
	}),
	tool({
		name: "reply_to_email",
		title: "Reply to email",
		description:
			"Reply to a received email (or the latest message of a thread by thread ID), keeping it threaded. from must be on a verified domain.",
		input: {
			email_id: z.string().describe("Received email ID or thread ID"),
			from: z.string(),
			...body,
			to: addressList.optional().describe("Override recipients (default: the original sender)"),
			subject: z.string().optional().describe('Default: "Re: <original subject>"'),
			reply_all: z.boolean().optional(),
			headers: z.record(z.string(), z.string()).optional(),
			attachments: attachmentsInput,
			tags: tagsInput,
			idempotency_key: z.string().optional(),
		},
		run: ({ email_id, idempotency_key, ...args }, { api }) =>
			api.post(
				`/emails/${encodePath(email_id)}/reply`,
				compact(args),
				idempotency_key ? { "Idempotency-Key": idempotency_key } : undefined,
			),
	}),
	tool({
		name: "update_email",
		title: "Mark email read or archived",
		description: "Mark a received email read/unread or archived/unarchived.",
		idempotent: true,
		input: {
			email_id: z.string(),
			is_read: z.boolean().optional(),
			is_archived: z.boolean().optional(),
		},
		run: ({ email_id, ...args }, { api }) =>
			api.patch(`/emails/${encodePath(email_id)}`, compact(args)),
	}),
	tool({
		name: "cancel_scheduled_email",
		title: "Cancel scheduled email",
		description: "Cancel a scheduled email so it is never sent.",
		destructive: true,
		input: { email_id: z.string() },
		run: (args, { api }) => api.delete(`/emails/${encodePath(args.email_id)}`),
	}),
	tool({
		name: "pause_scheduled_email",
		title: "Pause scheduled email",
		description: "Pause a scheduled email; resume it later with resume_scheduled_email.",
		idempotent: true,
		input: { email_id: z.string() },
		run: (args, { api }) => api.post(`/emails/${encodePath(args.email_id)}/pause`),
	}),
	tool({
		name: "resume_scheduled_email",
		title: "Resume scheduled email",
		description: "Resume a paused scheduled email.",
		idempotent: true,
		input: { email_id: z.string() },
		run: (args, { api }) => api.post(`/emails/${encodePath(args.email_id)}/resume`),
	}),
	tool({
		name: "retry_email_delivery",
		title: "Retry delivery",
		description:
			"Redeliver a received email to its endpoint(s), e.g. after fixing a failing webhook. Optionally target one endpoint or delivery.",
		input: {
			email_id: z.string(),
			endpoint_id: z.string().optional(),
			delivery_id: z.string().optional(),
		},
		run: ({ email_id, ...args }, { api }) =>
			api.post(`/emails/${encodePath(email_id)}/retry`, compact(args)),
	}),
	tool({
		name: "list_threads",
		title: "List threads",
		description:
			"List conversations (received and sent messages grouped by thread), most recent first, with a preview of the latest message.",
		readOnly: true,
		input: {
			domain: z.string().optional().describe("Domain name or ID"),
			address: z.string().optional().describe("Participant address or address ID"),
			search: z.string().optional(),
			unread_only: z.boolean().optional(),
			limit: z.number().int().min(1).max(100).optional(),
			cursor: z.string().optional().describe("pagination.next_cursor from the previous page"),
		},
		run: (args, { api }) =>
			api.get("/mail/threads", {
				domain: args.domain,
				address: args.address,
				search: args.search,
				unread: args.unread_only ? "true" : undefined,
				limit: args.limit,
				cursor: args.cursor,
			}),
	}),
	tool({
		name: "get_thread",
		title: "Get thread",
		description: "Get every message in a conversation, oldest first, with bodies.",
		readOnly: true,
		input: { thread_id: z.string() },
		run: (args, { api }) => api.get(`/mail/threads/${encodePath(args.thread_id)}`),
	}),
	tool({
		name: "list_attachments",
		title: "List attachments",
		description: "List a received email's attachments with their index, name, type and size.",
		readOnly: true,
		input: { email_id: z.string() },
		run: (args, { api }) => api.get(`/attachments/${encodePath(args.email_id)}`),
	}),
	tool({
		name: "download_attachment",
		title: "Download attachment",
		description:
			"Download one attachment of a received email by index (from list_attachments). Text is returned inline, images as images, other files as embedded base64 resources (max 10 MB).",
		readOnly: true,
		input: {
			email_id: z.string(),
			index: z.number().int().min(0),
		},
		run: async (args, { api }) =>
			attachmentContent(
				await api.binary(
					`/attachments/${encodePath(args.email_id)}/parts/${args.index}`,
				),
				`inbound://emails/${args.email_id}/attachments/${args.index}`,
			),
	}),
];
