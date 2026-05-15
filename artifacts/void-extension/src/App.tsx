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

export default function App() {
  const apiBase = window.location.origin;

  // True when Void is opened directly in a browser tab (not inside the Replit workspace iframe)
  const isStandalone = window.self === window.top;

  const [liveUrl, setLiveUrl] = useState(window.location.host);
  const [tabUrl, setTabUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<{ text: string; category: string }[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [dropActive, setDropActive] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  const chatAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const scrollToBottom = useCallback(() => {
    if (chatAreaRef.current) chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
  }, []);

  useEffect(() => {
    fetch(`${apiBase}/api/chat/history`).then(r => r.ok ? r.json() : []).then(setMessages).catch(() => {});
    fetch(`${apiBase}/api/suggestions`).then(r => r.ok ? r.json() : []).then((d: { text: string; category: string }[]) => setSuggestions(d.slice(0, 3))).catch(() => {});
  }, [apiBase]);

  useEffect(() => { scrollToBottom(); }, [messages, isTyping, scrollToBottom]);

  // Track live URL
  useEffect(() => {
    const update = () => setLiveUrl(window.location.host);
    window.addEventListener("popstate", update);
    window.addEventListener("hashchange", update);
    return () => { window.removeEventListener("popstate", update); window.removeEventListener("hashchange", update); };
  }, []);

  // Receive live tab URL from Chrome extension
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "VOID_TAB_URL" && typeof e.data.url === "string") {
        try { setTabUrl(new URL(e.data.url).host); } catch {}
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Open Void at its live URL in a new browser tab
  function openInNewTab() {
    window.open(window.location.origin, "_blank", "noopener");
  }

  function copyLiveUrl() {
    navigator.clipboard.writeText(window.location.origin).then(() => {
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    });
  }

  async function addFiles(fileList: FileList | File[]) {
    const toRead = Array.from(fileList).slice(0, 5);
    const results: AttachedFile[] = [];
    for (const file of toRead) {
      try { results.push(await readFileAsBase64(file)); } catch {}
    }
    setAttachedFiles(prev => [...prev, ...results]);
  }

  async function sendMessage(textOverride?: string) {
    const text = (textOverride ?? inputValue).trim();
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
          url: null, pageTitle: null,
          files: filesToSend.map(f => ({ name: f.name, type: f.type, data: f.data })),
        }),
      });
      setIsTyping(false);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        setMessages(prev => [...prev, { id: Date.now(), role: "assistant" as const, content: `Error: ${err.error || "Failed"}`, createdAt: new Date().toISOString() }]);
        return;
      }
      const data = await res.json();
      setMessages(prev => [...prev, { ...data.message, files: filesToSend }, data.reply]);
    } catch {
      setIsTyping(false);
      setMessages(prev => [...prev, { id: Date.now(), role: "assistant" as const, content: "Could not connect to Void. Please try again.", createdAt: new Date().toISOString() }]);
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

  // Global shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.ctrlKey && e.shiftKey && (e.key === "G" || e.key === "g")) {
        setSidebarVisible(v => !v);
      }
      if (e.ctrlKey && e.shiftKey && !e.altKey && (e.key === "L" || e.key === "l")) {
        e.preventDefault();
        fileInputRef.current?.click();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current++; setDropActive(true); };
  const handleDragLeave = () => { dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setDropActive(false); } };
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); dragCounter.current = 0; setDropActive(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  const icons: Record<string, string> = { coding: ">_", analysis: "~", general: "*", writing: "//", math: "∑" };

  // Build class list for #app
  const appClass = [
    sidebarVisible ? "visible" : "",
    isStandalone ? "standalone" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      id="app"
      className={appClass}
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
          {/* Open in new tab — works from any other tab or page */}
          {!isStandalone && (
            <button
              className="icon-btn"
              id="newtab-btn"
              title="Open Void in a new tab (keep it open across all your tabs)"
              onClick={openInNewTab}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Live URL banner — shown when opened in standalone tab */}
      {isStandalone && (
        <div id="live-url-bar">
          <div className="live-url-inner">
            <div className="live-url-dot" />
            <span className="live-url-label">Live at</span>
            <span className="live-url-text">{liveUrl}</span>
            <button className="live-url-copy" onClick={copyLiveUrl} title="Copy URL">
              {urlCopied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <div id="context-bar">
        <div className="context-pill">
          <div className={`context-dot${tabUrl ? " live" : ""}`} />
          <span className="context-url">{tabUrl ?? liveUrl}</span>
        </div>
        {tabUrl && <span className="context-live-badge">LIVE</span>}
      </div>

      <div id="chat-area" ref={chatAreaRef}>
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
        <div id="suggestions">
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
                  : <div className="file-pill-icon">{fileExtLabel(f.name)}</div>}
                <span className="file-pill-name">{f.name}</span>
                <button className="file-pill-remove" onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}>&times;</button>
              </div>
            ))}
          </div>
        )}
        <div className="input-wrapper">
          <button className="icon-btn" title="Attach file (Ctrl+Shift+L)" onClick={() => fileInputRef.current?.click()}>
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
          <button id="send-btn" onClick={() => sendMessage()} disabled={isLoading}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        {!isStandalone && <div className="shortcut-hint">Alt+Ctrl+Shift+G to toggle</div>}
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

          {/* Live URL section */}
          <div>
            <div className="settings-label">Your Live URL</div>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <input className="settings-input" type="text" value={window.location.origin} readOnly style={{ flex: 1, margin: 0 }} />
              <button className="settings-save-btn" style={{ whiteSpace: "nowrap", padding: "8px 12px" }} onClick={copyLiveUrl}>
                {urlCopied ? "✓ Copied!" : "Copy"}
              </button>
            </div>
            <div className="settings-hint" style={{ marginTop: "6px" }}>
              Open this URL in any browser tab to use Void alongside your other tabs. Bookmark it or pin the tab.
            </div>
            {!isStandalone && (
              <button className="settings-save-btn" style={{ marginTop: "8px", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }} onClick={openInNewTab}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Open in New Tab →
              </button>
            )}
          </div>

          <div style={{ borderTop: "1px solid rgba(124,58,237,0.15)", paddingTop: "16px", marginTop: "4px" }}>
            <div className="settings-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Chrome Extension
            </div>
            <div className="settings-hint" style={{ marginBottom: "10px" }}>
              Or install as a <strong style={{ color: "#a78bfa" }}>real Chrome sidebar</strong> — persists across every tab like a native extension.
            </div>
            <div className="settings-hint" style={{ marginBottom: "12px", lineHeight: 1.7 }}>
              <strong style={{ color: "#94a3b8" }}>How to install:</strong><br />
              1. Deploy this app to get a live URL<br />
              2. Download all 4 files below into one folder<br />
              3. Go to <code style={{ color: "#a78bfa", fontSize: "10px" }}>chrome://extensions</code><br />
              4. Enable <strong style={{ color: "#94a3b8" }}>Developer mode</strong><br />
              5. Click <strong style={{ color: "#94a3b8" }}>Load unpacked</strong> → select that folder<br />
              6. Click the Void icon → enter your live URL<br />
              7. A <strong style={{ color: "#a78bfa" }}>✦ purple bubble</strong> appears on every page
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <a className="settings-save-btn" style={{ textAlign: "center", textDecoration: "none", display: "block" }} href="/chrome-ext/manifest.json" download="manifest.json">↓ manifest.json</a>
              <a className="settings-save-btn" style={{ textAlign: "center", textDecoration: "none", display: "block", background: "rgba(124,58,237,0.3)" }} href="/chrome-ext/background.js" download="background.js">↓ background.js</a>
              <a className="settings-save-btn" style={{ textAlign: "center", textDecoration: "none", display: "block", background: "rgba(124,58,237,0.3)" }} href="/chrome-ext/content.js" download="content.js">↓ content.js</a>
              <a className="settings-save-btn" style={{ textAlign: "center", textDecoration: "none", display: "block", background: "rgba(124,58,237,0.3)" }} href="/chrome-ext/sidepanel.html" download="sidepanel.html">↓ sidepanel.html</a>
            </div>
            <div className="settings-hint" style={{ marginTop: "8px" }}>Put all 4 files in one folder, then load as unpacked extension.</div>
          </div>

          <button className="settings-save-btn" onClick={() => setShowSettings(false)} style={{ marginTop: "8px" }}>Close</button>
          <span className="settings-close" onClick={() => setShowSettings(false)}>Close settings</span>
        </div>
      )}
    </div>
  );
}
