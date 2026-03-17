import conversationService from "@/services/conversation/conversation.service.ts";
import express from "express";
import { BadRequestError } from "@/core/error.response.ts";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseUuid = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string" || !UUID_REGEX.test(value)) {
    throw new BadRequestError(`${fieldName} must be a valid UUID`);
  }
  return value;
};

class ConversationController {
  create = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      return res
        .status(201)
        .json(
          await conversationService.createConversation(
            req.userId,
            req.body.title,
          ),
        );
    } catch (error) {
      next(error);
    }
  };

  list = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      return res.json(
        await conversationService.getAllConversations(req.userId),
      );
    } catch (error) {
      next(error);
    }
  };

  detail = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      const conversationId = parseUuid(req.params.id, "conversationId");
      return res.json(
        await conversationService.getConversationById(
          conversationId,
          req.userId,
        ),
      );
    } catch (error) {
      next(error);
    }
  };

  rename = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      const conversationId = parseUuid(req.params.id, "conversationId");
      return res.json(
        await conversationService.renameConversation(
          conversationId,
          req.userId,
          req.body.title,
        ),
      );
    } catch (error) {
      next(error);
    }
  };

  remove = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      const conversationId = parseUuid(req.params.id, "conversationId");
      return res.json(
        await conversationService.deleteConversation(
          conversationId,
          req.userId,
        ),
      );
    } catch (error) {
      next(error);
    }
  };

  chat = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    let streamStarted = false;
    try {
      const conversationId = parseUuid(req.params.id, "conversationId");
      const text = req.body.text as string;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      streamStarted = true;
      res.flushHeaders?.();

      const result = await conversationService.streamChatWithConversation(
        conversationId,
        req.userId,
        text,
        (chunk) => {
          res.write(`event: chunk\ndata: ${JSON.stringify({ chunk })}\n\n`);
        },
      );

      res.write(`event: done\ndata: ${JSON.stringify(result)}\n\n`);
      res.end();
    } catch (error) {
      if (!streamStarted) {
        return next(error);
      }

      const message =
        error instanceof Error ? error.message : "Internal Server Error";
      res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      res.end();
    }
  };
}

export default new ConversationController();
