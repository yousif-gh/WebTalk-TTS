/**
 * WebTalk TTS - Content Script
 * Handles text-to-speech functionality on web pages
 */

(function() {
  'use strict';

  // Basic speechSynthesis "Hello World" test
  function speakHello() {
    // Check if speechSynthesis is supported
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance('Hello');
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      // Speak the utterance
      window.speechSynthesis.speak(utterance);
      console.log('[WebTalk TTS] Speech synthesis initialized - "Hello" spoken');
    } else {
      console.warn('[WebTalk TTS] Speech synthesis not supported in this browser');
    }
  }

  // Run when the page loads
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    speakHello();
  } else {
    document.addEventListener('DOMContentLoaded', speakHello);
  }
})();
