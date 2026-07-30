/**
 * WebTalk TTS - Content Script
 * Handles text-to-speech via the local Kokoro server, with chunk-based playback
 */

(function() {
  'use strict';

  const SERVER_URL = typeof WEBTALK_SERVER_URL !== 'undefined' ? WEBTALK_SERVER_URL : 'http://localhost:8008';

  // Default settings (used if no stored settings found)
  const DEFAULT_SETTINGS = {
    voiceURI: '',
    rate: 1.0
  };

  // Playback state
  const playbackState = {
    isPlaying: false,
    isPaused: false,
    chunks: [],
    currentChunkIndex: 0,
    currentSource: null,
    currentAbortController: null,
    // Word-highlight state (best-effort; only populated when the selection
    // could be wrapped and its word count matches the chunked text)
    wordSpans: [],
    chunkWordRanges: [],
    currentHighlightRAF: null,
    currentWordSpan: null
  };

  // Shared AudioContext for decoding/playing Kokoro's WAV bytes. Using
  // decodeAudioData + AudioBufferSourceNode instead of <audio src="blob:...">
  // because a page's CSP media-src directive can block blob: audio element
  // sources (e.g. claude.ai) - decodeAudioData works on raw bytes we already
  // fetched, so it's not subject to that resource-load restriction.
  let audioContext = null;

  function getAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
  }

  /**
   * Initialize the content script
   */
  function init() {
    console.log('[WebTalk TTS] Content script initialized');

    injectHighlightStyles();

    chrome.runtime.onMessage.addListener(handleMessage);

    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('pagehide', cleanup);
  }

  /**
   * Inject the CSS for the word-highlight effect once.
   */
  function injectHighlightStyles() {
    if (document.getElementById('webtalk-tts-styles')) {
      return;
    }
    const style = document.createElement('style');
    style.id = 'webtalk-tts-styles';
    style.textContent = '.webtalk-word-active { background-color: #ffe066; color: #1a1a1a; border-radius: 2px; box-shadow: 0 0 0 1px rgba(0,0,0,0.05); }';
    document.documentElement.appendChild(style);
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
              showErrorToast(error.message);
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
            if (!result.success) {
              showErrorToast(result.error);
            }
            sendResponse(result);
          })
          .catch((error) => {
            showErrorToast(error.message);
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
      .replace(/[​-‍﻿]/g, '')
      // Normalize quotation marks
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      // Normalize dashes
      .replace(/[–—]/g, '-')
      // Normalize ellipsis
      .replace(/…/g, '...')
      // Remove excessive punctuation (like !!!!! or ?????)
      .replace(/([!?.]){3,}/g, '$1$1')
      // Trim whitespace
      .trim();
  }

  /**
   * Split text into chunks for TTS requests, on sentence boundaries.
   * Kokoro has no truncation bug like the native API did, so this is now
   * about keeping individual requests reasonably sized and progress
   * updates meaningful, not working around a 200-char limit.
   * @param {string} text - Text to chunk
   * @param {number} maxChunkSize - Maximum characters per chunk
   * @returns {string[]} - Array of text chunks
   */
  function chunkTextForSpeech(text, maxChunkSize = 1500) {
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

      if ((currentChunk + ' ' + trimmedSentence).trim().length > maxChunkSize) {
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
   * Wrap each word within a Range in its own <span> so it can be
   * individually highlighted during playback. Works across mixed inline
   * formatting (bold/links/etc.) since it only ever touches single text
   * nodes. Best-effort: returns [] on any failure.
   * @param {Range} range
   * @returns {HTMLElement[]} wrapped word spans, in document order
   */
  function wrapSelectionInWords(range) {
    const allSpans = [];
    try {
      const root = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentNode
        : range.commonAncestorContainer;

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });

      const textNodes = [];
      let node;
      while ((node = walker.nextNode())) {
        textNodes.push(node);
      }

      for (const textNode of textNodes) {
        let startOffset = textNode === range.startContainer ? range.startOffset : 0;
        let endOffset = textNode === range.endContainer ? range.endOffset : textNode.length;

        if (startOffset >= endOffset) {
          continue;
        }

        const text = textNode.textContent.slice(startOffset, endOffset);
        const matches = [...text.matchAll(/\S+/g)];
        const nodeSpans = [];

        // Process right-to-left so earlier offsets in this text node stay
        // valid as surroundContents() splits it into siblings.
        for (let i = matches.length - 1; i >= 0; i--) {
          const match = matches[i];
          const wordStart = startOffset + match.index;
          const wordEnd = wordStart + match[0].length;

          try {
            const wordRange = document.createRange();
            wordRange.setStart(textNode, wordStart);
            wordRange.setEnd(textNode, wordEnd);
            const span = document.createElement('span');
            span.className = 'webtalk-word';
            wordRange.surroundContents(span);
            nodeSpans.push(span);
          } catch (e) {
            // Skip this word on boundary edge cases; not fatal.
          }
        }

        allSpans.push(...nodeSpans.reverse());
      }
    } catch (e) {
      console.warn('[WebTalk TTS] Could not wrap selection for highlighting:', e);
      return [];
    }
    return allSpans;
  }

  /**
   * Unwrap previously wrapped word spans back into plain text, restoring
   * the page's original DOM. Also clears any in-flight highlight state.
   * @param {HTMLElement[]} [spans] - defaults to playbackState.wordSpans
   */
  function unwrapWordSpans(spans) {
    const list = spans || playbackState.wordSpans;

    if (playbackState.currentHighlightRAF) {
      cancelAnimationFrame(playbackState.currentHighlightRAF);
      playbackState.currentHighlightRAF = null;
    }
    playbackState.currentWordSpan = null;

    if (list && list.length > 0) {
      const parents = new Set();
      for (const span of list) {
        if (span && span.parentNode) {
          const textNode = document.createTextNode(span.textContent);
          span.parentNode.replaceChild(textNode, span);
          parents.add(textNode.parentNode);
        }
      }
      parents.forEach(p => p && p.normalize());
    }

    if (!spans) {
      playbackState.wordSpans = [];
      playbackState.chunkWordRanges = [];
    }
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
   * Show a lightweight in-page error toast, for errors triggered by
   * the context menu path when no popup is open to show the error.
   */
  function showErrorToast(message) {
    const toast = document.createElement('div');
    toast.textContent = `WebTalk TTS: ${message}`;
    toast.style.cssText = [
      'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483647',
      'background:#c0392b', 'color:#fff', 'padding:10px 16px',
      'border-radius:6px', 'font:14px/1.4 -apple-system,sans-serif',
      'box-shadow:0 2px 8px rgba(0,0,0,0.3)', 'max-width:320px'
    ].join(';');
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  /**
   * Fetch synthesized audio for a chunk from the Kokoro server and play it.
   * @param {string} chunk - Text chunk to speak
   * @param {object} settings - Voice settings
   * @returns {Promise} - Resolves when chunk finishes playing
   */
  async function speakChunk(chunk, settings) {
    const controller = new AbortController();
    playbackState.currentAbortController = controller;

    let response;
    try {
      response = await fetch(`${SERVER_URL}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chunk, voice: settings.voiceURI, speed: settings.rate }),
        signal: controller.signal
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        return; // Stopped intentionally, not an error
      }
      throw new Error(`Kokoro server unreachable at ${SERVER_URL}. Is it running?`);
    }

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = await response.json();
        detail = body.detail || detail;
      } catch (e) {
        // ignore, use statusText
      }
      throw new Error(`Kokoro server error: ${detail}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    playbackState.currentSource = source;

    // Set up approximate word-level highlighting for this chunk, if the
    // selection was successfully wrapped and its word count lines up.
    const rangeInfo = playbackState.chunkWordRanges[playbackState.currentChunkIndex];
    let chunkWords = null;
    let wordBoundaries = null;
    if (rangeInfo && playbackState.wordSpans.length > 0) {
      chunkWords = playbackState.wordSpans.slice(rangeInfo.start, rangeInfo.start + rangeInfo.count);
      const weights = chunkWords.map(span => Math.max(span.textContent.length, 1));
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);
      let cumulative = 0;
      wordBoundaries = weights.map(weight => {
        cumulative += weight;
        return (cumulative / totalWeight) * audioBuffer.duration;
      });
    }

    try {
      await new Promise((resolve, reject) => {
        source.onended = () => resolve();
        source.addEventListener('error', () => reject(new Error('Audio playback error')));

        const chunkStartTime = ctx.currentTime;
        source.start(0);

        if (chunkWords && wordBoundaries) {
          const tick = () => {
            const elapsed = ctx.currentTime - chunkStartTime;
            let idx = wordBoundaries.findIndex(boundary => elapsed < boundary);
            if (idx === -1) idx = chunkWords.length - 1;
            const target = chunkWords[idx];
            if (target && target !== playbackState.currentWordSpan) {
              if (playbackState.currentWordSpan) {
                playbackState.currentWordSpan.classList.remove('webtalk-word-active');
              }
              target.classList.add('webtalk-word-active');
              playbackState.currentWordSpan = target;
            }
            playbackState.currentHighlightRAF = requestAnimationFrame(tick);
          };
          playbackState.currentHighlightRAF = requestAnimationFrame(tick);
        }
      });
    } finally {
      playbackState.currentSource = null;
      if (playbackState.currentHighlightRAF) {
        cancelAnimationFrame(playbackState.currentHighlightRAF);
        playbackState.currentHighlightRAF = null;
      }
      if (playbackState.currentWordSpan) {
        playbackState.currentWordSpan.classList.remove('webtalk-word-active');
        playbackState.currentWordSpan = null;
      }
    }
  }

  /**
   * Play chunks sequentially
   * @param {object} settings - Voice settings
   */
  async function playChunksSequentially(settings) {
    while (playbackState.currentChunkIndex < playbackState.chunks.length) {
      if (!playbackState.isPlaying) {
        break;
      }

      const chunk = playbackState.chunks[playbackState.currentChunkIndex];
      sendProgressUpdate();

      try {
        await speakChunk(chunk, settings);

        if (playbackState.isPlaying) {
          playbackState.currentChunkIndex++;
        }
      } catch (error) {
        console.error('[WebTalk TTS] Chunk error:', error);
        playbackState.isPlaying = false;
        playbackState.isPaused = false;
        playbackState.currentChunkIndex = 0;
        playbackState.chunks = [];
        unwrapWordSpans();
        sendProgressUpdate();
        throw error;
      }
    }

    // Playback complete
    playbackState.isPlaying = false;
    playbackState.isPaused = false;
    playbackState.currentChunkIndex = 0;
    playbackState.chunks = [];
    unwrapWordSpans();
    sendProgressUpdate();
    console.log('[WebTalk TTS] Playback complete');
  }

  /**
   * Speak text using user's stored settings with chunking
   * @param {string} text - Text to speak
   */
  async function speakText(text) {
    const cleanedText = cleanTextForSpeech(text);

    if (!cleanedText) {
      throw new Error('No valid text to speak');
    }

    stopSpeech();

    // Best-effort: wrap the live page selection in per-word spans so we can
    // highlight along with playback. If this succeeds, the chunks below are
    // built directly from the wrapped spans' own text (not the separately
    // cleaned `text` param) so word counts can never drift out of sync with
    // what's actually on the page.
    let chunkSourceText = cleanedText;
    try {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        const range = selection.getRangeAt(0).cloneRange();
        const spans = wrapSelectionInWords(range);
        if (spans.length > 0) {
          playbackState.wordSpans = spans;
          chunkSourceText = spans.map(s => s.textContent).join(' ');
        }
      }
    } catch (error) {
      console.warn('[WebTalk TTS] Word highlighting setup failed:', error);
    }

    const chunks = chunkTextForSpeech(chunkSourceText);

    if (chunks.length === 0) {
      unwrapWordSpans();
      throw new Error('No valid text to speak');
    }

    console.log(`[WebTalk TTS] Speaking ${chunks.length} chunks`);

    if (playbackState.wordSpans.length > 0) {
      let cursor = 0;
      playbackState.chunkWordRanges = chunks.map(c => {
        const count = c.split(/\s+/).filter(Boolean).length;
        const entry = { start: cursor, count };
        cursor += count;
        return entry;
      });
    }

    let settings = { ...DEFAULT_SETTINGS };
    try {
      const result = await chrome.storage.local.get('webtalkSettings');
      if (result.webtalkSettings) {
        settings = { ...DEFAULT_SETTINGS, ...result.webtalkSettings };
      }
    } catch (error) {
      console.warn('[WebTalk TTS] Could not load settings, using defaults:', error);
    }

    playbackState.isPlaying = true;
    playbackState.isPaused = false;
    playbackState.chunks = chunks;
    playbackState.currentChunkIndex = 0;

    sendProgressUpdate();

    await playChunksSequentially(settings);
  }

  /**
   * Pause speech
   */
  function pauseSpeech() {
    if (playbackState.isPlaying && !playbackState.isPaused && audioContext) {
      playbackState.isPaused = true;
      audioContext.suspend();
      sendProgressUpdate();
      console.log('[WebTalk TTS] Speech paused');
    }
  }

  /**
   * Resume speech
   */
  function resumeSpeech() {
    if (playbackState.isPlaying && playbackState.isPaused && audioContext) {
      playbackState.isPaused = false;
      audioContext.resume();
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

    if (playbackState.currentAbortController) {
      playbackState.currentAbortController.abort();
      playbackState.currentAbortController = null;
    }

    if (playbackState.currentSource) {
      try {
        playbackState.currentSource.stop();
      } catch (e) {
        // already stopped/ended
      }
      playbackState.currentSource = null;
    }

    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }

    unwrapWordSpans();

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
