import { users } from "./schemas/user.model.ts";
import { conversations, messages } from "./schemas/conversation.model.ts.ts";

export { users, conversations, messages };

export const models = {
  users,
  conversations,
  messages,
};
