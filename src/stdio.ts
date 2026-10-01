#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createInboundServer, parseToolsets } from "./server.js";

const token = process.env.INBOUND_API_KEY;
if (!token) {
	console.error("Set INBOUND_API_KEY to an Inbound API key or a mailbox password.");
	process.exit(1);
}

const server = createInboundServer({
	token,
	apiUrl: process.env.INBOUND_API_URL || undefined,
	toolsets: parseToolsets(process.env.INBOUND_TOOLSETS),
});
await server.connect(new StdioServerTransport());
