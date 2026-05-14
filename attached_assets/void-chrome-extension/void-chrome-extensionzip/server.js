const http = require("http");
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const PORT = 5000;

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const chatHistory = [];

const suggestions = [
  { text: "Explain this code to me", category: "coding" },
  { text: "How do I fix this bug?", category: "coding" },
  { text: "Write a function that...", category: "coding" },
  { text: "Summarize this page for me", category: "analysis" },
  { text: "What are the key points here?", category: "analysis" },
  { text: "Help me write an email", category: "writing" },
];

const mimeTypes = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function extractFileContent(file) {
  const { name, type, data } = file;
  const buffer = Buffer.from(data, "base64");

  if (type.startsWith("image/")) {
    return { kind: "image", name, type, data };
  }

  if (type === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
    try {
      const pdfParse = require("pdf-parse");
      const result = await pdfParse(buffer);
      return { kind: "text", name, content: result.text.slice(0, 20000) };
    } catch (e) {
      return { kind: "text", name, content: `[Could not parse PDF: ${e.message}]` };
    }
  }

  try {
    const text = buffer.toString("utf8");
    return { kind: "text", name, content: text.slice(0, 20000) };
  } catch (e) {
    return { kind: "text", name, content: `[Binary file — cannot display as text]` };
  }
}

async function buildMessageContent(text, files) {
  if (!files || files.length === 0) {
    return text;
  }

  const contentParts = [{ type: "text", text }];

  for (const file of files) {
    const extracted = await extractFileContent(file);

    if (extracted.kind === "image") {
      contentParts.push({
        type: "image_url",
        image_url: {
          url: `data:${extracted.type};base64,${extracted.data}`,
        },
      });
    } else {
      contentParts.push({
        type: "text",
        text: `\n\n--- Attached file: ${extracted.name} ---\n${extracted.content}\n--- End of file ---`,
      });
    }
  }

  return contentParts;
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url.split("?")[0];

  if (url === "/api/suggestions" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(suggestions));
    return;
  }

  if (url === "/api/chat/history" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(chatHistory));
    return;
  }

  if (url === "/api/chat/history" && req.method === "DELETE") {
    chatHistory.length = 0;
    res.writeHead(204);
    res.end();
    return;
  }

  if (url === "/api/chat" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const { message, url: pageUrl, pageTitle, files } = body;

      if (!message && (!files || files.length === 0)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Message or files are required" }));
        return;
      }

      const userText = message || "Please analyze the attached file(s).";

      const userMsg = {
        id: Date.now(),
        role: "user",
        content: userText,
        url: pageUrl || null,
        createdAt: new Date().toISOString(),
      };
      chatHistory.push(userMsg);

      const systemPrompt = pageUrl
        ? `You are Void, a precise and intelligent AI assistant living in the browser sidebar. The user is currently on: ${pageTitle || pageUrl} (${pageUrl}). Be concise, helpful, and respond in the aesthetic of deep space — calm, precise, and knowledgeable. When analyzing files, be thorough and detailed.`
        : `You are Void, a precise and intelligent AI assistant living in the browser sidebar. Be concise, helpful, and respond in the aesthetic of deep space — calm, precise, and knowledgeable. When analyzing files, be thorough and detailed.`;

      const userContent = await buildMessageContent(userText, files);

      const messages = [
        { role: "system", content: systemPrompt },
        ...chatHistory.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userContent },
      ];

      const hasImages = files && files.some((f) => f.type && f.type.startsWith("image/"));
      const model = hasImages ? "gpt-5-mini" : "gpt-5-mini";

      const completion = await openai.chat.completions.create({
        model,
        messages,
        max_completion_tokens: 8192,
      });

      const replyContent = completion.choices[0]?.message?.content || "No response received.";

      const replyMsg = {
        id: Date.now() + 1,
        role: "assistant",
        content: replyContent,
        url: null,
        createdAt: new Date().toISOString(),
      };
      chatHistory.push(replyMsg);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: userMsg, reply: replyMsg }));
    } catch (err) {
      console.error("AI error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to get AI response" }));
    }
    return;
  }

  let filePath = url === "/" ? "/sidepanel.html" : url;
  filePath = path.join(__dirname, filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Void is running on port ${PORT}`);
});
