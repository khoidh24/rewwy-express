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
import { completion, completionStream } from "@/helpers/deepseek.ts";
import { and, asc, desc, eq } from "drizzle-orm";
import { CREATED, OK } from "@/core/success.response.ts";

class ConversationService {
  private static ensureUserId(userId: string | undefined): string {
    if (!userId || typeof userId !== "string") {
      throw new UnauthorizedError("Unauthorized");
    }
    return userId;
  }

  static async createConversation(userIdInput: string | undefined, title?: string) {
    const userId = this.ensureUserId(userIdInput);

    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId));
    if (existingUser.length === 0) {
      throw new UnauthorizedError("User session is valid but user no longer exists");
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

  static async getConversationById(id: string, userIdInput: string | undefined) {
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

  static async chatWithConversation(
    conversationId: string,
    userIdInput: string | undefined,
    text: string,
  ) {
    const userId = this.ensureUserId(userIdInput);

    if (!text?.trim()) {
      throw new BadRequestError("Text is required");
    }

    const conversation = await db
      .select()
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

    await db.insert(messages).values({
      id: randomUUID(),
      conversationId,
      sender: "user",
      content: text.trim(),
    });

    const completionResult = await completion(text);
    const aiMessage = completionResult.choices[0]?.message?.content?.trim();
    if (!aiMessage) {
      throw new InternalServerError("AI did not return a response");
    }

    const savedAssistantMessage = await db
      .insert(messages)
      .values({
        id: randomUUID(),
        conversationId,
        sender: "assistant",
        content: aiMessage,
      })
      .returning();

    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    return new OK({
      message: "Chat response generated successfully",
      metadata: {
        conversationId,
        reply: savedAssistantMessage[0]?.content,
      },
    });
  }

  static async streamChatWithConversation(
    conversationId: string,
    userIdInput: string | undefined,
    text: string,
    onChunk: (chunk: string) => void,
  ) {
    const userId = this.ensureUserId(userIdInput);
    const userText = text?.trim();
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

    await db.insert(messages).values({
      id: randomUUID(),
      conversationId,
      sender: "user",
      content: userText,
    });

    const stream = await completionStream(userText);
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
}

export default ConversationService;
