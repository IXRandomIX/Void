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

// ── Document PiP window helpers (defined outside component so they're stable) ──

const PIP_STYLES = `
* { margin:0;padding:0;box-sizing:border-box; }
body { background:#07050f;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;font-size:13px;display:flex;flex-direction:column;height:100dvh;overflow:hidden; }
#pip-header { display:flex;align-items:center;gap:8px;padding:10px 14px;background:#0d0820;border-bottom:1px solid #1e1530;flex-shrink:0; }
.pip-logo-dot { width:8px;height:8px;border-radius:50%;background:#7c3aed;box-shadow:0 0 8px rgba(124,58,237,0.9);animation:pdot 2s ease-in-out infinite; }
@keyframes pdot { 0%,100%{box-shadow:0 0 6px rgba(124,58,237,0.8);}50%{box-shadow:0 0 14px rgba(124,58,237,1),0 0 24px rgba(124,58,237,0.4);} }
.pip-title { font-size:12px;font-weight:700;letter-spacing:0.15em;color:#e8e0ff;flex:1; }
.pip-drop-hint { font-size:9px;color:#3b2d6e;font-family:monospace; }
#pip-messages { flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px; }
#pip-messages::-webkit-scrollbar{width:3px;}
#pip-messages::-webkit-scrollbar-thumb{background:rgba(124,58,237,0.3);border-radius:2px;}
.pip-msg{display:flex;flex-direction:column;gap:3px;animation:pfade 0.2s ease-out;}
@keyframes pfade{from{opacity:0;transform:translateY(5px);}to{opacity:1;transform:translateY(0);}}
.pip-msg.user{align-items:flex-end;} .pip-msg.assistant{align-items:flex-start;}
.pip-bubble{padding:8px 12px;border-radius:12px;max-width:92%;line-height:1.45;word-break:break-word;font-size:12px;}
.pip-msg.user .pip-bubble{background:rgba(124,58,237,0.18);border:1px solid rgba(124,58,237,0.3);border-bottom-right-radius:3px;color:#e2e8f0;}
.pip-msg.assistant .pip-bubble{background:rgba(15,10,30,0.95);border:1px solid rgba(255,255,255,0.06);border-bottom-left-radius:3px;color:#94a3b8;}
.pip-bubble strong{color:#e2e8f0;font-weight:600;}
.pip-bubble code{background:rgba(124,58,237,0.15);padding:1px 4px;border-radius:3px;font-family:monospace;font-size:10px;color:#a78bfa;}
.pip-bubble pre{background:rgba(0,0,0,0.4);border:1px solid rgba(124,58,237,0.2);border-radius:6px;padding:7px 10px;margin:4px 0;overflow-x:auto;font-family:monospace;font-size:10px;color:#a78bfa;white-space:pre-wrap;}
.pip-msg-time{font-size:9px;color:#3b2d6e;padding:0 3px;}
.pip-msg-files{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:5px;}
.pip-file-thumb{width:60px;height:45px;border-radius:5px;object-fit:cover;border:1px solid rgba(124,58,237,0.2);}
.pip-file-badge{display:inline-flex;align-items:center;gap:3px;padding:2px 6px;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.2);border-radius:5px;font-size:9px;color:#94a3b8;font-family:monospace;}
.pip-typing{display:flex;align-items:center;gap:7px;}
.pip-tdots{display:flex;gap:3px;}
.pip-tdot{width:5px;height:5px;border-radius:50%;background:#7c3aed;animation:ptb 1.2s ease-in-out infinite;}
.pip-tdot:nth-child(2){animation-delay:0.2s;} .pip-tdot:nth-child(3){animation-delay:0.4s;}
@keyframes ptb{0%,60%,100%{transform:translateY(0);opacity:0.4;}30%{transform:translateY(-4px);opacity:1;}}
.pip-tlabel{font-size:10px;color:#64748b;font-style:italic;}
.pip-empty{flex:1;display:flex;align-items:center;justify-content:center;color:#3b2d6e;font-family:monospace;font-size:11px;}
#pip-previews{display:flex;flex-wrap:wrap;gap:5px;padding:0 12px 6px;flex-shrink:0;}
#pip-previews:empty{display:none;}
.pip-ppill{display:inline-flex;align-items:center;gap:5px;padding:3px 7px 3px 5px;background:rgba(124,58,237,0.14);border:1px solid rgba(124,58,237,0.28);border-radius:7px;font-size:10px;color:#94a3b8;max-width:150px;}
.pip-pthumb{width:20px;height:20px;border-radius:3px;object-fit:cover;flex-shrink:0;}
.pip-pext{width:20px;height:20px;border-radius:3px;background:rgba(124,58,237,0.2);display:flex;align-items:center;justify-content:center;font-size:8px;color:#7c3aed;font-family:monospace;font-weight:bold;flex-shrink:0;}
.pip-pname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;}
.pip-premove{border:none;background:none;color:#64748b;cursor:pointer;font-size:13px;padding:0;line-height:1;flex-shrink:0;}
.pip-premove:hover{color:#ef4444;}
#pip-input-row{display:flex;align-items:flex-end;gap:6px;padding:10px 12px 12px;border-top:1px solid #1e1530;background:rgba(10,0,20,0.95);flex-shrink:0;}
#pip-attach-btn{width:30px;height:30px;min-width:30px;border:none;background:rgba(255,255,255,0.06);border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#64748b;transition:all 0.2s;flex-shrink:0;}
#pip-attach-btn:hover{background:rgba(124,58,237,0.2);color:#e2e8f0;}
#pip-textarea{flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(124,58,237,0.2);border-radius:10px;padding:6px 10px;color:#e2e8f0;font-size:12px;font-family:inherit;resize:none;min-height:30px;max-height:80px;outline:none;line-height:1.4;}
#pip-textarea:focus{border-color:rgba(124,58,237,0.5);box-shadow:0 0 10px rgba(124,58,237,0.1);}
#pip-textarea::placeholder{color:#3b2d6e;}
#pip-send-btn{width:30px;height:30px;min-width:30px;border:none;background:#7c3aed;border-radius:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:white;flex-shrink:0;box-shadow:0 0 10px rgba(124,58,237,0.4);transition:all 0.2s;}
#pip-send-btn:hover{background:#6d28d9;box-shadow:0 0 16px rgba(124,58,237,0.6);}
#pip-send-btn:disabled{opacity:0.4;cursor:not-allowed;}
body.pip-drag-over{outline:3px dashed rgba(124,58,237,0.6);outline-offset:-4px;background:#0a0520;}
`;

