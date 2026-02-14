/**
 * WebTalk TTS - Content Script
 * Handles text-to-speech functionality on web pages
 */

(function() {
  'use strict';

  // Default settings (used if no stored settings found)
  const DEFAULT_SETTINGS = {
    voiceURI: '',
    rate: 1.0,
    pitch: 1.0
  };

  // Available voices cache
  let availableVoices = [];

  /**
   * Initialize the content script
   */
  function init() {
    console.log('[WebTalk TTS] Content script initialized');

    // Pre-load voices
    initVoices();

    // Set up message listener for background script communication
    chrome.runtime.onMessage.addListener(handleMessage);

    // Clean up speech synthesis when page is unloaded
    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('pagehide', cleanup);
  }

  /**
   * Initialize voices - handles async voice loading
   */
  function initVoices() {
    availableVoices = window.speechSynthesis.getVoices();

    if (availableVoices.length === 0) {
      // Voices load asynchronously in Chrome
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        availableVoices = window.speechSynthesis.getVoices();
        console.log(`[WebTalk TTS] Loaded ${availableVoices.length} voices`);
      });
    } else {
      console.log(`[WebTalk TTS] Loaded ${availableVoices.length} voices`);
    }
  }

  /**
   * Handle messages from background script
   */
  function handleMessage(message, sender, sendResponse) {
    console.log('[WebTalk TTS] Received message:', message);

    if (message.action === 'speak' && message.text) {
      speakText(message.text)
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((error) => {
          console.error('[WebTalk TTS] Speech error:', error);
          sendResponse({ success: false, error: error.message });
        });

      // Return true to indicate we'll respond asynchronously
      return true;
    }

    // Handle stop action
    if (message.action === 'stop') {
      window.speechSynthesis.cancel();
      sendResponse({ success: true });
      return false;
    }

    sendResponse({ success: false, error: 'Unknown action' });
    return false;
  }

  /**
   * Clean text for speech synthesis
   */
  function cleanTextForSpeech(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    return text
      // Normalize unicode
      .normalize('NFC')
      // Replace multiple whitespace with single space
      .replace(/\s+/g, ' ')
      // Remove control characters
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Remove zero-width characters
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // Normalize quotation marks
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      // Normalize dashes
      .replace(/[\u2013\u2014]/g, '-')
      // Normalize ellipsis
      .replace(/\u2026/g, '...')
      // Trim whitespace
      .trim();
  }

  /**
   * Speak text using user's stored settings
   */
  async function speakText(text) {
    return new Promise(async (resolve, reject) => {
      // Clean the text
      const cleanedText = cleanTextForSpeech(text);

      if (!cleanedText) {
        reject(new Error('No valid text to speak'));
        return;
      }

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      // Load user settings
      let settings = { ...DEFAULT_SETTINGS };
      try {
        const result = await chrome.storage.local.get('webtalkSettings');
        if (result.webtalkSettings) {
          settings = { ...DEFAULT_SETTINGS, ...result.webtalkSettings };
        }
      } catch (error) {
        console.warn('[WebTalk TTS] Could not load settings, using defaults:', error);
      }

      console.log('[WebTalk TTS] Speaking with settings:', settings);

      // Create utterance
      const utterance = new SpeechSynthesisUtterance(cleanedText);
      utterance.rate = settings.rate;
      utterance.pitch = settings.pitch;
      utterance.volume = 1.0;

      // Find and set the selected voice
      if (settings.voiceURI && availableVoices.length > 0) {
        const selectedVoice = availableVoices.find(v => v.voiceURI === settings.voiceURI);
        if (selectedVoice) {
          utterance.voice = selectedVoice;
          console.log('[WebTalk TTS] Using voice:', selectedVoice.name);
        }
      }

      // Set up event handlers
      utterance.onend = () => {
        console.log('[WebTalk TTS] Speech completed');
        resolve();
      };

      utterance.onerror = (event) => {
        // Don't treat 'interrupted' as an error (happens when speech is cancelled)
        if (event.error === 'interrupted') {
          resolve();
        } else {
          reject(new Error(`Speech synthesis error: ${event.error}`));
        }
      };

      // Chrome bug workaround: resume speech synthesis if it gets stuck
      // This can happen after the page has been inactive
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      // Speak the utterance
      window.speechSynthesis.speak(utterance);

      // Chrome bug workaround: speech can get stuck on long text
      // Periodically check and resume if needed
      const resumeInterval = setInterval(() => {
        if (!window.speechSynthesis.speaking) {
          clearInterval(resumeInterval);
        } else if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 1000);

      // Clear interval when speech ends
      utterance.onend = () => {
        clearInterval(resumeInterval);
        console.log('[WebTalk TTS] Speech completed');
        resolve();
      };

      utterance.onerror = (event) => {
        clearInterval(resumeInterval);
        if (event.error === 'interrupted') {
          resolve();
        } else {
          reject(new Error(`Speech synthesis error: ${event.error}`));
        }
      };
    });
  }

  /**
   * Clean up speech synthesis
   */
  function cleanup() {
    window.speechSynthesis.cancel();
    console.log('[WebTalk TTS] Cleaned up speech synthesis');
  }

  // Initialize when the script loads
  init();
})();
