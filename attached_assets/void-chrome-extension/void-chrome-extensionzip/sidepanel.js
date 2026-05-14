const DEFAULT_API_URL = window.location.origin;

let apiBase = DEFAULT_API_URL;
let currentTabUrl = "";
let currentTabTitle = "";
let isLoading = false;
let attachedFiles = [];

const chatArea = document.getElementById("chat-area");
const emptyState = document.getElementById("empty-state");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const clearBtn = document.getElementById("clear-btn");
const suggestionsEl = document.getElementById("suggestions");
const contextUrlText = document.getElementById("context-url-text");
const settingsBtn = document.getElementById("settings-btn");
const settingsPanel = document.getElementById("settings-panel");
const apiUrlInput = document.getElementById("api-url-input");
const saveSettingsBtn = document.getElementById("save-settings-btn");
const closeSettingsBtn = document.getElementById("close-settings-btn");
const attachBtn = document.getElementById("attach-btn");
const fileInput = document.getElementById("file-input");
const filePreviews = document.getElementById("file-previews");
const dropOverlay = document.getElementById("drop-overlay");
const appEl = document.getElementById("app");

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

function fileExtLabel(name) {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop().toUpperCase().slice(0, 4) : "FILE";
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(",")[1];
      resolve({ name: file.name, type: file.type, data: base64, dataUrl });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderFilePreviews() {
  filePreviews.innerHTML = "";
  attachedFiles.forEach((f, i) => {
    const pill = document.createElement("div");
    pill.className = "file-pill";

    let previewHtml = "";
    if (f.type.startsWith("image/")) {
      previewHtml = `<img class="file-pill-thumb" src="${f.dataUrl}" alt="${escapeHtml(f.name)}" />`;
    } else {
      previewHtml = `<div class="file-pill-icon">${fileExtLabel(f.name)}</div>`;
    }

    pill.innerHTML = `
      ${previewHtml}
      <span class="file-pill-name">${escapeHtml(f.name)}</span>
      <button class="file-pill-remove" data-index="${i}" title="Remove">&times;</button>
    `;
    filePreviews.appendChild(pill);
  });

  filePreviews.querySelectorAll(".file-pill-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      attachedFiles.splice(parseInt(btn.dataset.index), 1);
      renderFilePreviews();
    });
  });
}

async function addFiles(fileList) {
  const toRead = Array.from(fileList).slice(0, 5);
  for (const file of toRead) {
    try {
      const f = await readFileAsBase64(file);
      attachedFiles.push(f);
    } catch (e) {
      console.error("Failed to read file", e);
    }
  }
  renderFilePreviews();
  if (pipActive) pipRender();
}

