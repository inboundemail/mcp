import { z } from "zod";
import { encodePath } from "../client.js";
import {
	type AnyTool,
	addressList,
	compact,
	type Mode,
	pagination,
	tool,
	ToolInputError,
} from "../tool.js";
import { attachmentContent } from "./attachment-content.js";

// URL resolves literal dot segments even after encodeURIComponent.
export const mailboxPathSegment = z.string().min(1).refine(
	(value) => value !== "." && value !== "..",
	"Expected a path segment other than '.' or '..'",
);

export function mailboxStateTarget(mode: Mode) {
	const account = mode === "account";
	// As in mailboxAccessTools, mailbox mode omits the input and always targets me.
	const target = (
		account ? { mailbox_id: mailboxPathSegment.describe("Mailbox ID from list_mailboxes") } : {}
	) as { mailbox_id: z.ZodString };
	const root = (args: { mailbox_id: string }) =>
		`/mailboxes/${account ? encodePath(args.mailbox_id) : "me"}`;
	return { target, root };
}

const folder = mailboxPathSegment.max(255).describe("Plain folder path, e.g. INBOX or Projects/Invoices");
const uid = z.number().int().min(1).describe("UID within this folder, not an account email ID");
const flags = z.array(z.string().min(1).max(255)).max(50);
const rawLimit = 64 * 1024;

