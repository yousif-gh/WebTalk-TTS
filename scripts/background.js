/**
 * WebTalk TTS - Background Service Worker
 * Handles extension background tasks and context menus
 */

// Cross-browser compatibility shim
// Both Firefox and Chrome support chrome.* APIs in MV3,
// but this provides a fallback for edge cases
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// On Chrome this file runs as a real service worker, which supports
// importScripts(). On Firefox, scripts/config.js is already loaded first via
// manifest.json's background.scripts array, so WEBTALK_SERVER_URL exists.
if (typeof importScripts === 'function' && typeof WEBTALK_SERVER_URL === 'undefined') {
  importScripts('config.js');
}
const SERVER_URL = typeof WEBTALK_SERVER_URL !== 'undefined' ? WEBTALK_SERVER_URL : 'http://localhost:8008';

// Service worker initialization
console.log('[WebTalk TTS] Background service worker initialized');

/**
 * Fetch synthesized audio from the Kokoro server on behalf of content
 * scripts. Runs here (not in content.js) because content-script fetches are
 * subject to the active page's CSP connect-src directive - some sites
 * (e.g. github.com) block it even though the extension itself has
 * host_permissions for localhost. The background service worker isn't
 * subject to any page's CSP.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'fetchAudio') {
    fetch(`${SERVER_URL}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message.text, voice: message.voice, speed: message.speed })
    })
      .then(async (response) => {
        if (!response.ok) {
          let detail = response.statusText;
          try {
            const body = await response.json();
            detail = body.detail || detail;
          } catch (e) {
            // ignore, use statusText
          }
          sendResponse({ success: false, error: `Kokoro server error: ${detail}` });
          return;
        }
        const arrayBuffer = await response.arrayBuffer();
        sendResponse({ success: true, audio: arrayBuffer });
      })
      .catch(() => {
        sendResponse({ success: false, error: `Kokoro server unreachable at ${SERVER_URL}. Is it running?` });
      });
    return true; // async response
  }
});

// Context menu ID constant
const CONTEXT_MENU_ID = 'webtalk-speak-selection';

/**
 * Register context menu on extension install
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('[WebTalk TTS] Extension installed, creating context menu');

  // Create context menu item for selected text
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Speak highlighted text',
    contexts: ['selection']
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('[WebTalk TTS] Context menu creation error:', chrome.runtime.lastError.message);
    } else {
      console.log('[WebTalk TTS] Context menu created successfully');
    }
  });
});

/**
 * Handle context menu click events
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID && info.selectionText) {
    console.log('[WebTalk TTS] Context menu clicked, selected text:', info.selectionText.substring(0, 50) + '...');

    // Send message to content script with the selected text
    chrome.tabs.sendMessage(tab.id, {
      action: 'speak',
      text: info.selectionText
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[WebTalk TTS] Error sending message to content script:', chrome.runtime.lastError.message);
      } else if (response && response.success) {
        console.log('[WebTalk TTS] Content script acknowledged speech request');
      }
    });
  }
});
