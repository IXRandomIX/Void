import { useEffect, useRef, useState, useCallback } from "react";

const DEFAULT_API_URL = "https://e358c732-c2a8-4718-a39a-c853502371fa-00-13bge1dgs0kqm.kirk.replit.dev";

interface Message {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
      star.style.cssText = `
        width:${size}px;height:${size}px;
        left:${Math.random() * 100}%;top:${Math.random() * 100}%;
        --dur:${2 + Math.random() * 4}s;--delay:${Math.random() * 4}s;
        --min-op:${0.05 + Math.random() * 0.1};--max-op:${0.5 + Math.random() * 0.5};
      `;
      el.appendChild(star);
    }
  }, []);
  return <div id="starfield" ref={ref} />;
}

function TypingIndicator() {
  return (
    <div className="message assistant">
      <div className="typing-indicator">
        <div className="typing-dots">
          <div className="typing-dot" />
          <div className="typing-dot" />
          <div className="typing-dot" />
        </div>
        <span className="typing-label">thinking...</span>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const content =
    msg.role === "assistant"
      ? renderMarkdown(msg.content)
      : escapeHtml(msg.content).replace(/\n/g, "<br>");
  return (
    <div className={`message ${msg.role}`} id={`msg-${msg.id}`}>
      <div className="bubble" dangerouslySetInnerHTML={{ __html: content }} />
      <div className="msg-time">{formatTime(msg.createdAt)}</div>
    </div>
  );
}

export default function App() {
  const [apiBase, setApiBase] = useState(() => localStorage.getItem("apiBase") || DEFAULT_API_URL);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [stealthActive, setStealthActive] = useState(() => localStorage.getItem("stealthActive") === "true");
  const [showSettings, setShowSettings] = useState(false);
  const [apiUrlInput, setApiUrlInput] = useState(() => localStorage.getItem("apiBase") || DEFAULT_API_URL);
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<{ text: string; category: string }[]>([]);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, []);

  const loadHistory = useCallback(async (base: string) => {
    try {
      const res = await fetch(`${base}/api/chat/history`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data);
    } catch {
      // silently ignore
    }
  }, []);

  const loadSuggestions = useCallback(async (base: string) => {
    try {
      const res = await fetch(`${base}/api/suggestions`);
      if (!res.ok) return;
      const data = await res.json();
      setSuggestions(data.slice(0, 3));
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    loadHistory(apiBase);
    loadSuggestions(apiBase);
  }, [apiBase, loadHistory, loadSuggestions]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.key === "S") toggleStealth();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [stealthActive]);

  function toggleStealth() {
    setStealthActive((prev) => {
      const next = !prev;
      localStorage.setItem("stealthActive", String(next));
      return next;
    });
  }

  async function sendMessage() {
    const text = inputValue.trim();
    if (!text || isLoading) return;

    setInputValue("");
    setIsLoading(true);
    setIsTyping(true);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const res = await fetch(`${apiBase}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, url: null, pageTitle: null }),
      });

      setIsTyping(false);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        setMessages((prev) => [
          ...prev,
          { id: Date.now(), role: "assistant", content: `Error: ${err.error || "Failed to send message"}`, createdAt: new Date().toISOString() },
        ]);
        return;
      }

      const data = await res.json();
      setMessages((prev) => [...prev, data.message, data.reply]);
    } catch {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: "assistant",
          content: "Could not connect to Void backend. Please check your API URL in settings.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  }

  async function clearHistory() {
    if (!confirm("Clear all conversation history?")) return;
    try {
      await fetch(`${apiBase}/api/chat/history`, { method: "DELETE" });
      setMessages([]);
    } catch {
      // ignore
    }
  }

  function saveSettings() {
    const newUrl = apiUrlInput.trim().replace(/\/$/, "");
    if (newUrl) {
      setApiBase(newUrl);
      localStorage.setItem("apiBase", newUrl);
    }
    setShowSettings(false);
    setMessages([]);
    loadHistory(newUrl || apiBase);
    loadSuggestions(newUrl || apiBase);
  }

  const icons = { coding: ">_", analysis: "~", general: "*", writing: "//", math: "∑" } as Record<string, string>;

  return (
    <div id="app">
      <Starfield />

      <div id="header">
        <div id="logo">
          <div className="logo-dot" />
          VOID
        </div>
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
          <button className={`icon-btn${stealthActive ? " active" : ""}`} title="Toggle stealth mode (Alt+Shift+S)" onClick={toggleStealth}>
            {stealthActive ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      <div id="context-bar">
        <div className="context-pill">
          <div className="context-dot" />
          <span className="context-url">void.preview</span>
        </div>
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
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {isTyping && <TypingIndicator />}
      </div>

      {suggestions.length > 0 && (
        <div id="suggestions">
          {suggestions.map((s, i) => (
            <button
              key={i}
              className="suggestion-chip"
              onClick={() => { setInputValue(s.text); textareaRef.current?.focus(); }}
            >
              <span className="chip-icon">{icons[s.category] || "*"}</span>
              {s.text}
            </button>
          ))}
        </div>
      )}

      <div id="input-area">
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            id="message-input"
            placeholder="Message Void..."
            rows={1}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <button id="send-btn" onClick={sendMessage} disabled={isLoading}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <div className="shortcut-hint">Alt+Shift+G to open &bull; Alt+Shift+S for stealth</div>
      </div>

      {stealthActive && (
        <div id="stealth-overlay" className="active">
          <svg className="stealth-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
          <span className="stealth-label">STEALTH ACTIVE</span>
        </div>
      )}

      {showSettings && (
        <div id="settings-panel" className="active">
          <div className="settings-title">VOID CONFIGURATION</div>
          <div>
            <div className="settings-label">API Base URL</div>
            <input
              className="settings-input"
              type="text"
              placeholder="https://your-deployed-domain.replit.app"
              value={apiUrlInput}
              onChange={(e) => setApiUrlInput(e.target.value)}
            />
            <div className="settings-hint">The URL of your deployed Void backend. Deploy on Replit and paste the URL here.</div>
          </div>
          <button className="settings-save-btn" onClick={saveSettings}>Save</button>
          <span className="settings-close" onClick={() => setShowSettings(false)}>Close settings</span>
        </div>
      )}
    </div>
  );
}
