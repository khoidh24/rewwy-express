import {
  BadRequestError,
  InternalServerError,
  UnauthorizedError,
} from "@/core/error.response.ts";
import { randomUUID } from "node:crypto";
import { db } from "@/database/index.ts";
import {
  conversations,
  messages,
} from "@/models/schemas/conversation.model.ts.ts";
import { users } from "@/models/schemas/user.model.ts";
import {
  buildAttachmentContext,
  extractImageAttachmentUrls,
  type ChatAttachment,
} from "@/helpers/attachment-context.ts";
import {
  completionStream,
  type RewwyContentPart,
  type RewwyChatMessage,
} from "@/helpers/deepseek.ts";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { CREATED, OK } from "@/core/success.response.ts";

class ConversationService {
  private static readonly MAX_HISTORY_MESSAGES = 30;
  private static readonly ATTACHMENT_MARKER_PREFIX = "[[rewwy_attachments:";
  private static readonly ATTACHMENT_MARKER_SUFFIX = "]]";

  private static ensureUserId(userId: string | undefined): string {
    if (!userId || typeof userId !== "string") {
      throw new UnauthorizedError("Unauthorized");
    }
    return userId;
  }

  static async createConversation(
    userIdInput: string | undefined,
    title?: string,
  ) {
    const userId = this.ensureUserId(userIdInput);

    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId));
    if (existingUser.length === 0) {
      throw new UnauthorizedError(
        "User session is valid but user no longer exists",
      );
    }

    const conversation = await db
      .insert(conversations)
      .values({
        id: randomUUID(),
        userId,
        title: title?.trim() || "New conversation",
      })
      .returning();
    if (!conversation || conversation.length === 0) {
      throw new InternalServerError("Failed to create conversation");
    }
    return new CREATED("Conversation created successfully", conversation[0]);
  }

  static async getAllConversations(userIdInput: string | undefined) {
    const userId = this.ensureUserId(userIdInput);

    const conversationsList = await db
      .select({
        id: conversations.id,
        title: conversations.title,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt));

    return new OK({
      message: "Conversations fetched successfully",
      metadata: conversationsList,
    });
  }

  static async getConversationById(
    id: string,
    userIdInput: string | undefined,
  ) {
    const userId = this.ensureUserId(userIdInput);

    const conversation = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));

    if (conversation.length === 0) {
      throw new BadRequestError("Conversation not found");
    }

    const conversationMessages = await db
      .select({
        id: messages.id,
        sender: messages.sender,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));

    return new OK({
      message: "Conversation fetched successfully",
      metadata: {
        ...conversation[0],
        messages: conversationMessages,
      },
    });
  }

  static async renameConversation(
    id: string,
    userIdInput: string | undefined,
    title: string,
  ) {
    const userId = this.ensureUserId(userIdInput);

    if (!title?.trim()) {
      throw new BadRequestError("Title is required");
    }

    const conversation = await db
      .update(conversations)
      .set({ title: title.trim(), updatedAt: new Date() })
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .returning();

    if (!conversation || conversation.length === 0) {
      throw new BadRequestError("Conversation not found");
    }

    return new OK({
      message: "Conversation renamed successfully",
      metadata: conversation[0],
    });
  }

  static async deleteConversation(id: string, userIdInput: string | undefined) {
    const userId = this.ensureUserId(userIdInput);

    const existingConversation = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));

    if (existingConversation.length === 0) {
      throw new BadRequestError("Conversation not found");
    }

    await db.delete(messages).where(eq(messages.conversationId, id));

    const conversation = await db
      .delete(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .returning();

    if (!conversation || conversation.length === 0) {
      throw new BadRequestError("Conversation not found");
    }

    return new OK({
      message: "Conversation deleted successfully",
      metadata: { id },
    });
  }

  static async streamChatWithConversation(
    conversationId: string,
    userIdInput: string | undefined,
    text: string,
    attachments: ChatAttachment[],
    onChunk: (chunk: string) => void,
  ) {
    const userId = this.ensureUserId(userIdInput);
    const userText = text?.trim();
    if (!userText && attachments.length === 0) {
      throw new BadRequestError("Text or at least one attachment is required");
    }

    const conversation = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId),
        ),
      );

    if (conversation.length === 0) {
      throw new UnauthorizedError("Conversation not found or access denied");
    }

    const existingMessages = await db
      .select({
        sender: messages.sender,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));

    const fileContext = await buildAttachmentContext(attachments);
    const imageAttachmentUrls = extractImageAttachmentUrls(attachments);
    const composedUserMessage = this.composeCurrentUserPrompt(userText, fileContext);

    await db.insert(messages).values({
      id: randomUUID(),
      conversationId,
      sender: "user",
      content: this.serializeUserMessageContent(userText, attachments),
    });

    const historyMessages = this.toModelHistory(existingMessages);
    const primaryUserMessage = this.buildUserMessageForModel(
      composedUserMessage,
      imageAttachmentUrls,
    );
    const fallbackUserMessage = this.buildFallbackUserMessage(
      composedUserMessage,
      imageAttachmentUrls,
    );

    let stream;
    try {
      stream = await completionStream([...historyMessages, primaryUserMessage]);
    } catch (error) {
      if (imageAttachmentUrls.length === 0) {
        throw error;
      }
      stream = await completionStream([...historyMessages, fallbackUserMessage]);
    }
    let aiMessage = "";

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      if (!token) {
        continue;
      }

      aiMessage += token;
      onChunk(token);
    }

    const finalReply = aiMessage.trim();
    if (!finalReply) {
      throw new InternalServerError("AI did not return a response");
    }

    const savedAssistantMessage = await db
      .insert(messages)
      .values({
        id: randomUUID(),
        conversationId,
        sender: "assistant",
        content: finalReply,
      })
      .returning();

    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    return {
      conversationId,
      reply: savedAssistantMessage[0]?.content ?? finalReply,
    };
  }

  static async streamResendEditedMessage(
    conversationId: string,
    messageId: string,
    userIdInput: string | undefined,
    editedText: string,
    onChunk: (chunk: string) => void,
  ) {
    const userId = this.ensureUserId(userIdInput);
    const userText = editedText?.trim();
    if (!userText) {
      throw new BadRequestError("Text is required");
    }

    const conversation = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId),
        ),
      );

    if (conversation.length === 0) {
      throw new UnauthorizedError("Conversation not found or access denied");
    }

    const conversationMessages = await db
      .select({
        id: messages.id,
        sender: messages.sender,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));

    const targetIndex = conversationMessages.findIndex((m) => m.id === messageId);
    if (targetIndex < 0) {
      throw new BadRequestError("Message not found");
    }

    const targetMessage = conversationMessages[targetIndex];
    if (targetMessage?.sender !== "user") {
      throw new BadRequestError("Only user messages can be edited and resent");
    }

    const messagesToDelete = conversationMessages
      .slice(targetIndex + 1)
      .map((m) => m.id);

    if (messagesToDelete.length > 0) {
      await db
        .delete(messages)
        .where(
          and(
            eq(messages.conversationId, conversationId),
            inArray(messages.id, messagesToDelete),
          ),
        );
    }

    await db
      .update(messages)
      .set({ content: userText })
      .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)));

    const historyBeforeEditedMessage = conversationMessages
      .slice(0, targetIndex)
      .map((message) => ({
        sender: message.sender,
        content: message.content,
        createdAt: message.createdAt,
      }));

    const stream = await completionStream([
      ...this.toModelHistory(historyBeforeEditedMessage),
      { role: "user", content: userText },
    ]);
    let aiMessage = "";

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      if (!token) {
        continue;
      }

      aiMessage += token;
      onChunk(token);
    }

    const finalReply = aiMessage.trim();
    if (!finalReply) {
      throw new InternalServerError("AI did not return a response");
    }

    const savedAssistantMessage = await db
      .insert(messages)
      .values({
        id: randomUUID(),
        conversationId,
        sender: "assistant",
        content: finalReply,
      })
      .returning();

    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    return {
      conversationId,
      messageId,
      reply: savedAssistantMessage[0]?.content ?? finalReply,
    };
  }

  private static toModelHistory(
    history: Array<{
      sender: string;
      content: string;
      createdAt: Date | null;
    }>,
  ): RewwyChatMessage[] {
    const normalized = history
      .filter((message) => message.sender === "user" || message.sender === "assistant")
      .map((message) => ({
        role: message.sender as "user" | "assistant",
        content: this.extractPureMessageText(message.content),
      }));
    return normalized.slice(-this.MAX_HISTORY_MESSAGES);
  }

  private static composeCurrentUserPrompt(userText: string, fileContext: string) {
    if (!fileContext) {
      return userText;
    }

    if (!userText) {
      return [
        "Analyze the uploaded files and describe what they contain.",
        "If there are issues, risks, or improvement ideas, include them.",
        "",
        "## Uploaded files context",
        fileContext,
      ].join("\n");
    }

    return [
      "Use the following user request and file context together.",
      "",
      "## User request",
      userText,
      "",
      "## Uploaded files context",
      fileContext,
    ].join("\n");
  }

  private static buildUserMessageForModel(
    textContent: string,
    imageAttachmentUrls: string[],
  ): RewwyChatMessage {
    if (imageAttachmentUrls.length === 0) {
      return { role: "user", content: textContent };
    }

    const contentParts: RewwyContentPart[] = [
      { type: "text", text: textContent },
      ...imageAttachmentUrls.map((url) => ({
        type: "image_url" as const,
        image_url: { url },
      })),
    ];

    return {
      role: "user",
      content: contentParts,
    };
  }

  private static buildFallbackUserMessage(
    textContent: string,
    imageAttachmentUrls: string[],
  ): RewwyChatMessage {
    if (imageAttachmentUrls.length === 0) {
      return { role: "user", content: textContent };
    }

    return {
      role: "user",
      content: [
        textContent,
        "",
        "Image URLs (fallback mode):",
        ...imageAttachmentUrls.map((url, index) => `${index + 1}. ${url}`),
      ].join("\n"),
    };
  }

  private static serializeUserMessageContent(
    userText: string,
    attachments: ChatAttachment[],
  ) {
    const normalizedText = userText?.trim() ?? "";
    if (attachments.length === 0) return normalizedText;

    const compactAttachments = attachments.map((attachment) => ({
      url: attachment.url,
      name: attachment.name,
      contentType: attachment.contentType,
      kind: attachment.kind,
    }));
    const encoded = Buffer.from(JSON.stringify(compactAttachments), "utf8").toString(
      "base64url",
    );
    const marker = `${this.ATTACHMENT_MARKER_PREFIX}${encoded}${this.ATTACHMENT_MARKER_SUFFIX}`;
    const visibleText =
      normalizedText ||
      `Attached: ${compactAttachments
        .map((attachment) => attachment.name || "file")
        .join(", ")}`;
    return `${visibleText}\n\n${marker}`;
  }

  private static extractPureMessageText(rawContent: string) {
    if (!rawContent) return "";
    const markerRegex =
      /\n\n\[\[rewwy_attachments:[A-Za-z0-9_-]+\]\]\s*$/;
    return rawContent.replace(markerRegex, "").trim();
  }
}

export default ConversationService;
