(() => {
  const CONVERSATION_SELECTORS = Object.freeze([
    'a[data-test-id="conversation"]',
    'conversations-list a[href^="/app/"]',
    'a[href*="/app/"]'
  ]);

  function parseChatId(href, fallbackTitle = '') {
    const rawHref = typeof href === 'string' ? href : '';
    const match = rawHref.match(/\/app\/([^/?#]+)/i);
    if (match?.[1]) return match[1];

    try {
      return btoa(unescape(encodeURIComponent(`${fallbackTitle}::${rawHref}`))).slice(0, 24);
    } catch {
      return '';
    }
  }

  function getConversationLinks(root = document) {
    for (const selector of CONVERSATION_SELECTORS) {
      const links = [...root.querySelectorAll(selector)];
      if (links.length) {
        return {
          links,
          sourceSelector: selector,
          ok: true
        };
      }
    }

    return {
      links: [],
      sourceSelector: CONVERSATION_SELECTORS[0],
      ok: false
    };
  }

  window.GFSharedUtils = Object.freeze({
    version: '1.0.0',
    CONVERSATION_SELECTORS,
    parseChatId,
    getConversationLinks
  });
})();
