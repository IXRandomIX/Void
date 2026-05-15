import { Router } from "express";
import OpenAI from "openai";

const router = Router();

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  url: string | null;
  createdAt: string;
}

const chatHistory: ChatMessage[] = [];

const suggestions = [
  { text: "Explain this code to me", category: "coding" },
  { text: "How do I fix this bug?", category: "coding" },
  { text: "Write a function that...", category: "coding" },
  { text: "Summarize this page for me", category: "analysis" },
  { text: "What are the key points here?", category: "analysis" },
  { text: "Help me write an email", category: "writing" },
];

function getOpenAI() {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "no-key",
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

interface FileAttachment {
  name: string;
  type: string;
  data: string;
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

async function buildMessageContent(text: string, files: FileAttachment[]): Promise<string | ContentPart[]> {
  if (!files || files.length === 0) return text;

  const parts: ContentPart[] = [{ type: "text", text }];
  for (const file of files) {
    if (file.type.startsWith("image/")) {
      parts.push({ type: "image_url", image_url: { url: `data:${file.type};base64,${file.data}` } });
    } else {
      const buf = Buffer.from(file.data, "base64");
      const content = buf.toString("utf8").slice(0, 20000);
      parts.push({ type: "text", text: `\n\n--- Attached file: ${file.name} ---\n${content}\n--- End of file ---` });
    }
  }
  return parts;
}

router.get("/suggestions", (_req, res) => {
  res.json(suggestions);
});

router.get("/chat/history", (_req, res) => {
  res.json(chatHistory);
});

router.delete("/chat/history", (_req, res) => {
  chatHistory.length = 0;
  res.status(204).end();
});

router.post("/chat", async (req, res) => {
  const { message, url: pageUrl, pageTitle, pageContent, files } = req.body as {
    message: string;
    url?: string;
    pageTitle?: string;
    pageContent?: string;
    files?: FileAttachment[];
  };

  if (!message && (!files || files.length === 0)) {
    res.status(400).json({ error: "Message or files are required" });
    return;
  }

  const userText = message || "Please analyze the attached file(s).";

  const userMsg: ChatMessage = {
    id: Date.now(),
    role: "user",
    content: userText,
    url: pageUrl || null,
    createdAt: new Date().toISOString(),
  };
  chatHistory.push(userMsg);

  const pageContextBlock = pageContent
    ? `\n\n--- Current page content (${pageTitle || pageUrl || "unknown page"}) ---\n${pageContent.slice(0, 18000)}\n--- End of page content ---`
    : "";

  const systemPrompt = `You are Void, a precise and intelligent AI assistant living in the browser sidebar. Be concise, helpful, and respond in the aesthetic of deep space — calm, precise, and knowledgeable. When analyzing files, be thorough and detailed.${pageUrl ? ` The user is currently on: ${pageTitle || pageUrl} (${pageUrl}).` : ""}${pageContextBlock}

When the user says "answer", "answer this", "solve this", or similar, use the page content above to directly answer any questions or problems visible on the page. Be specific and accurate.`;

  try {
    const openai = getOpenAI();
    const userContent = await buildMessageContent(userText, files || []);

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...chatHistory.slice(0, -1).map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: userContent as string },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages,
      max_completion_tokens: 2048,
    });

    const replyContent = completion.choices[0]?.message?.content || "No response received.";

    const replyMsg: ChatMessage = {
      id: Date.now() + 1,
      role: "assistant",
      content: replyContent,
      url: null,
      createdAt: new Date().toISOString(),
    };
    chatHistory.push(replyMsg);

    res.json({ message: userMsg, reply: replyMsg });
  } catch (err) {
    req.log.error({ err }, "AI chat error");
    chatHistory.pop();
    res.status(500).json({ error: "Failed to get AI response" });
  }
});

export default router;
