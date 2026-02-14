/**
 * WebTalk TTS - Popup Script
 * Handles voice selection, settings management, and user preferences
 */

(function() {
  'use strict';

  // DOM Elements
  const voiceSelect = document.getElementById('voice-select');
  const rateSlider = document.getElementById('rate-slider');
  const rateValue = document.getElementById('rate-value');
  const pitchSlider = document.getElementById('pitch-slider');
  const pitchValue = document.getElementById('pitch-value');
  const testVoiceBtn = document.getElementById('test-voice-btn');

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