function appendMessage(msg) {
  const existing = document.getElementById(`msg-${msg.id}`);
  if (existing) return;

  if (emptyState) emptyState.style.display = "none";

  const el = document.createElement("div");
  el.className = `message ${msg.role}`;
  el.id = `msg-${msg.id}`;

  let filesHtml = "";
  if (msg.files && msg.files.length > 0) {
    filesHtml = `<div class="msg-files">`;
    msg.files.forEach((f) => {
      if (f.type && f.type.startsWith("image/") && f.dataUrl) {
        filesHtml += `<img class="msg-file-thumb" src="${f.dataUrl}" alt="${escapeHtml(f.name)}" />`;
      } else {
        filesHtml += `<span class="msg-file-badge">${fileExtLabel(f.name)} ${escapeHtml(f.name)}</span>`;
      }
    });
    filesHtml += `</div>`;
  }

  const content = msg.role === "assistant"
    ? renderMarkdown(msg.content)
    : escapeHtml(msg.content).replace(/\n/g, "<br>");

  el.innerHTML = `
    <div class="bubble">${filesHtml}${content}</div>
    <div class="msg-time">${formatTime(msg.createdAt)}</div>
  `;
  chatArea.appendChild(el);
  chatArea.scrollTop = chatArea.scrollHeight;
  if (pipActive) pipRefreshFromDom();
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
  if ((!text && attachedFiles.length === 0) || isLoading) return;

  isLoading = true;
  const filesToSend = [...attachedFiles];
  attachedFiles = [];
  renderFilePreviews();
  messageInput.value = "";
  messageInput.style.height = "auto";
  sendBtn.disabled = true;

  showTypingIndicator();

  try {
    const res = await fetch(`${apiBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text || "Please analyze the attached file(s).",
        url: currentTabUrl || null,
        pageTitle: currentTabTitle || null,
        files: filesToSend.map(f => ({ name: f.name, type: f.type, data: f.data })),
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
    const userMsgWithFiles = { ...data.message, files: filesToSend };
    appendMessage(userMsgWithFiles);
    appendMessage(data.reply);
  } catch (e) {
    removeTypingIndicator();
    appendMessage({
      id: Date.now(),
      role: "assistant",
      content: "Could not connect to Void. Please try again.",
      url: null,
      createdAt: new Date().toISOString(),
    });
  } finally {
    isLoading = false;
    sendBtn.disabled = false;
    messageInput.focus();
  }
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
    chrome.storage.local.get([], () => {
      apiBase = window.location.origin;
      apiUrlInput.value = apiBase;
      resolve();
    });
  });
}

// Attach button
attachBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files.length > 0) {
    addFiles(fileInput.files);
    fileInput.value = "";
  }
});

// Drag and drop
let dragCounter = 0;
appEl.addEventListener("dragenter", (e) => {
  e.preventDefault();
  dragCounter++;
  dropOverlay.classList.add("active");
});
appEl.addEventListener("dragleave", () => {
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dropOverlay.classList.remove("active");
  }
});
appEl.addEventListener("dragover", (e) => e.preventDefault());
appEl.addEventListener("drop", (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.classList.remove("active");
  if (e.dataTransfer.files.length > 0) {
    addFiles(e.dataTransfer.files);
  }
});

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

// ── Picture-in-Picture private view ──────────────────────────────────────────
const PIP_W = 480;
const PIP_H = 560;
let pipCanvas, pipCtx, pipVideo, pipActive = false;
let pipMessages = []; // [{role, text}]
let pipInputText = "";
let pipCursorVisible = true;
let pipCursorInterval = null;

function pipWrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, cy);
      cy += lineH;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) { ctx.fillText(line, x, cy); cy += lineH; }
  return cy;
}

function pipRender() {
  if (!pipCtx) return;
  const ctx = pipCtx;
  const W = PIP_W, H = PIP_H;
  const pad = 16;
  const inputAreaH = 52;
  const footerH = 24;
  const msgBottom = H - inputAreaH - footerH;

  // Background
  ctx.fillStyle = "#07050f";
  ctx.fillRect(0, 0, W, H);

  // Header bar
  ctx.fillStyle = "#120d22";
  ctx.fillRect(0, 0, W, 38);
  ctx.fillStyle = "#7c3aed";
  ctx.beginPath();
  ctx.arc(14, 19, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e8e0ff";
  ctx.font = "bold 13px system-ui, sans-serif";
  ctx.fillText("VOID  —  private view", 26, 24);

  // Divider
  ctx.fillStyle = "#1e1530";
  ctx.fillRect(0, 38, W, 1);

  // Messages
  let cy = 50;
  const maxW = W - pad * 2 - 8;
  const msgs = pipMessages.slice(-30);

  for (const m of msgs) {
    if (cy > msgBottom - 8) break;
    const isUser = m.role === "user";

    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.fillStyle = isUser ? "#a78bfa" : "#34d399";
    ctx.fillText(isUser ? "YOU" : "VOID", pad, cy + 11);
    cy += 16;

    const lines = m.text.split("\n").filter(Boolean);
    let bubbleH = 0;
    ctx.font = "13px system-ui, sans-serif";
    for (const line of lines) {
      const words = line.split(" ");
      let cur = "";
      for (const w of words) {
        const t = cur ? cur + " " + w : w;
        if (ctx.measureText(t).width > maxW) { bubbleH += 18; cur = w; }
        else cur = t;
      }
      if (cur) bubbleH += 18;
    }
    bubbleH = Math.max(bubbleH, 18) + 12;

    const bx = pad - 4;
    const by = cy - 2;
    const bw = maxW + 8;
    ctx.fillStyle = isUser ? "#1a1035" : "#0d1f18";
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, Math.min(bubbleH, msgBottom - by - 8), 6);
    ctx.fill();

    ctx.fillStyle = isUser ? "#ddd6fe" : "#d1fae5";
    ctx.font = "13px system-ui, sans-serif";
    let ty = cy + 10;
    for (const line of lines) {
      if (!line.trim()) { ty += 9; continue; }
      ty = pipWrapText(ctx, line, pad, ty, maxW, 18);
      if (ty > msgBottom - 10) break;
    }
    cy = by + bubbleH + 8;
  }

  // Input area divider
  const inputY = H - inputAreaH - footerH;
  ctx.fillStyle = "#1e1530";
  ctx.fillRect(0, inputY, W, 1);

  // Input box background
  ctx.fillStyle = "#0f0a1e";
  ctx.fillRect(0, inputY + 1, W, inputAreaH);

  // Input box border
  ctx.strokeStyle = "#3b2d6e";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(pad - 4, inputY + 10, W - pad * 2 + 8 - 36, 30, 6);
  ctx.stroke();

  // Input text + cursor
  ctx.font = "13px system-ui, sans-serif";
  const displayText = pipInputText || "";
  const cursorStr = pipCursorVisible ? "│" : " ";
  ctx.fillStyle = displayText ? "#e8e0ff" : "#4a3a6e";
  const inputX = pad + 2;
  const inputTextY = inputY + 30;
  const inputMaxW = W - pad * 2 - 44;

  // Scroll the text so the end is always visible
  let visibleText = displayText;
  ctx.font = "13px system-ui, sans-serif";
  while (visibleText.length > 0 && ctx.measureText(visibleText + cursorStr).width > inputMaxW) {
    visibleText = visibleText.slice(1);
  }
  ctx.fillStyle = displayText ? "#e8e0ff" : "#4a3a6e";
  ctx.fillText(visibleText || "Type here, Enter to send...", inputX, inputTextY);

  // Cursor
  if (displayText) {
    ctx.fillStyle = pipCursorVisible ? "#a78bfa" : "transparent";
    const cursorX = inputX + ctx.measureText(visibleText).width + 1;
    ctx.fillRect(cursorX, inputTextY - 12, 2, 15);
  }

  // Send hint
  ctx.fillStyle = "#3b2d6e";
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillText("↵", W - pad - 16, inputTextY);

  // Attached files badge (above input box)
  if (attachedFiles.length > 0) {
    const badgeY = inputY + 3;
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.fillStyle = "#7c3aed";
    const label = `📎 ${attachedFiles.length} file${attachedFiles.length > 1 ? "s" : ""} attached  (sent with next message)`;
    ctx.fillText(label, pad, badgeY + 8);
  }

  // Footer
  ctx.fillStyle = "#080510";
  ctx.fillRect(0, H - footerH, W, footerH);
  ctx.fillStyle = "#2e2050";
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillText("Ctrl+Shift+L attach  •  Ctrl+V paste/image  •  Enter send", pad, H - 8);
}

function pipAddMessage(role, text) {
  pipMessages.push({ role, text });
  pipRender();
}

function pipRefreshFromDom() {
  pipMessages = [];
  chatArea.querySelectorAll(".message").forEach((el) => {
    const role = el.classList.contains("user") ? "user" : "assistant";
    const bubble = el.querySelector(".bubble");
    if (bubble) pipMessages.push({ role, text: bubble.innerText || bubble.textContent || "" });
  });
  pipRender();
}

async function togglePip() {
  const pipBtn = document.getElementById("pip-btn");

  if (!document.pictureInPictureEnabled) {
    alert("Picture-in-Picture is not supported in this browser. Try Chrome.");
    return;
  }

  if (pipActive) {
    try { await document.exitPictureInPicture(); } catch (_) {}
    pipActive = false;
    pipInputText = "";
    pipBtn.classList.remove("active");
    chatArea.style.visibility = "";
    suggestionsEl.style.visibility = "";
    clearInterval(pipCursorInterval);
    pipCursorInterval = null;
    return;
  }

  // Build canvas + video once
  if (!pipCanvas) {
    pipCanvas = document.createElement("canvas");
    pipCanvas.width = PIP_W;
    pipCanvas.height = PIP_H;
    pipCtx = pipCanvas.getContext("2d");

    const stream = pipCanvas.captureStream(20);
    pipVideo = document.createElement("video");
    pipVideo.srcObject = stream;
    pipVideo.muted = true;
    pipVideo.style.position = "fixed";
    pipVideo.style.opacity = "0";
    pipVideo.style.pointerEvents = "none";
    pipVideo.style.width = "1px";
    pipVideo.style.height = "1px";
    document.body.appendChild(pipVideo);

    pipVideo.addEventListener("leavepictureinpicture", () => {
      pipActive = false;
      pipInputText = "";
      pipBtn.classList.remove("active");
      chatArea.style.visibility = "";
      suggestionsEl.style.visibility = "";
      clearInterval(pipCursorInterval);
      pipCursorInterval = null;
    });
  }

  pipRefreshFromDom();
  await pipVideo.play();
  await pipVideo.requestPictureInPicture();

  pipActive = true;
  pipInputText = "";
  pipBtn.classList.add("active");

  // Start cursor blink
  if (!pipCursorInterval) {
    pipCursorInterval = setInterval(() => {
      pipCursorVisible = !pipCursorVisible;
      pipRender();
    }, 530);
  }

  // Hide chat content from main window while PiP is showing it
  chatArea.style.visibility = "hidden";
  suggestionsEl.style.visibility = "hidden";
}

// Keyboard capture for PiP input
document.addEventListener("keydown", async (e) => {
  if (!pipActive) return;
  // Don't capture if user is typing in a real input/textarea
  if (document.activeElement.tagName === "TEXTAREA" || document.activeElement.tagName === "INPUT") return;

  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const text = pipInputText.trim();
    if (!text || isLoading) return;
    pipInputText = "";
    pipRender();
    // Send via the normal sendMessage flow — populate the real input and fire it
    messageInput.value = text;
    await sendMessage();
  } else if (e.key === "Backspace") {
    e.preventDefault();
    pipInputText = pipInputText.slice(0, -1);
    pipRender();
  } else if (e.key === "Escape") {
    pipInputText = "";
    pipRender();
  } else if ((e.key === "v" || e.key === "V") && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    // Try reading rich clipboard first (may include images)
    if (navigator.clipboard.read) {
      navigator.clipboard.read().then(async (items) => {
        let handled = false;
        for (const item of items) {
          // Image paste
          const imgType = item.types.find((t) => t.startsWith("image/"));
          if (imgType) {
            const blob = await item.getType(imgType);
            const file = new File([blob], "pasted-image.png", { type: imgType });
            await addFiles([file]);
            pipRender();
            handled = true;
            break;
          }
          // Text paste
          if (item.types.includes("text/plain")) {
            const blob = await item.getType("text/plain");
            const text = await blob.text();
            pipInputText += text;
            pipRender();
            handled = true;
            break;
          }
        }
        if (!handled) {
          navigator.clipboard.readText().then((t) => { pipInputText += t; pipRender(); }).catch(() => {});
        }
      }).catch(() => {
        navigator.clipboard.readText().then((t) => { pipInputText += t; pipRender(); }).catch(() => {});
      });
    } else {
      navigator.clipboard.readText().then((t) => { pipInputText += t; pipRender(); }).catch(() => {});
    }
  } else if ((e.key === "l" || e.key === "L") && (e.ctrlKey || e.metaKey) && e.shiftKey) {
    // Ctrl+Shift+L — open file picker
    e.preventDefault();
    fileInput.click();
  } else if ((e.key === "l" || e.key === "L") && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    pipInputText += e.key;
    pipRender();
  }
});

document.getElementById("pip-btn").addEventListener("click", togglePip);

clearBtn.addEventListener("click", clearHistory);

settingsBtn.addEventListener("click", () => {
  settingsPanel.classList.add("active");
});

closeSettingsBtn.addEventListener("click", () => {
  settingsPanel.classList.remove("active");
});

saveSettingsBtn.addEventListener("click", () => {
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
  if (e.altKey && e.ctrlKey && e.shiftKey && (e.key === "G" || e.key === "g")) {
    appEl.classList.toggle("visible");
  }
});

async function init() {
  initStarfield();
  await loadSettings();
  appEl.classList.add("visible");
  getTabContext();
  await loadHistory();
  await loadSuggestions();
}

init();
