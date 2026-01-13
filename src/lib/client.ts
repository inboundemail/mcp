import Inbound from "inboundemail";
import { headers } from "xmcp/headers";

export interface ClientContext {
	client: Inbound;
	domain: string | null;
}

export interface MailboxContext extends ClientContext {
	mailbox: string;
}

export function getClientContext(): ClientContext {
	const requestHeaders = headers();
	const apiKeyHeader = requestHeaders["x-inbound-api-key"];
	const domainHeader = requestHeaders["x-inbound-domain"];

	const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
	const domain = Array.isArray(domainHeader)
		? domainHeader[0]
		: domainHeader || null;

	if (!apiKey) {
		throw new Error("Missing x-inbound-api-key header");
	}

	const client = new Inbound({ apiKey });

	return { client, domain };
}

export function filterByDomain<T extends { domain?: string }>(
	items: T[],
	domain: string | null,
): T[] {
	if (!domain) return items;
	const lowerDomain = domain.toLowerCase();
	return items.filter((item) => item.domain?.toLowerCase() === lowerDomain);
}

export function validateDomainAccess(
	fromAddress: string,
	allowedDomain: string | null,
): void {
	if (!allowedDomain) return;

	const emailDomain = fromAddress.split("@")[1]?.toLowerCase();
	if (emailDomain !== allowedDomain.toLowerCase()) {
		throw new Error(
			`Domain ${emailDomain} is not allowed. Only ${allowedDomain} is permitted.`,
		);
	}
}

/**
 * Get mailbox context from headers. Requires x-inbound-mailbox header.
 * Used for agent mailbox mode where operations are scoped to a single email address.
 */
export function getMailboxContext(): MailboxContext {
	const requestHeaders = headers();
	const apiKeyHeader = requestHeaders["x-inbound-api-key"];
	const domainHeader = requestHeaders["x-inbound-domain"];
	const mailboxHeader = requestHeaders["x-inbound-mailbox"];

	const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
	const domain = Array.isArray(domainHeader)
		? domainHeader[0]
		: domainHeader || null;
	const mailbox = Array.isArray(mailboxHeader)
		? mailboxHeader[0]
		: mailboxHeader;

	if (!apiKey) {
		throw new Error("Missing x-inbound-api-key header");
	}

	if (!mailbox) {
		throw new Error(
			"Missing x-inbound-mailbox header. Set this header to your agent's email address (e.g., 'agent@yourdomain.com') to use mailbox tools.",
		);
	}

	// Validate mailbox is a proper email format
	if (!mailbox.includes("@")) {
		throw new Error(
			"Invalid x-inbound-mailbox header. Must be a valid email address.",
		);
	}

	const client = new Inbound({ apiKey });

	return { client, domain, mailbox };
}