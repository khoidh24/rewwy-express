import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "../config/index.ts";
import { createClient } from "redis";

const sql = neon(env.database.dbUrl!);
export const db = drizzle({ client: sql });

const redisPort = env.redis.port ? Number(env.redis.port) : undefined;
const redisSocket = {
  ...(env.redis.host ? { host: env.redis.host } : {}),
  ...(redisPort !== undefined && Number.isFinite(redisPort)
    ? { port: redisPort }
    : {}),
};

export const client = createClient({
  ...(env.redis.username ? { username: env.redis.username } : {}),
  ...(env.redis.password ? { password: env.redis.password } : {}),
  socket: redisSocket,
});
