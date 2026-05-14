import { useEffect, useRef, useState, useCallback } from "react";

interface AttachedFile {
  name: string;
  type: string;
  data: string;
  dataUrl: string;
}

interface Message {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  files?: AttachedFile[];
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMarkdown(text: string) {
  return text
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_: string, __: string, code: string) =>
      `<pre><code>${escapeHtml(code.trim())}</code></pre>`
    )
    .replace(/`([^`]+)`/g, (_: string, code: string) => `<code>${escapeHtml(code)}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

function fileExtLabel(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toUpperCase().slice(0, 4) : "FILE";
}

function readFileAsBase64(file: File): Promise<AttachedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve({ name: file.name, type: file.type, data: dataUrl.split(",")[1], dataUrl });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Starfield() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = "";
    for (let i = 0; i < 90; i++) {
      const star = document.createElement("div");
      star.className = "star";
      const size = Math.random() * 2 + 0.5;
      star.style.cssText = `width:${size}px;height:${size}px;left:${Math.random() * 100}%;top:${Math.random() * 100}%;--dur:${2 + Math.random() * 4}s;--delay:${Math.random() * 4}s;--min-op:${0.05 + Math.random() * 0.1};--max-op:${0.5 + Math.random() * 0.5};`;
      el.appendChild(star);
    }
  }, []);
  return <div id="starfield" ref={ref} />;
}

function MessageBubble({ msg }: { msg: Message }) {
  const content =
    msg.role === "assistant"
      ? renderMarkdown(msg.content)
      : escapeHtml(msg.content).replace(/\n/g, "<br>");
  return (
    <div className={`message ${msg.role}`} id={`msg-${msg.id}`}>
      <div className="bubble">
        {msg.files && msg.files.length > 0 && (
          <div className="msg-files">
            {msg.files.map((f, i) =>
              f.type.startsWith("image/") ? (
                <img key={i} className="msg-file-thumb" src={f.dataUrl} alt={f.name} />
              ) : (
                <span key={i} className="msg-file-badge">{fileExtLabel(f.name)} {f.name}</span>
              )
            )}
          </div>
        )}
        <span dangerouslySetInnerHTML={{ __html: content }} />
      </div>
      <div className="msg-time">{formatTime(msg.createdAt)}</div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="message assistant">
      <div className="typing-indicator">
        <div className="typing-dots">
          <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
        </div>
        <span className="typing-label">thinking...</span>
      </div>
    </div>
  );
}

const PIP_W = 480, PIP_H = 560;

