import { Router } from "express";
import OpenAI from "openai";

const router = Router();

// ── HTML → plain text extractor ───────────────────────────────────────────
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{3,}/g, "\n\n")
    .trim();
}

// ── Fetch a URL and return its readable text content ─────────────────────
async function fetchUrlContent(url: string): Promise<{ content: string; title: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; VoidAI/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : url;
    const content = htmlToText(html).slice(0, 20000);
    return { content, title };
  } catch {
    return null;
  }
}

// ── Detect a URL in text ──────────────────────────────────────────────────
function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0] : null;
}

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

  // ── Auto-fetch URL if one is detected in the message ─────────────────
  let resolvedContent = pageContent || null;
  let resolvedUrl = pageUrl || null;
  let resolvedTitle = pageTitle || null;

  let urlFetchFailed = false;
  if (!resolvedContent) {
    const detectedUrl = extractUrl(userText);
    if (detectedUrl) {
      const fetched = await fetchUrlContent(detectedUrl);
      if (fetched && fetched.content.length > 100) {
        resolvedContent = fetched.content;
        resolvedTitle = fetched.title;
        resolvedUrl = detectedUrl;
      } else {
        urlFetchFailed = true;
        resolvedUrl = detectedUrl;
      }
    }
  }

  const userMsg: ChatMessage = {
    id: Date.now(),
    role: "user",
    content: userText,
    url: resolvedUrl,
    createdAt: new Date().toISOString(),
  };
  chatHistory.push(userMsg);

  const pageContextBlock = resolvedContent
    ? `\n\n--- Page content (${resolvedTitle || resolvedUrl || "scanned page"}) ---\n${resolvedContent.slice(0, 18000)}\n--- End of page content ---`
    : "";

  const systemPrompt = urlFetchFailed
    ? `You are Void, a precise and intelligent AI assistant living in the browser sidebar. The user pasted this URL: ${resolvedUrl} — but you could not access it (it likely requires login or is behind a paywall). Explain this clearly and give them two options: (1) use the Scan Tab button (the crosshair icon) which reads their current tab directly through the browser extension, or (2) take a screenshot of the page and attach it using the paperclip button — you can then answer questions from the image. Be brief and helpful.`
    : `You are Void, a precise and intelligent AI assistant living in the browser sidebar. Be concise, helpful, and respond in the aesthetic of deep space — calm, precise, and knowledgeable. When analyzing files or images, be thorough and detailed.${resolvedUrl ? ` The user is currently on: ${resolvedTitle || resolvedUrl} (${resolvedUrl}).` : ""}${pageContextBlock}

When the user says "answer", "answer this", "answer all", "solve this", or similar — or when they paste a URL — find every question, problem, or exercise in the page content above and answer each one directly and completely. Number your answers clearly. Be specific and accurate. When images are attached showing questions or diagrams, analyze them carefully and solve each problem shown.`;

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
