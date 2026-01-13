import { z } from "zod";
import type { InferSchema, ToolMetadata } from "xmcp";
import { getMailboxContext } from "../../lib/client";

export const schema = {
	to: z
		.union([z.string(), z.array(z.string())])
		.describe("Recipient email address(es)"),
	subject: z.string().describe("Email subject line"),
	html: z.string().optional().describe("HTML content of the email"),
	text: z.string().optional().describe("Plain text content of the email"),
	cc: z
		.union([z.string(), z.array(z.string())])
		.optional()
		.describe("CC recipient email address(es)"),
	bcc: z
		.union([z.string(), z.array(z.string())])
		.optional()
		.describe("BCC recipient email address(es)"),
	scheduled_at: z
		.string()
		.optional()
		.describe(
			"ISO 8601 date or natural language time to schedule email (e.g., 'tomorrow at 9am')",
		),
	timezone: z
		.string()
		.optional()
		.describe(
			"Timezone for natural language scheduling (e.g., 'America/New_York')",
		),
};

export const metadata: ToolMetadata = {
	name: "send_from_mailbox",
	description:
		"Send an email from your agent mailbox. The 'from' address is automatically set to your mailbox address (x-inbound-mailbox header). Supports HTML/text content, CC/BCC, and scheduled sending.",
	annotations: {
		title: "Send from Mailbox",
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
	},
};

export default async function sendFromMailbox({
	to,
	subject,
	html,
	text,
	cc,
	bcc,
	scheduled_at,
	timezone,
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
	const response = await client.emails.send({
		from: mailbox,
		to,
		subject,
		html,
		text,
		cc,
		bcc,
		scheduled_at,
		timezone,
	});

	return JSON.stringify(
		{
			id: response.id,
			message_id: response.message_id,
			from: mailbox,
			from_address: mailboxAddress,
			to,
			subject,
			message: scheduled_at
				? "Email scheduled successfully"
				: "Email sent successfully",
		},
		null,
		2,
	);
}
