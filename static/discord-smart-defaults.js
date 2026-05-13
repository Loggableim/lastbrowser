/**
 * Discord Smart-Defaults Engine
 *
 * Context-based suggestion engine for the moderation Reason textarea.
 * Analyses user history, recent messages, and channel context to suggest
 * appropriate moderation reasons — 100% frontend, no LLM needed.
 *
 * Usage:
 *   const engine = new SmartDefaultEngine();
 *   const suggestions = engine.generate(userId, memberCache, messageCache, warns, config);
 *   // => [{ label, source }, ...]  max 4
 */

(function () {
  'use strict';

  /* ---------- abuse keyword patterns ---------- */
  var ABUSE_KEYWORDS = [
    { pattern: /https?:\/\//i, label: 'Externer Link / Werbung' },
    { pattern: /@everyone|@here/i, label: '@everyone Spam' },
    { pattern: /discord\.(gg|com\/invite)/i, label: 'Werbung / Invite-Spam' },
    { pattern: /gratis|kostenlos|coins|free|gewinnen/i, label: 'Spam-Verdacht' },
  ];

  /* ---------- insult word list ---------- */
  var INSULTS = [
    'hurensohn', 'opfer', 'bastard', 'idiot', 'trottel', 'depp',
    'fick', 'scheisse', 'arsch', 'wichser', 'faggot', 'nigger',
    'fuck', 'shit', 'bitch', 'asshole', 'dick', 'retard',
  ];

  /** ---------- Static Templates ---------- */
  var STATIC_TEMPLATES = ['Spam', 'Werbung', 'Beleidigung'];

  /* ---------- SmartDefaultEngine ---------- */
  function SmartDefaultEngine() {
    this.templates = STATIC_TEMPLATES.slice();
    this.abuseKeywords = ABUSE_KEYWORDS;
    this.insults = INSULTS;
  }

  /**
   * Generate up to 4 suggestions for a given user.
   *
   * @param {string} userId  Discord User-ID
   * @param {Array}  memberCache  _memberCache from discord-chat.js
   * @param {Object} messageCache _messageCache from discord-chat.js
   * @param {Object} warns        Raw warns data (guild_id → user_id → array)
   * @param {Object} [config]     Optional config (spam_threshold etc.)
   * @returns {Array<{label:string, source:string}>}
   */
  SmartDefaultEngine.prototype.generate = function (userId, memberCache, messageCache, warns, config) {
    var suggestions = [];

    // 1. Static templates (always present as fallback)
    suggestions.push.apply(suggestions, this.templates.map(function (t) {
      return { label: t, source: 'template' };
    }));

    // 2. User history: most frequent warn reason
    var userWarns = this._getUserWarns(userId, warns);
    if (userWarns && userWarns.length > 0) {
      var topReason = this._getTopWarnReason(userWarns);
      if (topReason && userWarns.length >= 2) {
        suggestions.unshift({ label: '\u26a0 Wied' + 'erholt: ' + topReason, source: 'history' });
      }

      // 2b. Count-based threshold warning
      var threshold = (config && config.spam_threshold) || 5;
      if (userWarns.length >= threshold) {
        // Push AFTER the "wiederholt" check, but keep within 4
        suggestions.push({ label: '\u26a0 ' + userWarns.length + '. Verwarnung', source: 'history' });
      }
    }

    // 3. Context analysis from last user message
    var messages = this._getUserMessages(userId, messageCache);
    if (messages && messages.length > 0) {
      // Take the most recent message(s) — up to last 3
      var recentMsgs = messages.slice(-3);
      var combinedContent = '';
      for (var mi = 0; mi < recentMsgs.length; mi++) {
        var msg = recentMsgs[mi];
        combinedContent += (msg.content || '') + '\n';
      }

      // 3a. Check abuse keywords
      for (var ki = 0; ki < this.abuseKeywords.length; ki++) {
        var kw = this.abuseKeywords[ki];
        if (kw.pattern.test(combinedContent)) {
          suggestions.push({ label: kw.label, source: 'context' });
        }
      }

      // 3b. Check insult words
      if (this._containsInsult(combinedContent)) {
        suggestions.push({ label: 'Beleidigung / Beschimpfung', source: 'context' });
      }

      // 3c. Repeated spam detection
      if (this._isRepeatedSpam(messages)) {
        suggestions.push({ label: 'Spam (wiederholt)', source: 'detect' });
      }
    }

    // 4. Deduplicate (same label text → keep first occurrence)
    suggestions = this._dedupe(suggestions);

    // 5. Max 4, put statics last (history + context should rank higher)
    return suggestions.slice(0, 4);
  };

  /**
   * Extract warns array for a specific user from the nested warns object.
   * Structure: warns[guildId][userId] = [{reason, moderator, time}, ...]
   */
  SmartDefaultEngine.prototype._getUserWarns = function (userId, warns) {
    if (!warns) return [];
    // warns could be an object with guild keys, or a flat array
    if (Array.isArray(warns)) return warns;

    if (typeof warns === 'object') {
      // Try to find this user in any guild
      var guildKeys = Object.keys(warns);
      for (var gi = 0; gi < guildKeys.length; gi++) {
        var guild = warns[guildKeys[gi]];
        if (guild && guild[userId] && Array.isArray(guild[userId])) {
          return guild[userId];
        }
      }
    }
    return [];
  };

  /**
   * Return the most common reason string from a user's warn array.
   */
  SmartDefaultEngine.prototype._getTopWarnReason = function (userWarns) {
    if (!userWarns || userWarns.length === 0) return null;

    var freq = {};
    var maxCount = 0;
    var topReason = null;

    for (var i = 0; i < userWarns.length; i++) {
      var reason = userWarns[i].reason || 'Unbekannt';
      freq[reason] = (freq[reason] || 0) + 1;
      if (freq[reason] > maxCount) {
        maxCount = freq[reason];
        topReason = reason;
      }
    }
    return topReason;
  };

  /**
   * Get messages from the cache that belong to a specific user.
   * messageCache is keyed by channelId: {channelId: [{author, content, ...}]}
   * We search across all channels.
   */
  SmartDefaultEngine.prototype._getUserMessages = function (userId, messageCache) {
    if (!messageCache) return [];

    var result = [];
    var channelKeys = Object.keys(messageCache);

    for (var ci = 0; ci < channelKeys.length; ci++) {
      var msgs = messageCache[channelKeys[ci]];
      if (!Array.isArray(msgs)) continue;

      for (var mi = 0; mi < msgs.length; mi++) {
        var msg = msgs[mi];
        // author could be an object {id: ..., username:...} or a string
        var authorId = null;
        if (typeof msg.author === 'object' && msg.author !== null) {
          authorId = msg.author.id || msg.author.username;
        } else if (typeof msg.author === 'string') {
          authorId = msg.author;
        }
        if (authorId === userId) {
          result.push(msg);
        }
      }
    }

    return result;
  };

  /**
   * Check if the user posted the same message content 3+ times in the last 10 messages.
   */
  SmartDefaultEngine.prototype._isRepeatedSpam = function (messages) {
    if (!messages || messages.length < 3) return false;

    // Look at the last 10 messages
    var recent = messages.slice(-10);
    var contentCount = {};

    for (var i = 0; i < recent.length; i++) {
      var content = recent[i].content || '';
      if (content.length < 3) continue; // ignore very short messages

      contentCount[content] = (contentCount[content] || 0) + 1;
      if (contentCount[content] >= 3) return true;
    }

    return false;
  };

  /**
   * Check if combined content contains any insult keywords.
   */
  SmartDefaultEngine.prototype._containsInsult = function (text) {
    if (!text) return false;
    var lower = text.toLowerCase();
    for (var i = 0; i < this.insults.length; i++) {
      if (lower.indexOf(this.insults[i]) !== -1) {
        return true;
      }
    }
    return false;
  };

  /**
   * Remove duplicate labels keeping the first occurrence.
   */
  SmartDefaultEngine.prototype._dedupe = function (arr) {
    var seen = {};
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var label = arr[i].label;
      if (!seen[label]) {
        seen[label] = true;
        out.push(arr[i]);
      }
    }
    return out;
  };

  /* ============================================================
     DOM Helpers — Chip Rendering
     ============================================================ */

  /**
   * Render suggestion chips into a container element.
   * @param {string} containerId  Element ID
   * @param {Array<{label:string, source:string}>} suggestions
   */
  function renderSmartChips(containerId, suggestions) {
    var chipsEl = document.getElementById(containerId);
    if (!chipsEl) return;

    if (!suggestions || suggestions.length === 0) {
      chipsEl.innerHTML =
        '<span class="discord-smart-chip" style="opacity:0.5;cursor:default;">Keine Vorschl\u00e4ge</span>';
      return;
    }

    chipsEl.innerHTML = suggestions
      .map(function (s) {
        return (
          '<span class="discord-smart-chip" onclick="window.applySmartDefault(' +
          "'" + escAttr(s.label) + "'" +
          ')">' + escHtml(s.label) + '</span>'
        );
      })
      .join('');
  }

  /**
   * Fill the Reason textarea with a chosen suggestion.
   * @param {string} reason
   */
  function applySmartDefault(reason) {
    var textarea = document.getElementById('discordOvModReason');
    if (textarea) textarea.value = reason;
  }

  /* ---------- small helpers ---------- */
  function escHtml(str) {
    var d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function escAttr(str) {
    return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  /* ---------- Smart-Defaults Loader ---------- */

  /**
   * Load Smart-Defaults for a selected user.
   * Called after a member is selected in the autocomplete dropdown.
   * @param {string} userId
   */
  window.loadSmartDefaults = async function (userId) {
    var chipsEl = document.getElementById('discordOvSmartChips');
    if (!chipsEl) return;

    // Show loading indicator
    chipsEl.innerHTML =
      '<span class="discord-smart-chip discord-smart-chip-loading">\u23f3 Analysiere...</span>';

    // Load warns from cache or API
    var warns = window.__warnsCache;
    if (!warns) {
      try {
        var resp = await fetch('/api/discord' + '/warns');
        window.__warnsCache = await resp.json();
        warns = window.__warnsCache;
      } catch (_e) {
        warns = {};
      }
    }

    // Run engine
    var engine = new SmartDefaultEngine();
    var suggestions = engine.generate(
      userId,
      (typeof _memberCache !== 'undefined') ? _memberCache : [],
      (typeof _messageCache !== 'undefined') ? _messageCache : {},
      warns || {},
      null // config optional
    );

    renderSmartChips('discordOvSmartChips', suggestions);
  };

  /* Make available globally */
  window.SmartDefaultEngine = SmartDefaultEngine;
  window.renderSmartChips = renderSmartChips;
  window.applySmartDefault = applySmartDefault;
})();
