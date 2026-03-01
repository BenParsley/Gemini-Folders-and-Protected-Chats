(() => {
  const CONVERSATION_SELECTORS = Object.freeze([
    'a[data-test-id="conversation"]',
    'conversations-list a[href^="/app/"]',
    'side-navigation-content a[href^="/app/"]',
    'a[href*="/app/"]'
  ]);

  const selectorStats = new Map(CONVERSATION_SELECTORS.map((selector) => [selector, {
    hits: 0,
    misses: 0,
    lastCount: 0,
    score: 100
  }]));

  const selectorHealth = {
    score: 100,
    activeSelector: CONVERSATION_SELECTORS[0],
    fallbackMode: 'none',
    message: ''
  };

  const selectorOrder = new Map(CONVERSATION_SELECTORS.map((selector, index) => [selector, index]));

  function isExtensionConversationLink(link) {
    if (!(link instanceof Element)) return false;
    if (link.closest('#gf-sidebar-root')) return true;
    if (link.classList.contains('gf-chat-link')) return true;
    return false;
  }

  function sanitizeConversationLinks(rawLinks) {
    if (!Array.isArray(rawLinks)) return [];
    return rawLinks.filter((link) => {
      if (!(link instanceof Element)) return false;
      if (isExtensionConversationLink(link)) return false;

      const href = link.getAttribute('href') || '';
      if (!href.includes('/app/')) return false;

      const text = (link.textContent || '').trim();
      return text.length > 0;
    });
  }

  function updateSelectorStats(selector, hitCount) {
    const existing = selectorStats.get(selector) || { hits: 0, misses: 0, lastCount: 0, score: 100 };
    if (hitCount > 0) existing.hits += 1;
    else existing.misses += 1;
    existing.lastCount = hitCount;

    const total = existing.hits + existing.misses;
    const ratio = total > 0 ? existing.hits / total : 0;
    existing.score = Math.round(ratio * 100);
    selectorStats.set(selector, existing);
  }

  function getHeuristicConversationLinks(root = document) {
    const sidebar = root.querySelector('side-navigation-content') || root;
    const links = [...sidebar.querySelectorAll('a[href]')];
    return sanitizeConversationLinks(links);
  }

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
    const rankedSelectors = [...CONVERSATION_SELECTORS].sort((a, b) => {
      const aScore = selectorStats.get(a)?.score ?? 0;
      const bScore = selectorStats.get(b)?.score ?? 0;
      if (aScore !== bScore) return bScore - aScore;
      return (selectorOrder.get(a) ?? 0) - (selectorOrder.get(b) ?? 0);
    });

    for (const selector of rankedSelectors) {
      const links = sanitizeConversationLinks([...root.querySelectorAll(selector)]);
      updateSelectorStats(selector, links.length);
      if (links.length) {
        const score = selectorStats.get(selector)?.score ?? 100;
        selectorHealth.score = score;
        selectorHealth.activeSelector = selector;
        selectorHealth.fallbackMode = 'none';
        selectorHealth.message = '';
        return {
          links,
          sourceSelector: selector,
          ok: true,
          score,
          fallbackMode: 'none'
        };
      }
    }

    const heuristicLinks = getHeuristicConversationLinks(root);
    if (heuristicLinks.length) {
      selectorHealth.score = 45;
      selectorHealth.activeSelector = 'heuristic:/app/links';
      selectorHealth.fallbackMode = 'heuristic';
      selectorHealth.message = 'Using heuristic conversation detection fallback.';
      return {
        links: heuristicLinks,
        sourceSelector: 'heuristic:/app/links',
        ok: true,
        score: 45,
        fallbackMode: 'heuristic'
      };
    }

    selectorHealth.score = 0;
    selectorHealth.activeSelector = CONVERSATION_SELECTORS[0];
    selectorHealth.fallbackMode = 'none';
    selectorHealth.message = 'No supported conversation selectors matched current layout.';

    return {
      links: [],
      sourceSelector: CONVERSATION_SELECTORS[0],
      ok: false,
      score: 0,
      fallbackMode: 'none'
    };
  }

  function getSelectorHealth() {
    return {
      ...selectorHealth,
      perSelector: Object.fromEntries(selectorStats.entries())
    };
  }

  window.GFSharedUtils = Object.freeze({
    version: '1.0.0',
    CONVERSATION_SELECTORS,
    parseChatId,
    getConversationLinks,
    getSelectorHealth
  });
})();