function renderPipMessages(pipWin: Window, msgs: Message[], typing: boolean) {
  const el = pipWin.document.getElementById("pip-messages");
  if (!el) return;
  if (msgs.length === 0 && !typing) {
    el.innerHTML = `<div class="pip-empty">Awaiting input in the void...</div>`;
    return;
  }
  let html = "";
  for (const msg of msgs) {
    let filesHtml = "";
    if (msg.files?.length) {
      filesHtml = '<div class="pip-msg-files">';
      for (const f of msg.files) {
        if (f.type.startsWith("image/")) {
          filesHtml += `<img class="pip-file-thumb" src="${f.dataUrl}" alt="${escapeHtml(f.name)}" />`;
        } else {
          filesHtml += `<span class="pip-file-badge">${fileExtLabel(f.name)} ${escapeHtml(f.name)}</span>`;
        }
      }
      filesHtml += "</div>";
    }
    const content = msg.role === "assistant"
      ? renderMarkdown(msg.content)
      : escapeHtml(msg.content).replace(/\n/g, "<br>");
    html += `<div class="pip-msg ${msg.role}">
      <div class="pip-bubble">${filesHtml}${content}</div>
      <div class="pip-msg-time">${formatTime(msg.createdAt)}</div>
    </div>`;
  }
  if (typing) {
    html += `<div class="pip-msg assistant"><div class="pip-bubble">
      <div class="pip-typing">
        <div class="pip-tdots"><div class="pip-tdot"></div><div class="pip-tdot"></div><div class="pip-tdot"></div></div>
        <span class="pip-tlabel">thinking...</span>
      </div>
    </div></div>`;
  }
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

function renderPipPreviews(
  pipWin: Window,
  files: AttachedFile[],
  onRemove: (i: number) => void
) {
  const el = pipWin.document.getElementById("pip-previews");
  if (!el) return;
  el.innerHTML = "";
  files.forEach((f, i) => {
    const pill = pipWin.document.createElement("div");
    pill.className = "pip-ppill";
    if (f.type.startsWith("image/")) {
      const img = pipWin.document.createElement("img");
      img.className = "pip-pthumb"; img.src = f.dataUrl; pill.appendChild(img);
    } else {
      const ext = pipWin.document.createElement("div");
      ext.className = "pip-pext"; ext.textContent = fileExtLabel(f.name); pill.appendChild(ext);
    }
    const name = pipWin.document.createElement("span");
    name.className = "pip-pname"; name.textContent = f.name; pill.appendChild(name);
    const rm = pipWin.document.createElement("button");
    rm.className = "pip-premove"; rm.textContent = "×";
    rm.addEventListener("click", (e) => { e.stopPropagation(); onRemove(i); });
    pill.appendChild(rm);
    el.appendChild(pill);
  });
}

// ── Main component ──────────────────────────────────────────────────────────

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
  const [pipActive, setPipActive] = useState(false);

  const chatAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  // Document PiP refs
  const documentPipWindowRef = useRef<Window | null>(null);
  // Stable refs so PiP callbacks always see fresh values
  const attachedFilesRef = useRef<AttachedFile[]>([]);
  const isLoadingRef = useRef(false);
  const pipSendRef = useRef<(text: string) => void>(() => {});

  useEffect(() => { attachedFilesRef.current = attachedFiles; }, [attachedFiles]);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

  // Keep pipSendRef pointing at a function that always sees the latest state via refs
  useEffect(() => {
    pipSendRef.current = async (text: string) => {
      if ((!text && attachedFilesRef.current.length === 0) || isLoadingRef.current) return;
      const filesToSend = [...attachedFilesRef.current];
      setAttachedFiles([]);
      setIsLoading(true);
      setIsTyping(true);
      isLoadingRef.current = true;
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
        isLoadingRef.current = false;
      }
    };
  }, [apiBase]);

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

  // ── Document PiP setup ────────────────────────────────────────────────────

  function initDocumentPipWindow(pipWin: Window) {
    const style = pipWin.document.createElement("style");
    style.textContent = PIP_STYLES;
    pipWin.document.head.appendChild(style);

    pipWin.document.body.innerHTML = `
      <div id="pip-header">
        <div class="pip-logo-dot"></div>
        <span class="pip-title">VOID — private view</span>
        <span class="pip-drop-hint">drag files here  •  Ctrl+Shift+L attach</span>
      </div>
      <div id="pip-messages"></div>
      <div id="pip-previews"></div>
      <div id="pip-input-row">
        <input type="file" id="pip-file-input" multiple accept="*/*" style="display:none">
        <button id="pip-attach-btn" title="Attach file (Ctrl+Shift+L)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>
        <textarea id="pip-textarea" placeholder="Type here, Enter to send..." rows="1"></textarea>
        <button id="pip-send-btn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    `;

    const fileInput = pipWin.document.getElementById("pip-file-input") as HTMLInputElement;
    const attachBtn = pipWin.document.getElementById("pip-attach-btn");
    const textarea = pipWin.document.getElementById("pip-textarea") as HTMLTextAreaElement;
    const sendBtn = pipWin.document.getElementById("pip-send-btn") as HTMLButtonElement;

    const handleFiles = (fl: FileList | null) => {
      if (fl?.length) { addFiles(fl); if (fileInput) fileInput.value = ""; }
    };

    attachBtn?.addEventListener("click", () => fileInput?.click());
    fileInput?.addEventListener("change", () => handleFiles(fileInput.files));

    // Drag & drop directly onto the PiP window
    let pipDragCounter = 0;
    pipWin.document.addEventListener("dragenter", (e) => { e.preventDefault(); pipDragCounter++; pipWin.document.body.classList.add("pip-drag-over"); });
    pipWin.document.addEventListener("dragleave", () => { pipDragCounter--; if (pipDragCounter <= 0) { pipDragCounter = 0; pipWin.document.body.classList.remove("pip-drag-over"); } });
    pipWin.document.addEventListener("dragover", (e) => e.preventDefault());
    pipWin.document.addEventListener("drop", (e) => {
      e.preventDefault(); pipDragCounter = 0; pipWin.document.body.classList.remove("pip-drag-over");
      if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
    });

    // Keyboard shortcut inside the PiP window
    pipWin.document.addEventListener("keydown", (e) => {
      if ((e.key === "l" || e.key === "L") && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        fileInput?.click();
      }
    });

    const doSend = () => {
      const text = textarea?.value.trim() ?? "";
      if (textarea) { textarea.value = ""; textarea.style.height = "auto"; }
      pipSendRef.current(text);
    };

    sendBtn?.addEventListener("click", doSend);
    textarea?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); }
      if (textarea) { textarea.style.height = "auto"; textarea.style.height = Math.min(textarea.scrollHeight, 80) + "px"; }
    });

    // Paste images in the PiP window
    pipWin.document.addEventListener("paste", async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageItems: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) imageItems.push(f);
        }
      }
      if (imageItems.length) { e.preventDefault(); addFiles(imageItems); }
    });
  }

  // Update PiP window whenever messages / typing / files change
  useEffect(() => {
    const pipWin = documentPipWindowRef.current;
    if (!pipActive || !pipWin || pipWin.closed) return;
    renderPipMessages(pipWin, messages, isTyping);
  }, [messages, isTyping, pipActive]);

  useEffect(() => {
    const pipWin = documentPipWindowRef.current;
    if (!pipActive || !pipWin || pipWin.closed) return;
    renderPipPreviews(pipWin, attachedFiles, (i) => setAttachedFiles(prev => prev.filter((_, j) => j !== i)));
  }, [attachedFiles, pipActive]);

  async function togglePip() {
    // Close if already active
    if (pipActive) {
      const pipWin = documentPipWindowRef.current;
      if (pipWin && !pipWin.closed) pipWin.close();
      documentPipWindowRef.current = null;
      setPipActive(false);
      return;
    }

    // Try Document Picture-in-Picture API (Chrome 116+, stays above all tabs)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dpip = (window as any).documentPictureInPicture as
      | { requestWindow: (opts: { width: number; height: number }) => Promise<Window> }
      | undefined;

    if (dpip) {
      try {
        const pipWin = await dpip.requestWindow({ width: 480, height: 580 });
        documentPipWindowRef.current = pipWin;
        initDocumentPipWindow(pipWin);
        renderPipMessages(pipWin, messages, isTyping);
        renderPipPreviews(pipWin, attachedFiles, (i) => setAttachedFiles(prev => prev.filter((_, j) => j !== i)));
        pipWin.addEventListener("pagehide", () => {
          documentPipWindowRef.current = null;
          setPipActive(false);
        });
        setPipActive(true);
        return;
      } catch (err) {
        console.warn("Document PiP failed, trying video PiP:", err);
      }
    }

    // Fallback: use window.open() — works everywhere including inside iframes
    const pipWin = window.open(
      "",
      "void-pip",
      "width=480,height=580,menubar=no,toolbar=no,location=no,status=no,resizable=yes"
    );
    if (pipWin) {
      documentPipWindowRef.current = pipWin;
      initDocumentPipWindow(pipWin);
      renderPipMessages(pipWin, messages, isTyping);
      renderPipPreviews(pipWin, attachedFiles, (i) =>
        setAttachedFiles(prev => prev.filter((_, j) => j !== i))
      );
      // Poll for close since window.open() has no pagehide event
      const closeCheck = setInterval(() => {
        if (pipWin.closed) {
          clearInterval(closeCheck);
          documentPipWindowRef.current = null;
          setPipActive(false);
        }
      }, 500);
      setPipActive(true);
    } else {
      // Pop-ups blocked — fall back to companion panel
      setPipActive(true);
    }
  }

  // Track live URL changes
  useEffect(() => {
    const update = () => setLiveUrl(window.location.host);
    window.addEventListener("popstate", update);
    window.addEventListener("hashchange", update);
    return () => { window.removeEventListener("popstate", update); window.removeEventListener("hashchange", update); };
  }, []);

  // Receive live tab URL from the Chrome extension (background.js → sidepanel → postMessage)
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "VOID_TAB_URL" && typeof e.data.url === "string") {
        try {
          setTabUrl(new URL(e.data.url).host);
        } catch {}
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Global shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Alt+Ctrl+Shift+G — toggle sidebar
      if (e.altKey && e.ctrlKey && e.shiftKey && (e.key === "G" || e.key === "g")) {
        setSidebarVisible(v => !v);
      }
      // Ctrl+Shift+L — open file picker (works any time)
      if (e.ctrlKey && e.shiftKey && (e.key === "L" || e.key === "l") && !e.altKey) {
        e.preventDefault();
        fileInputRef.current?.click();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Drag and drop on the main sidebar
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
      className={sidebarVisible ? "visible" : ""}
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
          <button className={`icon-btn${pipActive ? " active" : ""}`} id="pip-btn" title="Private view (Document PiP)" onClick={togglePip}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <rect x="12" y="10" width="8" height="5" rx="1" fill="currentColor" stroke="none"/>
            </svg>
          </button>
        </div>
      </div>

      <div id="context-bar">
        <div className="context-pill">
          <div className={`context-dot${tabUrl ? " live" : ""}`} />
          <span className="context-url">{tabUrl ?? liveUrl}</span>
        </div>
        {tabUrl && <span className="context-live-badge">LIVE</span>}
      </div>

      {pipActive ? (
        <div
          id="pip-companion"
          className={dropActive ? "pip-drop-active" : ""}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="pip-companion-inner">
            <div className="pip-companion-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </div>
            <div className="pip-companion-title">Drop files here</div>
            <div className="pip-companion-sub">or click to choose — files appear in the floating window</div>
            {attachedFiles.length > 0 && (
              <div className="pip-companion-files">
                {attachedFiles.map((f, i) => (
                  <div key={i} className="pip-companion-file" onClick={e => e.stopPropagation()}>
                    {f.type.startsWith("image/")
                      ? <img className="pip-companion-thumb" src={f.dataUrl} alt={f.name} />
                      : <div className="pip-companion-ext">{fileExtLabel(f.name)}</div>}
                    <span className="pip-companion-name">{f.name}</span>
                    <button className="file-pill-remove" onClick={e => { e.stopPropagation(); setAttachedFiles(prev => prev.filter((_, j) => j !== i)); }}>&times;</button>
                  </div>
                ))}
              </div>
            )}
            {attachedFiles.length > 0 && (
              <div className="pip-companion-badge">{attachedFiles.length} file{attachedFiles.length > 1 ? "s" : ""} queued — type &amp; send in the floating window</div>
            )}
            <div className="pip-companion-hint">Chat is live in the floating window<br/>You can also drag files &amp; Ctrl+Shift+L directly into it</div>
          </div>
        </div>
      ) : (
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
      )}

      {/* Hidden DOM for PiP message refresh */}
      {pipActive && (
        <div ref={chatAreaRef} style={{ display: "none" }}>
          {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
        </div>
      )}

      {suggestions.length > 0 && !pipActive && (
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

      {dropActive && !pipActive && (
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

          <div style={{ borderTop: "1px solid rgba(124,58,237,0.15)", paddingTop: "16px", marginTop: "4px" }}>
            <div className="settings-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Chrome Extension
            </div>
            <div className="settings-hint" style={{ marginBottom: "10px" }}>
              Install Void as a <strong style={{ color: "#a78bfa" }}>real Chrome sidebar</strong> — stays open as you switch between every tab, just like a native extension.
            </div>
            <div className="settings-hint" style={{ marginBottom: "12px", lineHeight: 1.7 }}>
              <strong style={{ color: "#94a3b8" }}>How to install:</strong><br />
              1. First <a href="https://replit.com" target="_blank" rel="noreferrer" style={{ color: "#7c3aed" }}>deploy this app</a> to get a live URL<br />
              2. Download the 3 extension files below<br />
              3. In Chrome go to <code style={{ color: "#a78bfa", fontSize: "10px" }}>chrome://extensions</code><br />
              4. Enable <strong style={{ color: "#94a3b8" }}>Developer mode</strong> (top-right toggle)<br />
              5. Click <strong style={{ color: "#94a3b8" }}>Load unpacked</strong> → select the folder<br />
              6. Click the Void icon → enter your live URL
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <a className="settings-save-btn" style={{ textAlign: "center", textDecoration: "none", display: "block" }}
                href="/chrome-ext/manifest.json" download="manifest.json">
                ↓ manifest.json
              </a>
              <a className="settings-save-btn" style={{ textAlign: "center", textDecoration: "none", display: "block", background: "rgba(124,58,237,0.3)" }}
                href="/chrome-ext/background.js" download="background.js">
                ↓ background.js
              </a>
              <a className="settings-save-btn" style={{ textAlign: "center", textDecoration: "none", display: "block", background: "rgba(124,58,237,0.3)" }}
                href="/chrome-ext/sidepanel.html" download="sidepanel.html">
                ↓ sidepanel.html
              </a>
            </div>
            <div className="settings-hint" style={{ marginTop: "8px" }}>
              Put all 3 files in the same folder, then load that folder as an unpacked extension.
            </div>
          </div>

          <button className="settings-save-btn" onClick={() => setShowSettings(false)} style={{ marginTop: "8px" }}>Close</button>
          <span className="settings-close" onClick={() => setShowSettings(false)}>Close settings</span>
        </div>
      )}
    </div>
  );
}
