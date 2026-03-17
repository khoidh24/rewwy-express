import { Router } from "express";
import conversationController from "@/controllers/conversation/index.ts";

const router = Router();

router.post("/", conversationController.create);
router.get("/", conversationController.list);
router.get("/:id", conversationController.detail);
router.patch("/:id", conversationController.rename);
router.delete("/:id", conversationController.remove);
router.post("/:id/chat", conversationController.chat);

export default router;
