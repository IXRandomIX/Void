/**
 * Void AI — content script
 * Injects an edge-trigger button into every webpage.
 * Hover the right edge of the screen for 2 seconds → button slides out.
 * Click it to open/close the Void panel.
 * State persists across tab switches via chrome.storage.local.
 */
(function () {
  'use strict';
  if (document.getElementById('__void_ext_root__')) return;

  chrome.storage.local.get(['voidUrl', 'voidOpen', 'voidX', 'voidY', 'voidW', 'voidH'], (data) => {
    if (!data.voidUrl) return;
    inject(data);
  });

  function inject(data) {
    const voidUrl = data.voidUrl;
    let isOpen = data.voidOpen !== false;
    let posX = typeof data.voidX === 'number' ? data.voidX : -1;
    let posY = typeof data.voidY === 'number' ? data.voidY : -1;
    const panelW = typeof data.voidW === 'number' ? data.voidW : 380;
    const panelH = typeof data.voidH === 'number' ? data.voidH : 560;

    if (posX < 0) posX = window.innerWidth - panelW - 20;
    if (posY < 0) posY = window.innerHeight - panelH - 20;

    // ── Root host element ──────────────────────────────────────────────
    const host = document.createElement('div');
    host.id = '__void_ext_root__';
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;pointer-events:none;top:0;left:0;width:0;height:0;';
    document.documentElement.appendChild(host);

    // ── Shadow DOM ─────────────────────────────────────────────────────
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      /* ── Edge trigger zone ── */
      #void-edge-zone {
        position: fixed;
        top: 0;
        right: 0;
        width: 24px;
        height: 100vh;
        z-index: 2147483647;
        pointer-events: all;
        display: flex;
        align-items: center;
        justify-content: flex-end;
      }

      #void-edge-btn {
        position: relative;
        right: -56px;
        width: 40px;
        height: 40px;
        border-radius: 20px 0 0 20px;
        border: 1px solid rgba(124,58,237,0.5);
        border-right: none;
        background: rgba(10,4,20,0.93);
        backdrop-filter: blur(12px);
        color: #a78bfa;
        font-size: 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: right 0.3s cubic-bezier(0.34,1.56,0.64,1),
                    background 0.2s ease,
                    box-shadow 0.2s ease;
        box-shadow: none;
        padding: 0;
        outline: none;
        font-family: system-ui, sans-serif;
        user-select: none;
      }

      #void-edge-btn.revealed {
        right: 0;
        box-shadow: -2px 0 20px rgba(124,58,237,0.4);
      }

      #void-edge-btn.revealed:hover {
        background: rgba(124,58,237,0.25);
        box-shadow: -2px 0 28px rgba(124,58,237,0.6);
      }

      #void-edge-btn.active {
        color: #c4b5fd;
      }

      /* ── Panel ── */
      #void-panel {
        position: fixed;
        z-index: 2147483646;
        width: ${panelW}px;
        height: ${panelH}px;
        left: ${posX}px;
        top: ${posY}px;
        background: rgba(6,0,14,0.97);
        border: 1px solid rgba(124,58,237,0.4);
        border-radius: 14px;
        box-shadow: 0 8px 48px rgba(0,0,0,0.8), 0 0 40px rgba(124,58,237,0.07);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        pointer-events: all;
        font-family: system-ui, -apple-system, sans-serif;
        resize: both;
        transition: opacity 0.18s ease, transform 0.18s ease;
      }

      #void-panel.hidden {
        opacity: 0;
        transform: scale(0.96) translateX(8px);
        pointer-events: none;
      }

      #void-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: rgba(124,58,237,0.09);
        border-bottom: 1px solid rgba(124,58,237,0.15);
        cursor: grab;
        user-select: none;
        flex-shrink: 0;
      }
      #void-header:active { cursor: grabbing; }

      .v-dot {
        width: 7px; height: 7px;
        border-radius: 50%;
        background: #7c3aed;
        box-shadow: 0 0 7px #7c3aed;
        flex-shrink: 0;
      }
      .v-title {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.18em;
        color: #e2e8f0;
      }
      .v-url {
        flex: 1;
        font-size: 10px;
        color: #475569;
        font-family: 'Courier New', monospace;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .v-close {
        background: none;
        border: none;
        color: #475569;
        font-size: 18px;
        cursor: pointer;
        line-height: 1;
        padding: 0 2px;
        opacity: 0.6;
        transition: opacity 0.15s;
        flex-shrink: 0;
      }
      .v-close:hover { opacity: 1; color: #e2e8f0; }

      #void-frame {
        flex: 1;
        border: none;
        width: 100%;
        height: 100%;
        display: block;
        background: #07050f;
      }
    `;
    shadow.appendChild(style);

    // ── Edge trigger zone ──────────────────────────────────────────────
    const edgeZone = document.createElement('div');
    edgeZone.id = 'void-edge-zone';

    const edgeBtn = document.createElement('button');
    edgeBtn.id = 'void-edge-btn';
    edgeBtn.title = 'Void AI';
    edgeBtn.textContent = '✦';
    if (isOpen) edgeBtn.classList.add('active');
    edgeZone.appendChild(edgeBtn);
    shadow.appendChild(edgeZone);

    // Hover timer — reveal button after 2 seconds on the edge zone
    let hoverTimer = null;

    edgeZone.addEventListener('mouseenter', () => {
      hoverTimer = setTimeout(() => edgeBtn.classList.add('revealed'), 2000);
    });

    edgeZone.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimer);
      hoverTimer = null;
      edgeBtn.classList.remove('revealed');
    });

    // Keep revealed while hovering the button itself
    edgeBtn.addEventListener('mouseenter', () => {
      clearTimeout(hoverTimer);
      edgeBtn.classList.add('revealed');
    });

    // ── Panel ──────────────────────────────────────────────────────────
    const panel = document.createElement('div');
    panel.id = 'void-panel';
    if (!isOpen) panel.classList.add('hidden');
    shadow.appendChild(panel);

    // Header
    const header = document.createElement('div');
    header.id = 'void-header';
    header.innerHTML = `
      <div class="v-dot"></div>
      <span class="v-title">VOID</span>
      <span class="v-url" id="void-tab-url">${location.hostname}</span>
      <button class="v-close" id="void-close-btn" title="Close">×</button>
    `;
    panel.appendChild(header);

    // iframe
    const iframe = document.createElement('iframe');
    iframe.id = 'void-frame';
    iframe.allow = 'clipboard-read; clipboard-write; camera; microphone';
    iframe.src = voidUrl;
    panel.appendChild(iframe);

    // ── Toggle open/close ──────────────────────────────────────────────
    function setOpen(open) {
      isOpen = open;
      if (open) {
        panel.classList.remove('hidden');
        edgeBtn.classList.add('active');
      } else {
        panel.classList.add('hidden');
        edgeBtn.classList.remove('active');
      }
      chrome.storage.local.set({ voidOpen: open });
    }

    edgeBtn.addEventListener('click', () => {
      setOpen(!isOpen);
      edgeBtn.classList.remove('revealed');
    });

    shadow.getElementById('void-close-btn').addEventListener('click', () => setOpen(false));

    // ── Dragging ───────────────────────────────────────────────────────
    let dragging = false;
    let dragOffX = 0, dragOffY = 0;

    header.addEventListener('mousedown', (e) => {
      if (e.target.id === 'void-close-btn') return;
      dragging = true;
      const rect = panel.getBoundingClientRect();
      dragOffX = e.clientX - rect.left;
      dragOffY = e.clientY - rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      posX = Math.max(0, Math.min(window.innerWidth - w, e.clientX - dragOffX));
      posY = Math.max(0, Math.min(window.innerHeight - h, e.clientY - dragOffY));
      panel.style.left = posX + 'px';
      panel.style.top = posY + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      chrome.storage.local.set({ voidX: posX, voidY: posY });
    });

    // ── Receive live tab URL from background ───────────────────────────
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'TAB_URL' && msg.url) {
        try {
          const host = new URL(msg.url).hostname;
          const el = shadow.getElementById('void-tab-url');
          if (el) el.textContent = host;
          if (iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'VOID_TAB_URL', url: msg.url }, '*');
          }
        } catch {}
      }
    });
  }
})();
