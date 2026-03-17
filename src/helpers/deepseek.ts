import OpenAI from "openai";
import { env } from "../config/index.ts";

const deepseek = new OpenAI({
  baseURL: env.deepseek.baseURL,
  apiKey: env.deepseek.apiKey,
});

export const completion = async (text: string) => {
  return await deepseek.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      {
        role: "system",
        content:
          "Analyze this text for sentiment, key topics, and named entities.",
      },
      { role: "user", content: text },
    ],
    temperature: 0.1,
    max_tokens: 256,
  });
};

export const completionStream = async (text: string) => {
  return await deepseek.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      {
        role: "system",
        content:
          "Analyze this text for sentiment, key topics, and named entities.",
      },
      { role: "user", content: text },
    ],
    temperature: 0.1,
    max_tokens: 256,
    stream: true,
  });
};

export default deepseek;
