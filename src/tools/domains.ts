import { z } from "zod";
import { encodePath } from "../client.js";
import { compact, pagination, tool } from "../tool.js";

export const domainTools = [
	tool({
		name: "list_domains",
		title: "List domains",
		description:
			"List the account's domains with verification status, receiving status, catch-all settings and email address counts.",
		readOnly: true,
		input: {
			status: z.enum(["pending", "verified", "failed"]).optional(),
			can_receive: z.boolean().optional().describe("Only domains that can (or cannot) receive mail"),
			check_dns: z
				.boolean()
				.optional()
				.describe("Re-check DNS and SES verification for each domain (slower)"),
			...pagination,
		},
		run: (args, { api }) =>
			api.get("/domains", {
				status: args.status,
				canReceive: args.can_receive,
				check: args.check_dns ? "true" : undefined,
				limit: args.limit,
				offset: args.offset,
			}),
	}),
	tool({
		name: "get_domain",
		title: "Get domain",
		description:
			"Get one domain, including the DNS records it needs and their status. Set check_dns to re-verify DNS now (use after adding records).",
		readOnly: true,
		input: {
			domain_id: z.string(),
			check_dns: z.boolean().optional(),
		},
		run: (args, { api }) =>
			api.get(`/domains/${encodePath(args.domain_id)}`, {
				check: args.check_dns ? "true" : undefined,
			}),
	}),
	tool({
		name: "create_domain",
		title: "Add domain",
		description:
			"Add a domain to send and receive email. Returns the DNS records (MX, TXT, DKIM CNAMEs) to add at the DNS provider; then call get_domain with check_dns to verify.",
		input: { domain: z.string().describe("e.g. example.com or mail.example.com") },
		run: (args, { api }) => api.post("/domains", { domain: args.domain }),
	}),
	tool({
		name: "update_domain",
		title: "Update domain",
		description:
			"Change a domain's catch-all routing (send mail for any address to one endpoint) and whether its subdomains receive mail too.",
		idempotent: true,
		input: {
			domain_id: z.string(),
			catch_all_enabled: z.boolean().optional(),
			catch_all_endpoint_id: z
				.string()
				.nullable()
				.optional()
				.describe("Endpoint that receives catch-all mail; null to clear"),
			include_subdomains: z
				.boolean()
				.optional()
				.describe("Receive mail for any subdomain (needs a wildcard MX record)"),
		},
		run: (args, { api }) =>
			api.patch(
				`/domains/${encodePath(args.domain_id)}`,
				compact({
					isCatchAllEnabled: args.catch_all_enabled,
					catchAllEndpointId: args.catch_all_endpoint_id,
					includeSubdomains: args.include_subdomains,
				}),
			),
	}),
	tool({
		name: "delete_domain",
		title: "Delete domain",
		description:
			"Permanently delete a domain and its email addresses. Mail to it stops being received. Cannot be undone.",
		destructive: true,
		input: { domain_id: z.string() },
		run: (args, { api }) => api.delete(`/domains/${encodePath(args.domain_id)}`),
	}),
	tool({
		name: "enable_domain_dkim",
		title: "Enable DKIM",
		description: "Enable DKIM signing for a domain and return the DKIM DNS records to add.",
		idempotent: true,
		input: { domain_id: z.string() },
		run: (args, { api }) => api.post(`/domains/${encodePath(args.domain_id)}/dkim`),
	}),
];
