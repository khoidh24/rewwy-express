import { UnauthorizedError } from "../core/error.response.ts";
import { env } from "../config/index.ts";
import express from "express";

export function XApiKeyMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const apiKey = req.headers["x-rewwy-api-key"] as string;

  if (!apiKey || apiKey !== env.xApiKey) {
    throw new UnauthorizedError("Invalid or missing API key");
  }

  next();
}
