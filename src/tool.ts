import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { InboundApiError, type InboundClient } from "./client.js";

export type Mode = "account" | "mailbox";

export interface ToolContext {
	api: InboundClient;
	mode: Mode;
}

export interface ToolDefinition<Shape extends z.ZodRawShape = z.ZodRawShape> {
	name: string;
	title: string;
	description: string;
	input: Shape;
	/** Reads only; never changes data. */
	readOnly?: boolean;
	/** May delete or irreversibly change data. */
	destructive?: boolean;
	/** Repeating the call with the same arguments has no further effect. */
	idempotent?: boolean;
	run: (
		args: z.infer<z.ZodObject<Shape>>,
		ctx: ToolContext,
	) => Promise<unknown>;
}

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous tool lists
export type AnyTool = ToolDefinition<any>;

export function tool<Shape extends z.ZodRawShape>(
	definition: ToolDefinition<Shape>,
): AnyTool {
	return definition as AnyTool;
}

function isCallToolResult(value: unknown): value is CallToolResult {
	return (
		!!value &&
		typeof value === "object" &&
		Array.isArray((value as { content?: unknown }).content)
	);
}

export function textResult(value: unknown): CallToolResult {
	return {
		content: [
			{
				type: "text",
				text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
			},
		],
	};
}

function errorResult(error: unknown): CallToolResult {
	if (error instanceof InboundApiError) {
		const hint =
			error.status === 401
				? " Check the API key or mailbox password configured for this MCP server."
				: error.status === 403
					? " The credential is not allowed to do this."
					: "";
		return {
			isError: true,
			content: [
				{
					type: "text",
					text: `${error.message}${hint}${
						error.body && typeof error.body === "object"
							? `\n${JSON.stringify(error.body, null, 2)}`
							: ""
					}`,
				},
			],
		};
	}
	return {
		isError: true,
		content: [
			{
				type: "text",
				text: error instanceof Error ? error.message : String(error),
			},
		],
	};
}

export class ToolInputError extends Error {}

export function registerTools(
	server: McpServer,
	ctx: ToolContext,
	tools: AnyTool[],
): void {
	for (const definition of tools) {
		server.registerTool(
			definition.name,
			{
				title: definition.title,
				description: definition.description,
				inputSchema: definition.input,
				annotations: {
					title: definition.title,
					readOnlyHint: definition.readOnly ?? false,
					destructiveHint: definition.destructive ?? false,
					idempotentHint: definition.idempotent ?? definition.readOnly ?? false,
					openWorldHint: true,
				},
			},
			async (args: unknown) => {
				try {
					const result = await definition.run(args as never, ctx);
					return isCallToolResult(result) ? result : textResult(result);
				} catch (error) {
					return errorResult(error);
				}
			},
		);
	}
}

/** Shared input fragments. */
export const pagination = {
	limit: z.number().int().min(1).max(100).optional().describe("Max results (1-100)"),
	offset: z.number().int().min(0).optional().describe("Results to skip"),
};

export const addressList = z
	.union([z.string(), z.array(z.string())])
	.describe('One address or a list, e.g. "a@x.com" or ["Name <a@x.com>"]');

export const attachmentsInput = z
	.array(
		z.object({
			filename: z.string(),
			content: z.string().optional().describe("Base64-encoded file content"),
			path: z.string().optional().describe("Public URL to fetch the file from instead of content"),
			content_type: z.string().optional(),
			content_id: z.string().optional().describe("For inline images referenced as cid:<id>"),
		}),
	)
	.optional()
	.describe("Attachments (total up to 40 MB)");

export const tagsInput = z
	.array(z.object({ name: z.string(), value: z.string() }))
	.optional()
	.describe("Tags for filtering and analytics");

/** Drops undefined values so PATCH/PUT bodies only carry provided fields. */
export function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
	return Object.fromEntries(
		Object.entries(value).filter(([, entry]) => entry !== undefined),
	) as Partial<T>;
}
