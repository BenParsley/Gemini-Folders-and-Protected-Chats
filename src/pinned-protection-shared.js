(() => {
  const CONVERSATION_SELECTORS = window.GFSharedUtils?.CONVERSATION_SELECTORS || [
    'a[data-test-id="conversation"]',
    'conversations-list a[href^="/app/"]',
    'a[href*="/app/"]'
  ];

  const health = {
    ok: true,
    sourceSelector: CONVERSATION_SELECTORS[0],
    message: ''
  };

  function parseChatId(href, fallbackTitle = '') {
    return window.GFSharedUtils?.parseChatId(href, fallbackTitle) || '';
  }

  function toAbsoluteUrl(href) {
    if (!href) return null;
    try {
      return new URL(href, window.location.origin);
    } catch {
      return null;
    }
  }

  function normalizeHref(href) {
    const url = toAbsoluteUrl(href);
    if (!url) return '';
    return `${url.origin}${url.pathname}`;
  }

  function getNativeConversationLinks() {
    const lookup = window.GFSharedUtils?.getConversationLinks?.(document) || { links: [], sourceSelector: CONVERSATION_SELECTORS[0], ok: false };
    health.ok = !!lookup.ok;
    health.sourceSelector = lookup.sourceSelector || CONVERSATION_SELECTORS[0];
    health.message = lookup.ok ? '' : 'No supported conversation selectors found on this Gemini layout.';
    return lookup.links || [];
  }

  function isLinkPinned(link) {
    if (!link) return false;
    const container = link.closest('.conversation-items-container') || link.parentElement;
    if (!container) return false;

    if (container.querySelector('[data-mat-icon-name="push_pin"], [fonticon="push_pin"]')) return true;

    const ariaText = [
      container.getAttribute('aria-label') || '',
      link.getAttribute('aria-label') || '',
      container.textContent || ''
    ].join(' ').toLowerCase();

    return /\bpin(ned)?\b/.test(ariaText);
  }

  function getPinnedSnapshot() {
    const pinnedHrefs = new Set();
    const pinnedIds = new Set();

    for (const link of getNativeConversationLinks()) {
      if (!isLinkPinned(link)) continue;
      const href = link.getAttribute('href') || '';
      const titleEl = link.querySelector('.conversation-title');
      const title = (titleEl?.textContent || link.textContent || '').trim();
      const id = parseChatId(href, title);

      const normalized = normalizeHref(href);
      if (normalized) pinnedHrefs.add(normalized);
      if (id) pinnedIds.add(id);
    }

    return { pinnedHrefs, pinnedIds };
  }

  function getCurrentChatId() {
    const match = window.location.pathname.match(/\/app\/([^/?#]+)/i);
    return match?.[1] || '';
  }

  const api = {
    parseChatId,
    normalizeHref,
    getPinnedSnapshot,
    getCurrentChatId,
    getHealth() {
      return { ...health };
    },
    isHrefPinned(href) {
      const normalized = normalizeHref(href);
      if (!normalized) return false;
      const { pinnedHrefs } = getPinnedSnapshot();
      return pinnedHrefs.has(normalized);
    },
    isCurrentChatPinned() {
      const currentId = getCurrentChatId();
      if (!currentId) return false;
      const { pinnedIds } = getPinnedSnapshot();
      return pinnedIds.has(currentId);
    }
  };

  window.GFPinnedProtection = api;
})();
