/**
 * WebTalk TTS - Popup Script
 * Handles voice selection, settings management, playback controls, and user preferences
 */

(function() {
  'use strict';

  const SERVER_URL = typeof WEBTALK_SERVER_URL !== 'undefined' ? WEBTALK_SERVER_URL : 'http://localhost:8008';

  // DOM Elements - Settings
  const voiceSelect = document.getElementById('voice-select');
  const rateSlider = document.getElementById('rate-slider');
  const rateValue = document.getElementById('rate-value');
  const testVoiceBtn = document.getElementById('test-voice-btn');

  // DOM Elements - Playback Controls
  const playBtn = document.getElementById('play-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const stopBtn = document.getElementById('stop-btn');

  // DOM Elements - Progress
  const progressSection = document.getElementById('progress-section');
  const progressText = document.getElementById('progress-text');
  const progressBar = document.getElementById('progress-bar');

  // DOM Elements - Status
  const statusMessage = document.getElementById('status-message');

  // Default settings
  const DEFAULT_SETTINGS = {
    voiceURI: '',
    rate: 1.0
  };

  // Current settings
  let currentSettings = { ...DEFAULT_SETTINGS };

  // Available voices
  let availableVoices = [];

  // True when the Kokoro server could not be reached
  let serverUnreachable = false;

  // Playback state
  let playbackState = {
    isPlaying: false,
    isPaused: false,
    currentChunk: 0,
    totalChunks: 0
  };

  /**
   * Initialize the popup
   */
  async function init() {
    console.log('[WebTalk TTS] Popup initialized');

    // Load saved settings first
    await loadSettings();

    // Initialize voice list
    await initVoices();

    // Set up event listeners
    setupEventListeners();

    // Get current playback status
    await refreshPlaybackStatus();

    // Listen for progress updates from content script
    chrome.runtime.onMessage.addListener(handleProgressMessage);
  }

  /**
   * Handle progress messages from content script
   */
  function handleProgressMessage(message, sender, sendResponse) {
    if (message.type === 'playbackProgress') {
      updatePlaybackUI(message);
    }
  }

  /**
   * Refresh playback status from content script
   */
  async function refreshPlaybackStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'getStatus' }, (response) => {
          if (response && response.success) {
            updatePlaybackUI(response);
          }
        });
      }
    } catch (error) {
      console.log('[WebTalk TTS] Could not get playback status');
    }
  }

  /**
   * Update playback UI based on state
   */
  function updatePlaybackUI(state) {
    playbackState = {
      isPlaying: state.isPlaying || false,
      isPaused: state.isPaused || false,
      currentChunk: state.currentChunk || 0,
      totalChunks: state.totalChunks || 0
    };

    // Update button states
    if (playbackState.isPlaying) {
      playBtn.disabled = playbackState.isPaused ? false : true;
      pauseBtn.disabled = playbackState.isPaused;
      stopBtn.disabled = false;

      // Update button appearance
      if (playbackState.isPaused) {
        playBtn.classList.remove('active');
        pauseBtn.classList.add('active');
      } else {
        playBtn.classList.add('active');
        pauseBtn.classList.remove('active');
      }

      // Show progress
      progressSection.style.display = 'block';
      const percentage = playbackState.totalChunks > 0
        ? Math.round((playbackState.currentChunk / playbackState.totalChunks) * 100)
        : 0;
      progressText.textContent = `Reading chunk ${playbackState.currentChunk} of ${playbackState.totalChunks}`;
      progressBar.style.width = `${percentage}%`;
    } else {
      playBtn.disabled = serverUnreachable;
      pauseBtn.disabled = true;
      stopBtn.disabled = true;
      playBtn.classList.remove('active');
      pauseBtn.classList.remove('active');

      // Hide progress when not playing
      if (playbackState.totalChunks === 0) {
        progressSection.style.display = 'none';
      } else {
        // Show completion
        progressText.textContent = 'Finished';
        progressBar.style.width = '100%';
        // Hide after a moment
        setTimeout(() => {
          progressSection.style.display = 'none';
        }, 2000);
      }
    }
  }

  /**
   * Initialize voices by fetching them from the Kokoro server
   */
  async function initVoices() {
    try {
      const response = await fetch(`${SERVER_URL}/voices`);
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      const data = await response.json();
      availableVoices = data.voices || [];
      populateVoiceList();
    } catch (error) {
      console.error('[WebTalk TTS] Could not load voices:', error);
      voiceSelect.innerHTML = '';
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Kokoro server unreachable';
      voiceSelect.appendChild(option);
      voiceSelect.disabled = true;
      testVoiceBtn.disabled = true;
      serverUnreachable = true;
      playBtn.disabled = true;
      showStatus(`Cannot reach Kokoro server at ${SERVER_URL}. Start it and reopen the popup.`, 'error');
    }
  }

  /**
   * Populate the voice selection dropdown from the Kokoro voice list
   */
  function populateVoiceList() {
    voiceSelect.innerHTML = '';

    if (availableVoices.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No voices available';
      voiceSelect.appendChild(option);
      return;
    }

    const sortedVoices = [...availableVoices].sort((a, b) => {
      if (a.lang !== b.lang) {
        return a.lang.localeCompare(b.lang);
      }
      return a.name.localeCompare(b.name);
    });

    sortedVoices.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.id;
      option.textContent = `${voice.name} (${voice.lang})`;
      voiceSelect.appendChild(option);
    });

    // Restore saved voice selection
    if (currentSettings.voiceURI) {
      const savedVoice = sortedVoices.find(v => v.id === currentSettings.voiceURI);
      if (savedVoice) {
        voiceSelect.value = currentSettings.voiceURI;
      } else {
        voiceSelect.selectedIndex = 0;
        currentSettings.voiceURI = voiceSelect.value;
        saveSettings();
      }
    } else {
      voiceSelect.selectedIndex = 0;
      currentSettings.voiceURI = voiceSelect.value;
      saveSettings();
    }

    console.log(`[WebTalk TTS] Loaded ${sortedVoices.length} voices`);
  }

  /**
   * Set up event listeners for all controls
   */
  function setupEventListeners() {
    // Voice selection change
    voiceSelect.addEventListener('change', () => {
      currentSettings.voiceURI = voiceSelect.value;
      saveSettings();

      const selectedOption = voiceSelect.options[voiceSelect.selectedIndex];
      if (selectedOption && selectedOption.value) {
        const voiceName = selectedOption.textContent.replace(/\s*\([^)]*\)$/, '');
        showStatus(`${voiceName} voice downloading…`, 'info');
      }
    });

    // Rate slider change
    rateSlider.addEventListener('input', () => {
      const rate = parseFloat(rateSlider.value);
      currentSettings.rate = rate;
      rateValue.textContent = `${rate.toFixed(1)}x`;
    });

    rateSlider.addEventListener('change', () => {
      saveSettings();
    });

    // Test voice button
    testVoiceBtn.addEventListener('click', testVoice);

    // Playback controls
    playBtn.addEventListener('click', handlePlay);
    pauseBtn.addEventListener('click', handlePause);
    stopBtn.addEventListener('click', handleStop);
  }

  /**
   * Handle play button click
   */
  async function handlePlay() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        showStatus('No active tab found', 'error');
        return;
      }

      if (playbackState.isPlaying && playbackState.isPaused) {
        // Resume playback
        chrome.tabs.sendMessage(tab.id, { action: 'resume' }, (response) => {
          if (chrome.runtime.lastError) {
            showStatus('Could not communicate with page', 'error');
            return;
          }
          if (response && response.success) {
            showStatus('Resumed', 'success');
          }
        });
      } else {
        // Start new playback with selected text
        chrome.tabs.sendMessage(tab.id, { action: 'speakSelection' }, (response) => {
          if (chrome.runtime.lastError) {
            showStatus('Could not communicate with page. Try refreshing.', 'error');
            return;
          }
          if (response && response.success) {
            showStatus('Playing selected text', 'success');
          } else if (response && response.error) {
            if (response.error === 'No text selected') {
              showStatus('Please select some text on the page first', 'info');
            } else {
              showStatus(response.error, 'error');
            }
          }
        });
      }
    } catch (error) {
      showStatus('An error occurred', 'error');
      console.error('[WebTalk TTS] Play error:', error);
    }
  }

  /**
   * Handle pause button click
   */
  async function handlePause() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return;

      chrome.tabs.sendMessage(tab.id, { action: 'pause' }, (response) => {
        if (response && response.success) {
          showStatus('Paused', 'info');
        }
      });
    } catch (error) {
      console.error('[WebTalk TTS] Pause error:', error);
    }
  }

  /**
   * Handle stop button click
   */
  async function handleStop() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return;

      chrome.tabs.sendMessage(tab.id, { action: 'stop' }, (response) => {
        if (response && response.success) {
          showStatus('Stopped', 'info');
          updatePlaybackUI({ isPlaying: false, isPaused: false, currentChunk: 0, totalChunks: 0 });
        }
      });
    } catch (error) {
      console.error('[WebTalk TTS] Stop error:', error);
    }
  }

  /**
   * Show status message
   * @param {string} message - Message to display
   * @param {string} type - Message type: 'success', 'error', 'info'
   */
  function showStatus(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';

    // Auto-hide after 3 seconds
    setTimeout(() => {
      statusMessage.style.display = 'none';
    }, 3000);
  }

  /**
   * Load settings from browser storage
   */
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get('webtalkSettings');

      if (result.webtalkSettings) {
        currentSettings = { ...DEFAULT_SETTINGS, ...result.webtalkSettings };
        console.log('[WebTalk TTS] Settings loaded:', currentSettings);
      }

      // Apply loaded settings to UI
      rateSlider.value = currentSettings.rate;
      rateValue.textContent = `${currentSettings.rate.toFixed(1)}x`;

    } catch (error) {
      console.error('[WebTalk TTS] Error loading settings:', error);
    }
  }

  /**
   * Save settings to browser storage
   */
  async function saveSettings() {
    try {
      await chrome.storage.local.set({ webtalkSettings: currentSettings });
      console.log('[WebTalk TTS] Settings saved:', currentSettings);
    } catch (error) {
      console.error('[WebTalk TTS] Error saving settings:', error);
    }
  }

  /**
   * Test the current voice with sample text
   */
  async function testVoice() {
    const testText = 'Hello! This is a test of the WebTalk text-to-speech voice.';

    testVoiceBtn.disabled = true;
    testVoiceBtn.textContent = 'Speaking...';

    let response;
    try {
      response = await fetch(`${SERVER_URL}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: testText, voice: currentSettings.voiceURI, speed: currentSettings.rate })
      });
    } catch (error) {
      console.error('[WebTalk TTS] Test voice fetch error:', error);
      showStatus(`Cannot reach Kokoro server at ${SERVER_URL}`, 'error');
      testVoiceBtn.disabled = false;
      testVoiceBtn.textContent = 'Test Voice';
      return;
    }

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = await response.json();
        detail = body.detail || detail;
      } catch (e) {
        // ignore, use statusText
      }
      showStatus(`Kokoro server error: ${detail}`, 'error');
      testVoiceBtn.disabled = false;
      testVoiceBtn.textContent = 'Test Voice';
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    const reset = () => {
      testVoiceBtn.disabled = false;
      testVoiceBtn.textContent = 'Test Voice';
      URL.revokeObjectURL(url);
    };

    audio.onended = reset;
    audio.onerror = (event) => {
      console.error('[WebTalk TTS] Test voice playback error:', event);
      reset();
    };

    audio.play().catch((error) => {
      console.error('[WebTalk TTS] Test voice play error:', error);
      reset();
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
