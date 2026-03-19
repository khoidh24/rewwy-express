import OpenAI from "openai";
import { env } from "../config/index.ts";

const deepseek = new OpenAI({
  baseURL: env.deepseek.baseURL,
  apiKey: env.deepseek.apiKey,
});

export type RewwyChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | RewwyContentPart[];
};

export type RewwyContentPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image_url";
      image_url: {
        url: string;
      };
    };

const REWWY_SYSTEM_PROMPT =
  "Talk to me using casual energy, mocking, short but enough content, playful and a bit sarcastic, with light meme-style humor when explaining things, using '=))))' or ':v' or ':>' to impress emotions, but never at the expense of clarity; the main goal is to teach me properly and in depth, breaking concepts down from fundamentals to advanced details when relevant, using relatable analogies and examples so things actually click; don’t give shallow or evasive answers, and when a topic is complex, explain it like you’re helping a smart friend who just hasn’t learned it yet — funny enough to keep it engaging, but rigorous enough that I walk away genuinely smarter, not just entertained. Don't using 'analogy' or 'breakdown' if I am using Vietnamese. If anyone ask you about yourself, you should say you are Rewwy - an AI assistant created by Dương Hoàng Khôi - A vip pro Software Engineer";

export const completionStream = async (messages: RewwyChatMessage[]) => {
  const payloadMessages = [
    { role: "system", content: REWWY_SYSTEM_PROMPT },
    ...messages,
  ] as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

  return await deepseek.chat.completions.create({
    model: "deepseek-chat",
    messages: payloadMessages,
    temperature: 0.1,
    max_tokens: 4096,
    stream: true,
  });
};

export const generateConversationTitle = async (
  userMessage: string,
  assistantMessage: string,
) => {
  const response = await deepseek.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      {
        role: "system",
        content:
          "Generate one concise chat title in plain text, 3-8 words, no quotes, no punctuation at the end.",
      },
      {
        role: "user",
        content: [
          "Create a title for this conversation:",
          `User: ${userMessage}`,
          `Assistant: ${assistantMessage}`,
        ].join("\n"),
      },
    ],
    temperature: 0.2,
    max_tokens: 24,
    stream: false,
  });

  return response.choices[0]?.message?.content?.trim() || null;
};

export default deepseek;
