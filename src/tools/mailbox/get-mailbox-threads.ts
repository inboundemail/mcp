import { z } from "zod";
import type { InferSchema, ToolMetadata } from "xmcp";
import { getMailboxContext } from "../../lib/client";

export const schema = {
	unread: z
		.boolean()
		.optional()
		.describe("Only return threads with unread messages"),
	limit: z
		.number()
		.min(1)
		.max(100)
		.optional()
		.describe("Maximum number of threads to return (1-100, default 25)"),
	cursor: z
		.string()
		.optional()
		.describe("Cursor for pagination (pass next_cursor from previous response)"),
};

export const metadata: ToolMetadata = {
	name: "get_mailbox_threads",
	description:
		"Get email threads/conversations for your agent mailbox. Shows conversations where your mailbox is a participant. Threads group related emails together like Gmail conversations.",
	annotations: {
		title: "Get Mailbox Threads",
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
	},
};

export default async function getMailboxThreads({
	unread,
	limit,
	cursor,
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

	const response = await client.mail.list({
		unread: unread ? "true" : undefined,
		limit: String(limit ?? 25),
		cursor,
		address: mailboxAddress, // Filter to threads involving this mailbox
	});

	const threads = response.threads.map((t) => ({
		id: t.id,
		subject: t.normalized_subject,
		preview: t.latest_message?.text_preview,
		message_count: t.message_count,
		unread_count: t.unread_count,
		has_unread: t.has_unread,
		participant_emails: t.participant_emails,
		participant_names: t.participant_names,
		last_message_at: t.last_message_at,
		created_at: t.created_at,
	}));

	return JSON.stringify(
		{
			mailbox,
			mailbox_address: mailboxAddress,
			threads,
			count: threads.length,
			pagination: response.pagination,
		},
		null,
		2,
	);
}
