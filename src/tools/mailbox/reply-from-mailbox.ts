import { z } from "zod";
import type { InferSchema, ToolMetadata } from "xmcp";
import { getMailboxContext } from "../../lib/client";

export const schema = {
	id: z
		.string()
		.describe(
			"Email ID or Thread ID to reply to. If thread ID, replies to the latest message.",
		),
	html: z.string().optional().describe("HTML content of the reply"),
	text: z.string().optional().describe("Plain text content of the reply"),
	subject: z
		.string()
		.optional()
		.describe("Email subject - defaults to 'Re: original subject'"),
	reply_all: z
		.boolean()
		.optional()
		.describe("Include original CC recipients in the reply"),
};

export const metadata: ToolMetadata = {
	name: "reply_from_mailbox",
	description:
		"Reply to an email from your agent mailbox. The 'from' address is automatically set to your mailbox address. Can reply to an email ID or thread ID (replies to latest message in thread).",
	annotations: {
		title: "Reply from Mailbox",
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
	},
};

export default async function replyFromMailbox({
	id,
	html,
	text,
	subject,
	reply_all,
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

	if (!html && !text) {
		return JSON.stringify({
			error: "Either 'html' or 'text' content is required",
		});
	}

	// Use full mailbox string (with display name) for the from field
	const response = await client.emails.reply(id, {
		from: mailbox,
		subject,
		html,
		text,
		reply_all,
	});

	return JSON.stringify(
		{
			id: response.id,
			message_id: response.message_id,
			from: mailbox,
			from_address: mailboxAddress,
			replied_to_email_id: response.replied_to_email_id,
			is_thread_reply: response.is_thread_reply,
			replied_to_thread_id: response.replied_to_thread_id,
			message: "Reply sent successfully",
		},
		null,
		2,
	);
}
