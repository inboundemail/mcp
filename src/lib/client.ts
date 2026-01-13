import Inbound from "inboundemail";
import { headers } from "xmcp/headers";

export interface ClientContext {
	client: Inbound;
	domain: string | null;
}

export interface MailboxContext extends ClientContext {
	/** Full mailbox string, e.g., "Agent <agent@domain.com>" or "agent@domain.com" */
	mailbox: string;
	/** Just the email address extracted from mailbox */
	mailboxAddress: string;
	/** Display name if provided, e.g., "Agent" */
	mailboxName: string | null;
}

/**
 * Parse an email string that may be in format "Name <email@domain.com>" or just "email@domain.com"
 * Returns { address, name } where name is null if not provided
 */
export function parseEmailAddress(email: string): {
	address: string;
	name: string | null;
} {
	const match = email.match(/^(.+?)\s*<([^>]+)>$/);
	if (match) {
		return {
			name: match[1].trim(),
			address: match[2].trim(),
		};
	}
	return {
		name: null,
		address: email.trim(),
	};
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
			"Missing x-inbound-mailbox header. Set this header to your agent's email address (e.g., 'Agent <agent@yourdomain.com>') to use mailbox tools.",
		);
	}

	// Parse the mailbox header - supports "Name <email>" or just "email"
	const { address: mailboxAddress, name: mailboxName } =
		parseEmailAddress(mailbox);

	// Validate mailbox is a proper email format
	if (!mailboxAddress.includes("@")) {
		throw new Error(
			"Invalid x-inbound-mailbox header. Must be a valid email address (e.g., 'Agent <agent@yourdomain.com>' or 'agent@yourdomain.com').",
		);
	}

	const client = new Inbound({ apiKey });

	return { client, domain, mailbox, mailboxAddress, mailboxName };
}