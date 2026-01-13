import { z } from "zod";
import type { InferSchema, ToolMetadata } from "xmcp";
import { getClientContext } from "../../lib/client";

export const schema = {
	type: z
		.enum(["webhook", "email", "email_group"])
		.optional()
		.describe("Filter by endpoint type"),
	active: z
		.boolean()
		.optional()
		.describe("Filter by active status"),
	limit: z
		.number()
		.min(1)
		.max(100)
		.optional()
		.describe("Maximum number of endpoints to return (1-100, default 50)"),
	offset: z
		.number()
		.min(0)
		.optional()
		.describe("Number of endpoints to skip for pagination"),
	search: z
		.string()
		.optional()
		.describe("Search by endpoint name"),
};

export const metadata: ToolMetadata = {
	name: "list_endpoints",
	description:
		"List all endpoints for receiving emails. Endpoints can be webhooks (HTTP delivery), email forwards, or email groups.",
	annotations: {
		title: "List Endpoints",
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
	},
};

export default async function listEndpoints({
	type,
	active,
	limit,
	offset,
	search,
}: InferSchema<typeof schema>) {
	const { client } = getClientContext();

	const response = await client.endpoints.list({
		type,
		active: active !== undefined ? (active ? "true" : "false") : undefined,
		limit: limit ?? 50,
		offset: offset ?? 0,
		search,
	});

	const endpoints = response.data.map((e) => ({
		id: e.id,
		name: e.name,
		type: e.type,
		isActive: e.isActive,
		config: e.config,
		deliveryStats: e.deliveryStats,
		createdAt: e.createdAt,
	}));

	return JSON.stringify(
		{
			endpoints,
			pagination: response.pagination,
		},
		null,
		2,
	);
}
