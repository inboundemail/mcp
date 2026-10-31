import { z } from "zod";
import { type AnyTool, type Mode, pagination, tool } from "../tool.js";
import { mailboxStateTarget } from "./mailbox-folders.js";

const activityFilters = {
	event: z.enum(["login_succeeded", "login_failed", "login_refused", "session_ended", "command_error", "quota_exceeded", "send_failed", "send_rate_limited", "events_dropped"]).optional(),
	protocol: z.enum(["imap", "smtp", "api"]).optional(),
	since: z.string().optional().describe("Only events at or after this ISO 8601 time"),
	until: z.string().optional().describe("Only events at or before this ISO 8601 time"),
	ip: z.string().max(64).optional().describe("Only events from this client IPv4 or IPv6 address"),
	...pagination,
};

const recorded = "Sign-ins, refusals, IMAP sessions, command errors, quota and send failures are kept for 30 days. The log never records message content, sender or recipient addresses, passwords or API keys.";

export function mailboxActivityTools(mode: Mode): AnyTool[] {
	const { target, root } = mailboxStateTarget(mode);
	const permission = mode === "mailbox" ? " Requires selfService.activity; otherwise returns 403." : "";
	return [
		tool({
			name: "list_mailbox_activity",
			title: "List mailbox activity",
			description: `Read this mailbox's activity, newest first. ${recorded}${permission}`,
			readOnly: true,
			input: { ...target, ...activityFilters },
			run: ({ mailbox_id, ...query }, { api }) => api.get(`${root({ mailbox_id })}/activity`, query),
		}),
	];
}

export const listAccountActivity = tool({
	name: "list_account_activity",
	title: "List account mailbox activity",
	description: `Read activity across the account's mailboxes, newest first. ${recorded}`,
	readOnly: true,
	input: {
		mailbox_id: z.string().max(255).optional().describe("Only events for this mailbox ID from list_mailboxes"),
		...activityFilters,
	},
	run: ({ mailbox_id, ...query }, { api }) => api.get("/mailboxes/activity", { ...query, mailboxId: mailbox_id }),
});
