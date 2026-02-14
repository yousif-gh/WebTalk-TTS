/**
 * WebTalk TTS - Popup Script
 * Handles voice selection, settings management, playback controls, and user preferences
 */

(function() {
  'use strict';

  // DOM Elements - Settings
  const voiceSelect = document.getElementById('voice-select');
  const rateSlider = document.getElementById('rate-slider');
  const rateValue = document.getElementById('rate-value');
  const pitchSlider = document.getElementById('pitch-slider');
  const pitchValue = document.getElementById('pitch-value');
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
    rate: 1.0,
    pitch: 1.0
  };

  // Current settings
  let currentSettings = { ...DEFAULT_SETTINGS };

  // Available voices
  let availableVoices = [];

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
    initVoices();

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
      playBtn.disabled = false;
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
   * Initialize voices - handles async voice loading
   */
  function initVoices() {
    // Try to get voices immediately
    availableVoices = window.speechSynthesis.getVoices();

    if (availableVoices.length > 0) {
      populateVoiceList();
    } else {
      // Voices load asynchronously in Chrome - wait for voiceschanged event
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        availableVoices = window.speechSynthesis.getVoices();
        populateVoiceList();
      });
    }
  }

  /**
   * Populate the voice selection dropdown
   */
  function populateVoiceList() {
    // Clear existing options
    voiceSelect.innerHTML = '';

    if (availableVoices.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No voices available';
      voiceSelect.appendChild(option);
      return;
    }

    // Sort voices: prioritize local voices and English
    const sortedVoices = [...availableVoices].sort((a, b) => {
      // Prioritize local voices over remote
      if (a.localService !== b.localService) {
        return a.localService ? -1 : 1;
      }
      // Then sort by language (English first)
      const aIsEnglish = a.lang.startsWith('en');
      const bIsEnglish = b.lang.startsWith('en');
      if (aIsEnglish !== bIsEnglish) {
        return aIsEnglish ? -1 : 1;
      }
      // Finally, alphabetically by name
      return a.name.localeCompare(b.name);
    });

    // Add voices to dropdown
    sortedVoices.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.voiceURI;
      option.textContent = `${voice.name} (${voice.lang})${voice.localService ? '' : ' [Online]'}`;
      voiceSelect.appendChild(option);
    });

    // Restore saved voice selection
    if (currentSettings.voiceURI) {
      const savedVoice = sortedVoices.find(v => v.voiceURI === currentSettings.voiceURI);
      if (savedVoice) {
        voiceSelect.value = currentSettings.voiceURI;
      } else {
        // Saved voice not found, use first available
        voiceSelect.selectedIndex = 0;
        currentSettings.voiceURI = voiceSelect.value;
        saveSettings();
      }
    } else {
      // No saved voice, use first available
      voiceSelect.selectedIndex = 0;
      currentSettings.voiceURI = voiceSelect.value;
      saveSettings();
    }

    console.log(`[WebTalk TTS] Loaded ${availableVoices.length} voices`);
  }

  /**
   * Set up event listeners for all controls
   */
  function setupEventListeners() {
    // Voice selection change
    voiceSelect.addEventListener('change', () => {
      currentSettings.voiceURI = voiceSelect.value;
      saveSettings();
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

    // Pitch slider change
    pitchSlider.addEventListener('input', () => {
      const pitch = parseFloat(pitchSlider.value);
      currentSettings.pitch = pitch;
      pitchValue.textContent = pitch.toFixed(1);
    });

    pitchSlider.addEventListener('change', () => {
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

      pitchSlider.value = currentSettings.pitch;
      pitchValue.textContent = currentSettings.pitch.toFixed(1);

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
  function testVoice() {
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const testText = 'Hello! This is a test of the WebTalk text-to-speech voice.';
    const utterance = new SpeechSynthesisUtterance(testText);

    // Apply current settings
    utterance.rate = currentSettings.rate;
    utterance.pitch = currentSettings.pitch;

    // Find and set the selected voice
    const selectedVoice = availableVoices.find(v => v.voiceURI === currentSettings.voiceURI);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    // Update button state during playback
    testVoiceBtn.disabled = true;
    testVoiceBtn.textContent = 'Speaking...';

    utterance.onend = () => {
      testVoiceBtn.disabled = false;
      testVoiceBtn.textContent = 'Test Voice';
    };

    utterance.onerror = (event) => {
      console.error('[WebTalk TTS] Speech error:', event.error);
      testVoiceBtn.disabled = false;
      testVoiceBtn.textContent = 'Test Voice';
    };

    // Speak the test text
    window.speechSynthesis.speak(utterance);
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
