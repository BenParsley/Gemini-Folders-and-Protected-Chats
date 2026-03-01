(() => {
  const ROOT_ID = 'gf-sidebar-root';
  const STORAGE_KEY = 'gfStateV1';
  const STORAGE_SCHEMA_VERSION = 2;
  const STORAGE_COMPACTION_INTERVAL_MS = 60 * 1000;
  const SIDEBAR_SELECTOR = 'side-navigation-content';
  const CHAT_SELECTORS = window.GFSharedUtils?.CONVERSATION_SELECTORS || [
    'a[data-test-id="conversation"]',
    'conversations-list a[href^="/app/"]',
    'a[href*="/app/"]'
  ];
  const DEFAULT_CREATE_MODAL_CONFIG = {
    title: 'Create Folder',
    placeholder: 'Folder name...',
    cancelText: 'Cancel',
    createText: 'Create',
    width: 376,
    titleSize: 16,
    inputSize: 12,
    inputHeight: 34,
    inputWidth: 92,
    buttonSize: 12
  };

  const PERF_BUDGET = {
    minTickIntervalMs: 24,
    maxMutationsPerBatch: 240,
    perfLogIntervalMs: 5000
  };

  const supportsHasSelector = typeof CSS !== 'undefined'
    && typeof CSS.supports === 'function'
    && CSS.supports('selector(:has(*))');

  const state = {
    folders: [],
    chatAssignments: {},
    deletedChats: {},
    folderOpen: {},
    selectedChats: {},
    selectMode: false,
    folderSearch: '',
    drag: null,
    status: '',
    selectorDegraded: false
  };

  const uiOffsets = {
    headerX: 60,
    header: 10,
    headerWidth: 210,
    headerHeight: 28,
    headerIconSize: 18,
    chatMenuX: 8,
    chatMenuY: 0,
    chats: 120,
    folders: 120,
    chatsDropHighlightExpand: 8
  };

  const sourceChats = new Map();
  let stateMeta = {
    lastCompactedAt: 0
  };
  let root = null;
  let observer = null;
  let saveTimer = null;
  let statusTimer = null;
  let tickScheduled = false;
  let tickRunning = false;
  let ignoreMutationsUntil = 0;
  let messageListenerBound = false;
  let activeFolderModal = null;
  let activeFolderActionsMenu = null;
  let activeChatActionsMenu = null;
  let activeBottomSheet = null;
  let createModalConfig = { ...DEFAULT_CREATE_MODAL_CONFIG };
  let debugColorsEnabled = false;
  let showAllHamburgersEnabled = false;
  let selectorWarningShown = false;
  let lastNativeMenuChatContext = null;
  let nativeMenuIntentListenerBound = false;
  let silentPinStyleEl = null;
  let silentPinOverlayHideTimer = null;
  let lastTickAt = 0;
  let delayedTickTimer = null;
  let lastCompactionAt = 0;
  const perfStats = {
    mutationsSeen: 0,
    mutationBursts: 0,
    ticksRequested: 0,
    ticksRun: 0,
    lastPerfLogAt: 0
  };

  function debugLog(context, error) {
    if (localStorage.getItem('gfDebug') !== '1') return;
    console.debug('[Gemini Folders and Protected Files Content]', context, error);
  }

  function recordPerfSnapshot(reason) {
    const now = Date.now();
    if (now - perfStats.lastPerfLogAt < PERF_BUDGET.perfLogIntervalMs) return;
    perfStats.lastPerfLogAt = now;
    debugLog(`Perf snapshot (${reason})`, {
      mutationsSeen: perfStats.mutationsSeen,
      mutationBursts: perfStats.mutationBursts,
      ticksRequested: perfStats.ticksRequested,
      ticksRun: perfStats.ticksRun
    });
  }

  const storage = {
    async get() {
      return new Promise((resolve) => {
        if (!chrome?.storage?.local) {
          resolve({});
          return;
        }
        chrome.storage.local.get([STORAGE_KEY], (result) => {
          resolve(result?.[STORAGE_KEY] || {});
        });
      });
    },
    async set(value) {
      return new Promise((resolve) => {
        if (!chrome?.storage?.local) {
          resolve();
          return;
        }
        chrome.storage.local.set({ [STORAGE_KEY]: value }, () => resolve());
      });
    }
  };

  function nowId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function parseChatId(href, title) {
    return window.GFSharedUtils?.parseChatId(href, title) || '';
  }

  function getMenuActionTerms() {
    const shared = window.GFMenuActionTerms;
    const sharedActions = shared?.chatActions || {};
    return {
      share: sharedActions.share || {
        icons: ['share'],
        terms: ['share conversation', 'share']
      },
      pinOn: sharedActions.pinOn || {
        icons: ['push_pin', 'keep_off'],
        terms: ['pin', 'anclar', 'fixer', 'heften', 'fixar', 'fissa', '固定', 'закреп']
      },
      pinOff: sharedActions.pinOff || {
        icons: ['keep_off', 'push_pin'],
        terms: ['unpin', 'un pin', 'desanclar', 'desfijar', 'détacher', 'lösen', '解除固定', 'закреп']
      },
      rename: sharedActions.rename || {
        icons: ['edit', 'drive_file_rename_outline'],
        terms: ['rename', 'edit name', 'renombrar', 'renommer', 'umbenennen', 'rinomina', '名前を変更', '重命名']
      },
      delete: sharedActions.delete || {
        icons: ['delete'],
        terms: ['delete', 'remove', 'eliminar', 'supprimer', 'löschen', 'excluir', 'cancella', '削除', '删除', '삭제', 'удал']
      }
    };
  }

  function isSidebarExpanded() {
    const appRoot = document.querySelector('chat-app');
    if (appRoot?.classList.contains('side-nav-open')) return true;
    const sideNav = document.querySelector('bard-sidenav');
    if (!sideNav) return false;
    return sideNav.getBoundingClientRect().width > 120;
  }

  function getConversationLinkMeta(link) {
    if (!(link instanceof Element)) return null;

    const href = link.getAttribute('href') || '';
    const titleEl = link.querySelector('.conversation-title');
    const title = (titleEl?.textContent || link.textContent || 'Untitled chat').trim();
    if (!href || !title) return null;

    return {
      href,
      title,
      id: parseChatId(href, title)
    };
  }

  function isConversationMatch(link, chat) {
    const meta = getConversationLinkMeta(link);
    if (!meta) return false;
    return meta.id === chat.id || meta.href === chat.href;
  }

  function extractChatsFromDom() {
    const lookup = window.GFSharedUtils?.getConversationLinks?.(document) || {
      links: [],
      sourceSelector: CHAT_SELECTORS[0],
      ok: false,
      score: 0,
      fallbackMode: 'none'
    };
    const links = lookup.links;
    const activeSelector = lookup.sourceSelector;
    const selectorScore = Number.isFinite(lookup.score) ? lookup.score : 0;
    const isHeuristicFallback = lookup.fallbackMode === 'heuristic';
    const debugMode = getDebugModeEnabled();

    if (!links.length && !selectorWarningShown && root) {
      selectorWarningShown = true;
      state.selectorDegraded = true;
      state.status = 'Gemini layout changed. Conversation sync is unavailable.';
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => {
        state.status = '';
        render();
      }, 3000);
      render();
      debugLog('No conversation selectors matched', { selectors: CHAT_SELECTORS });
    } else if (links.length && debugMode && (isHeuristicFallback || selectorScore < 60)) {
      selectorWarningShown = true;
      state.selectorDegraded = true;
      state.status = isHeuristicFallback
        ? 'Conversation sync running in heuristic fallback mode.'
        : `Conversation selector health is degraded (${selectorScore}%).`;
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => {
        state.status = '';
        render();
      }, 2600);
      render();
    } else if (links.length) {
      selectorWarningShown = false;
      state.selectorDegraded = false;
      if (!debugMode && state.status) {
        state.status = '';
      }
    }

    const chats = [];

    for (const link of links) {
      const meta = getConversationLinkMeta(link);
      if (!meta) continue;
      const pinned = !!link.querySelector('[data-mat-icon-name="push_pin"], [fonticon="push_pin"]');
      chats.push({ id: meta.id, title: meta.title, href: meta.href, pinned });
    }

    return chats;
  }

  function syncSourceChats() {
    const chats = extractChatsFromDom();
    const seen = new Set();
    let changed = false;

    for (const chat of chats) {
      const existing = sourceChats.get(chat.id);
      if (!existing || existing.title !== chat.title || existing.href !== chat.href || existing.pinned !== chat.pinned) {
        changed = true;
      }
      sourceChats.set(chat.id, chat);
      seen.add(chat.id);
    }

    for (const id of [...sourceChats.keys()]) {
      if (!seen.has(id)) {
        changed = true;
        sourceChats.delete(id);
        delete state.selectedChats[id];
      }
    }

    return changed;
  }

  function sanitizeState() {
    const foldersById = new Map(state.folders.map((folder) => [folder.id, folder]));
    let changed = false;

    for (const folder of state.folders) {
      if (folder.parentId && !foldersById.has(folder.parentId)) {
        folder.parentId = null;
        changed = true;
      }
      if (folder.parentId) {
        const parent = foldersById.get(folder.parentId);
        if (!parent || parent.parentId) {
          folder.parentId = null;
          changed = true;
        }
      }
    }

    for (const chatId of Object.keys(state.chatAssignments)) {
      const folderId = state.chatAssignments[chatId];
      if (folderId && !foldersById.has(folderId)) {
        state.chatAssignments[chatId] = null;
        changed = true;
      }
    }

    for (const folderId of Object.keys(state.folderOpen || {})) {
      if (!foldersById.has(folderId)) {
        delete state.folderOpen[folderId];
        changed = true;
      }
    }

    return changed;
  }

  function queueSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const payload = {
        schemaVersion: STORAGE_SCHEMA_VERSION,
        folders: state.folders,
        chatAssignments: state.chatAssignments,
        deletedChats: state.deletedChats,
        folderOpen: state.folderOpen,
        meta: {
          lastCompactedAt: Number.isFinite(stateMeta.lastCompactedAt)
            ? stateMeta.lastCompactedAt
            : 0
        }
      };
      await storage.set(payload);
    }, 200);
  }

  function migrateV0ToV1(payload) {
    return {
      schemaVersion: 1,
      folders: Array.isArray(payload?.folders) ? payload.folders : [],
      chatAssignments: payload?.chatAssignments && typeof payload.chatAssignments === 'object' ? payload.chatAssignments : {},
      deletedChats: payload?.deletedChats && typeof payload.deletedChats === 'object' ? payload.deletedChats : {},
      folderOpen: payload?.folderOpen && typeof payload.folderOpen === 'object' ? payload.folderOpen : {}
    };
  }

  function migrateV1ToV2(payload) {
    const base = migrateV0ToV1(payload);
    return {
      ...base,
      schemaVersion: 2,
      meta: {
        lastCompactedAt: Number(payload?.meta?.lastCompactedAt) || 0
      }
    };
  }

  function migrateStoredState(rawPayload) {
    const original = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
    const originalVersion = Number.isInteger(original.schemaVersion) ? original.schemaVersion : 0;
    let currentVersion = originalVersion;
    let payload = { ...original };

    while (currentVersion < STORAGE_SCHEMA_VERSION) {
      if (currentVersion === 0) {
        payload = migrateV0ToV1(payload);
        currentVersion = 1;
        continue;
      }
      if (currentVersion === 1) {
        payload = migrateV1ToV2(payload);
        currentVersion = 2;
        continue;
      }
      break;
    }

    payload.schemaVersion = STORAGE_SCHEMA_VERSION;

    return {
      payload,
      changed: originalVersion !== STORAGE_SCHEMA_VERSION
    };
  }

  function compactStateAgainstSourceChats({ force = false } = {}) {
    const now = Date.now();
    if (!force && now - lastCompactionAt < STORAGE_COMPACTION_INTERVAL_MS) return false;
    lastCompactionAt = now;

    const validChatIds = new Set(sourceChats.keys());
    let changed = false;

    for (const chatId of Object.keys(state.chatAssignments)) {
      if (!validChatIds.has(chatId)) {
        delete state.chatAssignments[chatId];
        changed = true;
      }
    }

    for (const chatId of Object.keys(state.deletedChats)) {
      if (!validChatIds.has(chatId)) {
        delete state.deletedChats[chatId];
        changed = true;
      }
    }

    for (const chatId of Object.keys(state.selectedChats)) {
      if (!validChatIds.has(chatId)) {
        delete state.selectedChats[chatId];
        changed = true;
      }
    }

    if (changed) {
      stateMeta.lastCompactedAt = now;
      queueSave();
      debugLog('State compaction applied', {
        chatAssignments: Object.keys(state.chatAssignments).length,
        deletedChats: Object.keys(state.deletedChats).length
      });
    }

    return changed;
  }

  function closeFolderModal() {
    if (!activeFolderModal) return;
    const { overlay, onKeydown } = activeFolderModal;
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
    activeFolderModal = null;
  }

  function closeFolderActionsMenu() {
    if (!activeFolderActionsMenu) return;
    const { panel, onDocClick, onKeydown, anchorElement } = activeFolderActionsMenu;
    document.removeEventListener('mousedown', onDocClick, true);
    document.removeEventListener('keydown', onKeydown);
    panel.remove();
    anchorElement?.setAttribute('aria-expanded', 'false');
    activeFolderActionsMenu = null;
  }

  function closeChatActionsMenu() {
    if (!activeChatActionsMenu) return;
    const { panel, onDocClick, onKeydown, anchorElement } = activeChatActionsMenu;
    document.removeEventListener('mousedown', onDocClick, true);
    document.removeEventListener('keydown', onKeydown);
    panel.remove();
    anchorElement?.setAttribute('aria-expanded', 'false');
    activeChatActionsMenu = null;
  }

  function bindMenuKeyboardNavigation(panel) {
    const items = [...panel.querySelectorAll('.gf-folder-actions-item')];
    if (!items.length) return;

    const focusByOffset = (offset) => {
      const current = document.activeElement;
      const currentIndex = items.indexOf(current);
      const nextIndex = currentIndex < 0
        ? 0
        : (currentIndex + offset + items.length) % items.length;
      items[nextIndex]?.focus();
    };

    panel.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusByOffset(1);
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusByOffset(-1);
      }
      if (event.key === 'Home') {
        event.preventDefault();
        items[0]?.focus();
      }
      if (event.key === 'End') {
        event.preventDefault();
        items[items.length - 1]?.focus();
      }
    });

    items[0]?.focus();
  }

  function hasMatchingIconToken(item, iconNames = []) {
    if (!item) return false;

    for (const iconName of iconNames) {
      if (item.querySelector(`[data-mat-icon-name="${iconName}"], [fonticon="${iconName}"]`)) {
        return true;
      }
    }

    const normalizedIcons = iconNames.map((value) => (value || '').trim().toLowerCase());
    const iconLikeNodes = item.querySelectorAll('[aria-hidden="true"], .google-symbols, mat-icon, [data-mat-icon-name], [fonticon]');
    for (const node of iconLikeNodes) {
      const iconText = (node.textContent || '').trim().toLowerCase();
      if (normalizedIcons.includes(iconText)) return true;
    }

    return false;
  }

  function hasMatchingTextToken(item, terms = []) {
    if (!item) return false;
    const raw = [
      item.getAttribute('aria-label') || '',
      item.getAttribute('title') || '',
      item.textContent || ''
    ].join(' ').toLowerCase();
    return terms.some((term) => raw.includes((term || '').toLowerCase()));
  }

  function getNativeMenuActionIntent(item) {
    if (!item) return null;
    const menuTerms = getMenuActionTerms();

    const isUnpin = hasMatchingIconToken(item, menuTerms.pinOff.icons)
      || hasMatchingTextToken(item, menuTerms.pinOff.terms);
    if (isUnpin) return 'unpin';

    const isPin = hasMatchingIconToken(item, menuTerms.pinOn.icons)
      || hasMatchingTextToken(item, menuTerms.pinOn.terms);
    if (isPin) return 'pin';

    return null;
  }

  function bindNativeMenuIntentListener() {
    if (nativeMenuIntentListenerBound) return;
    nativeMenuIntentListenerBound = true;

    const handleNativeMenuIntent = (event, phase) => {
      const item = event.target?.closest?.('[role="menuitem"], button.mat-mdc-menu-item');
      if (!item) return;

      const pane = item.closest('.cdk-overlay-pane');
      if (!pane) return;
      if (!pane.querySelector('[role="menu"], .mat-mdc-menu-panel')) return;

      const intent = getNativeMenuActionIntent(item);
      if (intent === 'pin') {
        if (phase === 'pre') {
          beginSilentPinWindow();
        }
        if (phase === 'commit') {
          autoCompleteNativePinDialog(lastNativeMenuChatContext || {});
        }
      }

      if (intent === 'unpin' && lastNativeMenuChatContext && phase === 'commit') {
        lastNativeMenuChatContext = {
          ...lastNativeMenuChatContext,
          pinned: false,
          at: Date.now()
        };
      }
    };

    document.addEventListener('pointerdown', (event) => {
      handleNativeMenuIntent(event, 'pre');
    }, true);

    document.addEventListener('mousedown', (event) => {
      handleNativeMenuIntent(event, 'pre');
    }, true);

    document.addEventListener('click', (event) => {
      handleNativeMenuIntent(event, 'commit');
    }, true);
  }

  function findNativeChatActionButton(chat) {
    const nativeConversations = window.GFSharedUtils?.getConversationLinks?.(document)?.links || [];
    const nativeChat = nativeConversations.find((link) => isConversationMatch(link, chat));

    return nativeChat
      ?.closest('.conversation-items-container')
      ?.querySelector('button[data-test-id="actions-menu-button"]') || null;
  }

  function findVisibleNativeMenuPane() {
    const overlayPanes = [...document.querySelectorAll('.cdk-overlay-pane')];
    return overlayPanes.findLast((pane) => {
      const menu = pane.querySelector('[role="menu"], .mat-mdc-menu-panel');
      if (!menu) return false;
      const style = window.getComputedStyle(pane);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }) || null;
  }

  function ensureSilentPinStyle() {
    if (silentPinStyleEl) return;
    const style = document.createElement('style');
    style.id = 'gf-silent-pin-style';
    style.textContent = `
      .gf-silent-pin-window .cdk-overlay-pane,
      .gf-silent-pin-window .cdk-overlay-backdrop,
      .gf-silent-pin-window [role="dialog"],
      .gf-silent-pin-window .mat-mdc-dialog-container,
      .gf-silent-pin-window mat-dialog-container {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      .gf-silent-pin-pane {
        opacity: 0 !important;
        pointer-events: none !important;
      }
      .gf-silent-pin-pane [role="dialog"],
      .gf-silent-pin-pane .mat-mdc-dialog-container,
      .gf-silent-pin-pane mat-dialog-container {
        visibility: hidden !important;
      }
    `;
    document.head.appendChild(style);
    silentPinStyleEl = style;
  }

  function beginSilentPinWindow() {
    ensureSilentPinStyle();
    document.documentElement.classList.add('gf-silent-pin-window');

    if (silentPinOverlayHideTimer) {
      clearTimeout(silentPinOverlayHideTimer);
    }
    silentPinOverlayHideTimer = setTimeout(() => {
      document.documentElement.classList.remove('gf-silent-pin-window');
      silentPinOverlayHideTimer = null;
    }, 3800);
  }

  function endSilentPinWindow() {
    document.documentElement.classList.remove('gf-silent-pin-window');
    if (silentPinOverlayHideTimer) {
      clearTimeout(silentPinOverlayHideTimer);
      silentPinOverlayHideTimer = null;
    }
  }

  function setSilentPinPane(pane, enabled) {
    if (!pane) return;
    if (enabled) {
      pane.classList.add('gf-silent-pin-pane');
      return;
    }
    pane.classList.remove('gf-silent-pin-pane');
  }

  function clearSilentPinPanes() {
    document.querySelectorAll('.gf-silent-pin-pane').forEach((pane) => {
      pane.classList.remove('gf-silent-pin-pane');
    });
  }

  function findActivePinDialogPane() {
    const panes = [...document.querySelectorAll('.cdk-overlay-pane')];
    return panes.findLast((pane) => {
      const style = window.getComputedStyle(pane);
      if (style.display === 'none') return false;
      return !!pane.querySelector('[role="dialog"], .mat-mdc-dialog-container, mat-dialog-container');
    }) || null;
  }

  function autoCompleteNativePinDialog(chat) {
    beginSilentPinWindow();
    const fallbackTitle = (chat?.title || 'Pinned chat').trim() || 'Pinned chat';
    let attempts = 0;
    const maxAttempts = 28;

    const clickConfirmAction = (dialogPane) => {
      const actions = [...dialogPane.querySelectorAll('button, [role="button"], .mdc-button, .mat-mdc-button')].filter((button) => {
        return !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true';
      });

      const confirmByText = actions.find((button) => {
        const text = (button.textContent || '').trim().toLowerCase();
        return /^(pin|save|done|confirm)$/i.test(text)
          || /(pin|save|confirm|done|apply|submit|ok|continue|next)/i.test(text);
      });
      if (confirmByText) {
        confirmByText.click();
        return true;
      }

      const dialogActions = [
        ...dialogPane.querySelectorAll('.mat-mdc-dialog-actions button, [mat-dialog-actions] button')
      ].filter((button) => !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true');
      const trailingAction = dialogActions[dialogActions.length - 1];
      if (trailingAction) {
        trailingAction.click();
        return true;
      }

      const lastEnabled = actions[actions.length - 1];
      if (lastEnabled) {
        lastEnabled.click();
        return true;
      }

      return false;
    };

    const stop = () => {
      clearSilentPinPanes();
      endSilentPinWindow();
    };

    const completeOnce = () => {
      attempts += 1;

      const dialogPane = findActivePinDialogPane();

      if (!dialogPane) {
        if (attempts >= maxAttempts) {
          stop();
          return false;
        }
        return true;
      }

      setSilentPinPane(dialogPane, true);

      const input = dialogPane.querySelector('input[type="text"], input:not([type]), textarea');
      if (input && !(input.value || '').trim()) {
        input.focus();
        input.value = fallbackTitle;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }

      if (clickConfirmAction(dialogPane)) {
        stop();
        return false;
      }

      if (attempts >= maxAttempts) {
        stop();
        return false;
      }
      return true;
    };

    const timer = setInterval(() => {
      const keepGoing = completeOnce();
      if (!keepGoing) clearInterval(timer);
    }, 90);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const keepGoing = completeOnce();
        if (!keepGoing) {
          clearInterval(timer);
          stop();
        }
      });
    });

    setTimeout(() => {
      clearInterval(timer);
      stop();
    }, 3200);
  }

  function executeNativeChatMenuAction(chat, action, anchorElement = null) {
    const normalizeText = (value) => (value || '').trim().toLowerCase();
    const menuTerms = getMenuActionTerms();
    const actionConfig = {
      share: menuTerms.share,
      pin: chat.pinned
        ? menuTerms.pinOff
        : menuTerms.pinOn,
      rename: menuTerms.rename,
      delete: menuTerms.delete
    };

    const findActionItem = (items) => {
      const config = actionConfig[action];
      if (!config) return null;

      const byIcon = items.find((item) => hasMatchingIconToken(item, config.icons));
      if (byIcon) return byIcon;

      const byTerm = items.find((item) => hasMatchingTextToken(item, config.terms));
      if (byTerm) return byTerm;

      return null;
    };

    const actionBtn = findNativeChatActionButton(chat);
    if (!actionBtn) return;

    actionBtn.click();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (anchorElement) {
          repositionNativeChatMenu(anchorElement);
        }

        const pane = findVisibleNativeMenuPane();
        if (!pane) return;

        const items = [...pane.querySelectorAll('[role="menuitem"], button.mat-mdc-menu-item')];
        const target = findActionItem(items);
        if (!target) {
          debugLog('Native menu action not found', { action, chatId: chat.id });
          return;
        }
        target?.click();

      });
    });
  }

  function openChatActionsMenu(chat, anchorElement) {
    closeChatActionsMenu();

    const pinLabel = chat.pinned ? 'Unpin' : 'Pin';
    const pinIcon = chat.pinned ? 'keep_off' : 'push_pin';

    const panel = document.createElement('div');
    panel.className = 'gf-folder-actions-menu-panel gf-chat-actions-menu-panel';
    panel.setAttribute('role', 'menu');
    panel.innerHTML = `
      <button class="gf-folder-actions-item" type="button" data-action="share"><span class="google-symbols gf-folder-actions-item-icon" aria-hidden="true">share</span><span>Share conversation</span></button>
      <button class="gf-folder-actions-item" type="button" data-action="pin"><span class="google-symbols gf-folder-actions-item-icon" aria-hidden="true">${pinIcon}</span><span>${pinLabel}</span></button>
      <button class="gf-folder-actions-item" type="button" data-action="rename"><span class="google-symbols gf-folder-actions-item-icon" aria-hidden="true">edit</span><span>Rename</span></button>
      <button class="gf-folder-actions-item" type="button" data-action="delete"><span class="google-symbols gf-folder-actions-item-icon" aria-hidden="true">delete</span><span>Delete</span></button>
    `;

    panel.querySelectorAll('.gf-folder-actions-item').forEach((item) => {
      item.setAttribute('role', 'menuitem');
    });

    document.body.appendChild(panel);
    anchorElement?.setAttribute('aria-expanded', 'true');

    const anchorRect = anchorElement.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const width = Math.max(230, panelRect.width || 230);
    const height = Math.max(150, panelRect.height || 150);
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, anchorRect.right + uiOffsets.chatMenuX));
    const top = Math.max(8, Math.min(window.innerHeight - height - 8, anchorRect.top + uiOffsets.chatMenuY));

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;

    panel.querySelectorAll('.gf-folder-actions-item').forEach((item) => {
      item.addEventListener('click', () => {
        const action = item.getAttribute('data-action');
        closeChatActionsMenu();
        executeNativeChatMenuAction(chat, action, anchorElement);
      });
    });

    bindMenuKeyboardNavigation(panel);

    const onDocClick = (event) => {
      if (panel.contains(event.target) || anchorElement.contains(event.target)) return;
      closeChatActionsMenu();
    };
    const onKeydown = (event) => {
      if (event.key === 'Escape') closeChatActionsMenu();
    };

    document.addEventListener('mousedown', onDocClick, true);
    document.addEventListener('keydown', onKeydown);
    activeChatActionsMenu = { panel, onDocClick, onKeydown, anchorElement };
  }

  function openFolderActionsMenu(folder, anchorElement) {
    closeFolderActionsMenu();

    const panel = document.createElement('div');
    panel.className = 'gf-folder-actions-menu-panel';
    panel.setAttribute('role', 'menu');
    panel.innerHTML = `
      <button class="gf-folder-actions-item" type="button" data-action="rename"><span class="google-symbols gf-folder-actions-item-icon" aria-hidden="true">edit</span><span>Rename</span></button>
      <button class="gf-folder-actions-item" type="button" data-action="delete"><span class="google-symbols gf-folder-actions-item-icon" aria-hidden="true">delete</span><span>Delete</span></button>
    `;

    panel.querySelectorAll('.gf-folder-actions-item').forEach((item) => {
      item.setAttribute('role', 'menuitem');
    });

    document.body.appendChild(panel);
    anchorElement?.setAttribute('aria-expanded', 'true');

    const anchorRect = anchorElement.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const width = Math.max(170, panelRect.width || 170);
    const height = Math.max(100, panelRect.height || 100);
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, anchorRect.right + 8));
    const top = Math.max(8, Math.min(window.innerHeight - height - 8, anchorRect.top));

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;

    panel.querySelector('[data-action="rename"]')?.addEventListener('click', () => {
      closeFolderActionsMenu();
      onEditFolder(folder.id);
    });
    panel.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
      closeFolderActionsMenu();
      onDeleteFolder(folder.id);
    });

    bindMenuKeyboardNavigation(panel);

    const onDocClick = (event) => {
      if (panel.contains(event.target) || anchorElement.contains(event.target)) return;
      closeFolderActionsMenu();
    };
    const onKeydown = (event) => {
      if (event.key === 'Escape') closeFolderActionsMenu();
    };

    document.addEventListener('mousedown', onDocClick, true);
    document.addEventListener('keydown', onKeydown);
    activeFolderActionsMenu = { panel, onDocClick, onKeydown, anchorElement };
  }

  function closeBottomSheet() {
    if (!activeBottomSheet) return;
    const { panel, onKeydown } = activeBottomSheet;
    document.removeEventListener('keydown', onKeydown);
    panel.remove();
    activeBottomSheet = null;
  }

  function openBottomSheet(content, bindEvents) {
    closeBottomSheet();
    const panel = document.createElement('div');
    panel.className = 'gf-bottom-sheet';
    panel.innerHTML = content;
    document.body.appendChild(panel);

    const onKeydown = (event) => {
      if (event.key === 'Escape') closeBottomSheet();
    };
    document.addEventListener('keydown', onKeydown);

    activeBottomSheet = { panel, onKeydown };
    bindEvents?.(panel);
  }

  function getSelectedChatIds() {
    return Object.keys(state.selectedChats).filter((chatId) => state.selectedChats[chatId]);
  }

  function clearMultiSelect() {
    state.selectedChats = {};
    state.selectMode = false;
    closeBottomSheet();
    render();
  }

  function moveSelectedChatsToFolder(folderId) {
    const selected = getSelectedChatIds();
    if (!selected.length) return;
    state.selectedChats = {};
    state.selectMode = false;
    closeBottomSheet();
    moveChatsToFolder(selected, folderId);
  }

  function openMoveSelectedBottomSheet() {
    const selected = getSelectedChatIds();
    if (!selected.length) return;

    const topFolders = state.folders.filter((folder) => !folder.parentId);
    if (!topFolders.length) {
      openBottomSheet(`
        <div class="gf-bottom-sheet-card">
          <div class="gf-bottom-sheet-title">No folders yet</div>
          <div class="gf-bottom-sheet-text">Create a folder first, then move your selected chats.</div>
          <div class="gf-bottom-sheet-actions">
            <button class="gf-bottom-btn gf-bottom-btn-muted" type="button" data-action="close">Close</button>
            <button class="gf-bottom-btn gf-bottom-btn-primary" type="button" data-action="create-folder">Create Folder</button>
          </div>
        </div>
      `, (panel) => {
        panel.querySelector('[data-action="close"]')?.addEventListener('click', closeBottomSheet);
        panel.querySelector('[data-action="create-folder"]')?.addEventListener('click', () => {
          closeBottomSheet();
          onCreateFolder(null);
        });
      });
      return;
    }

    openBottomSheet(`
      <div class="gf-bottom-sheet-card">
        <div class="gf-bottom-sheet-title">Move to Folder</div>
        <div class="gf-bottom-sheet-text">Choose where to move ${selected.length} selected chat${selected.length === 1 ? '' : 's'}.</div>
        <div class="gf-bottom-folder-list"></div>
        <div class="gf-bottom-sheet-actions">
          <button class="gf-bottom-btn gf-bottom-btn-muted" type="button" data-action="cancel">Cancel</button>
        </div>
      </div>
    `, (panel) => {
      const folderList = panel.querySelector('.gf-bottom-folder-list');
      if (folderList) {
        for (const folder of topFolders) {
          const button = document.createElement('button');
          button.className = 'gf-bottom-folder-option';
          button.type = 'button';
          button.setAttribute('data-folder-id', folder.id);
          button.textContent = `${folder.emoji || '📁'} ${folder.name}`;
          button.addEventListener('click', () => {
            moveSelectedChatsToFolder(folder.id);
          });
          folderList.appendChild(button);
        }
      }

      panel.querySelector('[data-action="cancel"]')?.addEventListener('click', closeBottomSheet);
    });
  }

  function openDeleteSelectedBottomSheet() {
    const selected = getSelectedChatIds();
    if (!selected.length) return;

    let deletableCount = 0;
    let blockedCount = 0;
    for (const chatId of selected) {
      const chat = sourceChats.get(chatId);
      if (!chat) continue;
      if (chat.pinned) blockedCount += 1;
      else deletableCount += 1;
    }

    openBottomSheet(`
      <div class="gf-bottom-sheet-card">
        <div class="gf-bottom-sheet-title">Delete Selected Chats</div>
        <div class="gf-bottom-sheet-text">
          Delete ${deletableCount} chat${deletableCount === 1 ? '' : 's'}?
          ${blockedCount > 0 ? `<br />${blockedCount} flagged chat${blockedCount === 1 ? '' : 's'} will be protected.` : ''}
        </div>
        <div class="gf-bottom-sheet-actions">
          <button class="gf-bottom-btn gf-bottom-btn-muted" type="button" data-action="cancel">Cancel</button>
          <button class="gf-bottom-btn gf-bottom-btn-danger" type="button" data-action="delete">Delete</button>
        </div>
      </div>
    `, (panel) => {
      panel.querySelector('[data-action="cancel"]')?.addEventListener('click', closeBottomSheet);
      panel.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
        closeBottomSheet();
        deleteSelectedChats();
      });
    });
  }

  function getFolderById(id) {
    return state.folders.find((folder) => folder.id === id) || null;
  }

  function getFolderChildren(parentId) {
    return state.folders.filter((folder) => folder.parentId === parentId);
  }

  function getDescendantFolderIds(folderId) {
    const collected = new Set([folderId]);
    const stack = [folderId];

    while (stack.length) {
      const currentId = stack.pop();
      for (const folder of state.folders) {
        if (folder.parentId !== currentId) continue;
        if (collected.has(folder.id)) continue;
        collected.add(folder.id);
        stack.push(folder.id);
      }
    }

    return collected;
  }

  function folderMatchesSearch(folder, normalizedFilter) {
    if (!normalizedFilter) return true;

    const folderLabel = `${folder.emoji || ''} ${folder.name || ''}`.toLowerCase();
    if (folderLabel.includes(normalizedFilter)) return true;

    const relevantFolderIds = getDescendantFolderIds(folder.id);
    for (const chat of sourceChats.values()) {
      const assignedFolderId = state.chatAssignments[chat.id] || null;
      if (!assignedFolderId || !relevantFolderIds.has(assignedFolderId)) continue;
      if (state.deletedChats[chat.id]) continue;
      const title = (chat.title || '').toLowerCase();
      if (title.includes(normalizedFilter)) return true;
    }

    return false;
  }

  function getAssignedChats(folderId) {
    const chats = [];
    for (const chat of sourceChats.values()) {
      const assigned = state.chatAssignments[chat.id] || null;
      if (assigned === folderId && !state.deletedChats[chat.id]) chats.push(chat);
    }
    return chats;
  }

  function getFolderNestedElementCount(folderId, visited = new Set()) {
    if (!folderId || visited.has(folderId)) return 0;
    visited.add(folderId);

    const chats = getAssignedChats(folderId);
    const children = getFolderChildren(folderId);

    let total = chats.length + children.length;
    for (const child of children) {
      total += getFolderNestedElementCount(child.id, visited);
    }

    return total;
  }

  function isFolderCollapsed(folderId) {
    return state.folderOpen?.[folderId] === false;
  }

  function applyFolderBodyCollapseState(wrapper, body, collapsed, { animate = false } = {}) {
    wrapper.classList.toggle('is-collapsed', collapsed);
    wrapper.classList.toggle('is-expanded', !collapsed);

    const countBadge = wrapper.querySelector('.gf-folder-collapsed-count');
    if (countBadge) {
      countBadge.classList.toggle('is-visible', collapsed);
    }

    if (!body) return;

    body.classList.add('gf-folder-body-collapsible');

    if (!animate) {
      body.style.maxHeight = collapsed ? '0px' : 'none';
      body.style.opacity = collapsed ? '0' : '1';
      return;
    }

    if (collapsed) {
      const startHeight = body.scrollHeight;
      body.style.maxHeight = `${startHeight}px`;
      body.style.opacity = '1';
      body.getBoundingClientRect();
      body.style.maxHeight = '0px';
      body.style.opacity = '0';
      return;
    }

    body.style.maxHeight = '0px';
    body.style.opacity = '0';
    body.getBoundingClientRect();

    const targetHeight = body.scrollHeight;
    body.style.maxHeight = `${targetHeight}px`;
    body.style.opacity = '1';

    const onTransitionEnd = (event) => {
      if (event.propertyName !== 'max-height') return;
      body.style.maxHeight = 'none';
      body.removeEventListener('transitionend', onTransitionEnd);
    };
    body.addEventListener('transitionend', onTransitionEnd);
  }

  function getUnassignedChats() {
    const chats = [];
    for (const chat of sourceChats.values()) {
      const assigned = state.chatAssignments[chat.id] || null;
      if (!assigned && !state.deletedChats[chat.id]) chats.push(chat);
    }
    return chats;
  }

  function moveChatsToFolder(chatIds, folderId) {
    for (const chatId of chatIds) {
      if (!sourceChats.has(chatId)) continue;
      if (folderId) {
        state.chatAssignments[chatId] = folderId;
      } else {
        delete state.chatAssignments[chatId];
      }
    }
    queueSave();
    render();
  }

  function getDraggedChatIds(event) {
    if (state.drag?.type === 'chat' && Array.isArray(state.drag.chatIds)) {
      return [...state.drag.chatIds];
    }

    try {
      const raw = event?.dataTransfer?.getData('application/x-gf-chat-ids');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((id) => typeof id === 'string' && id.length > 0);
    } catch (error) {
      debugLog('getDraggedChatIds failed', error);
      return [];
    }
  }

  function moveDraggedChatsToMainList(event) {
    const chatIds = getDraggedChatIds(event);
    if (!chatIds.length) return;
    state.drag = null;
    moveChatsToFolder(chatIds, null);
  }

  function normalizeCreateModalConfig(config) {
    const next = { ...DEFAULT_CREATE_MODAL_CONFIG };
    if (!config || typeof config !== 'object') return next;

    const normalizeText = (value, fallback, maxLength = 60) => {
      const text = typeof value === 'string' ? value.trim() : '';
      if (!text) return fallback;
      return text.slice(0, maxLength);
    };

    const normalizeNumber = (value, fallback, min, max) => {
      const number = Number(value);
      if (!Number.isFinite(number)) return fallback;
      return Math.max(min, Math.min(max, number));
    };

    next.title = normalizeText(config.title, DEFAULT_CREATE_MODAL_CONFIG.title, 70);
    next.placeholder = normalizeText(config.placeholder, DEFAULT_CREATE_MODAL_CONFIG.placeholder, 90);
    next.cancelText = normalizeText(config.cancelText, DEFAULT_CREATE_MODAL_CONFIG.cancelText, 24);
    next.createText = normalizeText(config.createText, DEFAULT_CREATE_MODAL_CONFIG.createText, 24);
    next.width = normalizeNumber(config.width, DEFAULT_CREATE_MODAL_CONFIG.width, 320, 560);
    next.titleSize = normalizeNumber(config.titleSize, DEFAULT_CREATE_MODAL_CONFIG.titleSize, 14, 48);
    next.inputSize = normalizeNumber(config.inputSize, DEFAULT_CREATE_MODAL_CONFIG.inputSize, 11, 28);
    next.inputHeight = normalizeNumber(config.inputHeight, DEFAULT_CREATE_MODAL_CONFIG.inputHeight, 34, 68);
    next.inputWidth = normalizeNumber(config.inputWidth, DEFAULT_CREATE_MODAL_CONFIG.inputWidth, 60, 100);
    next.buttonSize = normalizeNumber(config.buttonSize, DEFAULT_CREATE_MODAL_CONFIG.buttonSize, 11, 24);

    return next;
  }

  function applyCreateModalConfigToActiveModal() {
    if (!activeFolderModal || activeFolderModal.mode !== 'create') return;

    const { modal, headingEl, inputEl, cancelBtn, confirmBtn } = activeFolderModal;
    if (!modal || !headingEl || !inputEl || !cancelBtn || !confirmBtn) return;

    headingEl.textContent = createModalConfig.title;
    inputEl.placeholder = createModalConfig.placeholder;
    cancelBtn.textContent = createModalConfig.cancelText;
    confirmBtn.textContent = createModalConfig.createText;
    modal.style.setProperty('--gf-create-modal-width', `${createModalConfig.width}px`);
    modal.style.setProperty('--gf-create-modal-title-size', `${createModalConfig.titleSize}px`);
    modal.style.setProperty('--gf-create-modal-input-size', `${createModalConfig.inputSize}px`);
    modal.style.setProperty('--gf-create-modal-input-height', `${createModalConfig.inputHeight}px`);
    modal.style.setProperty('--gf-create-modal-input-width', `${createModalConfig.inputWidth}%`);
    modal.style.setProperty('--gf-create-modal-button-size', `${createModalConfig.buttonSize}px`);
  }

  function deleteSelectedChats() {
    const selected = getSelectedChatIds();
    if (!selected.length) return;

    let blocked = 0;
    let deleted = 0;

    for (const chatId of selected) {
      const chat = sourceChats.get(chatId);
      if (!chat) continue;
      if (chat.pinned) {
        blocked += 1;
        continue;
      }
      state.deletedChats[chatId] = true;
      delete state.selectedChats[chatId];
      deleted += 1;
    }

    if (deleted > 0) {
      state.status = `Deleted ${deleted} chat${deleted === 1 ? '' : 's'}.`;
    }
    if (blocked > 0) {
      state.status = `${state.status ? `${state.status} ` : ''}${blocked} flagged chat${blocked === 1 ? '' : 's'} protected.`;
    }

    state.selectMode = false;
    closeBottomSheet();
    queueSave();
    render();
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      state.status = '';
      render();
    }, 3000);
  }

  function openFolderNameModal({
    mode,
    heading,
    placeholder,
    cancelLabel,
    confirmLabel,
    initialValue,
    onConfirm
  }) {
    closeFolderModal();

    const overlay = document.createElement('div');
    overlay.className = 'gf-modal-overlay';
    overlay.innerHTML = `
      <div class="gf-create-folder-modal" role="dialog" aria-modal="true" aria-label="Folder dialog">
        <h3></h3>
        <input class="gf-create-folder-input" type="text" maxlength="80" />
        <div class="gf-create-folder-actions">
          <button class="gf-modal-cancel" type="button"></button>
          <button class="gf-modal-create" type="button" disabled></button>
        </div>
      </div>
    `;

    const modal = overlay.querySelector('.gf-create-folder-modal');
    const headingEl = overlay.querySelector('h3');
    const input = overlay.querySelector('.gf-create-folder-input');
    const cancelBtn = overlay.querySelector('.gf-modal-cancel');
    const confirmBtn = overlay.querySelector('.gf-modal-create');

    modal.setAttribute('aria-label', heading);
    headingEl.textContent = heading;
    input.placeholder = placeholder;
    input.value = initialValue || '';
    cancelBtn.textContent = cancelLabel;
    confirmBtn.textContent = confirmLabel;

    if (mode === 'create') {
      modal.style.setProperty('--gf-create-modal-width', `${createModalConfig.width}px`);
      modal.style.setProperty('--gf-create-modal-title-size', `${createModalConfig.titleSize}px`);
      modal.style.setProperty('--gf-create-modal-input-size', `${createModalConfig.inputSize}px`);
      modal.style.setProperty('--gf-create-modal-input-height', `${createModalConfig.inputHeight}px`);
      modal.style.setProperty('--gf-create-modal-input-width', `${createModalConfig.inputWidth}%`);
      modal.style.setProperty('--gf-create-modal-button-size', `${createModalConfig.buttonSize}px`);
    }

    const refreshConfirmState = () => {
      confirmBtn.disabled = !(input.value || '').trim();
    };

    const confirm = () => {
      const name = (input.value || '').trim();
      if (!name) return;
      onConfirm(name);
      closeFolderModal();
      render();
    };

    input.addEventListener('input', refreshConfirmState);
    cancelBtn.addEventListener('click', closeFolderModal);
    confirmBtn.addEventListener('click', confirm);

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        confirm();
      }
    });

    overlay.addEventListener('click', (event) => {
      if (!modal.contains(event.target)) closeFolderModal();
    });

    const onKeydown = (event) => {
      if (event.key === 'Escape') closeFolderModal();
    };

    document.addEventListener('keydown', onKeydown);
    document.body.appendChild(overlay);
    refreshConfirmState();
    input.focus();
    input.select();

    activeFolderModal = {
      overlay,
      onKeydown,
      mode,
      modal,
      headingEl,
      inputEl: input,
      cancelBtn,
      confirmBtn
    };
  }

  function onCreateFolder(parentId = null) {
    if (parentId) {
      const parent = getFolderById(parentId);
      if (!parent || parent.parentId) return;
    }

    openFolderNameModal({
      mode: 'create',
      heading: parentId ? 'Create Sub Folder' : createModalConfig.title,
      placeholder: createModalConfig.placeholder,
      cancelLabel: createModalConfig.cancelText,
      confirmLabel: createModalConfig.createText,
      initialValue: '',
      onConfirm: (name) => {
        const folder = {
          id: nowId('folder'),
          name,
          emoji: '📁',
          parentId: parentId || null
        };

        state.folders.push(folder);
        state.folderOpen[folder.id] = true;
        queueSave();
      }
    });
  }

  function onEditFolder(folderId) {
    const folder = getFolderById(folderId);
    if (!folder) return;

    openFolderNameModal({
      mode: 'edit',
      heading: 'Edit Folder',
      placeholder: createModalConfig.placeholder,
      cancelLabel: 'Cancel',
      confirmLabel: 'Save',
      initialValue: folder.name,
      onConfirm: (name) => {
        folder.name = name;
        queueSave();
      }
    });
  }

  function onDeleteFolder(folderId) {
    const folder = getFolderById(folderId);
    if (!folder) return;

    const hasSubfolders = state.folders.some((item) => item.parentId === folderId);

    closeFolderModal();

    const overlay = document.createElement('div');
    overlay.className = 'gf-modal-overlay';

    const safeName = folder.name
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    overlay.innerHTML = `
      <div class="gf-create-folder-modal gf-delete-folder-modal" role="dialog" aria-modal="true" aria-label="Delete Folder">
        <h3>Delete Folder</h3>
        <p class="gf-delete-folder-text">Delete &ldquo;${safeName}&rdquo;? Chats in this folder move back to Chats.</p>
        ${hasSubfolders ? '<p class="gf-delete-folder-warning">This will delete all subfolders in this folder as well.</p>' : ''}
        <div class="gf-create-folder-actions">
          <button class="gf-modal-cancel" type="button">Cancel</button>
          <button class="gf-modal-create gf-modal-danger" type="button">Delete</button>
        </div>
      </div>
    `;

    const modal = overlay.querySelector('.gf-create-folder-modal');
    const cancelBtn = overlay.querySelector('.gf-modal-cancel');
    const deleteBtn = overlay.querySelector('.gf-modal-danger');

    cancelBtn.addEventListener('click', closeFolderModal);
    deleteBtn.addEventListener('click', () => {
      closeFolderModal();
      removeFolder(folderId);
    });

    overlay.addEventListener('click', (event) => {
      if (!modal.contains(event.target)) closeFolderModal();
    });

    const onKeydown = (event) => {
      if (event.key === 'Escape') closeFolderModal();
    };

    document.addEventListener('keydown', onKeydown);
    document.body.appendChild(overlay);

    activeFolderModal = { overlay, onKeydown, mode: 'delete' };
  }

  function removeFolder(folderId) {
    const folder = getFolderById(folderId);
    if (!folder) return;

    const destinationBaseFolderId = (() => {
      if (!folder.parentId) return null;
      let current = folder;
      while (current?.parentId) {
        const parent = getFolderById(current.parentId);
        if (!parent) break;
        current = parent;
      }
      return current?.id || null;
    })();

    const folderIdsToRemove = new Set([folderId]);
    const stack = [folderId];

    while (stack.length) {
      const currentId = stack.pop();
      for (const candidate of state.folders) {
        if (candidate.parentId !== currentId) continue;
        if (folderIdsToRemove.has(candidate.id)) continue;
        folderIdsToRemove.add(candidate.id);
        stack.push(candidate.id);
      }
    }

    for (const chatId of Object.keys(state.chatAssignments)) {
      const assignedFolderId = state.chatAssignments[chatId];
      if (assignedFolderId && folderIdsToRemove.has(assignedFolderId)) {
        if (destinationBaseFolderId && !folderIdsToRemove.has(destinationBaseFolderId)) {
          state.chatAssignments[chatId] = destinationBaseFolderId;
        } else {
          delete state.chatAssignments[chatId];
        }
      }
    }

    state.folders = state.folders.filter((item) => !folderIdsToRemove.has(item.id));
    for (const id of folderIdsToRemove) {
      delete state.folderOpen[id];
    }
    queueSave();
    render();
  }

  function toggleSelectAll(allChats) {
    const ids = allChats.map((chat) => chat.id);
    const allSelected = ids.length > 0 && ids.every((id) => state.selectedChats[id]);

    if (allSelected) {
      for (const id of ids) delete state.selectedChats[id];
      state.selectMode = false;
    } else {
      for (const id of ids) state.selectedChats[id] = true;
      state.selectMode = true;
    }
    render();
  }

  function toggleSelectModeOnly() {
    if (state.selectMode) {
      state.selectMode = false;
      state.selectedChats = {};
      closeBottomSheet();
    } else {
      state.selectMode = true;
    }
    render();
  }

  function bindDropZone(element, onDrop) {
    const clearDropHighlights = () => {
      document.querySelectorAll('.gf-drop-highlight').forEach((node) => {
        if (node !== element) node.classList.remove('gf-drop-highlight');
      });
    };

    element.addEventListener('dragenter', (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearDropHighlights();
      element.classList.add('gf-drop-highlight');
    });

    element.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearDropHighlights();
      element.classList.add('gf-drop-highlight');
    });

    element.addEventListener('dragleave', (event) => {
      event.stopPropagation();
      const nextTarget = event.relatedTarget;
      if (!nextTarget || !(nextTarget instanceof Node) || !element.contains(nextTarget)) {
        element.classList.remove('gf-drop-highlight');
      }
    });

    element.addEventListener('drop', (event) => {
      event.preventDefault();
      event.stopPropagation();
      document.querySelectorAll('.gf-drop-highlight').forEach((node) => node.classList.remove('gf-drop-highlight'));
      onDrop(event);
    });
  }

  function shouldIgnoreMutationTarget(target) {
    return !!(root && target instanceof Node && root.contains(target));
  }

  function isRelevantMutationNode(node) {
    const element = node instanceof Element ? node : node?.parentElement;
    if (!element) return false;
    if (shouldIgnoreMutationTarget(element)) return false;

    if (element.matches?.(SIDEBAR_SELECTOR) || element.closest?.(SIDEBAR_SELECTOR)) return true;
    if (element.matches?.('chat-app, bard-sidenav, .cdk-overlay-pane, conversations-list')) return true;
    if (element.matches?.('a[data-test-id="conversation"], a[href*="/app/"]')) return true;

    return !!element.querySelector?.('a[data-test-id="conversation"], conversations-list, .cdk-overlay-pane, bard-sidenav, chat-app');
  }

  function scheduleTick() {
    if (tickScheduled) return;
    perfStats.ticksRequested += 1;

    const elapsed = performance.now() - lastTickAt;
    if (elapsed < PERF_BUDGET.minTickIntervalMs) {
      if (delayedTickTimer) return;
      delayedTickTimer = setTimeout(() => {
        delayedTickTimer = null;
        scheduleTick();
      }, PERF_BUDGET.minTickIntervalMs - elapsed);
      return;
    }

    tickScheduled = true;
    requestAnimationFrame(() => {
      tickScheduled = false;
      tick();
    });
  }

  function normalizeOffset(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(-120, Math.min(120, number));
  }

  function normalizeHeaderWidth(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 180;
    return Math.max(120, Math.min(340, number));
  }

  function normalizeHeaderHeight(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 36;
    return Math.max(28, Math.min(80, number));
  }

  function normalizeHeaderIconSize(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 18;
    return Math.max(12, Math.min(40, number));
  }

  function normalizeDropHighlightExpand(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 8;
    return Math.max(0, Math.min(16, number));
  }

  function applyOffsetsToUi() {
    if (!root) return;

    const header = root.querySelector('.gf-header');
    const chats = root.querySelector('.gf-chats');
    const folders = root.querySelector('.gf-folders');
    const chatsDropZone = root.querySelector('.gf-chats-drop-zone');

    if (header) {
      header.style.transform = `translate(${uiOffsets.headerX}px, ${uiOffsets.header}px)`;
      header.style.width = `${uiOffsets.headerWidth}px`;
      header.style.height = `${uiOffsets.headerHeight}px`;
    }
    if (chats) {
      chats.style.transform = `translateY(${uiOffsets.chats}px)`;
    }
    if (folders) {
      folders.style.transform = `translateY(${uiOffsets.folders}px)`;
    }
    if (chatsDropZone) {
      chatsDropZone.style.setProperty('--gf-chats-drop-highlight-expand', `${uiOffsets.chatsDropHighlightExpand}px`);
    }
  }

  function applyDebugColorsToUi() {
    if (!root) return;
    root.classList.toggle('gf-debug-colors', !!debugColorsEnabled);
  }

  function applyShowAllHamburgersToUi() {
    if (!root) return;
    root.classList.toggle('gf-show-all-hamburgers', !!showAllHamburgersEnabled);
  }

  function setDebugModeEnabled(enabled) {
    localStorage.setItem('gfDebug', enabled ? '1' : '0');
  }

  function getDebugModeEnabled() {
    return localStorage.getItem('gfDebug') === '1';
  }

  function bindRuntimeMessageListener() {
    if (messageListenerBound || !chrome?.runtime?.onMessage) return;
    messageListenerBound = true;

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message !== 'object') return;

      if (message.type === 'gf:setOffsets') {
        const offsets = message.offsets || {};
        uiOffsets.headerX = normalizeOffset(offsets.headerX);
        uiOffsets.header = normalizeOffset(offsets.header);
        uiOffsets.headerWidth = normalizeHeaderWidth(offsets.headerWidth);
        uiOffsets.headerHeight = normalizeHeaderHeight(offsets.headerHeight);
        uiOffsets.headerIconSize = normalizeHeaderIconSize(offsets.headerIconSize);
        uiOffsets.chatMenuX = normalizeOffset(offsets.chatMenuX);
        uiOffsets.chatMenuY = normalizeOffset(offsets.chatMenuY);
        uiOffsets.chats = normalizeOffset(offsets.chats);
        uiOffsets.folders = normalizeOffset(offsets.folders);
        uiOffsets.chatsDropHighlightExpand = normalizeDropHighlightExpand(offsets.chatsDropHighlightExpand);
        applyOffsetsToUi();
        sendResponse?.({ ok: true, offsets: { ...uiOffsets } });
        return true;
      }

      if (message.type === 'gf:getOffsets') {
        sendResponse?.({ ok: true, offsets: { ...uiOffsets } });
        return true;
      }

      if (message.type === 'gf:setCreateModalConfig') {
        createModalConfig = normalizeCreateModalConfig(message.config || {});
        applyCreateModalConfigToActiveModal();
        sendResponse?.({ ok: true, config: { ...createModalConfig } });
        return true;
      }

      if (message.type === 'gf:getCreateModalConfig') {
        sendResponse?.({ ok: true, config: { ...createModalConfig } });
        return true;
      }

      if (message.type === 'gf:setDebugColors') {
        debugColorsEnabled = !!message.enabled;
        applyDebugColorsToUi();
        sendResponse?.({ ok: true, enabled: debugColorsEnabled });
        return true;
      }

      if (message.type === 'gf:getDebugColors') {
        sendResponse?.({ ok: true, enabled: debugColorsEnabled });
        return true;
      }

      if (message.type === 'gf:setShowAllHamburgers') {
        showAllHamburgersEnabled = !!message.enabled;
        applyShowAllHamburgersToUi();
        sendResponse?.({ ok: true, enabled: showAllHamburgersEnabled });
        return true;
      }

      if (message.type === 'gf:getShowAllHamburgers') {
        sendResponse?.({ ok: true, enabled: showAllHamburgersEnabled });
        return true;
      }

      if (message.type === 'gf:setDebugMode') {
        const enabled = !!message.enabled;
        setDebugModeEnabled(enabled);
        sendResponse?.({ ok: true, enabled });
        return true;
      }

      if (message.type === 'gf:getDebugMode') {
        sendResponse?.({ ok: true, enabled: getDebugModeEnabled() });
        return true;
      }
    });
  }

  function clickNativeMenuButton() {
    const btn = document.querySelector('[data-test-id="side-nav-menu-button"]');
    btn?.click();
  }

  function clickNativeNewChat() {
    const anchor = document.querySelector('[data-test-id="new-chat-button"] a[aria-label="New chat"], [data-test-id="new-chat-button"] [aria-label="New chat"]');
    if (anchor) {
      anchor.click();
      return;
    }
    window.location.href = 'https://gemini.google.com/app';
  }

  function repositionNativeChatMenu(anchorElement) {
    if (!anchorElement) return;

    const overlayPanes = [...document.querySelectorAll('.cdk-overlay-pane')];
    if (!overlayPanes.length) return;

    const menuPane = overlayPanes.findLast((pane) => {
      const menu = pane.querySelector('[role="menu"], .mat-mdc-menu-panel');
      if (!menu) return false;
      const style = window.getComputedStyle(pane);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });

    if (!menuPane) return;

    const anchorRect = anchorElement.getBoundingClientRect();
    const paneRect = menuPane.getBoundingClientRect();
    const paneWidth = Math.max(220, paneRect.width || menuPane.offsetWidth || 220);
    const paneHeight = Math.max(120, paneRect.height || menuPane.offsetHeight || 120);

    const desiredLeft = anchorRect.right + uiOffsets.chatMenuX;
    const desiredTop = anchorRect.top + (anchorRect.height / 2) - (paneHeight / 2) + uiOffsets.chatMenuY;
    const left = Math.max(8, Math.min(window.innerWidth - paneWidth - 8, desiredLeft));
    const top = Math.max(8, Math.min(window.innerHeight - paneHeight - 8, desiredTop));

    menuPane.style.position = 'fixed';
    menuPane.style.left = `${left}px`;
    menuPane.style.top = `${top}px`;
    menuPane.style.right = 'auto';
    menuPane.style.bottom = 'auto';
    menuPane.style.margin = '0';
    menuPane.style.transform = 'none';
  }

  function triggerNativeChatActions(chat, anchorElement = null) {
    lastNativeMenuChatContext = {
      id: chat?.id || '',
      href: chat?.href || '',
      title: chat?.title || '',
      pinned: !!chat?.pinned,
      at: Date.now()
    };

    const actionBtn = findNativeChatActionButton(chat);

    if (actionBtn) {
      actionBtn.click();
      if (anchorElement) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => repositionNativeChatMenu(anchorElement));
        });
      }
      return;
    }

    const fallbackConversations = window.GFSharedUtils?.getConversationLinks?.(document)?.links || [];
    const fallbackChat = fallbackConversations.find((link) => isConversationMatch(link, chat));
    if (fallbackChat) {
      fallbackChat.click();
    }
  }

  function createChatElement(chat, folderId = null) {
    const row = document.createElement('div');
    row.className = 'gf-chat-item';
    if (state.selectMode) row.classList.add('is-select-mode');
    row.draggable = true;
    row.dataset.chatId = chat.id;

    const selected = !!state.selectedChats[chat.id];
    const inSelectMode = state.selectMode;

    const chatMain = document.createElement('div');
    chatMain.className = 'gf-chat-main';

    const link = document.createElement('a');
    link.className = 'gf-chat-link';
    link.setAttribute('href', chat.href || '#');
    link.textContent = chat.title || 'Untitled chat';
    chatMain.appendChild(link);

    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'conversation-actions-container gf-conversation-actions';

    let checkbox = null;
    if (inSelectMode) {
      checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'gf-chat-select-action';
      checkbox.setAttribute('aria-label', `Select ${chat.title || 'chat'}`);
      checkbox.checked = selected;
      actionsContainer.appendChild(checkbox);
    } else {
      const actionsButton = document.createElement('button');
      actionsButton.className = 'conversation-actions-menu-button gf-chat-actions-menu-button';
      actionsButton.type = 'button';
      actionsButton.title = 'More options';
      actionsButton.setAttribute('aria-label', `More options for ${chat.title || 'chat'}`);
      actionsButton.setAttribute('aria-haspopup', 'menu');
      actionsButton.setAttribute('aria-expanded', 'false');

      const icon = document.createElement('span');
      icon.className = 'google-symbols gf-chat-actions-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = 'more_vert';
      actionsButton.appendChild(icon);
      actionsContainer.appendChild(actionsButton);
    }

    row.appendChild(chatMain);
    row.appendChild(actionsContainer);

    if (link) link.draggable = false;

    const toggleRowSelection = () => {
      const nextSelected = !state.selectedChats[chat.id];
      if (checkbox) checkbox.checked = nextSelected;
      if (nextSelected) state.selectedChats[chat.id] = true;
      else delete state.selectedChats[chat.id];
      render();
    };

    checkbox?.addEventListener('change', () => {
      if (checkbox.checked) state.selectedChats[chat.id] = true;
      else delete state.selectedChats[chat.id];
      render();
    });

    link?.addEventListener('click', (event) => {
      if (!state.selectMode) return;
      event.preventDefault();
      event.stopPropagation();
      toggleRowSelection();
    });

    row.addEventListener('click', (event) => {
      if (state.selectMode) {
        if (event.target.closest('.gf-chat-select-action')) return;
        toggleRowSelection();
        return;
      }
      if (event.target.closest('button, input, .gf-conversation-actions')) return;
      if (event.target.closest('.gf-chat-link')) return;
      if (link?.href) {
        window.location.href = link.href;
      }
    });

    row.addEventListener('dragstart', (event) => {
      const selectedIds = Object.keys(state.selectedChats).filter((id) => state.selectedChats[id]);
      const dragIds = state.selectMode && selectedIds.includes(chat.id) ? selectedIds : [chat.id];
      state.drag = {
        type: 'chat',
        chatIds: dragIds,
        fromFolderId: folderId
      };
      try {
        event.dataTransfer?.setData('application/x-gf-chat-ids', JSON.stringify(dragIds));
        event.dataTransfer.effectAllowed = 'move';
      } catch (error) {
        debugLog('dragstart dataTransfer set failed', error);
      }
      row.classList.add('gf-dragging');
    });

    row.addEventListener('dragend', () => {
      state.drag = null;
      row.classList.remove('gf-dragging');
      render();
    });

    const actionsButton = row.querySelector('.gf-chat-actions-menu-button');
    actionsButton?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeChatActionsMenu();
      triggerNativeChatActions(chat, actionsButton);
    });

    return row;
  }

  function createFolderElement(folder, depth = 0, folderIndex = 0) {
    const wrapper = document.createElement('div');
    wrapper.className = `gf-folder gf-depth-${depth}`;
    wrapper.dataset.folderId = folder.id;
    wrapper.draggable = false;

    const chats = getAssignedChats(folder.id);
    const children = getFolderChildren(folder.id);
    const shouldRenderBody = depth === 0 || chats.length > 0;
    const collapsed = isFolderCollapsed(folder.id);
    const nestedElementCount = getFolderNestedElementCount(folder.id);
    const showCollapsedCount = nestedElementCount > 0;

    const folderHead = document.createElement('div');
    folderHead.className = 'gf-folder-head';
    folderHead.setAttribute('role', 'button');
    folderHead.setAttribute('tabindex', '0');
    folderHead.setAttribute('aria-expanded', collapsed ? 'false' : 'true');

    const folderTitle = document.createElement('div');
    folderTitle.className = 'gf-folder-title';

    const folderIcon = document.createElement('span');
    folderIcon.className = 'folder-icon';
    folderIcon.setAttribute('data-folder-index', String(folderIndex));
    folderIcon.title = 'Click to change icon';
    folderIcon.textContent = folder.emoji || '📁';

    const folderTitleText = document.createElement('span');
    folderTitleText.className = 'gf-folder-title-text';
    folderTitleText.textContent = folder.name || 'Folder';

    folderTitle.appendChild(folderIcon);
    folderTitle.appendChild(folderTitleText);

    if (showCollapsedCount) {
      const countBadge = document.createElement('span');
      countBadge.className = 'gf-folder-collapsed-count';
      countBadge.setAttribute('aria-label', `${nestedElementCount} hidden items`);
      countBadge.textContent = String(nestedElementCount);
      folderTitle.appendChild(countBadge);
    }

    const folderActions = document.createElement('div');
    folderActions.className = 'gf-folder-actions';

    if (depth === 0) {
      const addSubBtn = document.createElement('button');
      addSubBtn.className = 'gf-folder-action gf-folder-sub-add';
      addSubBtn.type = 'button';
      addSubBtn.title = 'Create subfolder';
      addSubBtn.setAttribute('aria-label', 'Create subfolder');
      addSubBtn.textContent = '+';
      folderActions.appendChild(addSubBtn);
    }

    const actionsMenuButton = document.createElement('button');
    actionsMenuButton.className = 'gf-folder-actions-menu-button';
    actionsMenuButton.type = 'button';
    actionsMenuButton.title = 'Additional options';
    actionsMenuButton.setAttribute('aria-label', `Additional options for ${folder.name || 'folder'}`);
    actionsMenuButton.setAttribute('aria-haspopup', 'menu');
    actionsMenuButton.setAttribute('aria-expanded', 'false');

    const actionsMenuIcon = document.createElement('span');
    actionsMenuIcon.className = 'google-symbols gf-folder-actions-icon';
    actionsMenuIcon.setAttribute('aria-hidden', 'true');
    actionsMenuIcon.textContent = 'more_vert';
    actionsMenuButton.appendChild(actionsMenuIcon);
    folderActions.appendChild(actionsMenuButton);

    folderHead.appendChild(folderTitle);
    folderHead.appendChild(folderActions);
    wrapper.appendChild(folderHead);

    let body = null;
    if (shouldRenderBody) {
      body = document.createElement('div');
      body.className = 'gf-folder-body';
      body.id = `gf-folder-body-${folder.id}`;
      folderHead.setAttribute('aria-controls', body.id);
      wrapper.appendChild(body);
    }

    if (chats.length > 0) {
      wrapper.classList.add('gf-folder-has-direct-chats');
    }

    if (body) {
      chats.forEach((chat, index) => {
        const chatEl = createChatElement(chat, folder.id);
        if (index < chats.length - 1) {
          chatEl.classList.add('gf-chat-item-has-next');
        }
        body.appendChild(chatEl);
      });
    }

    if (depth === 0 && children.length > 0 && body) {
      const subContainer = document.createElement('div');
      subContainer.className = 'gf-subfolders';
      for (const child of children) {
        subContainer.appendChild(createFolderElement(child, 1));
      }
      body.appendChild(subContainer);
    }

    applyFolderBodyCollapseState(wrapper, body, collapsed, { animate: false });

    const toggleFolderCollapsed = () => {
      if (!body) return;
      const nextCollapsed = !wrapper.classList.contains('is-collapsed');
      applyFolderBodyCollapseState(wrapper, body, nextCollapsed, { animate: true });
      state.folderOpen[folder.id] = !nextCollapsed;
      folderHead?.setAttribute('aria-expanded', nextCollapsed ? 'false' : 'true');
      queueSave();
    };

    folderHead?.addEventListener('click', (event) => {
      if (!body) return;
      if (event.target.closest('.folder-icon, .gf-folder-actions, .gf-folder-action, .gf-folder-actions-menu-button')) return;
      event.preventDefault();
      event.stopPropagation();
      toggleFolderCollapsed();
    });

    folderHead?.addEventListener('keydown', (event) => {
      if (!body) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest('.folder-icon, .gf-folder-actions, .gf-folder-action, .gf-folder-actions-menu-button')) return;
      event.preventDefault();
      event.stopPropagation();
      toggleFolderCollapsed();
    });

    folderIcon?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.GFFolderEmojiSelector?.openPicker?.({
        anchorElement: event.currentTarget,
        onSelect: (emoji) => {
          folder.emoji = emoji;
          queueSave();
          render();
        }
      });
    });

    wrapper.querySelector('.gf-folder-sub-add')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (depth === 0) onCreateFolder(folder.id);
    });

    actionsMenuButton?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openFolderActionsMenu(folder, event.currentTarget);
    });

    bindDropZone(wrapper, (event) => {
      const droppedChatIds = getDraggedChatIds(event);
      if (droppedChatIds.length) {
        moveChatsToFolder(droppedChatIds, folder.id);
        return;
      }
    });

    return wrapper;
  }

  function render() {
    if (!root) return;
    closeFolderActionsMenu();
    closeChatActionsMenu();
    ignoreMutationsUntil = performance.now() + 120;

    const allVisibleChats = [...sourceChats.values()].filter((chat) => !state.deletedChats[chat.id]);
    const unassigned = getUnassignedChats();
    const topFolders = state.folders.filter((folder) => !folder.parentId);
    const folderFilter = state.folderSearch.trim().toLowerCase();

    const selectAllBtn = root.querySelector('.gf-select-toggle');
    if (selectAllBtn) {
      selectAllBtn.setAttribute('aria-pressed', state.selectMode ? 'true' : 'false');
      selectAllBtn.classList.toggle('is-active', state.selectMode);
      selectAllBtn.disabled = allVisibleChats.length === 0;
    }

    const unassignedContainer = root.querySelector('.gf-chat-list');
    if (unassignedContainer) {
      unassignedContainer.innerHTML = '';
      if (unassigned.length) {
        for (const chat of unassigned) {
          unassignedContainer.appendChild(createChatElement(chat));
        }
      }
    }

    const folderContainer = root.querySelector('.gf-folder-list');
    if (folderContainer) {
      folderContainer.innerHTML = '';
      const filtered = topFolders.filter((folder) => {
        return folderMatchesSearch(folder, folderFilter);
      });

      if (!filtered.length) {
        if (folderFilter) {
          const empty = document.createElement('div');
          empty.className = 'gf-empty';
          empty.textContent = 'No folders match your search.';
          folderContainer.appendChild(empty);
        }
      } else {
        for (const folder of filtered) {
          folderContainer.appendChild(createFolderElement(folder));
        }
      }
    }

    const statusEl = root.querySelector('.gf-status');
    if (statusEl) {
      const statusParts = [];
      if (state.selectorDegraded) {
        statusParts.push('⚠ Degraded mode active');
      }
      if (state.status) {
        statusParts.push(state.status);
      }
      statusEl.textContent = statusParts.join(' • ');
      statusEl.classList.toggle('is-degraded', state.selectorDegraded);
    }

    const selectedCount = Object.keys(state.selectedChats).filter((id) => state.selectedChats[id]).length;
    const bulkBar = root.querySelector('.gf-bulk-bar');
    if (bulkBar) {
      const showBulkBar = state.selectMode && selectedCount > 0;
      bulkBar.style.display = showBulkBar ? 'flex' : 'none';
      const countEl = bulkBar.querySelector('.gf-bulk-count');
      if (countEl) {
        countEl.textContent = `${selectedCount} selected`;
      }
      if (!showBulkBar) closeBottomSheet();
    }

    applyOffsetsToUi();

    ignoreMutationsUntil = performance.now() + 120;
  }

  function buildUi(sidebar) {
    if (root) return;

    root = document.createElement('section');
    root.id = ROOT_ID;
    root.classList.toggle('gf-no-has', !supportsHasSelector);
    root.innerHTML = `
      <div class="gf-section gf-chats">
        <div class="gf-chats-drop-zone">
          <div class="gf-section-head">
            <div class="gf-section-title">Chats</div>
            <div class="gf-tools">
              <button id="sidebar-bulk-select-btn" class="gf-select-toggle sidebar-select-btn" type="button" title="Select chats for bulk delete" aria-label="Select chats for bulk delete" aria-pressed="false">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"></path>
                  <path d="M18 9l-1.4-1.4-6.6 6.6-2.6-2.6L6 13l4 4z"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="gf-chat-actions">
            <button class="gf-search-chats gf-chats-new-chat" type="button">New Chat</button>
          </div>
          <div class="gf-chat-list"></div>
        </div>
      </div>

      <div class="gf-section gf-folders">
        <div class="gf-section-head">
          <div class="gf-section-title">Folders</div>
          <div class="gf-tools">
            <button class="gf-add-folder" type="button" title="Create new folder">＋</button>
          </div>
        </div>
        <input class="gf-folder-search" type="text" placeholder="Filter folders..." />
        <div class="gf-folder-list"></div>
      </div>

      <div class="gf-status"></div>

      <div class="gf-bulk-bar" style="display:none">
        <div class="gf-bulk-count">0 selected</div>
        <button class="gf-bulk-cancel" type="button">Cancel</button>
        <button class="gf-bulk-move" type="button">Move to Folder</button>
        <button class="gf-bulk-delete" type="button">Delete</button>
      </div>
    `;

    sidebar.classList.add('gf-sidebar-active');
    sidebar.prepend(root);

    root.querySelector('.gf-chats-new-chat')?.addEventListener('click', clickNativeNewChat);

    root.querySelector('.gf-add-folder')?.addEventListener('click', () => {
      onCreateFolder(null);
    });

    root.querySelector('.gf-folder-search')?.addEventListener('input', (event) => {
      state.folderSearch = event.target.value;
      render();
    });

    root.querySelector('.gf-select-toggle')?.addEventListener('click', () => {
      toggleSelectModeOnly();
    });

    root.querySelector('.gf-bulk-cancel')?.addEventListener('click', clearMultiSelect);
    root.querySelector('.gf-bulk-move')?.addEventListener('click', openMoveSelectedBottomSheet);
    root.querySelector('.gf-bulk-delete')?.addEventListener('click', openDeleteSelectedBottomSheet);

    const chatsDropZone = root.querySelector('.gf-chats-drop-zone');
    bindDropZone(chatsDropZone, moveDraggedChatsToMainList);

    applyDebugColorsToUi();
    applyShowAllHamburgersToUi();
    applyOffsetsToUi();
    render();
  }

  function teardownUi() {
    closeFolderModal();
    window.GFFolderEmojiSelector?.closeActivePicker?.();
    closeFolderActionsMenu();
    closeChatActionsMenu();
    closeBottomSheet();
    const sidebar = document.querySelector(SIDEBAR_SELECTOR);
    if (sidebar) sidebar.classList.remove('gf-sidebar-active');
    if (root?.parentNode) root.parentNode.removeChild(root);
    root = null;
  }

  async function bootstrap() {
    bindRuntimeMessageListener();
    bindNativeMenuIntentListener();
    await window.GFFolderEmojiSelector?.preload?.();

    const saved = await storage.get();
    const migrated = migrateStoredState(saved);
    if (migrated.changed) {
      await storage.set(migrated.payload);
    }

    state.folders = Array.isArray(migrated.payload.folders) ? migrated.payload.folders : [];
    state.chatAssignments = migrated.payload.chatAssignments || {};
    state.deletedChats = migrated.payload.deletedChats || {};
    state.folderOpen = migrated.payload.folderOpen || {};
    stateMeta = {
      lastCompactedAt: Number(migrated.payload?.meta?.lastCompactedAt) || 0
    };
    lastCompactionAt = stateMeta.lastCompactedAt || 0;
    sanitizeState();

    scheduleTick();

    observer = new MutationObserver((mutations) => {
      if (performance.now() < ignoreMutationsUntil) return;

      perfStats.mutationsSeen += mutations.length;
      if (mutations.length > PERF_BUDGET.maxMutationsPerBatch) {
        perfStats.mutationBursts += 1;
        scheduleTick();
        recordPerfSnapshot('mutation-burst');
        return;
      }

      let shouldTick = false;
      for (const mutation of mutations) {
        if (!isRelevantMutationNode(mutation.target)) continue;

        const hasExternalAdded = [...mutation.addedNodes].some((node) => isRelevantMutationNode(node));
        const hasExternalRemoved = [...mutation.removedNodes].some((node) => isRelevantMutationNode(node));

        if (mutation.type === 'attributes' || hasExternalAdded || hasExternalRemoved) {
          shouldTick = true;
          break;
        }
      }

      if (shouldTick) {
        scheduleTick();
        recordPerfSnapshot('observer-trigger');
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
  }

  function tick() {
    if (tickRunning) return;
    tickRunning = true;
    perfStats.ticksRun += 1;
    lastTickAt = performance.now();

    const sidebar = document.querySelector(SIDEBAR_SELECTOR);
    if (!sidebar) {
      teardownUi();
      tickRunning = false;
      return;
    }

    const sourceChanged = syncSourceChats();
    const compacted = compactStateAgainstSourceChats();
    const stateChanged = sanitizeState();

    if (!isSidebarExpanded()) {
      teardownUi();
      tickRunning = false;
      return;
    }

    if (!root) {
      buildUi(sidebar);
      tickRunning = false;
      return;
    }

    if (sourceChanged || stateChanged || compacted) {
      render();
    }
    tickRunning = false;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
