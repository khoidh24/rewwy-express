import { Router } from "express";
import authRoutes from "./auth/auth.routes.ts";
import conversationRoutes from "./conversation/conversation.routes.ts";
import { XApiKeyMiddleware } from "@/middleware/x-api-key.ts";
import authMiddleware from "@/middleware/auth.ts";

const router = Router();

router.get("/", XApiKeyMiddleware, (req, res) => {
  res.json({ message: "Hello World" });
});

router.use("/v1/api", XApiKeyMiddleware, authRoutes);
router.use(
  "/v1/api/conversations",
  XApiKeyMiddleware,
  authMiddleware,
  conversationRoutes,
);

export default router;
