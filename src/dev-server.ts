import { handleMcpRequest } from "./http.js";

const port = Number(process.env.PORT ?? 5454);
const apiUrl = process.env.INBOUND_API_URL || undefined;

Bun.serve({
	port,
	fetch(request) {
		const { pathname } = new URL(request.url);
		if (pathname !== "/mcp" && pathname !== "/api/mcp") {
			return new Response("Not found", { status: 404 });
		}
		return handleMcpRequest(request, { apiUrl });
	},
});

console.log(`Inbound MCP server on http://localhost:${port}/mcp`);
