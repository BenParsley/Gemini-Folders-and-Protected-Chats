(() => {
  const EMOJI_SEARCH_FALLBACK_KEYWORDS = {
    '📁': ['folder', 'file', 'directory'],
    '📂': ['open folder', 'directory'],
    '🗂️': ['files', 'organize'],
    '📚': ['books', 'library', 'study'],
    '📖': ['book', 'read'],
    '📝': ['notes', 'write', 'document'],
    '✏️': ['pencil', 'edit', 'write'],
    '📌': ['pin', 'important'],
    '💼': ['work', 'business', 'office'],
    '💻': ['computer', 'code', 'tech'],
    '🔧': ['tool', 'settings', 'fix'],
    '🎯': ['target', 'goal', 'focus'],
    '🚀': ['launch', 'project', 'fast'],
    '🎨': ['design', 'art', 'creative'],
    '🎬': ['video', 'movie', 'media'],
    '🎵': ['music', 'audio'],
    '📷': ['photo', 'camera'],
    '💎': ['premium', 'important', 'value'],
    '🏠': ['home', 'house', 'personal'],
    '🌟': ['star', 'highlight', 'featured'],
    '⭐': ['star', 'favorite'],
    '💡': ['idea', 'brainstorm'],
    '🔥': ['urgent', 'hot', 'priority'],
    '❤️': ['love', 'heart'],
    '✅': ['done', 'complete', 'check'],
    '⚙️': ['settings', 'config'],
    '📊': ['analytics', 'data', 'chart'],
    '📈': ['growth', 'progress'],
    '📉': ['decline', 'drop'],
    '🔍': ['search', 'find', 'lookup'],
    '🔒': ['lock', 'secure', 'private'],
    '🔓': ['unlock', 'open'],
    '🛠️': ['build', 'tools', 'maintenance'],
    '🧪': ['test', 'experiment'],
    '🐞': ['bug', 'issue', 'fix'],
    '🧠': ['thinking', 'smart'],
    '🌙': ['night'],
    '☀️': ['day', 'sun'],
    '🌈': ['colorful', 'bright'],
    '🌲': ['forest', 'tree', 'nature'],
    '🌊': ['water', 'ocean']
  };

  const LANGUAGE_TO_REGION_CODES = {
    english: ['US', 'GB', 'CA', 'AU', 'NZ', 'IE', 'ZA'],
    spanish: ['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'BO', 'PY', 'UY', 'GT', 'CU', 'DO', 'HN', 'SV', 'NI', 'CR', 'PA', 'PR'],
    french: ['FR', 'BE', 'CH', 'CA', 'LU', 'MC', 'SN', 'CI', 'CM', 'ML', 'NE', 'BF', 'CD'],
    german: ['DE', 'AT', 'CH', 'LU', 'LI'],
    portuguese: ['PT', 'BR', 'AO', 'MZ', 'CV', 'GW', 'ST', 'TL'],
    italian: ['IT', 'CH', 'SM', 'VA'],
    dutch: ['NL', 'BE', 'SR'],
    arabic: ['SA', 'AE', 'EG', 'DZ', 'MA', 'JO', 'IQ', 'SY', 'LB', 'OM', 'QA', 'KW', 'BH', 'YE', 'SD', 'LY', 'TN'],
    hindi: ['IN'],
    urdu: ['PK'],
    bengali: ['BD', 'IN'],
    punjabi: ['IN', 'PK'],
    turkish: ['TR', 'CY'],
    persian: ['IR', 'AF', 'TJ'],
    russian: ['RU', 'BY', 'KZ', 'KG'],
    ukrainian: ['UA'],
    polish: ['PL'],
    czech: ['CZ'],
    slovak: ['SK'],
    romanian: ['RO', 'MD'],
    hungarian: ['HU'],
    greek: ['GR', 'CY'],
    swedish: ['SE', 'FI'],
    norwegian: ['NO'],
    danish: ['DK'],
    finnish: ['FI'],
    icelandic: ['IS'],
    estonian: ['EE'],
    latvian: ['LV'],
    lithuanian: ['LT'],
    serbian: ['RS', 'BA', 'ME'],
    croatian: ['HR', 'BA'],
    slovenian: ['SI'],
    bulgarian: ['BG'],
    albanian: ['AL', 'XK', 'MK'],
    georgian: ['GE'],
    armenian: ['AM'],
    azerbaijani: ['AZ'],
    hebrew: ['IL'],
    swahili: ['KE', 'TZ', 'UG', 'CD'],
    amharic: ['ET'],
    somali: ['SO', 'DJ', 'ET', 'KE'],
    hausa: ['NG', 'NE'],
    yoruba: ['NG', 'BJ'],
    igbo: ['NG'],
    zulu: ['ZA'],
    xhosa: ['ZA'],
    afrikaans: ['ZA', 'NA'],
    chinese: ['CN', 'TW', 'HK', 'MO', 'SG'],
    mandarin: ['CN', 'TW', 'SG'],
    cantonese: ['HK', 'MO'],
    japanese: ['JP'],
    korean: ['KR', 'KP'],
    thai: ['TH'],
    vietnamese: ['VN'],
    indonesian: ['ID'],
    malay: ['MY', 'BN', 'SG', 'ID'],
    tagalog: ['PH'],
    filipino: ['PH'],
    burmese: ['MM'],
    khmer: ['KH'],
    lao: ['LA'],
    nepali: ['NP'],
    sinhala: ['LK'],
    tamil: ['IN', 'LK', 'SG', 'MY'],
    telugu: ['IN'],
    marathi: ['IN'],
    gujarati: ['IN'],
    kannada: ['IN'],
    malayalam: ['IN'],
    odia: ['IN'],
    uzbek: ['UZ'],
    kazakh: ['KZ'],
    mongolian: ['MN'],
    irish: ['IE'],
    welsh: ['GB'],
    scottish: ['GB']
  };

  const OPERA_FLAG_RENDER_POLICY = {
    enabled: true,
    browsers: ['opera', 'opera gx'],
    preferNativeFlags: true,
    allowCountryCodeFallback: false,
    showCountryCodeBadge: true
  };

  let activePicker = null;
  let folderIconOptions = [];
  let folderIconCategories = [];
  let folderIconKeywordsByEmoji = new Map();
  let folderIconMetaByEmoji = new Map();
  let folderIconOptionsLoaded = false;
  let folderIconOptionsLoading = null;
  let folderIconOptionsLoadError = '';
  let emojiSearchKeywordsByEmoji = new Map();
  let emojiLanguageAliases = {};
  let emojiBrowserCompatibility = {
    flagFallbackBrowsers: [],
    flagFallbackDisplay: 'country-code',
    currentBrowser: 'unknown',
    useFlagFallback: false
  };

  function debugLog(context, error) {
    if (localStorage.getItem('gfDebug') !== '1') return;
    console.debug('[Gemini Folders Emoji Selector]', context, error);
  }

  function normalizeEmojiSearchText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function detectBrowserProfile() {
    const ua = String(navigator?.userAgent || '').toLowerCase();
    if (ua.includes('edg/')) return 'edge';
    if (ua.includes('opera gx') || ua.includes('oprgx')) return 'opera gx';
    if (ua.includes('opr/')) return ua.includes('gx') ? 'opera gx' : 'opera';
    if (ua.includes('opera')) return 'opera';
    if (ua.includes('firefox/')) return 'firefox';
    if (ua.includes('chrome/')) return 'chrome';
    if (ua.includes('safari/') && !ua.includes('chrome/')) return 'safari';
    return 'unknown';
  }

  function resolveFlagRenderMode({ currentBrowser, fallbackBrowsers }) {
    const browser = normalizeEmojiSearchText(currentBrowser);
    const fallbackSet = new Set((fallbackBrowsers || []).map((entry) => normalizeEmojiSearchText(entry)));
    const isOperaFamily = OPERA_FLAG_RENDER_POLICY.enabled
      && OPERA_FLAG_RENDER_POLICY.browsers.includes(browser);

    if (isOperaFamily && OPERA_FLAG_RENDER_POLICY.preferNativeFlags) {
      return OPERA_FLAG_RENDER_POLICY.showCountryCodeBadge ? 'opera-hybrid' : 'native';
    }

    if (isOperaFamily && !OPERA_FLAG_RENDER_POLICY.allowCountryCodeFallback) {
      return 'native';
    }

    if (fallbackSet.has(browser)) return 'fallback';
    return 'native';
  }

  function addEmojiKeywords(keywordMap, emoji, rawKeywords) {
    const value = typeof emoji === 'string' ? emoji.trim() : '';
    if (!value) return;

    const keywords = Array.isArray(rawKeywords)
      ? rawKeywords.map((keyword) => normalizeEmojiSearchText(keyword)).filter(Boolean)
      : [];
    if (!keywords.length) return;

    if (!keywordMap.has(value)) keywordMap.set(value, new Set());
    const target = keywordMap.get(value);
    for (const keyword of keywords) {
      target.add(keyword);
    }
  }

  function setEmojiJsonRuntimeConfig(payload) {
    const rawKeywords = payload?.searchKeywordsByEmoji && typeof payload.searchKeywordsByEmoji === 'object'
      ? payload.searchKeywordsByEmoji
      : {};
    const nextKeywords = new Map();
    for (const [emoji, keywords] of Object.entries(rawKeywords)) {
      addEmojiKeywords(nextKeywords, emoji, Array.isArray(keywords) ? keywords : []);
    }
    emojiSearchKeywordsByEmoji = nextKeywords;

    const rawAliases = payload?.languageAliases && typeof payload.languageAliases === 'object'
      ? payload.languageAliases
      : {};
    const nextAliases = {};
    for (const [alias, canonical] of Object.entries(rawAliases)) {
      const aliasKey = normalizeEmojiSearchText(alias);
      const canonicalKey = normalizeEmojiSearchText(canonical);
      if (!aliasKey || !canonicalKey) continue;
      if (!LANGUAGE_TO_REGION_CODES[canonicalKey]) continue;
      nextAliases[aliasKey] = canonicalKey;
    }
    emojiLanguageAliases = nextAliases;

    const rawCompatibility = payload?.browserCompatibility && typeof payload.browserCompatibility === 'object'
      ? payload.browserCompatibility
      : {};
    const currentBrowser = detectBrowserProfile();
    const fallbackBrowsersRaw = Array.isArray(rawCompatibility.flagFallbackBrowsers)
      ? rawCompatibility.flagFallbackBrowsers
      : [];
    const fallbackBrowsers = fallbackBrowsersRaw
      .map((entry) => normalizeEmojiSearchText(entry))
      .filter(Boolean);
    const fallbackDisplay = normalizeEmojiSearchText(rawCompatibility.flagFallbackDisplay || 'country-code') || 'country-code';

    emojiBrowserCompatibility = {
      flagFallbackBrowsers: fallbackBrowsers,
      flagFallbackDisplay: fallbackDisplay,
      currentBrowser,
      useFlagFallback: fallbackBrowsers.includes(currentBrowser),
      flagRenderMode: resolveFlagRenderMode({
        currentBrowser,
        fallbackBrowsers
      })
    };
  }

  function createFallbackEmojiKeywordMap() {
    const map = new Map();
    for (const [emoji, rawKeywords] of Object.entries(EMOJI_SEARCH_FALLBACK_KEYWORDS)) {
      const keywords = Array.isArray(rawKeywords)
        ? rawKeywords.map((keyword) => normalizeEmojiSearchText(keyword)).filter(Boolean)
        : [];
      if (!keywords.length) continue;
      map.set(emoji, new Set(keywords));
    }

    for (const [emoji, keywords] of emojiSearchKeywordsByEmoji) {
      addEmojiKeywords(map, emoji, [...keywords]);
    }

    return map;
  }

  function regionCodeToFlagEmoji(regionCode) {
    const code = String(regionCode || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return '';
    const A = 0x1f1e6;
    return String.fromCodePoint(
      A + (code.charCodeAt(0) - 65),
      A + (code.charCodeAt(1) - 65)
    );
  }

  function buildRegionLanguageIndex() {
    const index = new Map();
    for (const [language, regionCodes] of Object.entries(LANGUAGE_TO_REGION_CODES)) {
      for (const regionCode of regionCodes) {
        const code = String(regionCode || '').trim().toUpperCase();
        if (!/^[A-Z]{2}$/.test(code)) continue;
        if (!index.has(code)) index.set(code, new Set());
        index.get(code).add(normalizeEmojiSearchText(language));
      }
    }

    for (const [alias, canonical] of Object.entries(emojiLanguageAliases)) {
      const regionCodes = LANGUAGE_TO_REGION_CODES[canonical] || [];
      for (const regionCode of regionCodes) {
        const code = String(regionCode || '').trim().toUpperCase();
        if (!/^[A-Z]{2}$/.test(code)) continue;
        if (!index.has(code)) index.set(code, new Set());
        index.get(code).add(alias);
      }
    }

    return index;
  }

  function getGeneratedRegionFlagEntries() {
    const regionLanguageIndex = buildRegionLanguageIndex();
    const displayNames = typeof Intl !== 'undefined' && Intl.DisplayNames
      ? new Intl.DisplayNames(['en'], { type: 'region' })
      : null;

    const fallbackCodes = ['US', 'GB', 'CA', 'AU', 'NZ', 'IE', 'ZA', 'ES', 'MX', 'AR', 'CO', 'FR', 'DE', 'IT', 'PT', 'BR', 'NL', 'BE', 'CH', 'SE', 'NO', 'DK', 'FI', 'PL', 'CZ', 'SK', 'RO', 'HU', 'GR', 'TR', 'RU', 'UA', 'SA', 'AE', 'EG', 'IL', 'IN', 'PK', 'BD', 'CN', 'TW', 'HK', 'JP', 'KR', 'TH', 'VN', 'MY', 'ID', 'PH', 'SG', 'ZA', 'KE', 'TZ', 'NG', 'ET', 'MA', 'DZ', 'TN'];
    const mappedRegions = Object.values(LANGUAGE_TO_REGION_CODES).flat();
    const uniqueRegions = [...new Set([...fallbackCodes, ...mappedRegions])]
      .map((code) => String(code || '').trim().toUpperCase())
      .filter((code) => /^[A-Z]{2}$/.test(code))
      .sort();

    const entries = [];
    for (const code of uniqueRegions) {
      const emoji = regionCodeToFlagEmoji(code);
      if (!emoji) continue;

      const countryNameRaw = displayNames?.of(code) || code;
      const countryName = normalizeEmojiSearchText(countryNameRaw);
      const keywords = [code.toLowerCase()];
      if (countryName && countryName !== code.toLowerCase()) {
        keywords.push(countryName);
      }

      const languages = [...(regionLanguageIndex.get(code) || [])];
      keywords.push(...languages);

      entries.push({
        emoji,
        keywords,
        meta: {
          isFlag: true,
          countryCode: code,
          countryName: countryNameRaw
        }
      });
    }

    return entries;
  }

  function sanitizeEmojiOptions(rawOptions) {
    if (!Array.isArray(rawOptions)) return [];

    const unique = new Set();
    for (const item of rawOptions) {
      const value = typeof item === 'string' ? item.trim() : '';
      if (!value) continue;
      if (value.length > 12) continue;
      unique.add(value);
    }

    return [...unique];
  }

  function sanitizeEmojiEntry(item) {
    if (typeof item === 'string') {
      const emoji = item.trim();
      if (!emoji || emoji.length > 12) return null;
      return { emoji, keywords: [], meta: {} };
    }

    if (!item || typeof item !== 'object') return null;
    const emoji = typeof item.emoji === 'string' ? item.emoji.trim() : '';
    if (!emoji || emoji.length > 12) return null;

    const keywords = Array.isArray(item.keywords)
      ? item.keywords.map((keyword) => normalizeEmojiSearchText(keyword)).filter(Boolean)
      : [];

    const meta = item.meta && typeof item.meta === 'object' ? item.meta : {};

    return { emoji, keywords, meta };
  }

  function sanitizeEmojiCategory(rawCategory, index = 0) {
    if (!rawCategory || typeof rawCategory !== 'object') return null;

    const entries = [];

    if (rawCategory.generate === 'regions') {
      entries.push(...getGeneratedRegionFlagEntries());
    }

    if (Array.isArray(rawCategory.emojis)) {
      for (const item of rawCategory.emojis) {
        const parsed = sanitizeEmojiEntry(item);
        if (parsed) entries.push(parsed);
      }
    }

    const emojiSet = new Set();
    const keywordsByEmoji = new Map();
    const metaByEmoji = new Map();
    for (const entry of entries) {
      emojiSet.add(entry.emoji);
      addEmojiKeywords(keywordsByEmoji, entry.emoji, entry.keywords || []);
      if (entry.meta && typeof entry.meta === 'object') {
        metaByEmoji.set(entry.emoji, entry.meta);
      }
    }

    const emojis = [...emojiSet];
    if (!emojis.length) return null;

    const idSource = typeof rawCategory.id === 'string' ? rawCategory.id.trim().toLowerCase() : '';
    const id = idSource || `category-${index + 1}`;
    const labelSource = typeof rawCategory.label === 'string' ? rawCategory.label.trim() : '';
    const label = labelSource || `Category ${index + 1}`;

    return { id, label, emojis, keywordsByEmoji, metaByEmoji };
  }

  function setFolderIconData(options, categories) {
    const safeOptions = sanitizeEmojiOptions(options);

    const safeCategories = Array.isArray(categories)
      ? categories
          .map((category, index) => sanitizeEmojiCategory(category, index))
          .filter(Boolean)
      : [];

    const categoryPool = sanitizeEmojiOptions(safeCategories.flatMap((category) => category.emojis));
    folderIconOptions = safeOptions.length
      ? safeOptions
      : categoryPool;

    const keywordMap = createFallbackEmojiKeywordMap();
    const metaMap = new Map();
    for (const category of safeCategories) {
      for (const [emoji, keywords] of category.keywordsByEmoji || new Map()) {
        addEmojiKeywords(keywordMap, emoji, [...keywords]);
      }
      for (const [emoji, meta] of category.metaByEmoji || new Map()) {
        metaMap.set(emoji, meta);
      }
    }
    folderIconKeywordsByEmoji = keywordMap;
    folderIconMetaByEmoji = metaMap;

    if (safeCategories.length && folderIconOptions.length) {
      const byId = new Set();
      const normalized = [];

      normalized.push({ id: 'all', label: 'All', emojis: [...folderIconOptions] });
      byId.add('all');

      for (const category of safeCategories) {
        if (byId.has(category.id)) continue;
        byId.add(category.id);
        normalized.push(category);
      }

      folderIconCategories = normalized;
      return;
    }

    folderIconCategories = folderIconOptions.length
      ? [{ id: 'all', label: 'All', emojis: [...folderIconOptions] }]
      : [];
  }

  async function loadFolderIconOptions({ forceReload = false, maxRetries = 3 } = {}) {
    if (folderIconOptionsLoaded && !forceReload) return true;
    if (folderIconOptionsLoading && !forceReload) return folderIconOptionsLoading;

    folderIconOptionsLoading = (async () => {
      let lastError = null;

      for (let attempt = 1; attempt <= Math.max(1, maxRetries); attempt += 1) {
        try {
          const url = chrome.runtime.getURL('src/emoji-data.json');
          const response = await fetch(url, { cache: 'no-cache' });
          if (!response.ok) {
            throw new Error(`emoji-data.json request failed with status ${response.status}`);
          }

          const payload = await response.json();
          setEmojiJsonRuntimeConfig(payload);
          const topLevelOptions = sanitizeEmojiOptions(Array.isArray(payload) ? payload : payload?.emojis);
          const categoryCandidates = Array.isArray(payload?.categories) ? payload.categories : [];

          if (categoryCandidates.length) {
            setFolderIconData(topLevelOptions, categoryCandidates);
          } else if (topLevelOptions.length) {
            setFolderIconData(topLevelOptions, null);
          } else {
            throw new Error('emoji-data.json did not provide any emojis.');
          }

          if (!folderIconOptions.length) {
            throw new Error('No valid emojis were loaded from emoji-data.json.');
          }

          folderIconOptionsLoaded = true;
          folderIconOptionsLoadError = '';
          return true;
        } catch (error) {
          lastError = error;
          debugLog(`loadFolderIconOptions attempt ${attempt} failed`, error);

          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, 120 * attempt));
          }
        }
      }

      folderIconOptionsLoaded = false;
      folderIconOptions = [];
      folderIconCategories = [];
      folderIconKeywordsByEmoji = createFallbackEmojiKeywordMap();
      folderIconMetaByEmoji = new Map();
      folderIconOptionsLoadError = lastError instanceof Error ? lastError.message : 'Unable to load emoji data.';
      return false;
    })();

    const result = await folderIconOptionsLoading;
    folderIconOptionsLoading = null;
    return result;
  }

  function closeActivePicker() {
    if (!activePicker) return;
    const { panel, onDocClick, onKeydown } = activePicker;
    document.removeEventListener('mousedown', onDocClick, true);
    document.removeEventListener('keydown', onKeydown);
    panel.remove();
    activePicker = null;
  }

  function openPicker({ anchorElement, onSelect } = {}) {
    if (!anchorElement || typeof onSelect !== 'function') return;

    closeActivePicker();

    const panel = document.createElement('div');
    panel.className = 'gf-icon-picker';
    panel.innerHTML = `
      <div class="gf-icon-picker-body"></div>
    `;

    const body = panel.querySelector('.gf-icon-picker-body');

    const applyIcon = (emoji) => {
      const value = (emoji || '').trim();
      if (!value) return;
      onSelect(value);
      closeActivePicker();
    };

    const renderLoadingState = () => {
      body.innerHTML = `<div class="gf-icon-loading">Loading emoji categories…</div>`;
    };

    const renderErrorState = () => {
      const message = folderIconOptionsLoadError || 'Unable to load emojis from emoji-data.json.';
      body.innerHTML = `
        <div class="gf-icon-error">
          <div class="gf-icon-error-title">Emoji data unavailable</div>
          <div class="gf-icon-error-text">${message}</div>
          <button class="gf-icon-retry" type="button">Retry</button>
        </div>
      `;

      body.querySelector('.gf-icon-retry')?.addEventListener('click', async () => {
        await initializePicker(true);
      });
    };

    const renderPickerUi = () => {
      body.innerHTML = `
        <input class="gf-icon-search" type="text" placeholder="Search emoji or paste one…" aria-label="Search emojis" />
        <div class="gf-icon-divider" role="separator" aria-hidden="true"></div>
        <div class="gf-icon-category-bar" role="tablist" aria-label="Emoji categories"></div>
        <div class="gf-icon-grid"></div>
      `;

      const searchInput = body.querySelector('.gf-icon-search');
      const categoryBar = body.querySelector('.gf-icon-category-bar');
      const grid = body.querySelector('.gf-icon-grid');
      const pickerCategories = Array.isArray(folderIconCategories) && folderIconCategories.length
        ? folderIconCategories
        : [{ id: 'all', label: 'All', emojis: folderIconOptions }];
      let activeCategoryId = pickerCategories[0]?.id || 'all';
      let searchQuery = '';

      const categoryLabelsByEmoji = new Map();
      const allEmojiSet = new Set();
      for (const category of pickerCategories) {
        const label = String(category.label || '').trim();
        for (const emoji of category.emojis || []) {
          allEmojiSet.add(emoji);
          if (!categoryLabelsByEmoji.has(emoji)) {
            categoryLabelsByEmoji.set(emoji, new Set());
          }
          if (label) {
            categoryLabelsByEmoji.get(emoji).add(label.toLowerCase());
          }
        }
      }

      const allEmojiList = [...allEmojiSet];

      const getActiveCategory = () => {
        return pickerCategories.find((category) => category.id === activeCategoryId) || pickerCategories[0];
      };

      const renderCategoryTabs = () => {
        categoryBar.innerHTML = '';

        for (const category of pickerCategories) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'gf-icon-category-btn';
          button.textContent = category.label;
          button.setAttribute('role', 'tab');
          const selected = category.id === activeCategoryId;
          button.setAttribute('aria-selected', selected ? 'true' : 'false');
          if (selected) button.classList.add('is-active');
          button.addEventListener('click', () => {
            if (activeCategoryId === category.id) return;
            activeCategoryId = category.id;
            renderCategoryTabs();
            renderEmojiGrid();
          });
          categoryBar.appendChild(button);
        }
      };

      const renderEmojiGrid = () => {
        grid.innerHTML = '';
        const normalizedQuery = normalizeEmojiSearchText(searchQuery);

        let emojis = [];
        if (normalizedQuery) {
          emojis = allEmojiList.filter((emoji) => {
            const categoryLabels = [...(categoryLabelsByEmoji.get(emoji) || [])];
            const keywordTerms = [...(folderIconKeywordsByEmoji.get(emoji) || [])];
            const haystack = normalizeEmojiSearchText([
              emoji,
              ...categoryLabels,
              ...keywordTerms
            ].join(' '));
            return haystack.includes(normalizedQuery);
          });
        } else {
          const activeCategory = getActiveCategory();
          emojis = Array.isArray(activeCategory?.emojis) && activeCategory.emojis.length
            ? activeCategory.emojis
            : folderIconOptions;
        }

        if (!emojis.length) {
          const empty = document.createElement('div');
          empty.className = 'gf-icon-empty';
          empty.textContent = 'No emojis match your search.';
          grid.appendChild(empty);
          return;
        }

        for (const emoji of emojis) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'gf-icon-option';
          const emojiMeta = folderIconMetaByEmoji.get(emoji) || {};
          const isFlag = Boolean(emojiMeta.isFlag);
          const flagRenderMode = isFlag
            ? (emojiBrowserCompatibility.flagRenderMode || 'native')
            : 'native';

          if (isFlag && flagRenderMode === 'fallback') {
            button.textContent = emojiMeta.countryCode || emoji;
          } else {
            button.textContent = emoji;
          }

          if (emojiMeta.isFlag) {
            const label = emojiMeta.countryName
              ? `${emojiMeta.countryName} (${emojiMeta.countryCode || ''})`
              : (emojiMeta.countryCode || 'Flag');
            button.title = label;
            button.setAttribute('aria-label', label);
          }

          if (isFlag && flagRenderMode === 'fallback') {
            button.classList.add('gf-icon-option-flag-fallback');
          }

          if (isFlag && flagRenderMode === 'opera-hybrid') {
            button.classList.add('gf-icon-option-flag-opera-probe');
            button.setAttribute('data-country-code', emojiMeta.countryCode || '');
            button.setAttribute('data-flag-probe', 'opera');
          }

          button.addEventListener('click', () => applyIcon(emoji));
          grid.appendChild(button);
        }
      };

      renderCategoryTabs();
      renderEmojiGrid();

      searchInput?.addEventListener('input', (event) => {
        searchQuery = event.target.value || '';
        renderEmojiGrid();
      });
    };

    const initializePicker = async (forceReload = false) => {
      renderLoadingState();
      const loaded = await loadFolderIconOptions({ forceReload, maxRetries: 4 });
      if (!loaded || !folderIconOptions.length) {
        renderErrorState();
        return;
      }
      renderPickerUi();
    };

    document.body.appendChild(panel);

    const anchorRect = anchorElement.getBoundingClientRect();
    const left = Math.min(window.innerWidth - 290, Math.max(8, anchorRect.left));
    const top = Math.min(window.innerHeight - 330, anchorRect.bottom + 8);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;

    const onDocClick = (event) => {
      if (panel.contains(event.target) || anchorElement.contains(event.target)) return;
      closeActivePicker();
    };

    const onKeydown = (event) => {
      if (event.key === 'Escape') closeActivePicker();
    };

    document.addEventListener('mousedown', onDocClick, true);
    document.addEventListener('keydown', onKeydown);

    activePicker = { panel, onDocClick, onKeydown };
    initializePicker(false);
  }

  window.GFFolderEmojiSelector = {
    preload: (options) => loadFolderIconOptions(options),
    openPicker,
    closeActivePicker
  };
})();
