import { z } from "zod";
import type { InferSchema, ToolMetadata } from "xmcp";
import { getMailboxContext } from "../../lib/client";

export const schema = {
	status: z
		.enum(["all", "unread", "read", "archived"])
		.optional()
		.describe("Filter by email status (default: 'unread')"),
	limit: z
		.number()
		.min(1)
		.max(100)
		.optional()
		.describe("Maximum number of emails to return (1-100, default 25)"),
	offset: z
		.number()
		.min(0)
		.optional()
		.describe("Number of emails to skip for pagination"),
	time_range: z
		.enum(["1h", "24h", "7d", "30d", "90d", "all"])
		.optional()
		.describe("Filter by time range (default: '7d')"),
};

export const metadata: ToolMetadata = {
	name: "check_mailbox",
	description:
		"Check your agent mailbox for incoming emails. Requires the x-inbound-mailbox header to be set. Returns emails sent TO your mailbox address, with unread emails shown first by default.",
	annotations: {
		title: "Check Mailbox",
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
	},
};

export default async function checkMailbox({
	status,
	limit,
	offset,
	time_range,
}: InferSchema<typeof schema>) {
	let context;
	try {
		context = getMailboxContext();
	} catch (error) {
		return JSON.stringify({
			error:
				error instanceof Error
					? error.message
					: "Failed to get mailbox context",
		});
	}

	const { client, mailbox, mailboxAddress } = context;

	const response = await client.emails.list({
		type: "received",
		status: status ?? "unread",
		limit: String(limit ?? 25),
		offset: String(offset ?? 0),
		time_range: time_range ?? "7d",
		address: mailboxAddress, // Filter to emails for this mailbox address
	});

	const emails = response.data.map((e) => ({
		id: e.id,
		from: e.from,
		from_name: e.from_name,
		subject: e.subject,
		preview: e.preview,
		status: e.status,
		is_read: e.is_read,
		created_at: e.created_at,
		has_attachments: e.has_attachments,
		thread_id: e.thread_id,
	}));

	return JSON.stringify(
		{
			mailbox,
			mailbox_address: mailboxAddress,
			emails,
			count: emails.length,
			pagination: response.pagination,
		},
		null,
		2,
	);
}
