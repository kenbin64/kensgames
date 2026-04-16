/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ANPC HISTORY TRACKER — Dialog Manifold
 * ═══════════════════════════════════════════════════════════════════════════
 * Prevents repetition of dialog patterns across game sessions.
 * Tracks n-grams, pattern usage, and lexical combinations.
 *
 * Architecture:
 *   1. Pattern History: Track used pattern keys
 *   2. Phrase History: Track n-gram combinations
 *   3. Penalty System: Weight against recent usage
 *   4. Session Seed: Unique seed per game for variation
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SFHistory = (function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // § 1. HISTORY STORAGE
  // ═══════════════════════════════════════════════════════════════════════════

  const _history = {
    // Session seed - unique per game
    sessionSeed: Date.now() + Math.random(),

    // Pattern usage tracking
    patterns: new Map(),        // patternKey → timestamp
    patternCounts: new Map(),   // patternKey → use count

    // Phrase tracking (n-grams)
    trigrams: new Set(),        // 3-word sequences
    bigrams: new Set(),         // 2-word sequences

    // Recent topics (for topic suppression)
    recentTopics: [],           // Last 10 topics
    maxTopics: 10,

    // Intent tracking
    recentIntents: [],          // Last 5 intents
    maxIntents: 5
  };

  const CONFIG = {
    // Time-based penalties (in seconds)
    PATTERN_COOLDOWN: 30,       // Don't repeat same pattern within 30s
    TOPIC_COOLDOWN: 45,         // Don't repeat same topic within 45s

    // Usage-based penalties
    MAX_PATTERN_USES: 3,        // Max times to use a pattern per game

    // History window sizes
    TRIGRAM_WINDOW: 100,        // Keep last 100 trigrams
    BIGRAM_WINDOW: 200,         // Keep last 200 bigrams
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // § 2. N-GRAM EXTRACTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extract n-grams from a text string
   * @param {string} text - Dialog text
   * @param {number} n - N-gram size (2 or 3)
   * @returns {Array<string>} - Array of n-grams
   */
  function _extractNGrams(text, n) {
    // Normalize: lowercase, remove punctuation
    const normalized = text.toLowerCase().replace(/[^\w\s]/g, '');
    const words = normalized.split(/\s+/).filter(w => w.length > 0);

    const ngrams = [];
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.push(words.slice(i, i + n).join(' '));
    }
    return ngrams;
  }

  /**
   * Check if text contains recently used n-grams
   * @param {string} text - Dialog text to check
   * @returns {number} - Overlap score (0-1, higher = more overlap)
   */
  function _checkNGramOverlap(text) {
    const trigrams = _extractNGrams(text, 3);
    const bigrams = _extractNGrams(text, 2);

    let overlap = 0;
    let total = 0;

    // Check trigrams
    for (const tri of trigrams) {
      total++;
      if (_history.trigrams.has(tri)) overlap++;
    }

    // Check bigrams (weighted less)
    for (const bi of bigrams) {
      total++;
      if (_history.bigrams.has(bi)) overlap += 0.5;
    }

    return total > 0 ? overlap / total : 0;
  }

  /**
   * Record n-grams from text
   * @param {string} text - Dialog text
   */
  function _recordNGrams(text) {
    const trigrams = _extractNGrams(text, 3);
    const bigrams = _extractNGrams(text, 2);

    // Add to history (with sliding window)
    for (const tri of trigrams) {
      _history.trigrams.add(tri);
    }
    for (const bi of bigrams) {
      _history.bigrams.add(bi);
    }

    // Trim to window size (convert to array, slice, reconvert)
    if (_history.trigrams.size > CONFIG.TRIGRAM_WINDOW) {
      const arr = Array.from(_history.trigrams);
      _history.trigrams = new Set(arr.slice(-CONFIG.TRIGRAM_WINDOW));
    }
    if (_history.bigrams.size > CONFIG.BIGRAM_WINDOW) {
      const arr = Array.from(_history.bigrams);
      _history.bigrams = new Set(arr.slice(-CONFIG.BIGRAM_WINDOW));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § 3. PATTERN TRACKING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if pattern is on cooldown
   * @param {string} patternKey - Pattern key
   * @returns {boolean} - True if pattern should be avoided
   */
  function isPatternOnCooldown(patternKey) {
    if (!_history.patterns.has(patternKey)) return false;

    const lastUsed = _history.patterns.get(patternKey);
    const now = performance.now() / 1000;
    return (now - lastUsed) < CONFIG.PATTERN_COOLDOWN;
  }

  /**
   * Check if pattern has been overused
   * @param {string} patternKey - Pattern key
   * @returns {boolean} - True if pattern is overused
   */
  function isPatternOverused(patternKey) {
    const count = _history.patternCounts.get(patternKey) || 0;
    return count >= CONFIG.MAX_PATTERN_USES;
  }

  /**
   * Record pattern usage
   * @param {string} patternKey - Pattern key
   */
  function recordPattern(patternKey) {
    const now = performance.now() / 1000;
    _history.patterns.set(patternKey, now);

    const count = _history.patternCounts.get(patternKey) || 0;
    _history.patternCounts.set(patternKey, count + 1);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § 4. TOPIC TRACKING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if topic was recently used
   * @param {string} topic - Topic identifier
   * @returns {boolean} - True if topic is recent
   */
  function isTopicRecent(topic) {
    return _history.recentTopics.includes(topic);
  }

  /**
   * Record topic usage
   * @param {string} topic - Topic identifier
   */
  function recordTopic(topic) {
    _history.recentTopics.push(topic);
    if (_history.recentTopics.length > _history.maxTopics) {
      _history.recentTopics.shift();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § 5. INTENT TRACKING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if intent was recently used
   * @param {string} intent - Intent key
   * @returns {boolean} - True if intent is recent
   */
  function isIntentRecent(intent) {
    return _history.recentIntents.includes(intent);
  }

  /**
   * Record intent usage
   * @param {string} intent - Intent key
   */
  function recordIntent(intent) {
    _history.recentIntents.push(intent);
    if (_history.recentIntents.length > _history.maxIntents) {
      _history.recentIntents.shift();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § 6. COMPOSITE SCORING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calculate penalty score for a generated dialog line
   * @param {string} text - Generated dialog
   * @param {string} patternKey - Pattern used
   * @param {string} intent - Intent key
   * @returns {number} - Penalty score (0-1, higher = worse)
   */
  function calculatePenalty(text, patternKey, intent) {
    let penalty = 0;

    // Pattern penalties
    if (isPatternOnCooldown(patternKey)) penalty += 0.5;
    if (isPatternOverused(patternKey)) penalty += 0.8;

    // Intent penalties
    if (isIntentRecent(intent)) penalty += 0.3;

    // N-gram overlap penalty
    const ngramOverlap = _checkNGramOverlap(text);
    penalty += ngramOverlap * 0.4;

    return Math.min(penalty, 1.0);
  }

  /**
   * Record successful dialog generation
   * @param {string} text - Generated dialog
   * @param {string} patternKey - Pattern used
   * @param {string} intent - Intent key
   * @param {string} topic - Topic (optional)
   */
  function recordDialog(text, patternKey, intent, topic = null) {
    recordPattern(patternKey);
    recordIntent(intent);
    _recordNGrams(text);
    if (topic) recordTopic(topic);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § 7. RESET & UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Reset history (new game session)
   */
  function reset() {
    _history.sessionSeed = Date.now() + Math.random();
    _history.patterns.clear();
    _history.patternCounts.clear();
    _history.trigrams.clear();
    _history.bigrams.clear();
    _history.recentTopics = [];
    _history.recentIntents = [];
  }

  /**
   * Get session seed (for deterministic variation)
   */
  function getSessionSeed() {
    return _history.sessionSeed;
  }

  /**
   * Get statistics (for debugging)
   */
  function getStats() {
    return {
      totalPatterns: _history.patterns.size,
      totalTrigrams: _history.trigrams.size,
      totalBigrams: _history.bigrams.size,
      recentTopics: _history.recentTopics.length,
      recentIntents: _history.recentIntents.length,
      sessionSeed: _history.sessionSeed
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § 8. PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  return {
    // Pattern tracking
    isPatternOnCooldown,
    isPatternOverused,
    recordPattern,

    // Topic tracking
    isTopicRecent,
    recordTopic,

    // Intent tracking
    isIntentRecent,
    recordIntent,

    // Composite functions
    calculatePenalty,
    recordDialog,

    // Utilities
    reset,
    getSessionSeed,
    getStats
  };
})();

// Expose globally
window.SFHistory = SFHistory;
