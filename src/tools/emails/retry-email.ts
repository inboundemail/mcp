import { z } from "zod";
import type { InferSchema, ToolMetadata } from "xmcp";
import { getClientContext } from "../../lib/client";

export const schema = {
	id: z.string().describe("The email ID to retry delivery for"),
	endpoint_id: z
		.string()
		.optional()
		.describe(
			"Endpoint ID to retry delivery to. If not provided, retries to all configured endpoints.",
		),
	delivery_id: z
		.string()
		.optional()
		.describe(
			"Specific delivery ID to retry. If provided, retries that specific delivery.",
		),
};

export const metadata: ToolMetadata = {
	name: "retry_email",
	description:
		"Retry delivery of a received email. Can retry to a specific endpoint, retry a specific failed delivery, or retry to all configured endpoints.",
	annotations: {
		title: "Retry Email Delivery",
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
	},
};

export default async function retryEmail({
	id,
	endpoint_id,
	delivery_id,
}: InferSchema<typeof schema>) {
	const { client } = getClientContext();

	const response = await client.emails.retry(id, {
		endpoint_id,
		delivery_id,
	});

	return JSON.stringify(
		{
			success: response.success,
			message: response.message,
			delivery_id: response.delivery_id,
		},
		null,
		2,
	);
}
