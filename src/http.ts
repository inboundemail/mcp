import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createInboundServer, parseToolsets, VERSION } from "./server.js";

const PUBLIC_ORIGIN = process.env.INBOUND_PUBLIC_URL || "https://inbound.new";
const RESOURCE = `${PUBLIC_ORIGIN}/mcp`;
const ISSUER = `${PUBLIC_ORIGIN}/api/auth`;
const RESOURCE_METADATA = `${PUBLIC_ORIGIN}/.well-known/oauth-protected-resource/mcp`;
const ACCOUNT_SCOPE = "inbound:account";
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/jwks`));
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** Checks an OAuth access token before use so expired tokens get a 401 the client can refresh on. */
async function oauthTokenError(token: string): Promise<string | null> {
	if (!JWT_SHAPE.test(token)) return null; // API key or mailbox password
	try {
		const { payload } = await jwtVerify(token, jwks, {
			issuer: [ISSUER, PUBLIC_ORIGIN],
			audience: RESOURCE,
		});
		const scopes = typeof payload.scope === "string" ? payload.scope.split(" ") : [];
		return scopes.includes(ACCOUNT_SCOPE) ? null : "insufficient_scope";
	} catch {
		return "invalid_token";
	}
}

function challenge(error?: string): string {
	return [
		`Bearer resource_metadata="${RESOURCE_METADATA}"`,
		`scope="${ACCOUNT_SCOPE} offline_access"`,
		...(error ? [`error="${error}"`] : []),
	].join(", ");
}

const CORS_HEADERS: Record<string, string> = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
	"Access-Control-Allow-Headers":
		"Authorization, Content-Type, Accept, x-inbound-api-key, x-inbound-toolsets, mcp-session-id, mcp-protocol-version, last-event-id",
	"Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version, WWW-Authenticate",
	"Access-Control-Max-Age": "86400",
};

function withCors(response: Response): Response {
	const headers = new Headers(response.headers);
	for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
	return new Response(response.body, { status: response.status, headers });
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
	return withCors(
		new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json", ...headers },
		}),
	);
}

export function extractToken(headers: Headers): string | null {
	const bearer = headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
	return bearer || headers.get("x-inbound-api-key")?.trim() || null;
}

/** Stateless Streamable HTTP endpoint: one server per request, JSON responses. */
export async function handleMcpRequest(
	request: Request,
	options: { apiUrl?: string } = {},
): Promise<Response> {
	if (request.method === "OPTIONS") {
		return withCors(new Response(null, { status: 204 }));
	}
	if (request.method !== "POST") {
		if (request.method === "GET" && !request.headers.get("accept")?.includes("text/event-stream")) {
			return json(200, {
				name: "Inbound MCP server",
				version: VERSION,
				transport: "streamable-http",
				docs: "https://inbound.new/docs/integrations/mcp",
				auth: "OAuth (inbound.new), or Authorization: Bearer <Inbound API key or mailbox password>",
			});
		}
		return json(
			405,
			{ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null },
			{ Allow: "POST, OPTIONS" },
		);
	}

	const token = extractToken(request.headers);
	if (!token) {
		return json(
			401,
			{
				jsonrpc: "2.0",
				error: {
					code: -32001,
					message:
						"Sign in with OAuth, or send an Inbound API key (inbound.new/settings) or mailbox password as 'Authorization: Bearer <key>'.",
				},
				id: null,
			},
			{ "WWW-Authenticate": challenge() },
		);
	}
	const tokenError = await oauthTokenError(token);
	if (tokenError) {
		return json(
			tokenError === "insufficient_scope" ? 403 : 401,
			{
				jsonrpc: "2.0",
				error: {
					code: -32001,
					message:
						tokenError === "insufficient_scope"
							? "This token lacks the inbound:account scope."
							: "The access token is invalid or expired.",
				},
				id: null,
			},
			{ "WWW-Authenticate": challenge(tokenError) },
		);
	}

	const url = new URL(request.url);
	const server = createInboundServer({
		token,
		apiUrl: options.apiUrl,
		toolsets: parseToolsets(
			url.searchParams.get("toolsets") ?? request.headers.get("x-inbound-toolsets"),
		),
	});
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	});
	await server.connect(transport);
	try {
		return withCors(await transport.handleRequest(request));
	} finally {
		void server.close();
	}
}
