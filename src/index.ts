import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/index.ts";
import { client as redisClient } from "./database/index.ts";
import routes from "./routes/index.ts";

const app = express();

app.use(cors());
app.use(helmet());
app.use(morgan("combined"));
app.use(compression());
// app.use(rateLimitMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/", routes);

app.use(
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const err = new Error("Not Found");
    (err as any).status = 404;
    next(err);
  },
);

app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const statusCode = err.status || 500;
    res.status(statusCode).json({
      status: "error",
      code: statusCode,
      message: err.message || "Internal Server Error",
    });
  },
);

const bootstrap = async () => {
  redisClient.on("error", (err) => console.log("Redis Client Error", err));
  await redisClient.connect();

  app.listen(env.port, () => {
    console.log(`Server is running on http://localhost:${env.port}`);
  });
};

bootstrap().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("Shutting down server...");
  process.exit(0);
});
