import { handleMcpRequest } from "../src/http.js";

const apiUrl = process.env.INBOUND_API_URL || undefined;

const handler = (request: Request) => handleMcpRequest(request, { apiUrl });

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
export const OPTIONS = handler;
