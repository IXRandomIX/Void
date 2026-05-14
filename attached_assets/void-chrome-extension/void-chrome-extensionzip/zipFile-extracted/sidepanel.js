const DEFAULT_API_URL = "https://e358c732-c2a8-4718-a39a-c853502371fa-00-13bge1dgs0kqm.kirk.replit.dev";

let apiBase = DEFAULT_API_URL;
let stealthActive = false;
let currentTabUrl = "";
let currentTabTitle = "";
let isLoading = false;

const chatArea = document.getElementById("chat-area");
const emptyState = document.getElementById("empty-state");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const stealthBtn = document.getElementById("stealth-btn");
const stealthOverlay = document.getElementById("stealth-overlay");
const eyeOpen = document.getElementById("stealth-eye-open");
const eyeClosed = document.getElementById("stealth-eye-closed");
const clearBtn = document.getElementById("clear-btn");
const suggestionsEl = document.getElementById("suggestions");
const contextUrlText = document.getElementById("context-url-text");
const settingsBtn = document.getElementById("settings-btn");
const settingsPanel = document.getElementById("settings-panel");
const apiUrlInput = document.getElementById("api-url-input");
const saveSettingsBtn = document.getElementById("save-settings-btn");
const closeSettingsBtn = document.getElementById("close-settings-btn");

