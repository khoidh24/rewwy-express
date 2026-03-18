import mammoth from "mammoth";

type ChatAttachment = {
  url: string;
  name?: string;
  contentType?: string;
  kind?: "image" | "document";
};

const MAX_FILE_TEXT_CHARS = 12000;
const ALLOWED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const ALLOWED_DOCUMENT_EXTENSIONS = new Set(["pdf", "doc", "docx", "txt", "md"]);
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
]);
const TEXT_DOCUMENT_EXTENSIONS = new Set([
  "txt",
  "md",
]);
const TEXT_DOCUMENT_MIME_TYPES = new Set(["text/plain", "text/markdown"]);
const DOCX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const getAttachmentExtension = (attachment: ChatAttachment) =>
  (attachment.name ?? "").split(".").pop()?.toLowerCase() ?? "";

const resolveAttachmentKind = (attachment: ChatAttachment) => {
  if (attachment.kind) return attachment.kind;

  const contentType = attachment.contentType?.toLowerCase() ?? "";
  const extension = getAttachmentExtension(attachment);

  if (
    ALLOWED_IMAGE_MIME_TYPES.has(contentType) ||
    ALLOWED_IMAGE_EXTENSIONS.has(extension)
  ) {
    return "image" as const;
  }
  if (
    ALLOWED_DOCUMENT_MIME_TYPES.has(contentType) ||
    ALLOWED_DOCUMENT_EXTENSIONS.has(extension)
  ) {
    return "document" as const;
  }

  return null;
};

export const isSupportedAttachment = (attachment: ChatAttachment) =>
  resolveAttachmentKind(attachment) !== null;

const isLikelyTextFile = (attachment: ChatAttachment) => {
  const contentType = attachment.contentType?.toLowerCase() ?? "";
  if (TEXT_DOCUMENT_MIME_TYPES.has(contentType)) {
    return true;
  }

  const extension = getAttachmentExtension(attachment);
  return TEXT_DOCUMENT_EXTENSIONS.has(extension);
};

const normalizeText = (rawText: string) => {
  if (!rawText) return "";
  return rawText.replace(/\r\n/g, "\n").trim();
};

const truncateText = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n\n[...truncated for token safety...]`;
};

const inspectAttachmentUrl = async (attachmentUrl: string) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(attachmentUrl, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const contentType = response.headers.get("content-type") ?? "unknown";
    return {
      ok: response.ok,
      status: response.status,
      contentType,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      contentType: "unknown",
    };
  }
};

const fetchAttachmentText = async (attachment: ChatAttachment) => {
  const kind = resolveAttachmentKind(attachment);
  if (!kind) {
    return {
      ok: false,
      content: "Unsupported attachment type. Only image or document files are accepted.",
    };
  }

  if (kind === "image") {
    const inspection = await inspectAttachmentUrl(attachment.url);
    return {
      ok: inspection.ok,
      content: [
        "Image attachment provided.",
        `URL check: ${inspection.ok ? "reachable" : "unreachable"} (status: ${inspection.status})`,
        `Detected content-type: ${inspection.contentType}`,
        "If vision is available, analyze image content from this URL. If not, explain limitation explicitly and continue with available context.",
      ].join("\n"),
    };
  }

  const extension = getAttachmentExtension(attachment);
  const contentType = attachment.contentType?.toLowerCase() ?? "";
  const isDocx = extension === "docx" || DOCX_MIME_TYPES.has(contentType);

  if (isDocx) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(attachment.url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          ok: false,
          content: `Failed to fetch DOCX content (status ${response.status}).`,
        };
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const { value } = await mammoth.extractRawText({ buffer });
      const normalized = normalizeText(value);
      if (!normalized) {
        return {
          ok: false,
          content: "DOCX has no readable text content.",
        };
      }

      return { ok: true, content: truncateText(normalized, MAX_FILE_TEXT_CHARS) };
    } catch {
      return {
        ok: false,
        content: "Failed to parse DOCX content.",
      };
    }
  }

  if (!isLikelyTextFile(attachment)) {
    return {
      ok: false,
      content:
        "Document attachment provided (binary or non-text). Analyze based on metadata, URL, and user prompt.",
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(attachment.url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        content: `Failed to fetch file content (status ${response.status}).`,
      };
    }

    const text = normalizeText(await response.text());
    if (!text) {
      return { ok: false, content: "File is empty." };
    }

    return { ok: true, content: truncateText(text, MAX_FILE_TEXT_CHARS) };
  } catch {
    return { ok: false, content: "Failed to fetch or parse file content." };
  }
};

export const buildAttachmentContext = async (attachments: ChatAttachment[]) => {
  if (!attachments.length) return "";

  const results = await Promise.all(
    attachments.map(async (attachment, index) => {
      const fileResult = await fetchAttachmentText(attachment);
      const name = attachment.name?.trim() || `file-${index + 1}`;
      const type = attachment.contentType?.trim() || "unknown";
      return [
        `### Attachment ${index + 1}`,
        `name: ${name}`,
        `type: ${type}`,
        `url: ${attachment.url}`,
        "",
        fileResult.content,
      ].join("\n");
    }),
  );

  return results.join("\n\n");
};

export const extractImageAttachmentUrls = (attachments: ChatAttachment[]) => {
  return attachments
    .filter((attachment) => resolveAttachmentKind(attachment) === "image")
    .map((attachment) => attachment.url)
    .filter(Boolean);
};

export type { ChatAttachment };
