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

/**
 * Split text into chunks suitable for speech synthesis
 * - Splits by sentence boundaries (., !, ?, etc.)
 * - Ensures no chunk exceeds maxChunkSize characters
 * - If a sentence is longer than maxChunkSize, splits at word boundaries
 * - Preserves sentence meaning and flow
 *
 * @param {string} text - The text to chunk
 * @param {number} maxChunkSize - Maximum characters per chunk (default 200)
 * @returns {string[]} - Array of text chunks
 */
function chunkTextForSpeech(text, maxChunkSize = 200) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  // Clean the text first
  const cleanedText = cleanTextForSpeech(text);

  if (!cleanedText) {
    return [];
  }

  // If text is short enough, return as single chunk
  if (cleanedText.length <= maxChunkSize) {
    return [cleanedText];
  }

  const chunks = [];

  // Split by sentence boundaries - match sentences ending with . ! ? or other terminators
  // Also handles abbreviations and edge cases
  const sentenceRegex = /[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g;
  const sentences = cleanedText.match(sentenceRegex) || [cleanedText];

  let currentChunk = '';

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();

    if (!trimmedSentence) {
      continue;
    }

    // If sentence itself exceeds max size, split at word boundaries
    if (trimmedSentence.length > maxChunkSize) {
      // First, push any accumulated chunk
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      // Split long sentence at word boundaries
      const words = trimmedSentence.split(/\s+/);
      let wordChunk = '';

      for (const word of words) {
        // If a single word exceeds max size, split it (rare case)
        if (word.length > maxChunkSize) {
          if (wordChunk) {
            chunks.push(wordChunk.trim());
            wordChunk = '';
          }
          // Split long word into pieces
          for (let i = 0; i < word.length; i += maxChunkSize) {
            chunks.push(word.substring(i, i + maxChunkSize));
          }
        } else if ((wordChunk + ' ' + word).trim().length > maxChunkSize) {
          // Adding this word would exceed limit
          if (wordChunk) {
            chunks.push(wordChunk.trim());
          }
          wordChunk = word;
        } else {
          wordChunk = wordChunk ? wordChunk + ' ' + word : word;
        }
      }

      // Push remaining words from long sentence
      if (wordChunk) {
        chunks.push(wordChunk.trim());
      }
    } else if ((currentChunk + ' ' + trimmedSentence).trim().length > maxChunkSize) {
      // Adding this sentence would exceed limit - push current chunk and start new one
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = trimmedSentence;
    } else {
      // Add sentence to current chunk
      currentChunk = currentChunk ? currentChunk + ' ' + trimmedSentence : trimmedSentence;
    }
  }

  // Push any remaining chunk
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  // Filter out any empty chunks
  return chunks.filter(chunk => chunk.length > 0);
}

// Export functions for use in other scripts
// Using window object for content script compatibility
if (typeof window !== 'undefined') {
  window.WebTalkUtils = {
    cleanTextForSpeech,
    truncateText,
    isValidTextForSpeech,
    chunkTextForSpeech
  };
}
