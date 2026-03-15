/**
 * Chat page component with streaming SSE.
 * @module components/chat
 */

import { createModelToggle } from './model-toggle.js';

/**
 * Simple regex-based Markdown renderer (no external libs).
 * Supports: **bold**, *italic*, `code`, ```blocks```, ordered/unordered lists.
 * @param {string} text
 * @returns {string} HTML
 */
function _renderMarkdown(text) {
  let html = text
    // Escape HTML entities first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (``` ... ```)
  html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) =>
    `<pre style="background:var(--bg-input);padding:.75rem;border-radius:var(--radius-sm);overflow-x:auto;font-family:var(--font-mono);font-size:.85em;margin:.5rem 0;">${code.trimEnd()}</pre>`
  );

  // Inline code
  html = html.replace(/`([^`]+)`/g,
    '<code style="background:var(--bg-input);padding:.1em .3em;border-radius:3px;font-family:var(--font-mono);font-size:.9em;">$1</code>'
  );

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Unordered lists
  html = html.replace(/^[ \t]*[-*•]\s+(.+)$/gm,
    '<li style="margin:.15rem 0;">$1</li>'
  );
  // Ordered lists
  html = html.replace(/^[ \t]*\d+\.\s+(.+)$/gm,
    '<li style="margin:.15rem 0;">$1</li>'
  );
  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g,
    m => `<ul style="padding-left:1.25rem;margin:.5rem 0;">${m}</ul>`
  );

  // Paragraphs (double newline → <p>)
  html = html.replace(/\n{2,}/g, '</p><p>');
  // Single newlines → <br>
  html = html.replace(/\n/g, '<br>');

  return `<p>${html}</p>`;
}

/**
 * @param {HTMLElement} container
 * @param {{ health: object, storage: object, api: object, sharedState: object }} opts
 */
export function renderChat(container, { health, storage, api, sharedState }) {
  container.innerHTML = `
    <div class="page-header" style="padding-bottom:.75rem;">
      <h2>Chat</h2>
    </div>

    <div class="chat-container">
      <div id="chat-messages" class="chat-messages" aria-live="polite" aria-label="Chatberichten">
        <div class="chat-bubble assistant" style="opacity:.7;font-style:italic;">
          Hoe kan ik je helpen?
        </div>
      </div>

      <div id="chat-error" class="status-msg error hidden" role="alert" style="margin:.25rem 0;"></div>

      <!-- Controls bar: always visible above the input -->
      <div class="chat-controls-bar">
        <div id="toggle-wrap-chat" style="flex:1;"></div>
        <button id="thinking-btn" class="btn btn-secondary btn-sm" aria-label="Denkmodus aan/uit"
                title="Laat het model nadenken vóór het antwoord (Qwen3)">
          🧠 Denken
        </button>
      </div>

      <div id="chat-input-row" class="chat-input-row">
        <textarea id="chat-input" class="input" rows="1"
                  placeholder="Stel een vraag…" aria-label="Chatbericht invoer"
                  style="resize:none;min-height:42px;max-height:140px;overflow-y:auto;"></textarea>
        <button id="send-btn" class="btn btn-primary" aria-label="Bericht versturen">
          Verstuur
        </button>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:.5rem;">
        <button id="new-chat-btn" class="btn btn-secondary btn-sm"
                aria-label="Nieuw gesprek starten">
          🗑 Nieuw gesprek
        </button>
        <span id="chat-status" style="font-size:.78rem;color:var(--text-muted);" aria-live="polite"></span>
      </div>
    </div>
  `;

  const toggleWrap   = container.querySelector('#toggle-wrap-chat');
  const toggle       = createModelToggle({ container: toggleWrap, health, api });
  const thinkingBtn  = container.querySelector('#thinking-btn');

  const messagesEl = container.querySelector('#chat-messages');
  const inputEl    = container.querySelector('#chat-input');
  const sendBtn    = container.querySelector('#send-btn');
  const newChatBtn = container.querySelector('#new-chat-btn');
  const statusEl   = container.querySelector('#chat-status');
  const errorEl    = container.querySelector('#chat-error');

  /** @type {Array<{role: string, content: string}>} */
  let history = [];
  let streaming = false;
  let thinkingOn = false;

  // Thinking toggle
  thinkingBtn.addEventListener('click', () => {
    thinkingOn = !thinkingOn;
    thinkingBtn.classList.toggle('active', thinkingOn);
    thinkingBtn.title = thinkingOn
      ? 'Denkmodus aan — klik om uit te zetten'
      : 'Laat het model nadenken vóór het antwoord (Qwen3)';
  });

  function _scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function _addBubble(role, content, isHTML = false) {
    const div = document.createElement('div');
    div.className = `chat-bubble ${role}`;
    if (isHTML) {
      div.innerHTML = content;
    } else {
      div.textContent = content;
    }
    messagesEl.appendChild(div);
    _scrollToBottom();
    return div;
  }

  // Auto-resize textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
  });

  // Send on Enter (Shift+Enter = newline)
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!streaming) _sendMessage();
    }
  });

  sendBtn.addEventListener('click', () => { if (!streaming) _sendMessage(); });

  newChatBtn.addEventListener('click', () => {
    history = [];
    messagesEl.innerHTML = `
      <div class="chat-bubble assistant" style="opacity:.7;font-style:italic;">
        Hoe kan ik je helpen?
      </div>`;
    errorEl.classList.add('hidden');
    statusEl.textContent = '';
  });

  async function _sendMessage() {
    const text = inputEl.value.trim();
    if (!text || streaming) return;

    inputEl.value = '';
    inputEl.style.height = 'auto';
    errorEl.classList.add('hidden');

    history.push({ role: 'user', content: text });
    _addBubble('user', text);

    // Optional thinking indicator bubble (removed after thinking ends)
    let thinkBubble = null;
    // Streaming assistant bubble (hidden until thinking ends)
    const aiBubble = _addBubble('assistant', '');
    let fullText = '';
    streaming = true;
    sendBtn.disabled = true;
    inputEl.disabled = true;
    statusEl.textContent = 'Bezig…';

    try {
      fullText = await api.stream(
        '/chat',
        { messages: history, quality: toggle.getQualityMode(), enable_thinking: thinkingOn },
        token => {
          fullText += token;
          aiBubble.innerHTML = _renderMarkdown(fullText);
          _scrollToBottom();
        },
        (event, value) => {
          if (event === 'thinking') {
            if (value) {
              // Thinking started — show indicator before the (empty) ai bubble
              thinkBubble = document.createElement('div');
              thinkBubble.className = 'chat-bubble assistant chat-thinking';
              thinkBubble.innerHTML = '🧠 <em>Aan het denken…</em>';
              messagesEl.insertBefore(thinkBubble, aiBubble);
              _scrollToBottom();
            } else if (thinkBubble) {
              // Thinking ended — remove indicator
              thinkBubble.remove();
              thinkBubble = null;
            }
          }
        }
      );
      history.push({ role: 'assistant', content: fullText });
      statusEl.textContent = '';
    } catch (e) {
      errorEl.textContent = e.message || 'Chat mislukt';
      errorEl.classList.remove('hidden');
      aiBubble.remove();
      if (thinkBubble) thinkBubble.remove();
      history.pop();
      statusEl.textContent = '';
    } finally {
      streaming = false;
      sendBtn.disabled = false;
      inputEl.disabled = false;
      inputEl.focus();
    }
  }
}
