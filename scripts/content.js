/**
 * WebTalk TTS - Content Script
 * Handles text-to-speech functionality on web pages with chunk-based playback
 */

(function() {
  'use strict';

  // Default settings (used if no stored settings found)
  const DEFAULT_SETTINGS = {
    voiceURI: '',
    rate: 1.0,
    pitch: 1.0
  };

  // Playback state
  const playbackState = {
    isPlaying: false,
    isPaused: false,
    chunks: [],
    currentChunkIndex: 0,
    currentUtterance: null
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
   * Handle messages from background script or popup
   */
  function handleMessage(message, sender, sendResponse) {
    console.log('[WebTalk TTS] Received message:', message);

    switch (message.action) {
      case 'speak':
        if (message.text) {
          speakText(message.text)
            .then(() => {
              sendResponse({ success: true });
            })
            .catch((error) => {
              console.error('[WebTalk TTS] Speech error:', error);
              sendResponse({ success: false, error: error.message });
            });
          return true; // Async response
        }
        sendResponse({ success: false, error: 'No text provided' });
        return false;

      case 'pause':
        pauseSpeech();
        sendResponse({ success: true, isPaused: playbackState.isPaused });
        return false;

      case 'resume':
        resumeSpeech();
        sendResponse({ success: true, isPaused: playbackState.isPaused });
        return false;

      case 'stop':
        stopSpeech();
        sendResponse({ success: true });
        return false;

      case 'getStatus':
        sendResponse({
          success: true,
          isPlaying: playbackState.isPlaying,
          isPaused: playbackState.isPaused,
          currentChunk: playbackState.currentChunkIndex + 1,
          totalChunks: playbackState.chunks.length
        });
        return false;

      case 'speakSelection':
        speakSelection()
          .then((result) => {
            sendResponse(result);
          })
          .catch((error) => {
            sendResponse({ success: false, error: error.message });
          });
        return true; // Async response

      default:
        sendResponse({ success: false, error: 'Unknown action' });
        return false;
    }
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
      // Remove excessive punctuation (like !!!!! or ?????)
      .replace(/([!?.]){3,}/g, '$1$1')
      // Trim whitespace
      .trim();
  }

  /**
   * Split text into chunks for speech synthesis
   * @param {string} text - Text to chunk
   * @param {number} maxChunkSize - Maximum characters per chunk
   * @returns {string[]} - Array of text chunks
   */
  function chunkTextForSpeech(text, maxChunkSize = 200) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const cleanedText = cleanTextForSpeech(text);

    if (!cleanedText) {
      return [];
    }

    if (cleanedText.length <= maxChunkSize) {
      return [cleanedText];
    }

    const chunks = [];
    const sentenceRegex = /[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g;
    const sentences = cleanedText.match(sentenceRegex) || [cleanedText];

    let currentChunk = '';

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();

      if (!trimmedSentence) {
        continue;
      }

      if (trimmedSentence.length > maxChunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }

        const words = trimmedSentence.split(/\s+/);
        let wordChunk = '';

        for (const word of words) {
          if (word.length > maxChunkSize) {
            if (wordChunk) {
              chunks.push(wordChunk.trim());
              wordChunk = '';
            }
            for (let i = 0; i < word.length; i += maxChunkSize) {
              chunks.push(word.substring(i, i + maxChunkSize));
            }
          } else if ((wordChunk + ' ' + word).trim().length > maxChunkSize) {
            if (wordChunk) {
              chunks.push(wordChunk.trim());
            }
            wordChunk = word;
          } else {
            wordChunk = wordChunk ? wordChunk + ' ' + word : word;
          }
        }

        if (wordChunk) {
          chunks.push(wordChunk.trim());
        }
      } else if ((currentChunk + ' ' + trimmedSentence).trim().length > maxChunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = trimmedSentence;
      } else {
        currentChunk = currentChunk ? currentChunk + ' ' + trimmedSentence : trimmedSentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks.filter(chunk => chunk.length > 0);
  }

  /**
   * Send progress update to popup
   */
  function sendProgressUpdate() {
    try {
      chrome.runtime.sendMessage({
        type: 'playbackProgress',
        isPlaying: playbackState.isPlaying,
        isPaused: playbackState.isPaused,
        currentChunk: playbackState.currentChunkIndex + 1,
        totalChunks: playbackState.chunks.length
      }).catch(() => {
        // Popup might be closed, ignore error
      });
    } catch (e) {
      // Extension context might be invalid
    }
  }

  /**
   * Speak a single chunk
   * @param {string} chunk - Text chunk to speak
   * @param {object} settings - Voice settings
   * @returns {Promise} - Resolves when chunk finishes speaking
   */
  function speakChunk(chunk, settings) {
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.rate = settings.rate;
      utterance.pitch = settings.pitch;
      utterance.volume = 1.0;

      // Find and set the selected voice
      if (settings.voiceURI && availableVoices.length > 0) {
        const selectedVoice = availableVoices.find(v => v.voiceURI === settings.voiceURI);
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }
      }

      playbackState.currentUtterance = utterance;

      utterance.onend = () => {
        playbackState.currentUtterance = null;
        resolve();
      };

      utterance.onerror = (event) => {
        playbackState.currentUtterance = null;
        if (event.error === 'interrupted' || event.error === 'canceled') {
          resolve(); // Not an error, just stopped
        } else {
          reject(new Error(`Speech synthesis error: ${event.error}`));
        }
      };

      // Chrome bug workaround: resume if paused
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      window.speechSynthesis.speak(utterance);
    });
  }

  /**
   * Play chunks sequentially
   * @param {object} settings - Voice settings
   */
  async function playChunksSequentially(settings) {
    while (playbackState.currentChunkIndex < playbackState.chunks.length) {
      // Check if stopped
      if (!playbackState.isPlaying) {
        break;
      }

      // Wait while paused
      while (playbackState.isPaused && playbackState.isPlaying) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Check again if stopped during pause
      if (!playbackState.isPlaying) {
        break;
      }

      const chunk = playbackState.chunks[playbackState.currentChunkIndex];
      sendProgressUpdate();

      try {
        await speakChunk(chunk, settings);

        // Only advance if not stopped
        if (playbackState.isPlaying && !playbackState.isPaused) {
          playbackState.currentChunkIndex++;
        }
      } catch (error) {
        console.error('[WebTalk TTS] Chunk error:', error);
        // Continue to next chunk on error
        playbackState.currentChunkIndex++;
      }
    }

    // Playback complete
    playbackState.isPlaying = false;
    playbackState.isPaused = false;
    playbackState.currentChunkIndex = 0;
    playbackState.chunks = [];
    sendProgressUpdate();
    console.log('[WebTalk TTS] Playback complete');
  }

  /**
   * Speak text using user's stored settings with chunking
   * @param {string} text - Text to speak
   */
  async function speakText(text) {
    // Clean the text
    const cleanedText = cleanTextForSpeech(text);

    if (!cleanedText) {
      throw new Error('No valid text to speak');
    }

    // Cancel any ongoing speech
    stopSpeech();

    // Chunk the text
    const chunks = chunkTextForSpeech(cleanedText, 200);

    if (chunks.length === 0) {
      throw new Error('No valid text to speak');
    }

    console.log(`[WebTalk TTS] Speaking ${chunks.length} chunks`);

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

    // Set up playback state
    playbackState.isPlaying = true;
    playbackState.isPaused = false;
    playbackState.chunks = chunks;
    playbackState.currentChunkIndex = 0;

    sendProgressUpdate();

    // Start sequential playback
    await playChunksSequentially(settings);
  }

  /**
   * Pause speech
   */
  function pauseSpeech() {
    if (playbackState.isPlaying && !playbackState.isPaused) {
      playbackState.isPaused = true;
      window.speechSynthesis.pause();
      sendProgressUpdate();
      console.log('[WebTalk TTS] Speech paused');
    }
  }

  /**
   * Resume speech
   */
  function resumeSpeech() {
    if (playbackState.isPlaying && playbackState.isPaused) {
      playbackState.isPaused = false;
      window.speechSynthesis.resume();
      sendProgressUpdate();
      console.log('[WebTalk TTS] Speech resumed');
    }
  }

  /**
   * Stop speech completely
   */
  function stopSpeech() {
    playbackState.isPlaying = false;
    playbackState.isPaused = false;
    playbackState.currentChunkIndex = 0;
    playbackState.chunks = [];
    window.speechSynthesis.cancel();
    sendProgressUpdate();
    console.log('[WebTalk TTS] Speech stopped');
  }

  /**
   * Get selected text from the page
   * @returns {string} - Selected text or empty string
   */
  function getSelectedText() {
    const selection = window.getSelection();
    return selection ? selection.toString() : '';
  }

  /**
   * Speak currently selected text
   * @returns {Promise<object>} - Result object
   */
  async function speakSelection() {
    const selectedText = getSelectedText();

    if (!selectedText || !selectedText.trim()) {
      return { success: false, error: 'No text selected' };
    }

    try {
      await speakText(selectedText);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Clean up speech synthesis
   */
  function cleanup() {
    stopSpeech();
    console.log('[WebTalk TTS] Cleaned up speech synthesis');
  }

  // Initialize when the script loads
  init();
})();
