import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { env } from "./src/config/index.ts";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/models/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: env.database.dbUrl!,
  },
});
