import { z } from "zod";
import { encodePath } from "../client.js";
import { compact, pagination, ToolInputError, tool } from "../tool.js";

const matcher = (what: string) =>
	z
		.object({
			operator: z.enum(["OR", "AND"]).describe("OR: any value matches; AND: all must match"),
			values: z.array(z.string()).min(1).describe(what),
		})
		.optional();

const ruleFields = {
	subject: matcher("Case-insensitive substrings of the subject"),
	from: matcher("Sender addresses or whole domains like *@example.com"),
	to: matcher("Recipient addresses or whole domains like *@example.com"),
	has_words: matcher("Case-insensitive substrings of the body"),
	has_attachment: z.boolean().optional(),
	prompt: z
		.string()
		.optional()
		.describe("ai_prompt rules: natural-language description of what to match"),
	action: z
		.enum(["allow", "block", "route"])
		.optional()
		.describe("What happens to matching mail (route needs route_endpoint_id)"),
	route_endpoint_id: z.string().optional(),
	priority: z.number().int().optional().describe("Lower runs first"),
	description: z.string().optional(),
};

type RuleArgs = {
	subject?: { operator: "OR" | "AND"; values: string[] };
	from?: { operator: "OR" | "AND"; values: string[] };
	to?: { operator: "OR" | "AND"; values: string[] };
	has_words?: { operator: "OR" | "AND"; values: string[] };
	has_attachment?: boolean;
	prompt?: string;
	action?: "allow" | "block" | "route";
	route_endpoint_id?: string;
};

function ruleConfig(type: "explicit" | "ai_prompt", args: RuleArgs) {
	if (type === "ai_prompt") {
		if (!args.prompt) throw new ToolInputError("prompt is required for an ai_prompt rule");
		return { prompt: args.prompt };
	}
	const config = compact({
		subject: args.subject,
		from: args.from,
		to: args.to,
		hasWords: args.has_words,
		hasAttachment: args.has_attachment,
	});
	return Object.keys(config).length ? config : undefined;
}

function ruleAction(args: RuleArgs) {
	if (!args.action) return undefined;
	if (args.action === "route") {
		if (!args.route_endpoint_id) {
			throw new ToolInputError("route_endpoint_id is required when action is route");
		}
		return { action: "route", endpointId: args.route_endpoint_id };
	}
	return { action: args.action };
}

export const guardTools = [
	tool({
		name: "list_guard_rules",
		title: "List Guard rules",
		description:
			"List Guard rules, which allow, block or route incoming mail by sender, subject, body or an AI prompt.",
		readOnly: true,
		input: {
			search: z.string().optional(),
			type: z.enum(["explicit", "ai_prompt"]).optional(),
			is_active: z.boolean().optional(),
			...pagination,
		},
		run: (args, { api }) =>
			api.get("/guard", {
				search: args.search,
				type: args.type,
				isActive: args.is_active,
				limit: args.limit,
				offset: args.offset,
			}),
	}),
	tool({
		name: "get_guard_rule",
		title: "Get Guard rule",
		description: "Get one Guard rule with its configuration and match stats.",
		readOnly: true,
		input: { rule_id: z.string() },
		run: (args, { api }) => api.get(`/guard/${encodePath(args.rule_id)}`),
	}),
	tool({
		name: "create_guard_rule",
		title: "Create Guard rule",
		description:
			"Create a Guard rule. explicit rules match subject/from/to/has_words/has_attachment; ai_prompt rules match a natural-language prompt. Use generate_guard_rule to draft one from a description.",
		input: {
			name: z.string(),
			type: z.enum(["explicit", "ai_prompt"]),
			...ruleFields,
		},
		run: (args, { api }) => {
			const config = ruleConfig(args.type, args);
			if (!config) throw new ToolInputError("Give at least one condition for an explicit rule");
			return api.post(
				"/guard",
				compact({
					name: args.name,
					type: args.type,
					description: args.description,
					priority: args.priority,
					config,
					action: ruleAction(args),
				}),
			);
		},
	}),
	tool({
		name: "update_guard_rule",
		title: "Update Guard rule",
		description:
			"Update a Guard rule. Conditions you pass replace the rule's conditions; omitted fields stay unchanged.",
		idempotent: true,
		input: {
			rule_id: z.string(),
			name: z.string().optional(),
			is_active: z.boolean().optional(),
			...ruleFields,
		},
		run: async (args, { api }) => {
			const path = `/guard/${encodePath(args.rule_id)}`;
			const hasConditions =
				args.prompt !== undefined ||
				[args.subject, args.from, args.to, args.has_words, args.has_attachment].some(
					(value) => value !== undefined,
				);
			let config: Record<string, unknown> | undefined;
			if (hasConditions) {
				const current = await api.get<{ type?: "explicit" | "ai_prompt"; data?: { type?: string } }>(path);
				const type = (current.type ?? current.data?.type ?? "explicit") as "explicit" | "ai_prompt";
				config = ruleConfig(type, args);
			}
			return api.put(
				path,
				compact({
					name: args.name,
					description: args.description,
					isActive: args.is_active,
					priority: args.priority,
					config,
					action: ruleAction(args),
				}),
			);
		},
	}),
	tool({
		name: "delete_guard_rule",
		title: "Delete Guard rule",
		description: "Delete a Guard rule. Cannot be undone.",
		destructive: true,
		input: { rule_id: z.string() },
		run: (args, { api }) => api.delete(`/guard/${encodePath(args.rule_id)}`),
	}),
	tool({
		name: "check_guard_rule",
		title: "Test Guard rule",
		description: "Check whether a Guard rule matches an existing received email.",
		readOnly: true,
		input: { rule_id: z.string(), email_id: z.string() },
		run: (args, { api }) =>
			api.post(`/guard/${encodePath(args.rule_id)}/check`, {
				structuredEmailId: args.email_id,
			}),
	}),
	tool({
		name: "generate_guard_rule",
		title: "Draft Guard rule",
		description:
			"Draft a Guard rule configuration from a plain-language description, without saving it.",
		readOnly: true,
		input: { prompt: z.string().describe('e.g. "block cold sales outreach"') },
		run: (args, { api }) => api.post("/guard/generate", { prompt: args.prompt }),
	}),
];
