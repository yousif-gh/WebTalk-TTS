/**
 * WebTalk TTS - Background Service Worker
 * Handles extension background tasks and context menus
 */

// Service worker initialization
console.log('[WebTalk TTS] Background service worker initialized');

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
