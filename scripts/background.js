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

/**
 * Handle keyboard shortcut commands
 */
chrome.commands.onCommand.addListener((command) => {
  console.log('[WebTalk TTS] Command received:', command);

  if (command === 'speak-selection') {
    // Get the active tab and send speak selection command
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'speakSelection'
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('[WebTalk TTS] Error sending command to content script:', chrome.runtime.lastError.message);
          } else if (response && response.success) {
            console.log('[WebTalk TTS] Speaking selection via keyboard shortcut');
          } else if (response && response.error) {
            console.log('[WebTalk TTS] Speak selection error:', response.error);
          }
        });
      }
    });
  }
});
