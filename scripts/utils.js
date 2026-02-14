/**
 * WebTalk TTS - Utility Functions
 * Text cleaning and processing utilities for TTS
 */

/**
 * Clean text for speech synthesis
 * - Removes extra whitespace
 * - Normalizes unicode characters
 * - Removes control characters
 * - Trims leading/trailing whitespace
 *
 * @param {string} text - The raw text to clean
 * @returns {string} - Cleaned text ready for speech synthesis
 */
function cleanTextForSpeech(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    // Normalize unicode (NFC form - canonical decomposition followed by canonical composition)
    .normalize('NFC')
    // Replace multiple whitespace characters (spaces, tabs, newlines) with single space
    .replace(/\s+/g, ' ')
    // Remove control characters except common whitespace
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
    // Trim leading and trailing whitespace
    .trim();
}

/**
 * Truncate text to a maximum length for preview purposes
 *
 * @param {string} text - The text to truncate
 * @param {number} maxLength - Maximum character length (default 100)
 * @returns {string} - Truncated text with ellipsis if needed
 */
function truncateText(text, maxLength = 100) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength).trim() + '...';
}

/**
 * Check if text is valid for speech synthesis
 *
 * @param {string} text - The text to validate
 * @returns {boolean} - True if text is valid for speech
 */
function isValidTextForSpeech(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const cleaned = cleanTextForSpeech(text);
  // Must have at least some content after cleaning
  return cleaned.length > 0;
}

// Export functions for use in other scripts
// Using window object for content script compatibility
if (typeof window !== 'undefined') {
  window.WebTalkUtils = {
    cleanTextForSpeech,
    truncateText,
    isValidTextForSpeech
  };
}
