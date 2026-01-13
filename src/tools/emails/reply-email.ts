import { z } from "zod";
import type { InferSchema, ToolMetadata } from "xmcp";
import { getClientContext, validateDomainAccess } from "../../lib/client";

export const schema = {
	id: z
		.string()
		.describe(
			"Email ID or Thread ID to reply to. If thread ID, replies to the latest message in the thread.",
		),
	from: z
		.string()
		.describe("Sender email address (must be from a verified domain)"),
	to: z
		.union([z.string(), z.array(z.string())])
		.optional()
		.describe(
			"Recipient email address(es) - defaults to original sender if not specified",
		),
	subject: z
		.string()
		.optional()
		.describe("Email subject - defaults to 'Re: original subject'"),
	html: z.string().optional().describe("HTML content of the reply"),
	text: z.string().optional().describe("Plain text content of the reply"),
	reply_all: z
		.boolean()
		.optional()
		.describe("Include original CC recipients in the reply"),
};

export const metadata: ToolMetadata = {
	name: "reply_email",
	description:
		"Reply to an email or thread. Accepts either an email ID or thread ID (replies to latest message in thread). Supports reply-all functionality to include original CC recipients.",
	annotations: {
		title: "Reply to Email",
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
	},
};

export default async function replyEmail({
	id,
	from,
	to,
	subject,
	html,
	text,
	reply_all,
}: InferSchema<typeof schema>) {
	const { client, domain } = getClientContext();

	try {
		validateDomainAccess(from, domain);
	} catch (error) {
		return JSON.stringify({
			error:
				error instanceof Error
					? error.message
					: "Domain access validation failed",
		});
	}

	if (!html && !text) {
		return JSON.stringify({
			error: "Either 'html' or 'text' content is required",
		});
	}

	const response = await client.emails.reply(id, {
		from,
		to,
		subject,
		html,
		text,
		reply_all,
	});

	return JSON.stringify(
		{
			id: response.id,
			message_id: response.message_id,
			replied_to_email_id: response.replied_to_email_id,
			is_thread_reply: response.is_thread_reply,
			replied_to_thread_id: response.replied_to_thread_id,
			message: "Reply sent successfully",
		},
		null,
		2,
	);
}
