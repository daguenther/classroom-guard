(() => {
  'use strict';

  // Read central configuration or fallback to defaults
  const CONFIG = (typeof globalThis !== 'undefined' && (globalThis.CLASSROOM_GUARD_CONFIG || globalThis.YT_GUARD_CONFIG))
    ? (globalThis.CLASSROOM_GUARD_CONFIG || globalThis.YT_GUARD_CONFIG)
    : {
        MODE: 'TARGET_DOMAINS_ONLY',
        TARGET_DOMAINS: ['docs.google.com'],
        ALLOWED_TOP_DOMAINS: ['youtube.com', 'classroom.google.com', 'ixl.com'],
        BLOCK_IMAGE_SEARCH: true,
        BLOCK_GIFS: false,
        BLOCK_EXPLORE_TOOL: true,
        BLOCK_DOCS_EMBED_IFRAMES: false,
        ALLOW_CLASSROOM_DRIVE: true,
        VIDEO_DOMAINS: [
          'youtube.com',
          'youtubeeducation.com',
          'youtube-nocookie.com',
          'youtubekids.com',
          'youtu.be',
          'googlevideo.com',
          'video.google.com',
          'ytimg.com'
        ]
      };

  let customImageTerms = [];

  // Sync managed policy overrides if available
  try {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const storageArea = chrome.storage.managed || chrome.storage.local;
      storageArea.get([
        'blockDocsVideo',
        'blockImageSearch',
        'blockExploreTool',
        'blockGifs',
        'imageSearchTerms'
      ], (res) => {
        if (res) {
          if (typeof res.blockDocsVideo === 'boolean') {
            CONFIG.BLOCK_DOCS_VIDEO = res.blockDocsVideo;
          }
          if (typeof res.blockImageSearch === 'boolean') {
            CONFIG.BLOCK_IMAGE_SEARCH = res.blockImageSearch;
          }
          if (typeof res.blockExploreTool === 'boolean') {
            CONFIG.BLOCK_EXPLORE_TOOL = res.blockExploreTool;
          }
          if (typeof res.blockGifs === 'boolean') {
            CONFIG.BLOCK_GIFS = res.blockGifs;
          }
          if (Array.isArray(res.imageSearchTerms) && res.imageSearchTerms.length > 0) {
            customImageTerms = res.imageSearchTerms.map((t) => String(t).toLowerCase().trim()).filter(Boolean);
          }
          injectBlockStyles();
        }
      });
    }
  } catch {}

  const YOUTUBE_PATTERNS = CONFIG.VIDEO_DOMAINS || [
    'youtube.com',
    'youtubeeducation.com',
    'youtube-nocookie.com',
    'youtubekids.com',
    'youtu.be',
    'googlevideo.com',
    'video.google.com',
    'ytimg.com'
  ];

  function matchesDomainList(host, list) {
    if (!host || !Array.isArray(list)) return false;
    const lower = host.toLowerCase();
    return list.some((domain) => {
      const d = domain.toLowerCase();
      return lower === d || lower.endsWith('.' + d);
    });
  }

  function getTopHostname() {
    const ancestors = window.location.ancestorOrigins;
    if (ancestors && ancestors.length > 0) {
      try {
        return new URL(ancestors[ancestors.length - 1]).hostname.toLowerCase();
      } catch {
        return '';
      }
    }
    return (window.location.hostname || '').toLowerCase();
  }

  const currentHost = (window.location.hostname || '').toLowerCase();
  const currentPath = (window.location.pathname || '').toLowerCase();
  const topHost = getTopHostname();

  // On Google Classroom, intercept clicks on Drive attachments to track allowed file IDs
  if (matchesDomainList(topHost, ['classroom.google.com'])) {
    document.addEventListener('click', (e) => {
      try {
        const link = e.target.closest && e.target.closest('a[href*="drive.google.com"], [data-drive-id], [data-item-id]');
        if (link) {
          const href = link.href || link.getAttribute('href') || '';
          const match = href.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
          const fileId = match ? match[1] : (link.getAttribute('data-drive-id') || link.getAttribute('data-item-id') || '');
          chrome.runtime.sendMessage({
            action: 'ALLOW_CLASSROOM_DRIVE',
            fileId: fileId,
            url: href
          });
        }
      } catch {}
    }, { capture: true, passive: true });
  }

  function isDriveAllowedFromClassroom() {
    if (!matchesDomainList(topHost, ['drive.google.com']) && !matchesDomainList(currentHost, ['drive.google.com'])) {
      return false;
    }

    try {
      // 1. Check window token or session storage
      if (window.__ytGuardClassroomAllowed) return true;
      if (window.sessionStorage.getItem('__yt_guard_classroom_allowed') === 'true') return true;
      if (window.top && window.top.__ytGuardClassroomAllowed) return true;
      if (window.top && window.top.sessionStorage && window.top.sessionStorage.getItem('__yt_guard_classroom_allowed') === 'true') return true;

      // 2. Check referrer
      let ref = '';
      try {
        ref = (window.top && window.top.document ? window.top.document.referrer : '') || '';
      } catch {
        ref = '';
      }
      if (!ref) {
        ref = document.referrer || '';
      }
      ref = (ref || '').toLowerCase();

      if (ref.includes('classroom.google.com')) {
        try {
          const fileKey = window.location.pathname;
          window.sessionStorage.setItem('__yt_guard_classroom_file', fileKey);
          window.sessionStorage.setItem('__yt_guard_classroom_allowed', 'true');
        } catch {}
        return true;
      }

      // Check current frame document.referrer
      const docRef = (document.referrer || '').toLowerCase();
      if (docRef.includes('classroom.google.com')) {
        try {
          const fileKey = window.location.pathname;
          window.sessionStorage.setItem('__yt_guard_classroom_file', fileKey);
          window.sessionStorage.setItem('__yt_guard_classroom_allowed', 'true');
        } catch {}
        return true;
      }

      // Allow page reloads in the same tab for the file
      try {
        const saved = window.sessionStorage.getItem('__yt_guard_classroom_file');
        if (saved && (saved === window.location.pathname || window.location.pathname.startsWith('/file/d/'))) {
          return true;
        }
      } catch {}

      try {
        if (window.top !== window && window.top.sessionStorage) {
          const topSaved = window.top.sessionStorage.getItem('__yt_guard_classroom_file');
          if (topSaved) {
            return true;
          }
        }
      } catch {}
    } catch {}

    return false;
  }

  /**
   * Determines whether the current frame (or any of its parent frames) is within
   * the scope of the video lockdown.
   */
  function isTargetedContext() {
    if (CONFIG.MODE === 'TARGET_DOMAINS_ONLY') {
      // 1. Is the current frame itself one of the target domains (e.g. docs.google.com)?
      // This catches Google Docs, Slides, Sheets directly AND any embedded
      // pubembed presentation iframes (like docs.google.com/presentation/.../pubembed) on third-party sites!
      if (matchesDomainList(currentHost, CONFIG.TARGET_DOMAINS)) {
        return true;
      }

      // 2. Is this frame embedded inside any of the target domains?
      // (e.g. A YouTube iframe or player inside Google Slides, Docs, or Sheets)
      const ancestors = window.location.ancestorOrigins;
      if (ancestors && ancestors.length > 0) {
        for (let i = 0; i < ancestors.length; i++) {
          try {
            const ancestorHost = new URL(ancestors[i]).hostname.toLowerCase();
            if (matchesDomainList(ancestorHost, CONFIG.TARGET_DOMAINS)) {
              return true;
            }
          } catch {}
        }
      }

      // 3. Fallback: check document.referrer for target domain
      try {
        if (document.referrer) {
          const refHost = new URL(document.referrer).hostname.toLowerCase();
          if (matchesDomainList(refHost, CONFIG.TARGET_DOMAINS)) {
            return true;
          }
        }
      } catch {}

      // Current frame is outside target domains and has no target ancestors:
      // Leave completely OPEN (0% overhead)!
      return false;
    } else {
      // 'BLOCK_ALL_EXCEPT_ALLOWLIST' mode:
      if (matchesDomainList(topHost, CONFIG.ALLOWED_TOP_DOMAINS)) {
        return false;
      }
      if (CONFIG.ALLOW_CLASSROOM_DRIVE && isDriveAllowedFromClassroom()) {
        return false;
      }
      return true;
    }
  }

  // Exit immediately with zero overhead on non-targeted sites
  if (!isTargetedContext()) {
    // If enabled, optionally strip embedded docs iframes on external sites
    if (CONFIG.BLOCK_DOCS_EMBED_IFRAMES) {
      const removeDocsIframes = () => {
        const docIframes = document.querySelectorAll(
          'iframe[src*="docs.google.com"], iframe[data-src*="docs.google.com"]'
        );
        for (let i = 0; i < docIframes.length; i++) {
          docIframes[i].remove();
        }
      };
      removeDocsIframes();
      const iframeObs = new MutationObserver(removeDocsIframes);
      iframeObs.observe(document.documentElement || document, { childList: true, subtree: true });
    }
    return;
  }

  // If this is Google Drive and was opened from Google Classroom, allow playback and exit immediately
  if (CONFIG.ALLOW_CLASSROOM_DRIVE && isDriveAllowedFromClassroom()) {
    return;
  }

  const isUnauthorizedDrive =
    (matchesDomainList(topHost, ['drive.google.com']) || matchesDomainList(currentHost, ['drive.google.com'])) &&
    !isDriveAllowedFromClassroom();

  // Asynchronous fallback verification for Drive tabs via service worker
  if (isUnauthorizedDrive) {
    try {
      const match = window.location.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      const fileId = match ? match[1] : null;
      chrome.runtime.sendMessage({ action: 'CHECK_DRIVE_ALLOWED', fileId }, (res) => {
        if (res && res.allowed) {
          window.__ytGuardClassroomAllowed = true;
          try {
            sessionStorage.setItem('__yt_guard_classroom_allowed', 'true');
          } catch {}
          const st = document.getElementById('yt-nuke-lockdown-style');
          if (st) st.remove();
        }
      });
    } catch {}
  }

  function containsYouTubePattern(str) {
    if (!str || typeof str !== 'string') return false;
    const lower = str.toLowerCase();
    if (lower.includes('youtube')) return true;
    return YOUTUBE_PATTERNS.some((p) => lower.includes(p));
  }

  const isYouTubeSubframe =
    containsYouTubePattern(currentHost) ||
    matchesDomainList(currentHost, YOUTUBE_PATTERNS);
  const isGoogleVids =
    matchesDomainList(topHost, ['vids.google.com']) ||
    matchesDomainList(currentHost, ['vids.google.com']) ||
    (matchesDomainList(currentHost, ['docs.google.com']) && currentPath.startsWith('/videos'));
  const isDocsGoogle =
    matchesDomainList(currentHost, ['docs.google.com']) &&
    !(CONFIG.ALLOW_GOOGLE_VIDS !== false && isGoogleVids);
  const isGoogleSlides =
    isDocsGoogle && currentPath.startsWith('/presentation/');

  // Terms used by Google Docs and Slides strictly for Web image search ("Search the web" / Google Images)
  // Stock images are permitted.
  const IMAGE_SEARCH_TERMS = [
    'search the web',
    'search for images',
    'search google images',
    'google images',
    'google image search',
    'buscar en la web',
    'imágenes de google',
    'rechercher sur le web',
    'images google',
    'im web suchen',
    'google bilder',
    'pesquisar na web',
    'imagens do google',
    'cerca nel web',
    'immagini google'
  ];

  const GIF_TERMS = [
    'gifs',
    'gif'
  ];

  const EXPLORE_TERMS = [
    'explore',
    'explorar',
    'explorer',
    'erkunden',
    'esplora'
  ];

  const ARROW_STRIP_REGEX = /[\u2190-\u2199\u2794\u27A1>-]/g;
  const MATERIAL_ICON_LIGATURE_REGEX = /arrow_forward|arrow_back|chevron_right|chevron_left|navigate_next|navigate_before|east|west/g;

  function cleanHeaderText(str) {
    return (str || '')
      .toLowerCase()
      .replace(MATERIAL_ICON_LIGATURE_REGEX, '')
      .replace(ARROW_STRIP_REGEX, '')
      .trim();
  }

  function isBlockedHeaderLabel(clean) {
    if (!clean) return false;
    if (
      CONFIG.BLOCK_IMAGE_SEARCH !== false &&
      (clean === 'google images' ||
       clean === 'google image search' ||
       clean === 'search the web' ||
       clean === 'search for images' ||
       clean === 'search google images' ||
       clean === 'imágenes de google' ||
       clean === 'images google' ||
       clean === 'google bilder' ||
       clean === 'imagens do google' ||
       clean === 'immagini google' ||
       (customImageTerms && customImageTerms.includes(clean)))
    ) {
      return true;
    }
    if (
      CONFIG.BLOCK_GIFS !== false &&
      (clean === 'gifs' ||
       clean === 'gif')
    ) {
      return true;
    }
    return false;
  }

  function matchesSearchTerm(str, terms) {
    if (!str || typeof str !== 'string') return false;
    const lower = str.trim().toLowerCase();
    return terms.some((term) => {
      if (lower === term) return true;
      if (term.length >= 4 && lower.includes(term)) return true;
      return false;
    });
  }

  function isProtectedContainer(el) {
    if (!el || el.nodeType !== 1) return true;
    const tag = el.tagName;
    if (tag === 'HTML' || tag === 'BODY' || tag === 'HEAD' || tag === 'SCRIPT' || tag === 'STYLE') {
      return true;
    }
    if (
      el.id === 'docs-chrome' ||
      el.id === 'docs-editor' ||
      el.id === 'docs-editor-container' ||
      el.classList?.contains('goog-menu') ||
      el.classList?.contains('punch-filmstrip-sidebar') ||
      el.classList?.contains('kix-appview-editor') ||
      el.classList?.contains('punch-side-panel') ||
      el.classList?.contains('docs-side-panel') ||
      el.classList?.contains('punch-palette') ||
      el.classList?.contains('punch-palette-content') ||
      el.getAttribute('role') === 'menu' ||
      el.getAttribute('role') === 'menubar' ||
      el.getAttribute('role') === 'toolbar' ||
      el.getAttribute('role') === 'main' ||
      el.getAttribute('role') === 'application'
    ) {
      return true;
    }
    if (el.querySelector?.('#docs-editor, #docs-chrome, .kix-appview-editor, .goog-menuitem, [role="menuitem"]')) {
      return true;
    }
    return false;
  }

  function isBlockedGifImg(img) {
    if (!img || img.tagName !== 'IMG') return false;
    if (img.classList?.contains('docs-icon-img')) return false;
    const src = (img.src || img.getAttribute('src') || '').toLowerCase();
    if (!src) return false;
    if (src.includes('tenor.com')) return true;
    if (
      src.includes('cleardot.gif') ||
      src.includes('spacer.gif') ||
      src.includes('blank.gif') ||
      src.includes('gstatic.com') ||
      src.includes('google.com/images/')
    ) {
      return false;
    }
    if (src.startsWith('data:image/gif') && src.length < 200) {
      return false;
    }
    return src.endsWith('.gif') || src.includes('.gif?') || src.startsWith('data:image/gif');
  }

  function isBlockedImageSearchItem(el) {
    if (!el || el.nodeType !== 1 || isProtectedContainer(el)) return false;

    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const title = (el.getAttribute('title') || '').toLowerCase();
    const tooltip = (el.getAttribute('data-tooltip') || '').toLowerCase();
    const attrCombined = `${aria} ${title} ${tooltip}`;

    const isMenuOrTab =
      el.classList?.contains('goog-menuitem') ||
      el.classList?.contains('docs-material-menu-item') ||
      el.getAttribute('role') === 'menuitem' ||
      el.getAttribute('role') === 'tab' ||
      el.getAttribute('role') === 'option' ||
      el.getAttribute('role') === 'button' ||
      el.getAttribute('role') === 'link' ||
      el.tagName === 'BUTTON';

    const text = isMenuOrTab ? cleanHeaderText(el.textContent || '') : '';

    // Explicitly allow safe Stock images
    if (
      attrCombined.includes('stock') ||
      attrCombined.includes('archivo') ||
      (isMenuOrTab && (text.includes('stock') || text.includes('archivo')))
    ) {
      return false;
    }

    // Block GIFs if enabled
    if (CONFIG.BLOCK_GIFS !== false) {
      if (
        matchesSearchTerm(aria, GIF_TERMS) ||
        matchesSearchTerm(title, GIF_TERMS) ||
        matchesSearchTerm(tooltip, GIF_TERMS) ||
        (isMenuOrTab && text.length <= 80 && matchesSearchTerm(text, GIF_TERMS))
      ) {
        return true;
      }
    }

    if (CONFIG.BLOCK_IMAGE_SEARCH === false) return false;

    if (el.classList?.contains('cg-blocked-image-search')) return true;

    if (
      matchesSearchTerm(aria, IMAGE_SEARCH_TERMS) ||
      matchesSearchTerm(title, IMAGE_SEARCH_TERMS) ||
      matchesSearchTerm(tooltip, IMAGE_SEARCH_TERMS) ||
      (customImageTerms.length > 0 && (
        matchesSearchTerm(aria, customImageTerms) ||
        matchesSearchTerm(title, customImageTerms) ||
        matchesSearchTerm(tooltip, customImageTerms)
      ))
    ) {
      return true;
    }

    if (CONFIG.BLOCK_EXPLORE_TOOL !== false) {
      if (
        matchesSearchTerm(aria, EXPLORE_TERMS) ||
        matchesSearchTerm(title, EXPLORE_TERMS) ||
        matchesSearchTerm(tooltip, EXPLORE_TERMS)
      ) {
        return true;
      }
    }

    if (isMenuOrTab && text.length <= 80) {
      if (matchesSearchTerm(text, IMAGE_SEARCH_TERMS)) {
        return true;
      }
      if (CONFIG.BLOCK_EXPLORE_TOOL !== false && matchesSearchTerm(text, EXPLORE_TERMS)) {
        return true;
      }
    }

    if (CONFIG.BLOCK_EXPLORE_TOOL !== false) {
      if (
        el.classList?.contains('docs-explore-widget') ||
        el.classList?.contains('docs-explore-sidebar') ||
        el.classList?.contains('punch-explore-sidebar') ||
        el.id === 'docs-explore-widget'
      ) {
        return true;
      }
    }

    return false;
  }

  function nukeImageSearchItem(el) {
    if (!el || isProtectedContainer(el)) return;
    const menuItem = el.closest
      ? el.closest('.goog-menuitem, .docs-material-menu-item, [role="menuitem"], [role="tab"], .docs-explore-widget')
      : null;
    const target = menuItem || el;
    if (isProtectedContainer(target)) return;

    target.classList.add('cg-blocked-image-search');
    target.style.setProperty('display', 'none', 'important');
    target.style.setProperty('visibility', 'hidden', 'important');
    target.style.setProperty('pointer-events', 'none', 'important');
    target.style.setProperty('height', '0', 'important');
    target.style.setProperty('min-height', '0', 'important');
    target.style.setProperty('max-height', '0', 'important');
    target.style.setProperty('padding', '0', 'important');
    target.style.setProperty('margin', '0', 'important');
    target.style.setProperty('border', 'none', 'important');
    target.setAttribute('aria-hidden', 'true');
    target.setAttribute('tabindex', '-1');
  }

  function dismissImageSearchSidebar(root) {
    if (!root || !root.querySelectorAll) return;
    const sidebars = [];

    // Explore sidebars
    if (CONFIG.BLOCK_EXPLORE_TOOL !== false) {
      const exploreSelectors = '.docs-explore-sidebar, .punch-explore-sidebar';
      if (root.matches?.(exploreSelectors)) sidebars.push(root);
      const foundExplore = root.querySelectorAll(exploreSelectors);
      for (let i = 0; i < foundExplore.length; i++) sidebars.push(foundExplore[i]);
    }

    // Check dedicated side panels whose header is exclusively Web Image Search or GIFs (and NOT Stock images)
    const panelSelectors = '.docs-side-panel, .punch-palette';
    const candidatePanels = [];
    if (root.matches?.(panelSelectors)) candidatePanels.push(root);
    const foundPanels = root.querySelectorAll(panelSelectors);
    for (let i = 0; i < foundPanels.length; i++) candidatePanels.push(foundPanels[i]);

    for (let i = 0; i < candidatePanels.length; i++) {
      const panel = candidatePanels[i];
      const header = panel.querySelector('.punch-palette-title, .docs-side-panel-header, h1, h2, h3');
      const headerText = (header ? header.textContent : '').trim().toLowerCase();
      const panelText = (panel.textContent || '').toLowerCase();

      if (panelText.includes('stock') || panelText.includes('archivo')) {
        continue;
      }

      if (
        CONFIG.BLOCK_IMAGE_SEARCH !== false &&
        (headerText === 'search the web' ||
         headerText === 'search for images' ||
         headerText === 'search google images' ||
         headerText === 'google images')
      ) {
        sidebars.push(panel);
      } else if (
        CONFIG.BLOCK_GIFS !== false &&
        (headerText === 'gifs' ||
         headerText === 'gif')
      ) {
        sidebars.push(panel);
      }
    }

    for (let i = 0; i < sidebars.length; i++) {
      const sb = sidebars[i];
      sb.classList.add('cg-blocked-image-search');
      sb.style.setProperty('display', 'none', 'important');
      sb.style.setProperty('visibility', 'hidden', 'important');
      sb.style.setProperty('pointer-events', 'none', 'important');

      const closeBtn = sb.querySelector(
        '.docs-explore-close-button, .punch-palette-close-button, [aria-label*="Close" i]'
      );
      if (closeBtn && typeof closeBtn.click === 'function') {
        try { closeBtn.click(); } catch {}
      }

      const searchInputs = sb.querySelectorAll('input');
      for (let j = 0; j < searchInputs.length; j++) {
        searchInputs[j].value = '';
        searchInputs[j].disabled = true;
      }
    }
  }

  // On Google Docs/Slides/Sheets, intercept clicks on video links and image search actions
  if (isDocsGoogle) {
    const handleActionCapture = (e) => {
      try {
        const target = e.target;
        if (!target) return;

        // 1. YouTube links inside Google Docs/Slides
        const link = target.closest && target.closest('a, [xlink\\:href], [href], [data-url]');
        if (link) {
          const href = (link.href && typeof link.href === 'string' ? link.href : '') ||
                       link.getAttribute('href') ||
                       link.getAttribute('xlink:href') ||
                       link.getAttribute('data-url') ||
                       '';
          if (containsYouTubePattern(href)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
          }
        }

        // 2. Web Image Search, Explore, and GIF interaction check
        if (CONFIG.BLOCK_IMAGE_SEARCH !== false || CONFIG.BLOCK_EXPLORE_TOOL !== false || CONFIG.BLOCK_GIFS !== false) {
          let cur = target;
          for (let d = 0; cur && cur !== document.body && d < 4; d++, cur = cur.parentElement) {
            if (cur.children && cur.children.length <= 3) {
              const raw = (cur.textContent || '').trim();
              if (raw.length > 0 && raw.length <= 60) {
                const clean = cleanHeaderText(raw);
                if (isBlockedHeaderLabel(clean)) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.stopImmediatePropagation();
                  hideSidebarSectionFromAnchor(cur);
                  return;
                }
              }
            }
          }
          const candidate = target.closest && target.closest(
            '.cg-blocked-image-search, .goog-menuitem, [role="menuitem"], [role="tab"], [role="option"], [role="button"], [role="link"], .docs-material-menu-item, .docs-explore-widget, button'
          );
          if (candidate && isBlockedImageSearchItem(candidate)) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            nukeImageSearchItem(candidate);
          }
        }
      } catch {}
    };

    document.addEventListener('click', handleActionCapture, { capture: true });
    document.addEventListener('mousedown', handleActionCapture, { capture: true });
    document.addEventListener('pointerdown', handleActionCapture, { capture: true });

    // Intercept pasting of GIF images
    document.addEventListener('paste', (e) => {
      if (CONFIG.BLOCK_GIFS === false) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type === 'image/gif') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
      }
    }, { capture: true });

    // Intercept dropping of GIF files
    document.addEventListener('drop', (e) => {
      if (CONFIG.BLOCK_GIFS === false) return;
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          if (f.type === 'image/gif' || (f.name && f.name.toLowerCase().endsWith('.gif'))) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return;
          }
        }
      }
    }, { capture: true });

    // Intercept file uploads of GIF files
    document.addEventListener('change', (e) => {
      if (CONFIG.BLOCK_GIFS === false) return;
      const target = e.target;
      if (target && target.tagName === 'INPUT' && target.type === 'file') {
        const files = target.files;
        if (files && files.length > 0) {
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            if (f.type === 'image/gif' || (f.name && f.name.toLowerCase().endsWith('.gif'))) {
              target.value = '';
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              return;
            }
          }
        }
      }
    }, { capture: true });

    // Block Explore keyboard shortcut: Ctrl+Alt+Shift+I or Cmd+Option+Shift+I
    if (CONFIG.BLOCK_EXPLORE_TOOL !== false) {
      window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.altKey && e.shiftKey && (e.key === 'i' || e.key === 'I' || e.keyCode === 73)) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
      }, { capture: true });
    }
  }

  // 1. Dynamic CSS rule generator targeting YouTube URLs, Google Slides/Docs wrappers,
  // image search items, and Explore tools based on active configuration.
  function generateBlockCss() {
    let css = '';
    if (CONFIG.BLOCK_DOCS_VIDEO !== false) {
      css += `
        ${isYouTubeSubframe ? 'video, audio,' : ''}
        .punch-viewer-video-wrapper video,
        .punch-viewer-video-wrapper audio,
        .punch-video-player video,
        .punch-video-player audio,
        .docs-material-video-player video,
        .docs-material-video-player audio,
        .html5-video-player,
        #movie_player,
        .ytp-cued-thumbnail-overlay,
        video.html5-main-video,
        video[src*="googlevideo.com" i],
        video[src*="youtube" i],
        embed[src*="youtube" i],
        embed[src*="youtu.be" i],
        object[data*="youtube" i],
        object[data*="youtu.be" i],
        iframe[src*="youtube" i],
        iframe[src*="youtu.be" i],
        iframe[src*="googlevideo.com" i],
        iframe[src*="video.google.com" i],
        iframe[data-src*="youtube" i],
        iframe[data-src*="youtu.be" i],
        .punch-viewer-video-wrapper,
        .punch-video-player,
        .docs-material-video-player,
        .drive-viewer-video,
        a[href*="youtube" i],
        a[href*="youtu.be" i],
        a[*|href*="youtube" i],
        a[*|href*="youtu.be" i] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          width: 0 !important;
          height: 0 !important;
          max-width: 0 !important;
          max-height: 0 !important;
          pointer-events: none !important;
        }
      `;
    }

    if (isDocsGoogle && CONFIG.BLOCK_IMAGE_SEARCH !== false) {
      css += `
        .cg-blocked-image-search,
        [aria-label*="Search the web" i],
        [aria-label*="Search for images" i],
        [aria-label*="Search Google Images" i],
        [aria-label*="Google Images" i],
        [aria-label*="Google Image Search" i],
        [title*="Search the web" i],
        [title*="Search for images" i],
        [title*="Search Google Images" i],
        [title*="Google Images" i],
        [title*="Google Image Search" i],
        [data-tooltip*="Search the web" i],
        [data-tooltip*="Search for images" i],
        [data-tooltip*="Search Google Images" i],
        [data-tooltip*="Google Images" i],
        [data-tooltip*="Google Image Search" i],
        [data-action*="image-search" i],
        [data-action*="google-images" i],
        [data-action*="google-image" i],
        [data-action*="insert-web-image" i] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          height: 0 !important;
          min-height: 0 !important;
          max-height: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
          border: none !important;
          overflow: hidden !important;
        }
      `;
    }

    if (isDocsGoogle && CONFIG.BLOCK_GIFS !== false) {
      css += `
        img[src*="tenor.com" i],
        .goog-menuitem[aria-label*="GIF" i],
        [role="menuitem"][aria-label*="GIF" i],
        [role="tab"][aria-label*="GIF" i],
        [role="option"][aria-label*="GIF" i],
        [data-action*="gif" i] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          height: 0 !important;
          width: 0 !important;
          max-height: 0 !important;
          max-width: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
          overflow: hidden !important;
        }
      `;
    }

    if (isDocsGoogle && CONFIG.BLOCK_EXPLORE_TOOL !== false) {
      css += `
        .docs-explore-widget,
        .docs-explore-sidebar,
        .punch-explore-sidebar,
        div[aria-label*="Explore" i][role="button"],
        div[data-tooltip*="Explore" i][role="button"],
        button[aria-label*="Explore" i] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          width: 0 !important;
          height: 0 !important;
          min-width: 0 !important;
          min-height: 0 !important;
          overflow: hidden !important;
        }
      `;
    }

    return css;
  }

  let styleEl = null;

  function injectBlockStyles() {
    const root = document.head || document.documentElement;
    if (!root) return;
    if (!styleEl) {
      styleEl = document.getElementById('yt-nuke-lockdown-style');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'yt-nuke-lockdown-style';
      }
    }
    styleEl.textContent = generateBlockCss();
    if (!styleEl.isConnected) {
      root.appendChild(styleEl);
    }
  }

  injectBlockStyles();

  // 2. Element inspection & silent destruction helpers
  function isBlockedIframe(iframe) {
    if (!iframe || iframe.tagName !== 'IFRAME') return false;
    const src =
      iframe.getAttribute('src') ||
      iframe.getAttribute('data-src') ||
      iframe.src ||
      '';
    const srcdoc = iframe.getAttribute('srcdoc') || '';

    if (containsYouTubePattern(src) || containsYouTubePattern(srcdoc)) {
      return true;
    }

    if (isDocsGoogle || isGoogleSlides) {
      if (
        iframe.closest &&
        iframe.closest('.punch-viewer-video-wrapper, .punch-video-player, .docs-material-video-player')
      ) {
        return true;
      }
    }

    return false;
  }

  function isBlockedVideo(video) {
    if (!video || (video.tagName !== 'VIDEO' && video.tagName !== 'AUDIO')) return false;
    // Inside a YouTube embed frame, kill all video/audio playback
    if (isYouTubeSubframe) return true;

    // Inside Google Slides/Docs inserted video wrapper
    if (video.closest?.('.punch-viewer-video-wrapper, .punch-video-player, .docs-material-video-player')) {
      return true;
    }

    if (video.tagName !== 'VIDEO') return false;

    // URL-agnostic YouTube player DOM fingerprint check
    if (
      video.classList?.contains('html5-main-video') ||
      video.closest?.('.html5-video-player, #movie_player, .ytp-player-content')
    ) {
      return true;
    }

    if (
      containsYouTubePattern(video.src) ||
      containsYouTubePattern(video.currentSrc) ||
      containsYouTubePattern(video.getAttribute('src')) ||
      containsYouTubePattern(video.getAttribute('data-src'))
    ) {
      return true;
    }

    const sources = video.querySelectorAll('source');
    for (let i = 0; i < sources.length; i++) {
      if (containsYouTubePattern(sources[i].src || sources[i].getAttribute('src'))) {
        return true;
      }
    }

    return false;
  }

  function nukeVideo(video) {
    if (!video) return;
    try {
      video.pause();
      video.muted = true;
      video.volume = 0;
      video.removeAttribute('src');
      video.removeAttribute('data-src');
      if (video.srcObject) {
        video.srcObject = null;
      }
      const sources = video.querySelectorAll('source');
      for (let i = 0; i < sources.length; i++) {
        sources[i].remove();
      }
      video.load();
      video.remove();
    } catch {
      // Ignore
    }
  }

  function nukeIframe(iframe) {
    if (!iframe) return;
    try {
      const wrapper =
        iframe.closest &&
        iframe.closest('.punch-viewer-video-wrapper, .punch-video-player, .docs-material-video-player');
      iframe.removeAttribute('src');
      iframe.removeAttribute('data-src');
      iframe.removeAttribute('srcdoc');
      iframe.remove();
      if (wrapper) {
        wrapper.remove();
      }
    } catch {
      // Ignore
    }
  }

  function hideElementBox(el) {
    if (!el || isProtectedContainer(el)) return;
    const text = (el.textContent || '').toLowerCase();
    if (text.includes('stock') || text.includes('archivo')) return;
    el.classList.add('cg-blocked-sidebar-section', 'cg-blocked-image-search');
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('height', '0', 'important');
    el.style.setProperty('min-height', '0', 'important');
    el.style.setProperty('max-height', '0', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
    el.style.setProperty('overflow', 'hidden', 'important');

    const inputs = el.querySelectorAll?.('input');
    if (inputs) {
      for (let j = 0; j < inputs.length; j++) {
        inputs[j].value = '';
        inputs[j].disabled = true;
      }
    }
  }

  function hideSidebarSectionFromAnchor(el) {
    if (!el || isProtectedContainer(el)) return;
    const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (!rect || rect.width === 0 || rect.height === 0 || rect.width > 500) return;

    if (el.closest?.('.goog-menu, [role="menu"], [role="menubar"], [role="toolbar"], .punch-filmstrip-sidebar')) {
      return;
    }

    // If in a sub-view like "<- Google images", click the back arrow button to the left of the title
    const headerRow = el.parentElement?.parentElement || el.parentElement;
    if (headerRow && headerRow.offsetWidth > 0 && headerRow.offsetWidth <= 500) {
      const btns = headerRow.querySelectorAll('button, [role="button"]');
      for (let b = 0; b < btns.length; b++) {
        const btn = btns[b];
        if (btn !== el && !btn.contains(el)) {
          const btnRect = btn.getBoundingClientRect ? btn.getBoundingClientRect() : null;
          if (
            btnRect &&
            btnRect.width > 0 &&
            btnRect.width < 80 &&
            btnRect.right <= rect.left + 16 &&
            Math.abs(btnRect.top - rect.top) < 40
          ) {
            try { btn.click(); } catch {}
            break;
          }
        }
      }
    }

    let block = el;
    let steps = 0;
    while (block && block.parentElement && block.parentElement !== document.body && steps < 10) {
      const p = block.parentElement;
      if (isProtectedContainer(p)) break;

      const pRect = p.getBoundingClientRect ? p.getBoundingClientRect() : null;
      if (!pRect || pRect.width === 0 || pRect.width > 500) break;

      const pText = (p.textContent || '').toLowerCase();
      if (pText.includes('stock') || pText.includes('archivo')) {
        break;
      }
      if (pText.includes('templates') && (pText.includes('uploads') || pText.includes('blocks') || pText.includes('record'))) {
        break;
      }
      if (
        p.classList?.contains('punch-palette-content') ||
        p.classList?.contains('docs-side-panel-content') ||
        p.classList?.contains('docs-side-panel')
      ) {
        break;
      }

      block = p;
      steps++;
    }

    if (block && !isProtectedContainer(block)) {
      const blockRect = block.getBoundingClientRect ? block.getBoundingClientRect() : null;
      const wasShortHeader = !blockRect || blockRect.height < 100;
      hideElementBox(block);

      // If `block` only captured a section header row (e.g., because its parent also holds Stock images),
      // also hide the immediately following sibling search bar / image grid belonging to this section.
      if (wasShortHeader) {
        let sib = block.nextElementSibling;
        let sibCount = 0;
        while (sib && sibCount < 5) {
          const sibText = (sib.textContent || '').toLowerCase();
          if (
            sibText.includes('stock') ||
            sibText.includes('archivo') ||
            (sibText.includes('templates') && (sibText.includes('uploads') || sibText.includes('blocks')))
          ) {
            break;
          }
          hideElementBox(sib);
          sib = sib.nextElementSibling;
          sibCount++;
        }
      }
    }
  }

  function purgeSidebarMediaSections(root) {
    if (!root || !root.querySelectorAll) return;

    // Unhide any container that switched back to displaying safe Stock images
    const previouslyBlocked = document.querySelectorAll('.cg-blocked-sidebar-section');
    for (let i = 0; i < previouslyBlocked.length; i++) {
      const pb = previouslyBlocked[i];
      const pbText = (pb.textContent || '').toLowerCase();
      if (pbText.includes('stock') || pbText.includes('archivo')) {
        pb.classList.remove('cg-blocked-sidebar-section', 'cg-blocked-image-search');
        pb.style.removeProperty('display');
        pb.style.removeProperty('visibility');
        pb.style.removeProperty('height');
        pb.style.removeProperty('min-height');
        pb.style.removeProperty('max-height');
        pb.style.removeProperty('pointer-events');
        pb.style.removeProperty('overflow');
      }
    }

    // 1. Purge by Google Images disclaimer text
    if (CONFIG.BLOCK_IMAGE_SEARCH !== false) {
      const disclaimerNodes = root.querySelectorAll('div, span, p');
      for (let i = 0; i < disclaimerNodes.length; i++) {
        const el = disclaimerNodes[i];
        if (el.children.length > 2) continue;
        const text = (el.textContent || '').toLowerCase();
        if (
          text.length > 20 &&
          text.length < 300 &&
          (text.includes("results don't represent google's views") ||
           text.includes("results do not represent google's views") ||
           text.includes("only select images that you have confirmed"))
        ) {
          hideSidebarSectionFromAnchor(el);
        }
      }
    }

    // 2. Purge sections and sub-views by header ("Google images", "GIFs")
    const headers = root.querySelectorAll(
      'h1, h2, h3, h4, [role="heading"], [role="button"], [role="link"], a, button, div, span'
    );
    for (let i = 0; i < headers.length; i++) {
      const el = headers[i];
      if (el.children.length <= 2) {
        const rawText = (el.textContent || '').trim();
        if (!rawText || rawText.length > 60) continue;
        const clean = cleanHeaderText(rawText);
        if (isBlockedHeaderLabel(clean)) {
          hideSidebarSectionFromAnchor(el);
        }
      }
    }
  }

  function inspectAndNukeNode(node) {
    if (!node || node.nodeType !== 1) return;

    // In Google Docs/Slides/Sheets, neutralize image search, GIFs, & Explore items
    if (isDocsGoogle && (CONFIG.BLOCK_IMAGE_SEARCH !== false || CONFIG.BLOCK_EXPLORE_TOOL !== false || CONFIG.BLOCK_GIFS !== false)) {
      if (isBlockedImageSearchItem(node)) {
        nukeImageSearchItem(node);
        return;
      }
      dismissImageSearchSidebar(node);
      purgeSidebarMediaSections(node);
    }

    const tag = node.tagName;

    // Remove any non-UI GIF <img> element in Docs/Slides
    if (isDocsGoogle && CONFIG.BLOCK_GIFS !== false && tag === 'IMG') {
      if (isBlockedGifImg(node)) {
        node.remove();
        return;
      }
    }

    if (tag === 'VIDEO' || (isYouTubeSubframe && tag === 'AUDIO')) {
      if (isBlockedVideo(node)) {
        nukeVideo(node);
      }
      return;
    }

    if (tag === 'IFRAME') {
      if (isBlockedIframe(node)) {
        nukeIframe(node);
      }
      return;
    }

    if (tag === 'EMBED' || tag === 'OBJECT') {
      const src = node.getAttribute('src') || node.getAttribute('data') || '';
      if (containsYouTubePattern(src)) {
        node.remove();
        return;
      }
    }

    if (
      node.classList &&
      (node.classList.contains('punch-viewer-video-wrapper') ||
        node.classList.contains('punch-video-player') ||
        node.classList.contains('docs-material-video-player'))
    ) {
      const iframes = node.querySelectorAll('iframe');
      for (let i = 0; i < iframes.length; i++) {
        nukeIframe(iframes[i]);
      }
      node.remove();
      return;
    }

    // Check descendants only if this node actually has child elements
    if (node.firstElementChild && node.querySelectorAll) {
      if (isDocsGoogle && (CONFIG.BLOCK_IMAGE_SEARCH !== false || CONFIG.BLOCK_EXPLORE_TOOL !== false || CONFIG.BLOCK_GIFS !== false)) {
        dismissImageSearchSidebar(node);
        purgeSidebarMediaSections(node);
        const menuCandidates = node.querySelectorAll(
          '.goog-menuitem, [role="menuitem"], .docs-material-menu-item, [role="tab"], [role="option"], .docs-explore-widget, .docs-explore-sidebar, .punch-explore-sidebar, [aria-label*="Search the web" i], [aria-label*="Google Images" i], [aria-label*="Explore" i], [aria-label*="GIFs" i]'
        );
        for (let i = 0; i < menuCandidates.length; i++) {
          if (isBlockedImageSearchItem(menuCandidates[i])) {
            nukeImageSearchItem(menuCandidates[i]);
          }
        }
        if (CONFIG.BLOCK_GIFS !== false) {
          const gifImgs = node.querySelectorAll('img[src*=".gif" i], img[src*="tenor.com" i], img[src^="data:image/gif" i]');
          for (let i = 0; i < gifImgs.length; i++) {
            if (isBlockedGifImg(gifImgs[i])) {
              gifImgs[i].remove();
            }
          }
        }
      }

      const candidates = node.querySelectorAll(
        'video, audio, iframe, embed, object, .punch-viewer-video-wrapper, .punch-video-player, .docs-material-video-player'
      );
      for (let i = 0; i < candidates.length; i++) {
        const el = candidates[i];
        if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') {
          if (isBlockedVideo(el)) nukeVideo(el);
        } else if (el.tagName === 'IFRAME') {
          if (isBlockedIframe(el)) nukeIframe(el);
        } else if (el.tagName === 'EMBED' || el.tagName === 'OBJECT') {
          const src = el.getAttribute('src') || el.getAttribute('data') || '';
          if (containsYouTubePattern(src)) {
            el.remove();
          }
        } else {
          el.remove();
        }
      }
    }

    // If this entire frame is an unauthorized YouTube/YouTubeEducation embed, keep body empty using Trusted-Types-safe replaceChildren()
    if (isYouTubeSubframe && document.body && document.body.childNodes.length > 0) {
      try {
        document.body.replaceChildren();
      } catch {
        // Ignore
      }
    }
  }

  // Immediate sweep of any already-loaded elements in this frame
  if (document.documentElement) {
    inspectAndNukeNode(document.documentElement);
  }

  if (isYouTubeSubframe) {
    try {
      window.stop();
    } catch {
      // Ignore
    }
  }

  // Guard against duplicate observer/listener registration when re-injected by service worker
  if (window.__ytNukeIsolatedInstalled) {
    return;
  }
  window.__ytNukeIsolatedInstalled = true;

  // 3. Capture-phase media event listener: includes `timeupdate` & `progress` so already-loaded/playing videos die immediately
  const MEDIA_EVENTS = [
    'play',
    'playing',
    'timeupdate',
    'progress',
    'loadstart',
    'loadedmetadata',
    'loadeddata',
    'canplay',
    'canplaythrough',
    'seeking',
    'ratechange',
    'volumechange'
  ];

  function onCaptureMediaEvent(e) {
    const target = e.target;
    if (target && isBlockedVideo(target)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      nukeVideo(target);
    }
  }

  for (let i = 0; i < MEDIA_EVENTS.length; i++) {
    window.addEventListener(MEDIA_EVENTS[i], onCaptureMediaEvent, {
      capture: true,
      passive: false
    });
  }

  // 4. Batched MutationObserver using requestAnimationFrame so page performance is never impacted
  const pendingNodes = new Set();
  let rafScheduled = false;
  let lastFullSidebarSweep = 0;

  function processPendingNodes() {
    rafScheduled = false;
    injectBlockStyles();
    const batch = Array.from(pendingNodes);
    pendingNodes.clear();

    if (
      isDocsGoogle &&
      (CONFIG.BLOCK_IMAGE_SEARCH !== false || CONFIG.BLOCK_GIFS !== false || CONFIG.BLOCK_EXPLORE_TOOL !== false)
    ) {
      const now = Date.now();
      if (now - lastFullSidebarSweep > 300) {
        lastFullSidebarSweep = now;
        const sidebars = document.querySelectorAll(
          '.docs-side-panel, .punch-palette, .docs-explore-sidebar, .punch-explore-sidebar'
        );
        for (let s = 0; s < sidebars.length; s++) {
          purgeSidebarMediaSections(sidebars[s]);
        }
      }
    }

    const BATCH_SIZE = 25;
    let index = 0;

    function runBatch() {
      const end = Math.min(index + BATCH_SIZE, batch.length);
      for (; index < end; index++) {
        inspectAndNukeNode(batch[index]);
      }
      if (index < batch.length) {
        requestAnimationFrame(runBatch);
      }
    }

    runBatch();
  }

  function scheduleNodeInspection(node) {
    if (!node || node.nodeType !== 1) return;
    // Fast path: skip document text editor canvas (typing in Docs/Sheets/Slides)
    if (
      node.closest?.('#docs-editor, .kix-appview-editor, .punch-filmstrip-sidebar, .punch-viewer-content') &&
      !node.closest?.('.punch-viewer-video-wrapper, .punch-video-player, video, iframe')
    ) {
      return;
    }
    pendingNodes.add(node);
    if (!rafScheduled) {
      rafScheduled = true;
      requestAnimationFrame(processPendingNodes);
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
      if (m.type === 'attributes') {
        scheduleNodeInspection(m.target);
      } else if (m.type === 'childList') {
        const added = m.addedNodes;
        for (let j = 0; j < added.length; j++) {
          const n = added[j];
          if (n.nodeType === 1) {
            scheduleNodeInspection(n);
          }
        }
      }
    }
  });

  observer.observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'data-src', 'srcdoc', 'allow', 'aria-label', 'title', 'data-tooltip']
  });

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        injectBlockStyles();
        inspectAndNukeNode(document.documentElement);
      },
      { once: true }
    );
  }
})();
