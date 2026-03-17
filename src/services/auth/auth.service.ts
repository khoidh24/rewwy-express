import {
  BadRequestError,
  ConflictRequestError,
  ErrorResponse,
  InternalServerError,
  UnauthorizedError,
} from "@/core/error.response.ts";
import { db } from "@/database/index.ts";
import { users } from "@/models/schemas/user.model.ts";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { CREATED, OK } from "@/core/success.response.ts";
import { env } from "@/config/index.ts";
import { generateToken, verifyToken, type JwtExpiresIn } from "@/helpers/token.ts";
import logger from "@/middleware/logger.ts";
import { client as redisClient } from "@/database/index.ts";
import { parseExpiresInToSeconds } from "@/utils/time.ts";
import { parseRedisTokenSession } from "@/utils/redis-session.ts";
import jwt from "jsonwebtoken";

class AuthService {
  static async signup(email: string, password: string, displayName: string) {
    try {
      if (!email || !password || !displayName) {
        throw new BadRequestError("Missing required fields");
      }

      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, email));
      if (existingUser.length > 0) {
        throw new ConflictRequestError("User already exists");
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await db
        .insert(users)
        .values({ email, password: hashedPassword, name: displayName })
        .returning();

      if (!user || user.length === 0) {
        throw new InternalServerError("Failed to create user");
      }

      logger.info("User created successfully", { email: user[0]?.id });
      return new CREATED("User created successfully", user[0]?.email);
    } catch (error) {
      if (error instanceof ErrorResponse) {
        throw error;
      }

      throw new InternalServerError("Something went wrong while signing up");
    }
  }

  static async login(email: string, password: string) {
    try {
      if (!email || !password) {
        throw new BadRequestError("Missing required fields");
      }

      const user = await db.select().from(users).where(eq(users.email, email));
      if (user.length === 0) {
        throw new BadRequestError("User not found");
      }
      const isPasswordValid = await bcrypt.compare(
        password,
        user[0]?.password!,
      );
      if (!isPasswordValid) {
        throw new BadRequestError("Invalid password");
      }

      const accessToken = generateToken(
        String(user[0]?.id),
        env.jwt.accessTokenExpiresIn as JwtExpiresIn,
      );
      const refreshToken = generateToken(
        String(user[0]?.id),
        env.jwt.refreshTokenExpiresIn as JwtExpiresIn,
      );

      if (!accessToken || !refreshToken) {
        throw new InternalServerError("Failed to generate tokens");
      }

      const accessTokenTtlSeconds = parseExpiresInToSeconds(
        env.jwt.accessTokenExpiresIn,
      );
      const refreshTokenTtlSeconds = parseExpiresInToSeconds(
        env.jwt.refreshTokenExpiresIn,
      );

      const setToken = await redisClient.set(
        String(user[0]?.id),
        JSON.stringify({ accessToken, refreshToken }),
        { EX: Math.max(accessTokenTtlSeconds, refreshTokenTtlSeconds) },
      );

      if (!setToken) {
        logger.error("Failed to set tokens", { userId: user[0]?.id });
        throw new InternalServerError("Failed to set tokens");
      }

      return new OK({
        message: "Login successful",
        metadata: {
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      if (error instanceof ErrorResponse) {
        throw error;
      }

      throw new InternalServerError("Something went wrong while logging in");
    }
  }

  static async refreshToken(refreshToken: string) {
    try {
      if (!refreshToken) {
        throw new BadRequestError("Missing refresh token");
      }

      const decoded = verifyToken(refreshToken);
      if (!decoded) {
        throw new UnauthorizedError("Invalid or expired refresh token");
      }

      const payload = decoded as jwt.JwtPayload;
      const userId = payload.userId;
      if (!userId || typeof userId !== "string") {
        throw new UnauthorizedError("Invalid refresh token payload");
      }

      const rawSession = await redisClient.get(userId);
      const session = parseRedisTokenSession(rawSession);
      if (!session?.refreshToken) {
        throw new UnauthorizedError("Session expired, please login again");
      }

      if (session.refreshToken !== refreshToken) {
        throw new UnauthorizedError("Refresh token does not match active session");
      }

      const newAccessToken = generateToken(
        userId,
        env.jwt.accessTokenExpiresIn as JwtExpiresIn,
      );
      const newRefreshToken = generateToken(
        userId,
        env.jwt.refreshTokenExpiresIn as JwtExpiresIn,
      );

      const accessTokenTtlSeconds = parseExpiresInToSeconds(
        env.jwt.accessTokenExpiresIn,
      );
      const refreshTokenTtlSeconds = parseExpiresInToSeconds(
        env.jwt.refreshTokenExpiresIn,
      );

      await redisClient.set(
        userId,
        JSON.stringify({
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        }),
        { EX: Math.max(accessTokenTtlSeconds, refreshTokenTtlSeconds) },
      );

      return new OK({
        message: "Token refreshed successfully",
        metadata: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        },
      });
    } catch (error) {
      if (error instanceof ErrorResponse) {
        throw error;
      }

      throw new InternalServerError("Something went wrong while refreshing token");
    }
  }

  static async logout(refreshToken: string) {
    try {
      if (!refreshToken) {
        throw new BadRequestError("Missing refresh token");
      }

      const decoded = verifyToken(refreshToken);
      if (!decoded) {
        throw new UnauthorizedError("Invalid or expired refresh token");
      }

      const payload = decoded as jwt.JwtPayload;
      const userId = payload.userId;
      if (!userId || typeof userId !== "string") {
        throw new UnauthorizedError("Invalid refresh token payload");
      }

      const rawSession = await redisClient.get(userId);
      const session = parseRedisTokenSession(rawSession);
      if (!session?.refreshToken) {
        throw new UnauthorizedError("Session expired, please login again");
      }

      if (session.refreshToken !== refreshToken) {
        throw new UnauthorizedError("Refresh token does not match active session");
      }

      await redisClient.del(userId);

      return new OK({
        message: "Logged out successfully",
        metadata: null,
      });
    } catch (error) {
      if (error instanceof ErrorResponse) {
        throw error;
      }

      throw new InternalServerError("Something went wrong while logging out");
    }
  }
}

export default AuthService;