function initStarfield() {
  const starfield = document.getElementById("starfield");
  const count = 90;
  for (let i = 0; i < count; i++) {
    const star = document.createElement("div");
    star.className = "star";
    const size = Math.random() * 2 + 0.5;
    star.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 100}%;
      --dur: ${2 + Math.random() * 4}s;
      --delay: ${Math.random() * 4}s;
      --min-op: ${0.05 + Math.random() * 0.1};
      --max-op: ${0.5 + Math.random() * 0.5};
    `;
    starfield.appendChild(star);
  }
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderMarkdown(text) {
  return text
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code>${escapeHtml(code.trim())}</code></pre>`
    )
    .replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function appendMessage(msg) {
  const existing = document.getElementById(`msg-${msg.id}`);
  if (existing) return;

  if (emptyState) emptyState.style.display = "none";

  const el = document.createElement("div");
  el.className = `message ${msg.role}`;
  el.id = `msg-${msg.id}`;

  const content = msg.role === "assistant"
    ? renderMarkdown(msg.content)
    : escapeHtml(msg.content).replace(/\n/g, "<br>");

  el.innerHTML = `
    <div class="bubble">${content}</div>
    <div class="msg-time">${formatTime(msg.createdAt)}</div>
  `;
  chatArea.appendChild(el);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function showTypingIndicator() {
  removeTypingIndicator();
  if (emptyState) emptyState.style.display = "none";
  const el = document.createElement("div");
  el.className = "message assistant";
  el.id = "typing-indicator";
  el.innerHTML = `
    <div class="typing-indicator">
      <div class="typing-dots">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
      <span class="typing-label">thinking...</span>
    </div>
  `;
  chatArea.appendChild(el);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function removeTypingIndicator() {
  const el = document.getElementById("typing-indicator");
  if (el) el.remove();
}

async function loadHistory() {
  try {
    const res = await fetch(`${apiBase}/api/chat/history`);
    if (!res.ok) return;
    const messages = await res.json();
    messages.forEach(appendMessage);
    if (messages.length > 0 && emptyState) {
      emptyState.style.display = "none";
    }
  } catch (e) {
    console.error("Failed to load history", e);
  }
}

async function loadSuggestions() {
  try {
    const res = await fetch(`${apiBase}/api/suggestions`);
    if (!res.ok) return;
    const suggestions = await res.json();
    suggestionsEl.innerHTML = "";
    const show = suggestions.slice(0, 3);
    show.forEach((s) => {
      const chip = document.createElement("button");
      chip.className = "suggestion-chip";
      const icons = { coding: ">_", analysis: "~", general: "*", writing: "//", math: "∑" };
      chip.innerHTML = `<span class="chip-icon">${icons[s.category] || "*"}</span>${s.text}`;
      chip.addEventListener("click", () => {
        messageInput.value = s.text;
        messageInput.focus();
      });
      suggestionsEl.appendChild(chip);
    });
  } catch (e) {
    console.error("Failed to load suggestions", e);
  }
}

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || isLoading) return;

  isLoading = true;
  messageInput.value = "";
  messageInput.style.height = "auto";
  sendBtn.disabled = true;

  showTypingIndicator();

  try {
    const res = await fetch(`${apiBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        url: currentTabUrl || null,
        pageTitle: currentTabTitle || null,
      }),
    });

    removeTypingIndicator();

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      appendMessage({
        id: Date.now(),
        role: "assistant",
        content: `Error: ${err.error || "Failed to send message"}`,
        url: null,
        createdAt: new Date().toISOString(),
      });
      return;
    }

    const data = await res.json();
    appendMessage(data.message);
    appendMessage(data.reply);
  } catch (e) {
    removeTypingIndicator();
    appendMessage({
      id: Date.now(),
      role: "assistant",
      content: "Could not connect to Void backend. Please check your API URL in settings.",
      url: null,
      createdAt: new Date().toISOString(),
    });
  } finally {
    isLoading = false;
    sendBtn.disabled = false;
    messageInput.focus();
  }
}

function toggleStealth() {
  stealthActive = !stealthActive;
  stealthOverlay.classList.toggle("active", stealthActive);
  stealthBtn.classList.toggle("active", stealthActive);
  eyeOpen.style.display = stealthActive ? "none" : "block";
  eyeClosed.style.display = stealthActive ? "block" : "none";
  chrome.storage.local.set({ stealthActive });
}

async function clearHistory() {
  if (!confirm("Clear all conversation history?")) return;
  try {
    await fetch(`${apiBase}/api/chat/history`, { method: "DELETE" });
    chatArea.innerHTML = "";
    chatArea.appendChild(emptyState);
    emptyState.style.display = "flex";
  } catch (e) {
    console.error("Failed to clear history", e);
  }
}

function getTabContext() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      currentTabUrl = tabs[0].url || "";
      currentTabTitle = tabs[0].title || "";
      try {
        const url = new URL(currentTabUrl);
        contextUrlText.textContent = url.hostname || "local";
      } catch {
        contextUrlText.textContent = currentTabUrl.slice(0, 30) || "unknown";
      }
    }
  });
}

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["apiBase", "stealthActive"], (result) => {
      if (result.apiBase) {
        apiBase = result.apiBase;
        apiUrlInput.value = apiBase;
      } else {
        apiUrlInput.value = DEFAULT_API_URL;
      }
      if (result.stealthActive) {
        stealthActive = true;
        stealthOverlay.classList.add("active");
        stealthBtn.classList.add("active");
        eyeOpen.style.display = "none";
        eyeClosed.style.display = "block";
      }
      resolve();
    });
  });
}

sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 100) + "px";
});

stealthBtn.addEventListener("click", toggleStealth);
clearBtn.addEventListener("click", clearHistory);

settingsBtn.addEventListener("click", () => {
  settingsPanel.classList.add("active");
});

closeSettingsBtn.addEventListener("click", () => {
  settingsPanel.classList.remove("active");
});

saveSettingsBtn.addEventListener("click", () => {
  const newUrl = apiUrlInput.value.trim().replace(/\/$/, "");
  if (newUrl) {
    apiBase = newUrl;
    chrome.storage.local.set({ apiBase: newUrl });
  }
  settingsPanel.classList.remove("active");
  chatArea.innerHTML = "";
  if (emptyState) {
    chatArea.appendChild(emptyState);
    emptyState.style.display = "flex";
  }
  loadHistory();
  loadSuggestions();
});

document.addEventListener("keydown", (e) => {
  if (e.altKey && e.shiftKey && e.key === "S") {
    toggleStealth();
  }
});

async function init() {
  initStarfield();
  await loadSettings();
  getTabContext();
  await loadHistory();
  await loadSuggestions();
  messageInput.focus();
}

init();