export function mailboxFolderTools(mode: Mode): AnyTool[] {
	const { target, root } = mailboxStateTarget(mode);
	const inFolder = { ...target, folder };
	const message = { ...inFolder, uid };
	const folderPath = (args: { mailbox_id: string; folder: string }) =>
		`${root(args)}/folders/${encodePath(args.folder)}`;
	const messagePath = (args: { mailbox_id: string; folder: string; uid: number }) =>
		`${folderPath(args)}/messages/${args.uid}`;

	return [
		tool({
			name: "list_mailbox_folders",
			title: "List mailbox folders",
			description: "Find folder paths, subscription state, message counts and IMAP sync checkpoints for this mailbox.",
			readOnly: true,
			input: target,
			run: (args, { api }) => api.get(`${root(args)}/folders`),
		}),
		tool({
			name: "create_mailbox_folder",
			title: "Create mailbox folder",
			description: "Create a custom folder. A slash nests the folder; subscribed defaults to true.",
			input: { ...target, path: folder, subscribed: z.boolean().optional() },
			run: (args, { api }) =>
				api.post(`${root(args)}/folders`, compact({ path: args.path, subscribed: args.subscribed })),
		}),
		tool({
			name: "rename_mailbox_folder",
			title: "Rename or subscribe to a mailbox folder",
			description: "Provide path to rename a custom folder and its descendants, subscribed to change its subscription, or both.",
			idempotent: true,
			input: {
				...inFolder,
				path: folder.optional().describe("New plain folder path"),
				subscribed: z.boolean().optional(),
			},
			run: (args, { api }) =>
				api.patch(folderPath(args), compact({ path: args.path, subscribed: args.subscribed })),
		}),
		tool({
			name: "delete_mailbox_folder",
			title: "Delete mailbox folder",
			description: "Delete a custom folder and its message entries from this mailbox. Subfolders and underlying account-level received mail are kept.",
			destructive: true,
			idempotent: true,
			input: inFolder,
			run: (args, { api }) => api.delete(folderPath(args)),
		}),
		tool({
			name: "list_folder_messages",
			title: "List folder messages by UID",
			description: `List any exact folder by UID (including drafts and copies), unlike ${mode === "account" ? "list_mailbox_messages" : "list_messages"}, which uses account email IDs. For incremental sync, keep uidValidity and the first page's highestModseq; page with since_uid, not offset. Rebuild on 409 or changed uidValidity.`,
			readOnly: true,
			input: {
				...inFolder,
				...pagination,
				unread: z.boolean().optional().describe("True to list only unread messages"),
				flagged: z.boolean().optional().describe("True to list only flagged messages"),
				search: z.string().optional().describe("Search subject and addresses or appended headers, not bodies"),
				since_uid: z.number().int().min(0).optional().describe("Only UIDs greater than this one"),
				since_modseq: z.number().int().min(0).optional().describe("Return changes and expunged UIDs since this checkpoint"),
			},
			run: (args, { api }) =>
				api.get(`${folderPath(args)}/messages`, {
					limit: args.limit,
					offset: args.offset,
					unread: args.unread,
					flagged: args.flagged,
					search: args.search,
					sinceUid: args.since_uid,
					sinceModseq: args.since_modseq,
				}),
		}),
		tool({
			name: "get_folder_message",
			title: "Get folder message",
			description: "Fetch parsed text, HTML, attachments and flags by folder and UID without marking the message read.",
			readOnly: true,
			input: message,
			run: (args, { api }) => api.get(messagePath(args)),
		}),
		tool({
			name: "get_folder_message_raw",
			title: "Get raw folder message",
			description: "Read the original RFC 822 headers and MIME body as text. Only the first 64 KiB are returned.",
			readOnly: true,
			input: message,
			run: async (args, { api }) => {
				const { bytes } = await api.binary(`${messagePath(args)}/raw`);
				const truncated = bytes.length > rawLimit;
				const text = new TextDecoder().decode(bytes.subarray(0, rawLimit), { stream: truncated });
				return truncated ? `${text}\n…[truncated at 64 KiB]` : text;
			},
		}),
		tool({
			name: "set_message_flags",
			title: "Change folder message flags",
			description: "Add, remove or replace IMAP flags (such as \\Seen or \\Flagged) and custom keywords. 'set' replaces all flags; \\Deleted marks for expunge.",
			destructive: true,
			idempotent: true,
			input: { ...message, action: z.enum(["add", "remove", "set"]), flags },
			run: (args, { api }) => api.patch(messagePath(args), { action: args.action, flags: args.flags }),
		}),
		tool({
			name: "move_message",
			title: "Move folder message",
			description: "Move a message and return its destination UID. Moving received mail to Junk or back to INBOX marks it junk or not junk for this mailbox only.",
			destructive: true,
			idempotent: true,
			input: { ...message, destination: folder },
			run: (args, { api }) => api.post(`${messagePath(args)}/move`, { destination: args.destination }),
		}),
		tool({
			name: "copy_message",
			title: "Copy folder message",
			description: "Copy a message to a folder without removing the source. Use the returned destinationUid for the copy.",
			input: { ...message, destination: folder },
			run: (args, { api }) => api.post(`${messagePath(args)}/copy`, { destination: args.destination }),
		}),
		tool({
			name: "delete_folder_message",
			title: "Delete folder message",
			description: "Move the message to Trash. If already in Trash or permanent is true, expunge its folder entry. This does not delete received mail from the account.",
			destructive: true,
			idempotent: true,
			input: { ...message, permanent: z.boolean().optional() },
			run: (args, { api }) => api.request("DELETE", messagePath(args), { query: { permanent: args.permanent } }),
		}),
		tool({
			name: "expunge_folder",
			title: "Expunge deleted folder messages",
			description: "Permanently remove entries flagged \\Deleted from this folder. Omit uids to expunge every such entry, or supply only the UIDs to expunge.",
			destructive: true,
			idempotent: true,
			input: { ...inFolder, uids: z.array(uid).max(1000).optional() },
			run: (args, { api }) => api.post(`${folderPath(args)}/expunge`, compact({ uids: args.uids })),
		}),
		tool({
			name: "append_message",
			title: "Append a draft or raw message",
			description: "Store a message without sending it (default folder: Drafts; 1 MiB maximum). Supply draft fields OR base64 raw RFC 822 MIME, e.g. for attachments. Both forms accept flags and date.",
			input: {
				...target,
				folder: folder.optional(),
				raw: z.string().max(1_402_200).optional().describe("Base64-encoded UTF-8 RFC 822 message"),
				from: z.string().max(512).optional(),
				to: addressList.optional(),
				cc: addressList.optional(),
				reply_to: addressList.optional(),
				subject: z.string().max(998).optional(),
				text: z.string().optional(),
				html: z.string().optional(),
				headers: z.record(z.string(), z.string()).optional(),
				in_reply_to: z.string().max(998).optional(),
				references: z.array(z.string().max(998)).max(100).optional(),
				flags: flags.optional(),
				date: z.string().optional().describe("ISO 8601 internal date"),
			},
			run: (args, { api }) => {
				const draft = compact({
					from: args.from,
					to: args.to,
					cc: args.cc,
					replyTo: args.reply_to,
					subject: args.subject,
					text: args.text,
					html: args.html,
					headers: args.headers,
					inReplyTo: args.in_reply_to,
					references: args.references,
				});
				if (args.raw !== undefined && Object.keys(draft).length) {
					throw new ToolInputError("Provide raw or draft fields, not both");
				}
				const path = folderPath({ ...args, folder: args.folder ?? "Drafts" });
				return api.post(`${path}/messages`, compact({ ...draft, raw: args.raw, flags: args.flags, date: args.date }));
			},
		}),
		tool({
			name: "list_folder_message_attachments",
			title: "List folder message attachments",
			description: "List attachments on a received or appended message, including the zero-based index for downloading each file.",
			readOnly: true,
			input: message,
			run: (args, { api }) => api.get(`${messagePath(args)}/attachments`),
		}),
		tool({
			name: "download_folder_message_attachment",
			title: "Download folder message attachment",
			description: "Download one attachment by folder, UID and index from list_folder_message_attachments (up to 10 MiB).",
			readOnly: true,
			input: { ...message, index: z.number().int().min(0) },
			run: async (args, { api }) => {
				const path = `${messagePath(args)}/attachments/${args.index}`;
				return attachmentContent(await api.binary(path), `inbound:/${path}`);
			},
		}),
	];
}
