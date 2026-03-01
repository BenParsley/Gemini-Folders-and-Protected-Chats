const debugVisualsToggle = document.getElementById('debugVisualsToggle');
const debugModeToggle = document.getElementById('debugModeToggle');

function debugLog(context, error) {
  if (localStorage.getItem('gfDebug') !== '1') return;
  console.debug('[Gemini Folders and Protected Files Popup]', context, error);
}

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0]?.id || null;
}

async function sendDebugColorsEnabled(enabled) {
  const tabId = await getActiveTabId();
  if (!tabId) return;

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'gf:setDebugColors',
      enabled: !!enabled
    });
  } catch (error) {
    debugLog('sendDebugColorsEnabled failed', error);
  }
}

async function getCurrentDebugColorsEnabled() {
  const tabId = await getActiveTabId();
  if (!tabId) {
    return false;
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'gf:getDebugColors' });
    if (response?.ok) {
      return !!response.enabled;
    }
  } catch (error) {
    debugLog('getCurrentDebugColorsEnabled failed', error);
  }

  return false;
}

async function sendShowAllHamburgersEnabled(enabled) {
  const tabId = await getActiveTabId();
  if (!tabId) return;

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'gf:setShowAllHamburgers',
      enabled: !!enabled
    });
  } catch (error) {
    debugLog('sendShowAllHamburgersEnabled failed', error);
  }
}

async function sendDebugVisualsEnabled() {
  if (!debugVisualsToggle) return;
  const enabled = !!debugVisualsToggle.checked;
  await Promise.all([
    sendDebugColorsEnabled(enabled),
    sendShowAllHamburgersEnabled(enabled)
  ]);
}

async function sendDebugModeEnabled() {
  const tabId = await getActiveTabId();
  if (!tabId || !debugModeToggle) return;

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'gf:setDebugMode',
      enabled: !!debugModeToggle.checked
    });
  } catch (error) {
    debugLog('sendDebugModeEnabled failed', error);
  }
}

async function loadCurrentDebugModeEnabled() {
  if (!debugModeToggle) return;

  const tabId = await getActiveTabId();
  if (!tabId) {
    debugModeToggle.checked = false;
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'gf:getDebugMode' });
    if (response?.ok) {
      debugModeToggle.checked = !!response.enabled;
      return;
    }
  } catch (error) {
    debugLog('loadCurrentDebugModeEnabled failed', error);
  }

  debugModeToggle.checked = false;
}

async function getCurrentShowAllHamburgersEnabled() {
  const tabId = await getActiveTabId();
  if (!tabId) {
    return false;
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'gf:getShowAllHamburgers' });
    if (response?.ok) {
      return !!response.enabled;
    }
  } catch (error) {
    debugLog('getCurrentShowAllHamburgersEnabled failed', error);
  }

  return false;
}

async function loadCurrentDebugVisualsEnabled() {
  if (!debugVisualsToggle) return;

  const [colorsEnabled, hamburgersEnabled] = await Promise.all([
    getCurrentDebugColorsEnabled(),
    getCurrentShowAllHamburgersEnabled()
  ]);
  debugVisualsToggle.checked = colorsEnabled && hamburgersEnabled;
}

debugVisualsToggle?.addEventListener('change', async () => {
  await sendDebugVisualsEnabled();
});

debugModeToggle?.addEventListener('change', async () => {
  await sendDebugModeEnabled();
});

loadCurrentDebugVisualsEnabled();
loadCurrentDebugModeEnabled();
