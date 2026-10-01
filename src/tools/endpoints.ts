import { z } from "zod";
import { encodePath } from "../client.js";
import { compact, pagination, ToolInputError, tool } from "../tool.js";

const configFields = {
	url: z.string().optional().describe("webhook: URL that receives each email as a JSON POST"),
	timeout: z.number().int().min(1).max(300).optional().describe("webhook: seconds (default 30)"),
	retry_attempts: z.number().int().min(0).max(10).optional().describe("webhook: retries on failure (default 3)"),
	headers: z.record(z.string(), z.string()).optional().describe("webhook: extra request headers"),
	forward_to: z.string().optional().describe("email: address to forward mail to"),
	emails: z.array(z.string()).optional().describe("email_group: addresses to forward mail to"),
	include_attachments: z.boolean().optional().describe("email/email_group"),
	subject_prefix: z.string().optional().describe("email/email_group: e.g. [Support]"),
	from_address: z.string().optional().describe("email/email_group: sender for forwarded mail"),
	sender_name: z.string().optional().describe("email/email_group"),
	preserve_headers: z.boolean().optional().describe("email/email_group"),
};

type ConfigArgs = { [K in keyof typeof configFields]?: z.infer<(typeof configFields)[K]> };
type EndpointType = "webhook" | "email" | "email_group";

function buildConfig(
	type: EndpointType,
	args: ConfigArgs,
	existing: Record<string, unknown> = {},
): Record<string, unknown> {
	if (type === "webhook") {
		const config = {
			...existing,
			...compact({
				url: args.url,
				timeout: args.timeout,
				retryAttempts: args.retry_attempts,
				headers: args.headers,
			}),
		};
		if (!config.url) throw new ToolInputError("url is required for a webhook endpoint");
		return config;
	}
	const forwarding = compact({
		includeAttachments: args.include_attachments,
		subjectPrefix: args.subject_prefix,
		fromAddress: args.from_address,
		senderName: args.sender_name,
		preserveHeaders: args.preserve_headers,
	});
	if (type === "email") {
		const config = { ...existing, ...forwarding, ...compact({ forwardTo: args.forward_to }) };
		if (!config.forwardTo) throw new ToolInputError("forward_to is required for an email endpoint");
		return config;
	}
	const config = { ...existing, ...forwarding, ...compact({ emails: args.emails }) };
	if (!Array.isArray(config.emails) || config.emails.length === 0) {
		throw new ToolInputError("emails is required for an email_group endpoint");
	}
	return config;
}

function hasConfigChange(args: ConfigArgs): boolean {
	return Object.keys(configFields).some(
		(key) => args[key as keyof ConfigArgs] !== undefined,
	);
}

export const endpointTools = [
	tool({
		name: "list_endpoints",
		title: "List endpoints",
		description:
			"List endpoints: webhooks, email forwards and email groups that received mail is delivered to, with delivery stats.",
		readOnly: true,
		input: {
			type: z.enum(["webhook", "email", "email_group"]).optional(),
			active: z.boolean().optional(),
			search: z.string().optional(),
			sort: z.enum(["newest", "oldest"]).optional(),
			...pagination,
		},
		run: (args, { api }) =>
			api.get("/endpoints", {
				type: args.type,
				active: args.active,
				search: args.search,
				sortBy: args.sort,
				limit: args.limit,
				offset: args.offset,
			}),
	}),
	tool({
		name: "get_endpoint",
		title: "Get endpoint",
		description: "Get an endpoint's configuration, linked addresses and recent deliveries.",
		readOnly: true,
		input: { endpoint_id: z.string() },
		run: (args, { api }) => api.get(`/endpoints/${encodePath(args.endpoint_id)}`),
	}),
	tool({
		name: "create_endpoint",
		title: "Create endpoint",
		description:
			"Create where received mail goes. webhook: POSTs each email as JSON to url. email: forwards to forward_to. email_group: forwards to every address in emails. Link it to an address with create_email_address or to a domain with update_domain (catch-all).",
		input: {
			name: z.string(),
			type: z.enum(["webhook", "email", "email_group"]),
			description: z.string().optional(),
			...configFields,
		},
		run: (args, { api }) =>
			api.post("/endpoints", {
				name: args.name,
				type: args.type,
				description: args.description,
				config: buildConfig(args.type, args),
			}),
	}),
	tool({
		name: "update_endpoint",
		title: "Update endpoint",
		description:
			"Rename, describe, activate/deactivate an endpoint or change its configuration. Only the fields you pass change.",
		idempotent: true,
		input: {
			endpoint_id: z.string(),
			name: z.string().optional(),
			description: z.string().optional(),
			is_active: z.boolean().optional(),
			webhook_format: z.enum(["inbound", "discord", "slack"]).optional(),
			...configFields,
		},
		run: async (args, { api }) => {
			const path = `/endpoints/${encodePath(args.endpoint_id)}`;
			let config: Record<string, unknown> | undefined;
			if (hasConfigChange(args)) {
				const current = await api.get<{ type: EndpointType; config?: Record<string, unknown> }>(path);
				config = buildConfig(current.type, args, current.config ?? {});
			}
			return api.put(
				path,
				compact({
					name: args.name,
					description: args.description,
					isActive: args.is_active,
					webhookFormat: args.webhook_format,
					config,
				}),
			);
		},
	}),
	tool({
		name: "delete_endpoint",
		title: "Delete endpoint",
		description: "Delete an endpoint. Addresses routed to it stop delivering. Cannot be undone.",
		destructive: true,
		input: { endpoint_id: z.string() },
		run: (args, { api }) => api.delete(`/endpoints/${encodePath(args.endpoint_id)}`),
	}),
	tool({
		name: "test_endpoint",
		title: "Test endpoint",
		description: "Send a sample email payload to an endpoint and report the response.",
		input: {
			endpoint_id: z.string(),
			webhook_format: z.enum(["inbound", "discord", "slack"]).optional(),
			override_url: z.string().optional().describe("Send the test to this URL instead"),
		},
		run: (args, { api }) =>
			api.post(
				`/endpoints/${encodePath(args.endpoint_id)}/test`,
				compact({ webhookFormat: args.webhook_format, overrideUrl: args.override_url }),
			),
	}),
];
