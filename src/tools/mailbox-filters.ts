import { z } from "zod";
import { encodePath } from "../client.js";
import { type AnyTool, compact, type Mode, pagination, tool } from "../tool.js";
import { mailboxPathSegment, mailboxStateTarget } from "./mailbox-folders.js";

const filterFields = {
	name: z.string().min(1).max(255),
	enabled: z.boolean().optional().describe("Enabled by default"),
	match: z.enum(["all", "any"]).optional().describe("Match all conditions (default) or any one"),
	conditions: z.array(z.object({
		field: z.enum(["from", "to", "cc", "recipient", "subject", "header", "body", "has_attachment", "size", "junk", "jev"]),
		operator: z.enum(["contains", "not_contains", "equals", "not_equals", "starts_with", "ends_with", "domain_is", "exists", "greater_than", "less_than", "gte"]),
		value: z.union([z.string().max(1024), z.number(), z.boolean()]).optional()
			.describe("Comparison value; optional for exists. Use bytes for size or a level (0–4) for jev."),
		header: z.string().max(255).optional().describe("Header name, required for field 'header'"),
		label: z.enum(["spam", "phishing", "fraud", "impersonation", "malware"]).optional()
			.describe("Classifier category, required for field 'jev'"),
	})).min(1).max(20),
	actions: z.array(z.object({
		type: z.enum(["move_to", "mark_read", "flag", "add_keyword", "mark_junk", "mark_not_junk", "move_to_trash", "stop"]),
		value: z.string().max(1024).optional()
			.describe("Existing folder path for move_to, custom keyword for add_keyword; omit otherwise"),
	})).min(1).max(20),
	stop_processing: z.boolean().optional().describe("Skip later filters on a match (default false)"),
};

const pattern = z.string().min(2).max(255).describe("Exact sender address or @domain, case-insensitive; no subdomain matching");

