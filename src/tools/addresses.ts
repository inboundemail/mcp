import { z } from "zod";
import { encodePath } from "../client.js";
import { compact, pagination, tool } from "../tool.js";

export const addressTools = [
	tool({
		name: "list_email_addresses",
		title: "List email addresses",
		description:
			"List configured receiving addresses (e.g. support@example.com) and the endpoint each one routes to.",
		readOnly: true,
		input: {
			domain_id: z.string().optional(),
			is_active: z.boolean().optional(),
			...pagination,
		},
		run: (args, { api }) =>
			api.get("/email-addresses", {
				domainId: args.domain_id,
				isActive: args.is_active,
				limit: args.limit,
				offset: args.offset,
			}),
	}),
	tool({
		name: "get_email_address",
		title: "Get email address",
		description: "Get one receiving address with its routing.",
		readOnly: true,
		input: { address_id: z.string() },
		run: (args, { api }) => api.get(`/email-addresses/${encodePath(args.address_id)}`),
	}),
	tool({
		name: "create_email_address",
		title: "Create email address",
		description:
			"Create a receiving address on a verified domain and optionally route it to an endpoint. Mail to addresses without a route is still stored and readable.",
		input: {
			address: z.string().describe("Full address, e.g. support@example.com"),
			domain_id: z.string(),
			endpoint_id: z.string().optional(),
			is_active: z.boolean().optional(),
		},
		run: (args, { api }) =>
			api.post(
				"/email-addresses",
				compact({
					address: args.address,
					domainId: args.domain_id,
					endpointId: args.endpoint_id,
					isActive: args.is_active,
				}),
			),
	}),
	tool({
		name: "update_email_address",
		title: "Update email address",
		description: "Change an address's endpoint (null removes the route) or activate/deactivate it.",
		idempotent: true,
		input: {
			address_id: z.string(),
			endpoint_id: z.string().nullable().optional(),
			is_active: z.boolean().optional(),
		},
		run: (args, { api }) =>
			api.put(
				`/email-addresses/${encodePath(args.address_id)}`,
				compact({ endpointId: args.endpoint_id, isActive: args.is_active }),
			),
	}),
	tool({
		name: "delete_email_address",
		title: "Delete email address",
		description: "Delete a receiving address. Cannot be undone.",
		destructive: true,
		input: { address_id: z.string() },
		run: (args, { api }) => api.delete(`/email-addresses/${encodePath(args.address_id)}`),
	}),
];
