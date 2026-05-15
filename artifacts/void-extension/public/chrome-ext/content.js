/**
 * Void AI — content script
 * Injects a draggable floating chat widget into every webpage.
 * The widget persists across tab switches because it re-injects on each page load
 * and restores its position/open-state from chrome.storage.local.
 */
(function () {
  'use strict';
  if (document.getElementById('__void_ext_root__')) return;

  chrome.storage.local.get(['voidUrl', 'voidOpen', 'voidX', 'voidY', 'voidW', 'voidH'], (data) => {
    if (!data.voidUrl) return; // not configured yet — set up via the side panel first
    inject(data);
  });

  function inject(data) {
    const voidUrl = data.voidUrl;
    let isOpen = data.voidOpen !== false;
    let posX = typeof data.voidX === 'number' ? data.voidX : -1;
    let posY = typeof data.voidY === 'number' ? data.voidY : -1;
    const panelW = typeof data.voidW === 'number' ? data.voidW : 360;
    const panelH = typeof data.voidH === 'number' ? data.voidH : 520;

    // Default position: bottom-right
    if (posX < 0) posX = window.innerWidth - panelW - 20;
    if (posY < 0) posY = window.innerHeight - panelH - 20;

    // ── Root host element (outside shadow, fixed positioning) ──────────
    const host = document.createElement('div');
    host.id = '__void_ext_root__';
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;pointer-events:none;top:0;left:0;width:0;height:0;';
    document.documentElement.appendChild(host);

    // ── Shadow DOM ─────────────────────────────────────────────────────
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      #void-panel {
        position: fixed;
        z-index: 2147483647;
        width: ${panelW}px;
        height: ${panelH}px;
        left: ${posX}px;
        top: ${posY}px;
        background: rgba(6,0,14,0.97);
        border: 1px solid rgba(124,58,237,0.4);
        border-radius: 14px;
        box-shadow: 0 8px 48px rgba(0,0,0,0.8), 0 0 0 1px rgba(124,58,237,0.1), 0 0 40px rgba(124,58,237,0.07);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        pointer-events: all;
        font-family: system-ui, -apple-system, sans-serif;
        resize: both;
        transition: opacity 0.15s, transform 0.15s;
      }
      #void-panel.hidden {
        opacity: 0;
        transform: scale(0.95);
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

      #void-bubble {
        position: fixed;
        z-index: 2147483647;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: #7c3aed;
        border: none;
        cursor: pointer;
        pointer-events: all;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(124,58,237,0.5), 0 0 0 2px rgba(124,58,237,0.2);
        transition: transform 0.15s, box-shadow 0.15s;
        color: #fff;
        font-size: 18px;
        user-select: none;
      }
      #void-bubble:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 28px rgba(124,58,237,0.7), 0 0 0 3px rgba(124,58,237,0.3);
      }
      #void-bubble.active {
        background: #5b21b6;
        box-shadow: 0 4px 20px rgba(124,58,237,0.8), 0 0 0 3px rgba(124,58,237,0.4);
      }
    `;
    shadow.appendChild(style);

    // ── Bubble launcher ────────────────────────────────────────────────
    const bubble = document.createElement('button');
    bubble.id = 'void-bubble';
    bubble.title = 'Void AI';
    bubble.innerHTML = '✦';
    if (isOpen) bubble.classList.add('active');

    const bubbleRight = 20;
    const bubbleBottom = 20;
    bubble.style.right = bubbleRight + 'px';
    bubble.style.bottom = bubbleBottom + 'px';
    shadow.appendChild(bubble);

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
        bubble.classList.add('active');
      } else {
        panel.classList.add('hidden');
        bubble.classList.remove('active');
      }
      chrome.storage.local.set({ voidOpen: open });
    }

    bubble.addEventListener('click', () => setOpen(!isOpen));
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
          // Also tell the Void app iframe so the context bar updates
          if (iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'VOID_TAB_URL', url: msg.url }, '*');
          }
        } catch {}
      }
    });
  }
})();
