(function (initialDict, reloadDictFn, fetchDirectQuotaFn, fetchDirectContextFn) {
  'use strict';

  const STORAGE_KEY = 'agy_ui_lang';
  const QUOTA_CACHE_KEY = 'agy_quota_cache_v1';
  let activeContextData = null;
  let dict = { exact: {}, placeholders: {}, patterns: [] };
  let compiledPatterns = [];

  function applyDict(parsed) {
    if (!parsed || typeof parsed !== 'object') return;
    dict = {
      exact: parsed.exact || {},
      placeholders: parsed.placeholders || {},
      patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
    };
    compiledPatterns = dict.patterns
      .map((p) => {
        try {
          return { re: new RegExp(p.regex), replace: p.replace };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  applyDict(initialDict);

  function loadDict() {
    if (typeof reloadDictFn === 'function') {
      try {
        const fresh = reloadDictFn();
        if (fresh) applyDict(fresh);
      } catch {
        // ignore
      }
    }
  }

  const origTextMap = new WeakMap();
  const origAttrMap = new WeakMap();

  const SKIP_TAGS = new Set([
    'SCRIPT',
    'STYLE',
    'NOSCRIPT',
    'CODE',
    'PRE',
    'TEXTAREA',
    'INPUT',
    'SVG',
    'CANVAS',
    'MATH',
  ]);

  function shouldSkipElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.isContentEditable) return true;
    if (el.hasAttribute && el.hasAttribute('data-no-i18n')) return true;
    if (el.closest) {
      if (
        el.closest(
          'code, pre, textarea, .monaco-editor, .cm-editor, .xterm, [contenteditable="true"], [data-no-i18n]'
        )
      ) {
        return true;
      }
    }
    return false;
  }

  function translateString(str, isPlaceholder = false) {
    if (!str) return str;
    const trimmed = str.trim();
    if (!trimmed) return str;

    let translated = null;
    if (isPlaceholder && dict.placeholders[trimmed]) {
      translated = dict.placeholders[trimmed];
    } else if (dict.exact[trimmed]) {
      translated = dict.exact[trimmed];
    } else {
      for (const p of compiledPatterns) {
        if (p.re.test(trimmed)) {
          translated = trimmed.replace(p.re, p.replace);
          break;
        }
      }
    }

    if (!translated) return str;
    const leading = str.slice(0, str.indexOf(trimmed));
    const trailing = str.slice(str.indexOf(trimmed) + trimmed.length);
    return leading + translated + trailing;
  }

  function getLang() {
    try {
      return window.localStorage?.getItem(STORAGE_KEY) || 'vi';
    } catch {
      return 'vi';
    }
  }

  function setLang(lang) {
    try {
      window.localStorage?.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore
    }
  }

  function processTextNode(node, lang) {
    const parent = node.parentElement;
    if (!parent || shouldSkipElement(parent)) return;

    const current = node.nodeValue;
    if (!current || !current.trim()) return;

    if (!origTextMap.has(node)) {
      origTextMap.set(node, current);
    } else {
      const prevOrig = origTextMap.get(node);
      const expectedVi = translateString(prevOrig, false);
      if (current !== prevOrig && current !== expectedVi) {
        origTextMap.set(node, current);
      }
    }

    const orig = origTextMap.get(node);
    const target = lang === 'vi' ? translateString(orig, false) : orig;
    if (node.nodeValue !== target) {
      node.nodeValue = target;
    }
  }

  const TRANSLATABLE_ATTRS = ['placeholder', 'data-placeholder', 'aria-label', 'title'];

  function processElementAttrs(el, lang) {
    if (!el || el.nodeType !== 1) return;
    if (el.hasAttribute && el.hasAttribute('data-no-i18n')) return;
    if (el.closest && el.closest('[data-no-i18n]')) return;

    let store = origAttrMap.get(el);
    if (!store) {
      store = {};
      origAttrMap.set(el, store);
    }

    for (const attr of TRANSLATABLE_ATTRS) {
      if (!el.hasAttribute(attr)) continue;
      const val = el.getAttribute(attr);
      if (!val || !val.trim()) continue;

      const isPh = attr === 'placeholder' || attr === 'data-placeholder';
      if (!(attr in store)) {
        store[attr] = val;
      } else {
        const prevOrig = store[attr];
        const expectedVi = translateString(prevOrig, isPh);
        if (val !== prevOrig && val !== expectedVi) {
          store[attr] = val;
        }
      }

      const orig = store[attr];
      const target = lang === 'vi' ? translateString(orig, isPh) : orig;
      if (el.getAttribute(attr) !== target) {
        el.setAttribute(attr, target);
      }
    }
  }

  function walkAndTranslate(root, lang) {
    if (!root) return;
    if (root.nodeType === 3) {
      processTextNode(root, lang);
      return;
    }
    if (root.nodeType !== 1) return;
    if (root.hasAttribute && root.hasAttribute('data-no-i18n')) return;

    processElementAttrs(root, lang);
    if (shouldSkipElement(root)) return;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      null
    );
    let cur = walker.nextNode();
    while (cur) {
      if (cur.nodeType === 3) {
        processTextNode(cur, lang);
      } else if (cur.nodeType === 1) {
        processElementAttrs(cur, lang);
      }
      cur = walker.nextNode();
    }
  }

  // ---------------- Quota Panel ----------------
  function loadQuotaCache() {
    try {
      const raw = window.localStorage?.getItem(QUOTA_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveQuotaCache(data) {
    try {
      window.localStorage?.setItem(QUOTA_CACHE_KEY, JSON.stringify(data));
    } catch {
      // ignore
    }
  }

  function formatResetDelta(isoOrTime) {
    if (!isoOrTime) return '';
    let targetMs = 0;
    if (typeof isoOrTime === 'object' && isoOrTime !== null) {
      const sec = Number(isoOrTime.seconds || isoOrTime.seconds_ || 0);
      if (sec > 0) targetMs = sec * 1000;
    } else if (typeof isoOrTime === 'number') {
      targetMs = isoOrTime > 1e11 ? isoOrTime : isoOrTime * 1000;
    } else if (typeof isoOrTime === 'string') {
      targetMs = Date.parse(isoOrTime);
      if (Number.isNaN(targetMs) && /^\d+$/.test(isoOrTime.trim())) {
        const num = Number(isoOrTime.trim());
        targetMs = num > 1e11 ? num : num * 1000;
      }
    }
    if (!targetMs || !Number.isFinite(targetMs)) return '';
    const ms = targetMs - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return '';
    const totalMin = Math.floor(ms / 60000);
    const d = Math.floor(totalMin / (60 * 24));
    const h = Math.floor((totalMin % (60 * 24)) / 60);
    const m = totalMin % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function formatQuotaDisplayLabel(item, lang) {
    let grp = item.group || 'Model';
    let lbl = item.label || 'Limit';
    if (/gemini/i.test(grp)) grp = 'Gemini';
    else if (/claude|gpt/i.test(grp)) grp = 'Claude & GPT';

    if (lang === 'vi') {
      if (/week|tuần/i.test(lbl)) lbl = 'Tuần';
      else if (/(\d+)\s*(-hour|hour|h)/i.test(lbl)) {
        const m = lbl.match(/(\d+)\s*(-hour|hour|h)/i);
        lbl = `${m[1]}h`;
      } else if (/day|ngày/i.test(lbl)) lbl = 'Ngày';
    } else {
      if (/week/i.test(lbl)) lbl = 'Weekly';
      else if (/(\d+)\s*(-hour|hour|h)/i.test(lbl)) {
        const m = lbl.match(/(\d+)\s*(-hour|hour|h)/i);
        lbl = `${m[1]}h`;
      } else if (/day/i.test(lbl)) lbl = 'Daily';
    }
    return `${grp} (${lbl})`;
  }

  function sortQuotaItems(items) {
    function getRank(it) {
      const g = (it.group || '').toLowerCase();
      const l = (it.label || '').toLowerCase();
      const isGemini = g.includes('gemini');
      const isClaudeGpt = g.includes('claude') || g.includes('gpt');
      const isWeek = l.includes('week') || l.includes('tuần');
      const is5h = l.includes('5') || l.includes('hour') || l.includes('h');

      if (isGemini && isWeek) return 1;
      if (isGemini && is5h) return 2;
      if (isGemini) return 3;
      if (isClaudeGpt && isWeek) return 4;
      if (isClaudeGpt && is5h) return 5;
      if (isClaudeGpt) return 6;
      return 10;
    }
    return items.slice().sort((a, b) => getRank(a) - getRank(b));
  }

  function ensureFourQuotaLines(items) {
    if (!Array.isArray(items) || items.length === 0) return items;
    const hasGeminiWeek = items.some(it => /gemini/i.test(it.group) && /week|tuần/i.test(it.label));
    const hasGemini5h = items.some(it => /gemini/i.test(it.group) && /5|hour/i.test(it.label));
    const hasCgWeek = items.some(it => /claude|gpt/i.test(it.group) && /week|tuần/i.test(it.label));
    const hasCg5h = items.some(it => /claude|gpt/i.test(it.group) && /5|hour/i.test(it.label));

    const result = [...items];
    const geminiEx = items.find(it => /gemini/i.test(it.group));
    const cgEx = items.find(it => /claude|gpt/i.test(it.group));

    if (!hasGeminiWeek && geminiEx) {
      result.push({
        group: 'Gemini Models',
        label: 'Weekly limit',
        pct: 100,
        reset: '',
      });
    }
    if (!hasGemini5h && geminiEx) {
      result.push({
        group: 'Gemini Models',
        label: '5-hour limit',
        pct: geminiEx.pct,
        reset: geminiEx.reset,
      });
    }
    if (!hasCgWeek && cgEx) {
      result.push({
        group: 'Claude and GPT models',
        label: 'Weekly limit',
        pct: 100,
        reset: '',
      });
    }
    if (!hasCg5h && cgEx) {
      result.push({
        group: 'Claude and GPT models',
        label: '5-hour limit',
        pct: cgEx.pct,
        reset: cgEx.reset,
      });
    }
    return sortQuotaItems(result);
  }

  function scrapeUsagePopoverFromDom() {
    // Deprecated in favor of direct language-server RPC
  }

  function findSettingsAnchor() {
    const candidates = document.querySelectorAll('button, [role="button"], a');
    for (const el of candidates) {
      if (el.closest('[data-no-i18n]')) continue;
      const txt = (el.textContent || '').trim();
      if (txt !== 'Cài đặt' && txt !== 'Settings') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.left < 280 && rect.bottom > window.innerHeight - 140) {
        return el;
      }
    }
    return null;
  }

  function getBarColor(pct) {
    if (pct > 50) return '#22c55e';
    if (pct > 20) return '#f59e0b';
    return '#ef4444';
  }

  function translateQuotaLabel(label, lang) {
    if (lang !== 'vi') return label;
    if (/gemini models|các mô hình gemini/i.test(label)) return 'Gemini';
    if (/claude and gpt|claude & gpt/i.test(label)) return 'Claude & GPT';
    if (/weekly limit|giới hạn tuần/i.test(label)) return 'Tuần';
    if (/daily limit|giới hạn ngày/i.test(label)) return 'Ngày';
    if (/(\d+h)\s*limit|giới hạn\s*(\d+h)/i.test(label)) {
      const m = label.match(/(\d+h)/i);
      return m ? m[1] : label;
    }
    return label;
  }

  function renderQuotaPanel(cacheOverride) {
    const anchor = findSettingsAnchor();
    if (!anchor || !anchor.parentElement) return;

    let panel = document.getElementById('agy-vi-quota-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'agy-vi-quota-panel';
      panel.setAttribute('data-no-i18n', 'true');
      Object.assign(panel.style, {
        margin: '6px 8px 4px 8px',
        padding: '8px 10px',
        borderRadius: '8px',
        border: '1px solid rgba(148,163,184,0.22)',
        background: 'rgba(128,128,128,0.08)',
        fontSize: '11px',
        lineHeight: '1.35',
        color: 'inherit',
        userSelect: 'none',
      });
      panel.addEventListener('click', (e) => {
        if (e.target && e.target.closest && e.target.closest('#agy-vi-quota-sync')) {
          fetchQuotaDirectly(true);
          fetchContextDirectly();
        }
      });
      anchor.parentElement.insertBefore(panel, anchor);
    } else if (panel.nextElementSibling !== anchor) {
      anchor.parentElement.insertBefore(panel, anchor);
    }

    const lang = getLang();
    const data = cacheOverride || loadQuotaCache();
    const ctxKey = activeContextData
      ? `${activeContextData.cascadeId}:${activeContextData.totalTokens}:${activeContextData.maxTokens}`
      : 'none';
    const renderKey = `${lang}:${data?.updatedAt || 0}:${data?.items?.length || 0}:${ctxKey}`;
    if (panel.dataset.renderKey === renderKey) {
      return;
    }
    panel.dataset.renderKey = renderKey;
    const title = lang === 'vi' ? 'Quota mô hình' : 'Model Quota';

    function buildContextRowHtml() {
      if (!activeContextData) return '';
      const total = activeContextData.totalTokens || 0;
      const maxTok = activeContextData.maxTokens || 1000000;
      const pctRaw = maxTok > 0 ? (total / maxTok) * 100 : 0;
      const pctClamped = Math.max(0, Math.min(100, pctRaw));
      const pctText = pctRaw >= 10 || pctRaw === 0 ? `${Math.round(pctRaw)}%` : `${pctRaw.toFixed(1)}%`;
      const barColor = pctRaw > 85 ? '#ef4444' : pctRaw > 60 ? '#f59e0b' : '#22c55e';
      const ctxLabel = lang === 'vi' ? 'Context phiên' : 'Session context';
      const tipTitle = activeContextData.title ? `${activeContextData.title}\n` : '';
      const tipDetail = `Input: ${activeContextData.inputTokens || 0} | Cache: ${activeContextData.cacheReadTokens || 0} | Output: ${activeContextData.outputTokens || 0}`;
      return (
        `<div title="${(tipTitle + tipDetail).replace(/"/g, '&quot;')}" style="margin-top:6px;padding-top:5px;border-top:1px solid rgba(148,163,184,0.16);">` +
        `<div style="display:flex;justify-content:space-between;gap:6px;font-size:10.5px;">` +
        `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:0.88;">${ctxLabel}</span>` +
        `<span style="font-weight:600;white-space:nowrap;">${formatTokenCount(total)} / ${formatTokenCount(maxTok)} (${pctText})</span>` +
        `</div>` +
        `<div style="height:4px;border-radius:999px;background:rgba(148,163,184,0.2);overflow:hidden;margin-top:2px;">` +
        `<div style="height:100%;width:${pctClamped}%;background:${barColor};border-radius:999px;transition:width 0.25s ease;"></div>` +
        `</div>` +
        `</div>`
      );
    }

    if (!data || !Array.isArray(data.items) || data.items.length === 0) {
      panel.innerHTML =
        `<div style="display:flex;justify-content:space-between;align-items:center;font-weight:600;opacity:0.9;margin-bottom:3px;">` +
        `<span>📊 ${title}</span>` +
        `<button id="agy-vi-quota-sync" type="button" title="${lang === 'vi' ? 'Đồng bộ Quota ngay' : 'Sync Quota now'}" style="background:none;border:none;color:inherit;cursor:pointer;padding:0 2px;font-size:12px;opacity:0.7;line-height:1;">↻</button>` +
        `</div>` +
        `<div class="agy-quota-empty-msg" style="opacity:0.65;font-size:10.5px;">${
          lang === 'vi'
            ? 'Đang đồng bộ dữ liệu...'
            : 'Syncing quota...'
        }</div>` +
        buildContextRowHtml();
      return;
    }

    // Show top 4 most relevant entries compactly
    const rowsHtml = data.items
      .slice(0, 4)
      .map((item) => {
        const fullLabel = formatQuotaDisplayLabel(item, lang);
        const color = getBarColor(item.pct);
        const resetTxt = item.reset ? ` · ${item.reset}` : '';
        return (
          `<div style="margin-top:5px;">` +
          `<div style="display:flex;justify-content:space-between;gap:6px;font-size:10.5px;">` +
          `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:0.88;">${fullLabel}</span>` +
          `<span style="font-weight:600;white-space:nowrap;">${item.pct}%${resetTxt}</span>` +
          `</div>` +
          `<div style="height:4px;border-radius:999px;background:rgba(148,163,184,0.2);overflow:hidden;margin-top:2px;">` +
          `<div style="height:100%;width:${Math.max(0, Math.min(100, item.pct))}%;background:${color};border-radius:999px;transition:width 0.25s ease;"></div>` +
          `</div>` +
          `</div>`
        );
      })
      .join('');

    panel.innerHTML =
      `<div style="display:flex;justify-content:space-between;align-items:center;font-weight:600;opacity:0.92;">` +
      `<span>📊 ${title}</span>` +
      `<span style="display:flex;align-items:center;gap:6px;">` +
      `<span style="font-size:10px;opacity:0.55;">${new Date(data.updatedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>` +
      `<button id="agy-vi-quota-sync" type="button" title="${lang === 'vi' ? 'Đồng bộ Quota ngay' : 'Sync Quota now'}" style="background:none;border:none;color:inherit;cursor:pointer;padding:0 2px;font-size:12px;opacity:0.7;line-height:1;">↻</button>` +
      `</span>` +
      `</div>` +
      rowsHtml +
      buildContextRowHtml();
  }

  function parseQuotaSummary(raw) {
    if (!raw) return null;
    const root = raw.response || raw.userQuotaSummary || raw.summary || raw;
    const groups = root.groups || root.group;
    if (Array.isArray(groups) && groups.length > 0) {
      const items = [];
      for (const g of groups) {
        const grpName = g.displayName || g.display_name || g.name || 'Model';
        const buckets = g.buckets || g.bucket || [];
        for (const b of buckets) {
          const frac = b.remainingFraction ?? b.remaining_fraction;
          if (typeof frac === 'number') {
            const pct = Math.round(frac * 100);
            const resetIso = b.resetTime || b.reset_time || '';
            const resetStr = formatResetDelta(resetIso);
            items.push({
              group: grpName,
              label: b.displayName || b.display_name || b.label || 'Limit',
              pct: pct,
              reset: resetStr,
            });
          }
        }
      }
      if (items.length > 0) return items;
    }

    const rootBuckets = root.buckets || root.bucket;
    if (Array.isArray(rootBuckets) && rootBuckets.length > 0) {
      const items = [];
      for (const b of rootBuckets) {
        const frac = b.remainingFraction ?? b.remaining_fraction;
        if (typeof frac === 'number') {
          const pct = Math.round(frac * 100);
          const resetIso = b.resetTime || b.reset_time || '';
          const resetStr = formatResetDelta(resetIso);
          items.push({
            group: b.groupName || b.group || 'Model',
            label: b.displayName || b.display_name || b.label || 'Limit',
            pct: pct,
            reset: resetStr,
          });
        }
      }
      if (items.length > 0) return items;
    }

    return null;
  }

  function extractQuotaNodes(obj, out) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (const x of obj) extractQuotaNodes(x, out);
      return;
    }
    const qi = obj.quotaInfo || obj.quota_info;
    const frac = qi?.remainingFraction ?? qi?.remaining_fraction;
    if (typeof frac === 'number') {
      out.push({
        name: obj.label || obj.displayName || obj.display_name || obj.modelOrAlias?.model || obj.model || 'Model',
        pct: Math.round(frac * 100),
        resetTime: qi.resetTime || qi.reset_time || '',
      });
    }
    for (const k of Object.keys(obj)) {
      if (obj[k] && typeof obj[k] === 'object') extractQuotaNodes(obj[k], out);
    }
  }

  let isFetchingQuota = false;
  async function fetchQuotaDirectly(manual = false) {
    if (isFetchingQuota || typeof fetchDirectQuotaFn !== 'function') return;
    isFetchingQuota = true;
    const syncIcon = document.getElementById('agy-vi-quota-sync');
    if (syncIcon) syncIcon.textContent = '⏳';
    try {
      const raw = await fetchDirectQuotaFn();
      if (raw) {
        let items = parseQuotaSummary(raw);
        if (!items) {
          const found = [];
          extractQuotaNodes(raw, found);
          if (found.length > 0) {
            items = [];
            const gemini = found.filter((x) => /gemini/i.test(x.name));
            const claudeGpt = found.filter((x) => /claude|gpt/i.test(x.name));
            if (gemini.length > 0) {
              const minG = gemini.reduce((a, b) => (a.pct <= b.pct ? a : b));
              items.push({
                group: 'Gemini Models',
                label: '5-hour limit',
                pct: minG.pct,
                reset: formatResetDelta(minG.resetTime),
              });
            }
            if (claudeGpt.length > 0) {
              const minC = claudeGpt.reduce((a, b) => (a.pct <= b.pct ? a : b));
              items.push({
                group: 'Claude and GPT models',
                label: '5-hour limit',
                pct: minC.pct,
                reset: formatResetDelta(minC.resetTime),
              });
            }
          }
        }
        if (items && items.length > 0) {
          items = ensureFourQuotaLines(sortQuotaItems(items));
          const payload = { updatedAt: Date.now(), items };
          saveQuotaCache(payload);
          renderQuotaPanel(payload);
          return;
        }
      }
      if (manual && syncIcon) {
        syncIcon.textContent = '!';
        const sub = document.querySelector('#agy-vi-quota-panel .agy-quota-empty-msg');
        if (sub) sub.textContent = 'Chưa nhận được phản hồi quota từ server';
        setTimeout(() => {
          syncIcon.textContent = '↻';
        }, 3000);
      }
    } catch {
      if (manual && syncIcon) {
        syncIcon.textContent = '!';
        setTimeout(() => {
          syncIcon.textContent = '↻';
        }, 3000);
      }
    } finally {
      if (syncIcon && syncIcon.textContent === '⏳') syncIcon.textContent = '↻';
      isFetchingQuota = false;
    }
  }

  function formatTokenCount(n) {
    if (!Number.isFinite(n) || n <= 0) return '0';
    if (n >= 1000000) {
      const m = n / 1000000;
      return `${Number.isInteger(m) ? m : m.toFixed(1).replace(/\.0$/, '')}M`;
    }
    if (n >= 1000) {
      if (n >= 100000) return `${Math.round(n / 1000)}k`;
      return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    }
    return String(n);
  }

  function getContextWindowLimit(modelStr) {
    let s = String(modelStr || '');
    if (!s || /^\d+$/.test(s)) {
      const modelBtn = document.querySelector('button[aria-label*="model" i], [data-testid*="model" i]');
      if (modelBtn && modelBtn.textContent) s = modelBtn.textContent;
    }
    if (/claude/i.test(s)) return 200000;
    if (/gpt/i.test(s)) return 128000;
    return 1000000;
  }

  function detectActiveSessionHint() {
    const uuidRe = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
    let cascadeId = '';

    const urlMatch = (window.location.href || '').match(uuidRe);
    if (urlMatch) cascadeId = urlMatch[1];

    if (!cascadeId) {
      const attrEl = document.querySelector('[data-cascade-id], [data-conversation-id], [data-trajectory-id]');
      if (attrEl) {
        const val = attrEl.getAttribute('data-cascade-id') || attrEl.getAttribute('data-conversation-id') || attrEl.getAttribute('data-trajectory-id') || '';
        const m = val.match(uuidRe);
        if (m) cascadeId = m[1];
      }
    }

    if (!cascadeId) {
      try {
        for (const store of [window.sessionStorage, window.localStorage]) {
          if (!store) continue;
          for (let i = 0; i < store.length; i++) {
            const k = store.key(i) || '';
            if (/cascade|conversation|active.*chat|selected.*thread/i.test(k)) {
              const v = store.getItem(k) || '';
              const m = v.match(uuidRe);
              if (m) { cascadeId = m[1]; break; }
            }
          }
          if (cascadeId) break;
        }
      } catch {}
    }

    const titles = [];
    const pushTitle = (t) => {
      const clean = String(t || '').replace(/\s*[-|]\s*Antigravity.*$/i, '').trim();
      if (clean && clean.length >= 2 && clean.length <= 160 && !titles.includes(clean)) {
        titles.push(clean);
      }
    };

    const activeItems = document.querySelectorAll('[aria-selected="true"], [aria-current="page"], [data-active="true"]');
    for (const el of activeItems) {
      if (el.closest('[data-no-i18n]')) continue;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (origTextMap.has(node)) pushTitle(origTextMap.get(node));
        pushTitle(node.nodeValue);
      }
      pushTitle(el.textContent);
    }

    const headers = document.querySelectorAll('header h1, header h2, header span, main h1, [role="heading"]');
    for (const el of headers) {
      if (el.closest('[data-no-i18n]')) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.top < 110 && rect.left > 200) {
        const firstText = el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild : null;
        if (firstText && origTextMap.has(firstText)) pushTitle(origTextMap.get(firstText));
        pushTitle(el.textContent);
      }
    }

    pushTitle(document.title);
    return { cascadeId, title: titles[0] || '', titles };
  }

  let isFetchingContext = false;
  async function fetchContextDirectly() {
    if (isFetchingContext || typeof fetchDirectContextFn !== 'function') return;
    isFetchingContext = true;
    try {
      const hint = detectActiveSessionHint();
      const res = await fetchDirectContextFn(hint);
      if (res && res.cascadeId) {
        const totalTokens = (res.inputTokens || 0) + (res.cacheReadTokens || 0) + (res.cacheWriteTokens || 0);
        const maxTokens = getContextWindowLimit(res.model);
        activeContextData = {
          cascadeId: res.cascadeId,
          title: res.title || '',
          totalTokens,
          maxTokens,
          inputTokens: res.inputTokens || 0,
          cacheReadTokens: res.cacheReadTokens || 0,
          outputTokens: res.outputTokens || 0,
        };
        renderQuotaPanel();
      }
    } catch {
      // ignore
    } finally {
      isFetchingContext = false;
    }
  }

  // ---------------- Language Toggle Pill ----------------
  let toggleBtn = null;

  function updateToggleBadge(lang) {
    if (!toggleBtn) return;
    toggleBtn.textContent = lang === 'vi' ? '🌐 VI' : '🌐 EN';
    toggleBtn.title =
      lang === 'vi'
        ? 'Ngôn ngữ giao diện: Tiếng Việt (Nhấn hoặc Ctrl+Shift+L để đổi sang English)'
        : 'UI Language: English (Click or Ctrl+Shift+L to switch to Tiếng Việt)';
  }

  function toggleLanguage() {
    loadDict();
    const next = getLang() === 'vi' ? 'en' : 'vi';
    setLang(next);
    updateToggleBadge(next);
    if (document.body) {
      walkAndTranslate(document.body, next);
      renderQuotaPanel();
    }
  }

  function ensureTogglePill() {
    if (!document.body) return;
    const existing = document.getElementById('agy-vi-lang-toggle');
    if (existing) {
      toggleBtn = existing;
      updateToggleBadge(getLang());
      return;
    }
    const btn = document.createElement('button');
    btn.id = 'agy-vi-lang-toggle';
    btn.type = 'button';
    btn.setAttribute('data-no-i18n', 'true');
    Object.assign(btn.style, {
      position: 'fixed',
      right: '16px',
      bottom: '14px',
      zIndex: '2147483647',
      padding: '4px 10px',
      fontSize: '12px',
      fontWeight: '600',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      borderRadius: '999px',
      border: '1px solid rgba(148,163,184,0.45)',
      background: 'rgba(24,24,27,0.85)',
      color: '#f4f4f5',
      boxShadow: '0 2px 8px rgba(0,0,0,0.28)',
      backdropFilter: 'blur(6px)',
      cursor: 'pointer',
      opacity: '0.85',
      transition: 'opacity 0.15s ease, transform 0.15s ease',
      lineHeight: '1.3',
      userSelect: 'none',
    });
    btn.addEventListener('mouseenter', () => {
      btn.style.opacity = '1';
      btn.style.transform = 'scale(1.04)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.opacity = '0.85';
      btn.style.transform = 'scale(1)';
    });
    btn.addEventListener('click', toggleLanguage);
    toggleBtn = btn;
    updateToggleBadge(getLang());
    document.body.appendChild(btn);
  }

  let pendingRoots = new Set();
  let rafScheduled = false;

  function scheduleFlush() {
    if (rafScheduled) return;
    rafScheduled = true;
    const flush = () => {
      rafScheduled = false;
      ensureTogglePill();
      const lang = getLang();
      const roots = Array.from(pendingRoots);
      pendingRoots.clear();
      for (const r of roots) {
        if (r.isConnected) {
          walkAndTranslate(r, lang);
        }
      }
      scrapeUsagePopoverFromDom();
      renderQuotaPanel();
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(flush);
    } else {
      setTimeout(flush, 16);
    }
  }

  function init() {
    if (!document.body) {
      setTimeout(init, 50);
      return;
    }
    ensureTogglePill();
    walkAndTranslate(document.body, getLang());
    renderQuotaPanel();

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'characterData') {
          pendingRoots.add(m.target);
        } else if (m.type === 'attributes') {
          pendingRoots.add(m.target);
        } else if (m.type === 'childList') {
          for (const added of m.addedNodes) {
            pendingRoots.add(added);
          }
        }
      }
      if (pendingRoots.size > 0) {
        scheduleFlush();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRS,
    });

    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault();
        toggleLanguage();
      }
    });

    // Auto-fetch quota (30s) and active session context (10s + on session switch)
    let ctxDebounceTimer = null;
    const scheduleContextFetch = (delayMs = 500) => {
      if (ctxDebounceTimer) clearTimeout(ctxDebounceTimer);
      ctxDebounceTimer = setTimeout(() => {
        fetchContextDirectly();
      }, delayMs);
    };

    setTimeout(() => {
      fetchQuotaDirectly(false);
      fetchContextDirectly();
    }, 1500);
    setInterval(() => {
      fetchQuotaDirectly(false);
    }, 30000);
    setInterval(() => {
      fetchContextDirectly();
    }, 10000);
    window.addEventListener('focus', () => {
      fetchQuotaDirectly(false);
      fetchContextDirectly();
    });
    window.addEventListener('popstate', () => scheduleContextFetch(350));
    window.addEventListener('hashchange', () => scheduleContextFetch(350));
    document.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('[data-no-i18n]')) return;
      scheduleContextFetch(600);
    }, true);
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }
  }
})
