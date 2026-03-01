(() => {
  const shared = window.GFPinnedProtection;
  if (!shared) return;

  let observer = null;
  let scheduled = false;
  let lastCustomMenuContext = null;
  let healthWarned = false;
  let needsFullDecorationPass = true;
  const pendingRows = new Set();

  function debugLog(context, payload) {
    if (localStorage.getItem('gfDebug') !== '1') return;
    console.debug('[Gemini Folders and Protected Files Pinned Protection]', context, payload);
  }

  function applyHealthStatus() {
    const health = shared.getHealth?.();
    const isHealthy = !health || health.ok;
    document.body.setAttribute('data-gf-pinned-protection-status', isHealthy ? 'ok' : 'degraded');

    if (!isHealthy && !healthWarned) {
      healthWarned = true;
      debugLog('Pinned selector health degraded', health);
    }

    if (isHealthy) {
      healthWarned = false;
    }
  }

  function extractRowHrefFromEvent(event) {
    const trigger = event.target?.closest?.('.gf-chat-actions-menu-button');
    if (!trigger) return null;

    const row = trigger.closest('.gf-chat-item');
    if (!row) return null;

    const link = row.querySelector('.gf-chat-link');
    const href = link?.getAttribute('href') || '';
    if (!href) return null;

    const title = (link.textContent || '').trim();
    return {
      href,
      id: shared.parseChatId(href, title),
      at: Date.now()
    };
  }

  function disableActionElement(actionEl, text = 'Protected') {
    if (!actionEl || actionEl.dataset.gfProtectedAction === '1') return;

    const label = actionEl.querySelector('span:last-child') || actionEl.querySelector('.mdc-list-item__primary-text') || actionEl;
    const originalLabel = (label?.textContent || '').trim();

    actionEl.dataset.gfProtectedAction = '1';
    actionEl.classList.add('gf-protected-action');
    actionEl.setAttribute('data-gf-protected', 'true');
    actionEl.setAttribute('aria-disabled', 'true');
    actionEl.setAttribute('aria-label', 'Protected. Chat cannot be deleted');
    actionEl.setAttribute('title', 'Protected chat cannot be deleted');
    actionEl.setAttribute('tabindex', '-1');
    if (originalLabel) {
      actionEl.dataset.gfProtectedOriginalLabel = originalLabel;
    }

    if ('disabled' in actionEl) {
      actionEl.disabled = true;
    }

    if (label) label.textContent = text;

    const guard = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const keydownGuard = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        guard(event);
      }
    };

    actionEl.addEventListener('click', guard, true);
    actionEl.addEventListener('mousedown', guard, true);
    actionEl.addEventListener('mouseup', guard, true);
    actionEl.addEventListener('keydown', keydownGuard, true);
    actionEl._gfProtectedGuard = guard;
    actionEl._gfProtectedKeydownGuard = keydownGuard;
  }

  function enableActionElement(actionEl) {
    if (!actionEl || actionEl.dataset.gfProtectedAction !== '1') return;

    const guard = actionEl._gfProtectedGuard;
    const keydownGuard = actionEl._gfProtectedKeydownGuard;
    if (guard) {
      actionEl.removeEventListener('click', guard, true);
      actionEl.removeEventListener('mousedown', guard, true);
      actionEl.removeEventListener('mouseup', guard, true);
    }
    if (keydownGuard) {
      actionEl.removeEventListener('keydown', keydownGuard, true);
    }

    delete actionEl._gfProtectedGuard;
    delete actionEl._gfProtectedKeydownGuard;
    delete actionEl.dataset.gfProtectedAction;
    delete actionEl.dataset.gfProtected;

    actionEl.classList.remove('gf-protected-action');
    actionEl.removeAttribute('aria-disabled');
    actionEl.removeAttribute('tabindex');
    actionEl.removeAttribute('title');
    actionEl.removeAttribute('aria-label');

    if ('disabled' in actionEl) {
      actionEl.disabled = false;
    }

    const label = actionEl.querySelector('span:last-child') || actionEl.querySelector('.mdc-list-item__primary-text') || actionEl;
    const originalLabel = actionEl.dataset.gfProtectedOriginalLabel;
    if (label && originalLabel) {
      label.textContent = originalLabel;
    }
    delete actionEl.dataset.gfProtectedOriginalLabel;
  }

  function ensurePinnedState(link, pinned) {
    if (!link) return;

    const cleanedText = (link.textContent || '').replace(/\s*🔒\s*/g, ' ').trim();
    if (cleanedText !== link.textContent) {
      link.textContent = cleanedText;
    }

    link.classList.toggle('gf-chat-link-pinned', !!pinned);
    link.setAttribute('title', cleanedText);
  }

  function patchCustomMenuIfNeeded() {
    const menu = document.querySelector('.gf-chat-actions-menu-panel');
    if (!menu) return;

    const context = lastCustomMenuContext;
    if (!context) return;
    if (Date.now() - context.at > 5000) return;

    const isPinned = shared.isHrefPinned(context.href);
    const deleteButton = menu.querySelector('[data-action="delete"]');
    if (!isPinned) {
      enableActionElement(deleteButton);
      return;
    }

    disableActionElement(deleteButton, 'Protected');
  }

  function patchNativeMenuIfNeeded() {
    const contextPinned = !!(
      lastCustomMenuContext
      && Date.now() - lastCustomMenuContext.at <= 5000
      && shared.isHrefPinned(lastCustomMenuContext.href)
    );
    const currentPinned = shared.isCurrentChatPinned();
    const shouldProtect = contextPinned || currentPinned;

    const panes = [...document.querySelectorAll('.cdk-overlay-pane')];
    if (!panes.length) return;

    const pane = panes.findLast((candidate) => {
      const menu = candidate.querySelector('[role="menu"], .mat-mdc-menu-panel');
      if (!menu) return false;
      const style = window.getComputedStyle(candidate);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });

    if (!pane) return;

    const items = [...pane.querySelectorAll('[role="menuitem"], button.mat-mdc-menu-item')];
    const deleteTerms = Array.isArray(window.GFMenuActionTerms?.deleteTerms)
      ? window.GFMenuActionTerms.deleteTerms
      : [
        'delete',
        'remove',
        'eliminar',
        'elimina',
        'supprimer',
        'löschen',
        'excluir',
        'cancella',
        '削除',
        '删除',
        '삭제',
        'удал'
      ];

    const hasDeleteIcon = (item) => {
      if (!item) return false;
      if (item.querySelector('[data-mat-icon-name="delete"], [fonticon="delete"]')) return true;

      const iconLikeNodes = item.querySelectorAll('[aria-hidden="true"], .google-symbols, mat-icon, [data-mat-icon-name], [fonticon]');
      for (const node of iconLikeNodes) {
        const iconText = (node.textContent || '').trim().toLowerCase();
        if (iconText === 'delete') return true;
      }

      return false;
    };

    const hasDeleteTextHint = (item) => {
      if (!item) return false;
      const rawText = [
        item.getAttribute('aria-label') || '',
        item.getAttribute('title') || '',
        item.textContent || ''
      ].join(' ').toLowerCase();

      return deleteTerms.some((term) => rawText.includes(term));
    };

    const deleteItem = items.find((item) => hasDeleteIcon(item) || hasDeleteTextHint(item));
    if (!shouldProtect) {
      enableActionElement(deleteItem);
      return;
    }

    disableActionElement(deleteItem, 'Protected');
  }

  function applyPinnedChatDecorations() {
    const rows = needsFullDecorationPass
      ? [...document.querySelectorAll('.gf-chat-item')]
      : [...pendingRows];

    pendingRows.clear();
    needsFullDecorationPass = false;

    for (const row of rows) {
      const link = row.querySelector('.gf-chat-link');
      const href = link?.getAttribute('href') || '';
      const pinned = !!href && shared.isHrefPinned(href);
      row.classList.toggle('gf-chat-item-pinned', pinned);
      ensurePinnedState(link, pinned);
    }
  }

  function runPass() {
    scheduled = false;
    applyHealthStatus();
    applyPinnedChatDecorations();
    patchCustomMenuIfNeeded();
    patchNativeMenuIfNeeded();
  }

  function schedulePass() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(runPass);
  }

  function queueRowForDecoration(node) {
    const element = node instanceof Element ? node : node?.parentElement;
    if (!element) return;

    const row = element.matches('.gf-chat-item') ? element : element.closest('.gf-chat-item');
    if (row) pendingRows.add(row);
  }

  function isRelevantPinnedMutationNode(node) {
    const element = node instanceof Element ? node : node?.parentElement;
    if (!element) return false;

    if (element.matches?.('.gf-chat-item, .gf-chat-link, .gf-chat-actions-menu-button')) return true;
    if (element.matches?.('.gf-chat-actions-menu-panel, .cdk-overlay-pane, [role="menu"], [role="menuitem"], button.mat-mdc-menu-item')) return true;
    if (element.matches?.('a[data-test-id="conversation"], a[href*="/app/"]')) return true;

    return !!element.querySelector?.('.gf-chat-item, .gf-chat-actions-menu-panel, .cdk-overlay-pane, [role="menu"], [role="menuitem"], a[data-test-id="conversation"], a[href*="/app/"]');
  }

  function bindListeners() {
    document.addEventListener('click', (event) => {
      const context = extractRowHrefFromEvent(event);
      if (context) {
        lastCustomMenuContext = context;
      }

      queueRowForDecoration(event.target);
      schedulePass();
    }, true);

    window.addEventListener('popstate', () => {
      needsFullDecorationPass = true;
      schedulePass();
    });

    window.addEventListener('hashchange', () => {
      needsFullDecorationPass = true;
      schedulePass();
    });

    observer = new MutationObserver((mutations) => {
      let shouldRun = false;

      const hasRelevantMutation = mutations.some((mutation) => {
        const targetRelevant = isRelevantPinnedMutationNode(mutation.target);
        const addedRelevant = [...mutation.addedNodes].some((node) => isRelevantPinnedMutationNode(node));
        const removedRelevant = [...mutation.removedNodes].some((node) => isRelevantPinnedMutationNode(node));

        if (targetRelevant) {
          shouldRun = true;
          queueRowForDecoration(mutation.target);
        }

        for (const node of mutation.addedNodes) {
          if (!isRelevantPinnedMutationNode(node)) continue;
          shouldRun = true;
          queueRowForDecoration(node);

          const element = node instanceof Element ? node : node?.parentElement;
          if (element?.matches?.('a[data-test-id="conversation"], a[href*="/app/"]') || element?.querySelector?.('a[data-test-id="conversation"], a[href*="/app/"]')) {
            needsFullDecorationPass = true;
          }
        }

        if (removedRelevant) {
          shouldRun = true;
        }

        if (addedRelevant || removedRelevant) return true;
        if (targetRelevant) return true;
        return false;
      });

      if (hasRelevantMutation && shouldRun) {
        schedulePass();
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'aria-disabled']
    });
  }

  function init() {
    bindListeners();
    schedulePass();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
