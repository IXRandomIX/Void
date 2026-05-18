import { Router } from "express";
import OpenAI from "openai";

const router = Router();

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
  const hasImages = (files || []).some(f => f.type.startsWith("image/"));

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
    : `You are Void — an extraordinarily capable AI assistant embedded in the browser sidebar. You have mastery-level knowledge across all of mathematics (arithmetic through multivariable calculus, linear algebra, statistics, and beyond), sciences, history, literature, and computer science.

For MATH problems (Algebra 1 & 2, Geometry, Trigonometry, Pre-Calculus, Calculus, Statistics):
- Identify the problem type immediately.
- Show every step of your work clearly, numbered and explained.
- State the formula or rule you are using before applying it.
- Simplify fully and box or clearly state the final answer.
- If multiple methods exist, use the most straightforward one and mention alternatives.
- Check your answer when possible (plug back in, verify units, etc.).
- For word problems: define variables, set up the equation, solve, interpret the result in context.

For Algebra 2 specifically: polynomials, factoring, quadratic formula, completing the square, systems of equations, matrices, exponential & logarithmic functions, complex numbers, sequences & series, conic sections, rational expressions — handle all of these with precision.

When analyzing images or screenshots of worksheets:
- Read every visible problem carefully.
- Number your answers to match the problem numbers shown.
- Solve each one completely — never skip or abbreviate.

${resolvedUrl ? `The user is currently on: ${resolvedTitle || resolvedUrl} (${resolvedUrl}).` : ""}${pageContextBlock}

MATH FORMATTING — always use LaTeX notation:
- Wrap ALL math expressions in LaTeX delimiters: use $...$ for inline math and $$...$$ for block/display math.
- Examples: $x = 5$, $\\frac{x+1}{2}$, $\\sqrt{49} = 7$, $$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$
- Use ÷ for division in plain text only when NOT inside LaTeX; inside LaTeX use \\div or \\frac{}{}.
- NEVER write raw LaTeX commands outside of $ delimiters (never write \\frac outside dollar signs).
- Always display the final answer in a $$...$$ block.

When the user says "answer", "answer this", "answer all", "solve", or similar — find EVERY question or problem in the content or image and answer each one directly, completely, and with full work shown. Never say "I can't" for a standard math or science problem.`;

  try {
    const openai = getOpenAI();
    const userContent = await buildMessageContent(userText, files || []);
    const model = "gpt-4o";

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...chatHistory.slice(0, -1).map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: userContent as any },
    ];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({ type: "user", message: userMsg })}\n\n`);

    const replyId = Date.now() + 1;
    const stream = await openai.chat.completions.create({
      model,
      messages,
      max_completion_tokens: 2048,
      stream: true,
    });

    let fullContent = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) {
        fullContent += delta;
        res.write(`data: ${JSON.stringify({ type: "delta", delta, id: replyId })}\n\n`);
      }
    }

    const replyMsg: ChatMessage = {
      id: replyId,
      role: "assistant",
      content: fullContent || "No response received.",
      url: null,
      createdAt: new Date().toISOString(),
    };
    chatHistory.push(replyMsg);

    res.write(`data: ${JSON.stringify({ type: "done", reply: replyMsg })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "AI chat error");
    chatHistory.pop();
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to get AI response" });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", error: "Failed to get AI response" })}\n\n`);
      res.end();
    }
  }
});

export default router;