export default function App() {
  const apiBase = window.location.origin;
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<{ text: string; category: string }[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [dropActive, setDropActive] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  // PiP refs
  const pipCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const pipMessagesRef = useRef<{ role: string; text: string }[]>([]);
  const pipInputRef = useRef("");
  const pipCursorVisibleRef = useRef(true);
  const pipCursorIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollToBottom = useCallback(() => {
    if (chatAreaRef.current) chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
  }, []);

  useEffect(() => {
    fetch(`${apiBase}/api/chat/history`).then(r => r.ok ? r.json() : []).then(setMessages).catch(() => {});
    fetch(`${apiBase}/api/suggestions`).then(r => r.ok ? r.json() : []).then((d: { text: string; category: string }[]) => setSuggestions(d.slice(0, 3))).catch(() => {});
  }, [apiBase]);

  useEffect(() => { scrollToBottom(); }, [messages, isTyping, scrollToBottom]);

  async function addFiles(fileList: FileList | File[]) {
    const toRead = Array.from(fileList).slice(0, 5);
    const results: AttachedFile[] = [];
    for (const file of toRead) {
      try { results.push(await readFileAsBase64(file)); } catch {}
    }
    setAttachedFiles(prev => [...prev, ...results]);
  }

  async function sendMessage() {
    const text = inputValue.trim();
    if ((!text && attachedFiles.length === 0) || isLoading) return;

    const filesToSend = [...attachedFiles];
    setAttachedFiles([]);
    setInputValue("");
    setIsLoading(true);
    setIsTyping(true);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const res = await fetch(`${apiBase}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text || "Please analyze the attached file(s).",
          url: null,
          pageTitle: null,
          files: filesToSend.map(f => ({ name: f.name, type: f.type, data: f.data })),
        }),
      });
      setIsTyping(false);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        setMessages(prev => [...prev, { id: Date.now(), role: "assistant", content: `Error: ${err.error || "Failed"}`, createdAt: new Date().toISOString() }]);
        return;
      }
      const data = await res.json();
      setMessages(prev => [...prev, { ...data.message, files: filesToSend }, data.reply]);
    } catch {
      setIsTyping(false);
      setMessages(prev => [...prev, { id: Date.now(), role: "assistant", content: "Could not connect to Void. Please try again.", createdAt: new Date().toISOString() }]);
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  }

  async function clearHistory() {
    if (!confirm("Clear all conversation history?")) return;
    await fetch(`${apiBase}/api/chat/history`, { method: "DELETE" }).catch(() => {});
    setMessages([]);
  }

  // PiP rendering
  function pipRender() {
    const ctx = pipCtxRef.current;
    if (!ctx) return;
    const W = PIP_W, H = PIP_H, pad = 16;
    const inputAreaH = 52, footerH = 24;
    const msgBottom = H - inputAreaH - footerH;

    ctx.fillStyle = "#07050f";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#120d22";
    ctx.fillRect(0, 0, W, 38);
    ctx.fillStyle = "#7c3aed";
    ctx.beginPath(); ctx.arc(14, 19, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e8e0ff";
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.fillText("VOID  —  private view", 26, 24);
    ctx.fillStyle = "#1e1530";
    ctx.fillRect(0, 38, W, 1);

    let cy = 50;
    const maxW = W - pad * 2 - 8;
    const msgs = pipMessagesRef.current.slice(-30);

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
        const words = line.split(" "); let cur = "";
        for (const w of words) {
          const t = cur ? cur + " " + w : w;
          if (ctx.measureText(t).width > maxW) { bubbleH += 18; cur = w; } else cur = t;
        }
        if (cur) bubbleH += 18;
      }
      bubbleH = Math.max(bubbleH, 18) + 12;
      ctx.fillStyle = isUser ? "#1a1035" : "#0d1f18";
      ctx.beginPath();
      ctx.roundRect(pad - 4, cy - 2, maxW + 8, Math.min(bubbleH, msgBottom - cy - 8), 6);
      ctx.fill();
      ctx.fillStyle = isUser ? "#ddd6fe" : "#d1fae5";
      ctx.font = "13px system-ui, sans-serif";
      let ty = cy + 10;
      for (const line of lines) {
        if (!line.trim()) { ty += 9; continue; }
        const words = line.split(" "); let cur2 = "";
        for (const w of words) {
          const t = cur2 ? cur2 + " " + w : w;
          if (ctx.measureText(t).width > maxW && cur2) { ctx.fillText(cur2, pad, ty); ty += 18; cur2 = w; } else cur2 = t;
        }
        if (cur2) { ctx.fillText(cur2, pad, ty); ty += 18; }
        if (ty > msgBottom - 10) break;
      }
      cy = cy - 2 + bubbleH + 8;
    }

    const inputY = H - inputAreaH - footerH;
    ctx.fillStyle = "#1e1530"; ctx.fillRect(0, inputY, W, 1);
    ctx.fillStyle = "#0f0a1e"; ctx.fillRect(0, inputY + 1, W, inputAreaH);
    ctx.strokeStyle = "#3b2d6e"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(pad - 4, inputY + 10, W - pad * 2 + 8 - 36, 30, 6); ctx.stroke();

    ctx.font = "13px system-ui, sans-serif";
    const inputText = pipInputRef.current;
    const cursorStr = pipCursorVisibleRef.current ? "│" : " ";
    const inputMaxW = W - pad * 2 - 44;
    let visibleText = inputText;
    while (visibleText.length > 0 && ctx.measureText(visibleText + cursorStr).width > inputMaxW) {
      visibleText = visibleText.slice(1);
    }
    ctx.fillStyle = inputText ? "#e8e0ff" : "#4a3a6e";
    ctx.fillText(visibleText || "Type here, Enter to send...", pad + 2, inputY + 30);
    if (inputText) {
      ctx.fillStyle = pipCursorVisibleRef.current ? "#a78bfa" : "transparent";
      ctx.fillRect(pad + 2 + ctx.measureText(visibleText).width + 1, inputY + 18, 2, 15);
    }
    ctx.fillStyle = "#3b2d6e"; ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("↵", W - pad - 16, inputY + 30);

    ctx.fillStyle = "#080510"; ctx.fillRect(0, H - footerH, W, footerH);
    ctx.fillStyle = "#2e2050"; ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("Ctrl+Shift+L attach  •  Ctrl+V paste  •  Enter send", pad, H - 8);
  }

  function pipRefreshFromDom() {
    pipMessagesRef.current = [];
    if (chatAreaRef.current) {
      chatAreaRef.current.querySelectorAll(".message").forEach(el => {
        const role = el.classList.contains("user") ? "user" : "assistant";
        const bubble = el.querySelector(".bubble");
        if (bubble) pipMessagesRef.current.push({ role, text: (bubble as HTMLElement).innerText || bubble.textContent || "" });
      });
    }
    pipRender();
  }

  async function togglePip() {
    if (!document.pictureInPictureEnabled) {
      alert("Picture-in-Picture is not supported in this browser. Try Chrome.");
      return;
    }
    if (pipActive) {
      try { await document.exitPictureInPicture(); } catch {}
      setPipActive(false);
      pipInputRef.current = "";
      if (pipCursorIntervalRef.current) { clearInterval(pipCursorIntervalRef.current); pipCursorIntervalRef.current = null; }
      return;
    }

    if (!pipCanvasRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = PIP_W; canvas.height = PIP_H;
      pipCanvasRef.current = canvas;
      pipCtxRef.current = canvas.getContext("2d");
      const stream = canvas.captureStream(20);
      const video = document.createElement("video");
      video.srcObject = stream; video.muted = true;
      video.style.cssText = "position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;";
      document.body.appendChild(video);
      pipVideoRef.current = video;
      video.addEventListener("leavepictureinpicture", () => {
        setPipActive(false);
        pipInputRef.current = "";
        if (pipCursorIntervalRef.current) { clearInterval(pipCursorIntervalRef.current); pipCursorIntervalRef.current = null; }
      });
    }
    pipRefreshFromDom();
    await pipVideoRef.current!.play();
    await pipVideoRef.current!.requestPictureInPicture();
    setPipActive(true);
    pipInputRef.current = "";
    if (!pipCursorIntervalRef.current) {
      pipCursorIntervalRef.current = setInterval(() => {
        pipCursorVisibleRef.current = !pipCursorVisibleRef.current;
        pipRender();
      }, 530);
    }
  }

  // PiP keyboard capture
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if (!pipActive) return;
      const active = document.activeElement;
      if (active?.tagName === "TEXTAREA" || active?.tagName === "INPUT") return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const text = pipInputRef.current.trim();
        if (!text || isLoading) return;
        pipInputRef.current = "";
        pipRender();
        if (textareaRef.current) textareaRef.current.value = text;
        setInputValue(text);
        setTimeout(() => sendMessage(), 0);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        pipInputRef.current = pipInputRef.current.slice(0, -1);
        pipRender();
      } else if (e.key === "Escape") {
        pipInputRef.current = "";
        pipRender();
      } else if ((e.key === "v" || e.key === "V") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const text = await navigator.clipboard.readText().catch(() => "");
        if (text) { pipInputRef.current += text; pipRender(); }
      } else if ((e.key === "l" || e.key === "L") && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        fileInputRef.current?.click();
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        pipInputRef.current += e.key;
        pipRender();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [pipActive, isLoading]);

  // Refresh PiP when messages change
  useEffect(() => {
    if (pipActive) setTimeout(() => pipRefreshFromDom(), 50);
  }, [messages, pipActive]);

  // Drag and drop
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current++; setDropActive(true); };
  const handleDragLeave = () => { dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setDropActive(false); } };
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); dragCounter.current = 0; setDropActive(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  const icons: Record<string, string> = { coding: ">_", analysis: "~", general: "*", writing: "//", math: "∑" };

  return (
    <div
      id="app"
      className="visible"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Starfield />

      <div id="header">
        <div id="logo"><div className="logo-dot" />VOID</div>
        <div className="header-actions">
          <button className="icon-btn" title="Settings" onClick={() => setShowSettings(true)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <button className="icon-btn" title="Clear history" onClick={clearHistory}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
          <button className={`icon-btn${pipActive ? " active" : ""}`} id="pip-btn" title="Private view — hides chat from screen share" onClick={togglePip}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <rect x="12" y="10" width="8" height="5" rx="1" fill="currentColor" stroke="none"/>
            </svg>
          </button>
        </div>
      </div>

      <div id="context-bar">
        <div className="context-pill">
          <div className="context-dot" />
          <span className="context-url">void.preview</span>
        </div>
      </div>

      <div id="chat-area" ref={chatAreaRef} style={pipActive ? { visibility: "hidden" } : {}}>
        {messages.length === 0 && !isTyping && (
          <div className="empty-state">
            <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            <span className="empty-text">Awaiting input in the void...</span>
          </div>
        )}
        {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
        {isTyping && <TypingIndicator />}
      </div>

      {suggestions.length > 0 && (
        <div id="suggestions" style={pipActive ? { visibility: "hidden" } : {}}>
          {suggestions.map((s, i) => (
            <button key={i} className="suggestion-chip" onClick={() => { setInputValue(s.text); textareaRef.current?.focus(); }}>
              <span className="chip-icon">{icons[s.category] || "*"}</span>{s.text}
            </button>
          ))}
        </div>
      )}

      <div id="input-area">
        {attachedFiles.length > 0 && (
          <div id="file-previews">
            {attachedFiles.map((f, i) => (
              <div key={i} className="file-pill">
                {f.type.startsWith("image/")
                  ? <img className="file-pill-thumb" src={f.dataUrl} alt={f.name} />
                  : <div className="file-pill-icon">{fileExtLabel(f.name)}</div>
                }
                <span className="file-pill-name">{f.name}</span>
                <button className="file-pill-remove" onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}>&times;</button>
              </div>
            ))}
          </div>
        )}
        <div className="input-wrapper">
          <button className="icon-btn" title="Attach file" onClick={() => fileInputRef.current?.click()}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>
          <input ref={fileInputRef} type="file" multiple accept="*/*" style={{ display: "none" }}
            onChange={e => { if (e.target.files?.length) { addFiles(e.target.files); e.target.value = ""; } }} />
          <textarea
            ref={textareaRef}
            id="message-input"
            placeholder="Message Void..."
            rows={1}
            value={inputValue}
            onChange={e => {
              setInputValue(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
            }}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          />
          <button id="send-btn" onClick={sendMessage} disabled={isLoading}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <div className="shortcut-hint">Alt+Ctrl+Shift+G to toggle</div>
      </div>

      {dropActive && (
        <div id="drop-overlay" className="active">
          <div className="drop-inner">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
            <span>Drop files into Void</span>
          </div>
        </div>
      )}

      {showSettings && (
        <div id="settings-panel" className="active">
          <div className="settings-title">VOID CONFIGURATION</div>
          <div>
            <div className="settings-label">API Base URL</div>
            <input className="settings-input" type="text" value={apiBase} readOnly />
            <div className="settings-hint">Void is running on this server — no configuration needed.</div>
          </div>
          <button className="settings-save-btn" onClick={() => setShowSettings(false)}>Close</button>
          <span className="settings-close" onClick={() => setShowSettings(false)}>Close settings</span>
        </div>
      )}
    </div>
  );
}
