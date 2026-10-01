export const DEFAULT_API_URL = "https://inbound.new/api/e2";

export class InboundApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly body: unknown,
	) {
		super(message);
		this.name = "InboundApiError";
	}
}

type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
	query?: Record<string, QueryValue>;
	body?: unknown;
	headers?: Record<string, string>;
}

export interface BinaryResponse {
	bytes: Uint8Array;
	contentType: string;
	filename: string | null;
}

export class InboundClient {
	constructor(
		private readonly token: string,
		private readonly apiUrl = DEFAULT_API_URL,
	) {}

	private url(path: string, query?: Record<string, QueryValue>): string {
		const url = new URL(`${this.apiUrl.replace(/\/$/, "")}${path}`);
		for (const [key, value] of Object.entries(query ?? {})) {
			if (value !== undefined && value !== null && value !== "") {
				url.searchParams.set(key, String(value));
			}
		}
		return url.toString();
	}

	private async send(
		method: string,
		path: string,
		options: RequestOptions = {},
	): Promise<Response> {
		const headers: Record<string, string> = {
			Authorization: `Bearer ${this.token}`,
			"User-Agent": "inbound-mcp/1.0",
			...options.headers,
		};
		if (options.body !== undefined) headers["Content-Type"] = "application/json";
		const response = await fetch(this.url(path, options.query), {
			method,
			headers,
			body: options.body === undefined ? undefined : JSON.stringify(options.body),
			signal: AbortSignal.timeout(55_000),
		});
		if (!response.ok) {
			const text = await response.text();
			let body: unknown = text;
			try {
				body = JSON.parse(text);
			} catch {}
			throw new InboundApiError(response.status, errorMessage(response.status, body), body);
		}
		return response;
	}

	async request<T = unknown>(
		method: string,
		path: string,
		options: RequestOptions = {},
	): Promise<T> {
		const response = await this.send(method, path, options);
		if (response.status === 204) return { success: true } as T;
		const text = await response.text();
		if (!text) return { success: true } as T;
		try {
			return JSON.parse(text) as T;
		} catch {
			return text as T;
		}
	}

	get<T = unknown>(path: string, query?: Record<string, QueryValue>) {
		return this.request<T>("GET", path, { query });
	}
	post<T = unknown>(path: string, body?: unknown, headers?: Record<string, string>) {
		return this.request<T>("POST", path, { body: body ?? {}, headers });
	}
	put<T = unknown>(path: string, body: unknown) {
		return this.request<T>("PUT", path, { body });
	}
	patch<T = unknown>(path: string, body: unknown) {
		return this.request<T>("PATCH", path, { body });
	}
	delete<T = unknown>(path: string) {
		return this.request<T>("DELETE", path);
	}

	async binary(path: string): Promise<BinaryResponse> {
		const response = await this.send("GET", path);
		const disposition = response.headers.get("content-disposition") ?? "";
		const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
		const plain = disposition.match(/filename="([^"]+)"/i)?.[1];
		return {
			bytes: new Uint8Array(await response.arrayBuffer()),
			contentType: response.headers.get("content-type") ?? "application/octet-stream",
			filename: encoded ? decodeURIComponent(encoded) : (plain ?? null),
		};
	}
}

function errorMessage(status: number, body: unknown): string {
	if (body && typeof body === "object") {
		const record = body as Record<string, unknown>;
		const detail = record.message ?? record.error ?? record.details;
		if (typeof detail === "string") return `Inbound API ${status}: ${detail}`;
	}
	if (typeof body === "string" && body.trim() && body.length < 500) {
		return `Inbound API ${status}: ${body.trim()}`;
	}
	return `Inbound API request failed with status ${status}`;
}

export function encodePath(value: string): string {
	return encodeURIComponent(value);
}
