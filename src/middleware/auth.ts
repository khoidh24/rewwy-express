import { UnauthorizedError } from "@/core/error.response.ts";
import { verifyToken } from "@/helpers/token.ts";
import { client as redisClient } from "@/database/index.ts";
import { parseRedisTokenSession } from "@/utils/redis-session.ts";
import express from "express";
import jwt from "jsonwebtoken";

const authMiddleware = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;
    const tokenMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
    const token = tokenMatch?.[1]?.trim();

    if (!token) {
      throw new UnauthorizedError("Missing bearer token");
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      throw new UnauthorizedError("Invalid or expired token");
    }

    const payload = decoded as jwt.JwtPayload;
    if (!payload.userId || typeof payload.userId !== "string") {
      throw new UnauthorizedError("Invalid token payload");
    }

    const cachedTokenPayload = await redisClient.get(payload.userId);
    if (!cachedTokenPayload) {
      throw new UnauthorizedError("Session expired, please login again");
    }

    const session = parseRedisTokenSession(cachedTokenPayload);
    const cachedAccessToken = session?.accessToken;

    if (!cachedAccessToken || cachedAccessToken.trim() !== token) {
      throw new UnauthorizedError("Token does not match active session");
    }

    req.userId = payload.userId;

    next();
  } catch (error) {
    next(error);
  }
};

export default authMiddleware;
