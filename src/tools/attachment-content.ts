import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { BinaryResponse } from "../client.js";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 200_000;

function isText(contentType: string): boolean {
	return (
		contentType.startsWith("text/") ||
		/(json|xml|csv|javascript|yaml|x-sh|markdown)/.test(contentType)
	);
}

export function attachmentContent(file: BinaryResponse, uri: string): CallToolResult {
	const contentType = file.contentType.split(";")[0]?.trim() || "application/octet-stream";
	const label = `${file.filename ?? "attachment"} (${contentType}, ${file.bytes.length} bytes)`;
	if (file.bytes.length > MAX_BYTES) {
		return {
			isError: true,
			content: [{ type: "text", text: `${label} is larger than 10 MB and can't be returned here.` }],
		};
	}
	if (isText(contentType)) {
		const text = new TextDecoder().decode(file.bytes);
		return {
			content: [
				{ type: "text", text: label },
				{
					type: "text",
					text:
						text.length > MAX_TEXT_CHARS
							? `${text.slice(0, MAX_TEXT_CHARS)}\n…[truncated]`
							: text,
				},
			],
		};
	}
	const data = Buffer.from(file.bytes).toString("base64");
	if (contentType.startsWith("image/")) {
		return {
			content: [
				{ type: "text", text: label },
				{ type: "image", data, mimeType: contentType },
			],
		};
	}
	return {
		content: [
			{ type: "text", text: label },
			{ type: "resource", resource: { uri, mimeType: contentType, blob: data } },
		],
	};
}