export function mailboxFilterTools(mode: Mode): AnyTool[] {
	const { target, root } = mailboxStateTarget(mode);
	const filterId = mailboxPathSegment.describe("Filter ID from list_mailbox_filters");
	const filterPath = (args: { mailbox_id: string; filter_id: string }) =>
		`${root(args)}/filters/${encodePath(args.filter_id)}`;
	const entry = { ...target, list: z.enum(["allow", "block"]), pattern };
	const permission = (flag: "filters" | "spam") => mode === "mailbox"
		? ` Requires selfService.${flag} on this mailbox credential; otherwise returns 403.` : "";
	const filters = permission("filters");
	const spam = permission("spam");

	return [
		tool({
			name: "list_mailbox_filters",
			title: "List mailbox filters",
			description: `List filters in the order they run on new received mail for this mailbox.${filters}`,
			readOnly: true,
			input: { ...target, ...pagination },
			run: (args, { api }) => api.get(`${root(args)}/filters`, { limit: args.limit, offset: args.offset }),
		}),
		tool({
			name: "get_mailbox_filter",
			title: "Get mailbox filter",
			description: `Get one filter's conditions, actions, position and enabled state.${filters}`,
			readOnly: true,
			input: { ...target, filter_id: filterId },
			run: (args, { api }) => api.get(filterPath(args)),
		}),
		tool({
			name: "create_mailbox_filter",
			title: "Create mailbox filter",
			description: `Add an ordered filter for newly received mail in this mailbox; drafts and Sent copies are not filtered. Use apply_mailbox_filters for existing mail.${filters}`,
			input: { ...target, ...filterFields },
			run: (args, { api }) => api.post(`${root(args)}/filters`, compact({
				name: args.name,
				enabled: args.enabled,
				match: args.match,
				conditions: args.conditions,
				actions: args.actions,
				stopProcessing: args.stop_processing,
			})),
		}),
		tool({
			name: "update_mailbox_filter",
			title: "Update mailbox filter",
			description: `Change only the supplied fields on a filter. conditions and actions each replace the entire list. Does not re-sort existing mail.${filters}`,
			destructive: true,
			idempotent: true,
			input: {
				...target,
				filter_id: filterId,
				...filterFields,
				name: filterFields.name.optional(),
				conditions: filterFields.conditions.optional(),
				actions: filterFields.actions.optional(),
			},
			run: (args, { api }) => api.patch(filterPath(args), compact({
				name: args.name,
				enabled: args.enabled,
				match: args.match,
				conditions: args.conditions,
				actions: args.actions,
				stopProcessing: args.stop_processing,
			})),
		}),
		tool({
			name: "delete_mailbox_filter",
			title: "Delete mailbox filter",
			description: `Delete a filter. This stops future matches but does not undo previous actions.${filters}`,
			destructive: true,
			idempotent: true,
			input: { ...target, filter_id: filterId },
			run: (args, { api }) => api.delete(filterPath(args)),
		}),
		tool({
			name: "reorder_mailbox_filters",
			title: "Reorder mailbox filters",
			description: `Set execution order for new mail. Supply every filter ID exactly once, including disabled filters.${filters}`,
			idempotent: true,
			input: { ...target, ids: z.array(z.string().min(1).max(255)).max(100) },
			run: (args, { api }) => api.post(`${root(args)}/filters/reorder`, { ids: args.ids }),
		}),
		tool({
			name: "apply_mailbox_filters",
			title: "Apply mailbox filters to existing mail",
			description: `Run enabled filters (or just filter_id) on received mail already in a writable folder. Actions can move or flag mail. If hasMore, continue with after_uid set to lastUid.${filters}`,
			destructive: true,
			input: {
				...target,
				folder: z.string().min(1).max(255),
				after_uid: z.number().int().min(0).optional(),
				limit: z.number().int().min(1).max(500).optional().describe("Maximum messages to examine (default 500)"),
				filter_id: filterId.optional(),
			},
			run: (args, { api }) => {
				const path = args.filter_id === undefined ? `${root(args)}/filters`
					: filterPath({ ...args, filter_id: args.filter_id });
				return api.post(`${path}/apply`, compact({ folder: args.folder, afterUid: args.after_uid, limit: args.limit }));
			},
		}),
		tool({
			name: "get_mailbox_spam_settings",
			title: "Get mailbox spam settings",
			description: `Read this mailbox's junk-filter level, effective level and sender allow/block lists.${spam}`,
			readOnly: true,
			input: target,
			run: (args, { api }) => api.get(`${root(args)}/spam`),
		}),
		tool({
			name: "set_mailbox_spam_settings",
			title: "Replace mailbox spam settings",
			description: `Replace the level and both lists. Use null for the account level and [] to clear a list. Also re-sorts existing INBOX/Junk mail in batches for this mailbox only.${spam}`,
			destructive: true,
			idempotent: true,
			input: {
				...target,
				level: z.enum(["off", "lenient", "standard", "strict"]).nullable(),
				allow: z.array(pattern).max(1000),
				block: z.array(pattern).max(1000),
			},
			run: (args, { api }) => api.put(`${root(args)}/spam`, { level: args.level, allow: args.allow, block: args.block }),
		}),
		tool({
			name: "add_spam_list_entry",
			title: "Add spam list entry",
			description: `Allow a sender or route it to Junk for this mailbox. Adding a pattern removes it from the opposite list; blocking never rejects delivery.${spam}`,
			destructive: true,
			idempotent: true,
			input: entry,
			run: (args, { api }) => api.post(`${root(args)}/spam/${args.list}`, { pattern: args.pattern }),
		}),
		tool({
			name: "remove_spam_list_entry",
			title: "Remove spam list entry",
			description: `Remove one exact pattern from the specified sender list without replacing any other settings.${spam}`,
			destructive: true,
			idempotent: true,
			input: entry,
			run: (args, { api }) => api.request("DELETE", `${root(args)}/spam/${args.list}`, { body: { pattern: args.pattern } }),
		}),
	];
}
