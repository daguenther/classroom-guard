/**
 * ============================================================================
 * Classroom Guard - Google Search AI Overview & AI Mode Blocker
 * ============================================================================
 *
 * Lightweight, future-proof protection against Google's AI Overview and AI Mode.
 *
 * 1. CSS Layer (Instant): Hides AI Overview and AI Mode containers before first paint.
 * 2. DOM Layer: Identifies AI Overview blocks using semantic heading text
 *    and structure (immune to Google's randomized class name rotations).
 * 3. AI Mode Filter: Strips links, buttons, and redirects from udm=50 (AI Mode).
 * 4. Zero-Overhead: Disconnects the observer automatically once the search
 *    results finish loading.
 * ============================================================================
 */

(() => {
  'use strict';

  // Guard against multiple executions in the same frame
  if (window.__cgAiOverviewInstalled) return;
  window.__cgAiOverviewInstalled = true;

  // Multilingual list of heading labels Google uses for AI Overview
  const DEFAULT_HEADING_TERMS = [
    'ai overview',
    'ai overviews',
    'generative ai',
    'visión general creada por ia',
    'visión general de ia',
    'aperçu ia',
    'ki-übersicht',
    'visão geral criada por ia',
    'panoramica dell\'ia',
    'ai による概要',
    'ai 개요'
  ];

  let headingTerms = [...DEFAULT_HEADING_TERMS];
  let customSelectors = [];
  let isEnabled = true;
  let blockAiMode = true;

  const BASE_BLOCKED_CSS = `
    /* Instant CSS suppression of AI Overview and AI Mode elements */
    div:has(> [data-async-context*="aiob"]),
    div:has(> [data-async-context*="ai_overview"]),
    div[data-attrid*="ai_overview" i],
    div[data-attrid*="wa:/g/11vsc" i],
    [aria-label*="AI Overview" i],
    [aria-label*="AI Overviews" i],
    [aria-label*="Visión general creada por IA" i],
    [aria-label*="Aperçu IA" i],
    [aria-label*="KI-Übersicht" i],
    [aria-label*="Visão geral criada por IA" i],
    a[href*="udm=50"],
    [data-action-item][href*="udm=50"],
    [aria-label*="AI Mode" i],
    [aria-label*="Modo IA" i] {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      min-height: 0 !important;
      max-height: 0 !important;
      opacity: 0 !important;
      pointer-events: none !important;
      overflow: hidden !important;
    }
  `;

  let styleEl = null;

  function injectBlockStyles(extraSelectors = []) {
    if (!isEnabled) {
      if (styleEl) styleEl.remove();
      return;
    }
    const root = document.head || document.documentElement;
    if (!root) return;

    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'cg-ai-overview-style';
    }

    let css = BASE_BLOCKED_CSS;
    if (extraSelectors && extraSelectors.length > 0) {
      const extraRule = extraSelectors.join(',\n') + ` {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }\n`;
      css += extraRule;
    }

    styleEl.textContent = css;
    if (!styleEl.isConnected) {
      root.appendChild(styleEl);
    }
  }

  // Inject styles immediately at document_start
  injectBlockStyles();

  // If the student navigated directly to AI Mode (udm=50), redirect to Web search (udm=14)
  if (window.location.search && window.location.search.includes('udm=50')) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('udm', '14');
      window.location.replace(url.toString());
    } catch {}
  }

  function matchesHeadingTerm(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.trim().toLowerCase();
    if (lower.length === 0 || lower.length > 80) return false;
    return headingTerms.some((term) => lower === term || lower.startsWith(term) || lower.includes(term));
  }

  function findTopResultCard(node) {
    if (!node || node.nodeType !== 1) return null;
    let cur = node;
    let card = null;

    // Walk up the tree to find the top-level result block in the search container
    while (cur && cur !== document.body && cur !== document.documentElement) {
      const parent = cur.parentElement;
      if (!parent) break;

      // Direct children of #rso or #center_col or #botstuff or div.GyAeWb are top-level cards
      if (
        parent.id === 'rso' ||
        parent.id === 'center_col' ||
        parent.classList?.contains('GyAeWb') ||
        parent.classList?.contains('s6JM6d')
      ) {
        card = cur;
        break;
      }

      // Google standard search result wrapper class .MjjYud
      if (cur.classList?.contains('MjjYud')) {
        card = cur;
        break;
      }

      cur = parent;
    }

    return card || node;
  }

  function removeElement(el) {
    if (!el) return;
    try {
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.remove();
    } catch {}
  }

  function sweepForAiOverview(root = document) {
    if (!isEnabled || !root || !root.querySelectorAll) return;

    // 1. Identify headings that indicate an AI Overview
    const headings = root.querySelectorAll('h1, h2, h3, div[role="heading"], span[role="heading"]');
    for (let i = 0; i < headings.length; i++) {
      const h = headings[i];
      if (matchesHeadingTerm(h.textContent)) {
        const card = findTopResultCard(h);
        if (card) {
          removeElement(card);
        }
      }
    }

    // 2. Identify and remove any AI Mode tabs, buttons, or links
    if (blockAiMode) {
      const aiModeLinks = root.querySelectorAll(
        'a[href*="udm=50"], [data-action-item][href*="udm=50"], [aria-label*="AI Mode" i], [aria-label*="Modo IA" i]'
      );
      for (let i = 0; i < aiModeLinks.length; i++) {
        const link = aiModeLinks[i];
        const tabContainer = link.closest && link.closest('[role="listitem"], [role="tab"], div.crJ18e, div.hdtb-mitem');
        removeElement(tabContainer || link);
      }
    }

    // 3. Apply custom selectors pushed from Google Admin Console
    if (customSelectors.length > 0) {
      for (let s = 0; s < customSelectors.length; s++) {
        try {
          const targets = root.querySelectorAll(customSelectors[s]);
          for (let t = 0; t < targets.length; t++) {
            removeElement(targets[t]);
          }
        } catch {}
      }
    }
  }

  // Intercept click on any link or button leading to AI Mode
  document.addEventListener('click', (e) => {
    if (!blockAiMode) return;
    const link = e.target?.closest && e.target.closest('a[href*="udm=50"]');
    if (link) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      try {
        const url = new URL(link.href, window.location.origin);
        url.searchParams.set('udm', '14');
        window.location.assign(url.toString());
      } catch {}
    }
  }, { capture: true });

  // Read policy overrides from chrome.storage.managed / local
  function syncPolicy() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const storageArea = chrome.storage.managed || chrome.storage.local;
        storageArea.get([
          'blockAiOverview',
          'blockAiMode',
          'aiOverviewHeadingTerms',
          'aiOverviewSelectors'
        ], (res) => {
          if (!res) return;
          if (typeof res.blockAiOverview === 'boolean') {
            isEnabled = res.blockAiOverview;
          }
          if (typeof res.blockAiMode === 'boolean') {
            blockAiMode = res.blockAiMode;
          }
          if (Array.isArray(res.aiOverviewHeadingTerms) && res.aiOverviewHeadingTerms.length > 0) {
            headingTerms = [
              ...DEFAULT_HEADING_TERMS,
              ...res.aiOverviewHeadingTerms.map((t) => String(t).toLowerCase().trim()).filter(Boolean)
            ];
          }
          if (Array.isArray(res.aiOverviewSelectors) && res.aiOverviewSelectors.length > 0) {
            customSelectors = res.aiOverviewSelectors.map((s) => String(s).trim()).filter(Boolean);
          }

          injectBlockStyles(customSelectors);
          if (isEnabled) {
            sweepForAiOverview(document);
          }
        });
      }
    } catch {}
  }

  syncPolicy();

  // Initial sweep
  sweepForAiOverview(document);

  // MutationObserver with auto-disconnect for zero ongoing overhead
  let observer = null;
  let disconnectTimer = null;

  function resetDisconnectTimer() {
    if (disconnectTimer) clearTimeout(disconnectTimer);
    // After 10 seconds of no mutations (page load complete), disconnect to free up all CPU
    disconnectTimer = setTimeout(() => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }, 10000);
  }

  observer = new MutationObserver((mutations) => {
    if (!isEnabled) return;
    resetDisconnectTimer();

    for (let i = 0; i < mutations.length; i++) {
      const added = mutations[i].addedNodes;
      for (let j = 0; j < added.length; j++) {
        const node = added[j];
        if (node.nodeType === 1) {
          sweepForAiOverview(node);
        }
      }
    }
  });

  const observeTarget = document.documentElement || document;
  observer.observe(observeTarget, {
    childList: true,
    subtree: true
  });
  resetDisconnectTimer();

  // Re-sweep when DOM finishes loading
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectBlockStyles(customSelectors);
      sweepForAiOverview(document);
    }, { once: true });
  }

  window.addEventListener('load', () => {
    injectBlockStyles(customSelectors);
    sweepForAiOverview(document);
  }, { once: true });
})();
