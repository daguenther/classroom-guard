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

  // Sync managed policy overrides if available
  try {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const storageArea = chrome.storage.managed || chrome.storage.local;
      storageArea.get([
        'blockDocsVideo',
        'blockImageSearch',
        'blockExploreTool',
        'blockGifs'
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
        }
      });
    }
  } catch {}

  const YOUTUBE_DOMAINS = CONFIG.VIDEO_DOMAINS || [
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

  const isGoogleVids =
    matchesDomainList(topHost, ['vids.google.com']) ||
    matchesDomainList(currentHost, ['vids.google.com']) ||
    (matchesDomainList(currentHost, ['docs.google.com']) && currentPath.startsWith('/videos'));

  function isDriveAllowedFromClassroom() {
    if (!matchesDomainList(topHost, ['drive.google.com']) && !matchesDomainList(currentHost, ['drive.google.com'])) {
      return false;
    }

    try {
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
        } catch {}
        return true;
      }

      // Check current frame document.referrer
      const docRef = (document.referrer || '').toLowerCase();
      if (docRef.includes('classroom.google.com')) {
        try {
          const fileKey = window.location.pathname;
          window.sessionStorage.setItem('__yt_guard_classroom_file', fileKey);
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
    if (CONFIG.ALLOW_GOOGLE_VIDS !== false && isGoogleVids) {
      // In Google Vids, permit the video creation tool while still blocking YouTube embeds/frames
      return isYouTubeHostOrUrl(currentHost);
    }

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
    return;
  }

  // If this is Google Drive and was opened from Google Classroom, allow playback and exit immediately
  if (CONFIG.ALLOW_CLASSROOM_DRIVE && isDriveAllowedFromClassroom()) {
    return;
  }

  const isUnauthorizedDrive =
    (matchesDomainList(topHost, ['drive.google.com']) || matchesDomainList(currentHost, ['drive.google.com'])) &&
    !isDriveAllowedFromClassroom();

  function isYouTubeHostOrUrl(str) {
    if (!str || typeof str !== 'string') return false;
    const lower = str.toLowerCase();
    if (lower.includes('youtube')) return true;
    return YOUTUBE_DOMAINS.some((d) => lower.includes(d));
  }

  const isYouTubeFrame =
    isYouTubeHostOrUrl(currentHost) ||
    typeof window.ytcfg !== 'undefined' ||
    typeof window.ytplayer !== 'undefined';
  const isDocsGoogle =
    matchesDomainList(currentHost, ['docs.google.com']) &&
    !(CONFIG.ALLOW_GOOGLE_VIDS !== false && isGoogleVids);
  const isGoogleSlides =
    isDocsGoogle && currentPath.startsWith('/presentation/');

  // Block window.open targeting YouTube and Web Image Search from Docs/Slides, and prevent GIF imports
  if (isDocsGoogle) {
    try {
      const origWindowOpen = window.open;
      window.open = function(url, ...args) {
        if (typeof url === 'string') {
          const lowerUrl = url.toLowerCase();
          if (isYouTubeHostOrUrl(url) || lowerUrl.includes('youtube')) {
            return null;
          }
          if (CONFIG.BLOCK_IMAGE_SEARCH !== false && (
            lowerUrl.includes('images.google.') ||
            lowerUrl.includes('tbm=isch') ||
            lowerUrl.includes('udm=2')
          )) {
            return null;
          }
        }
        return origWindowOpen.apply(this, [url, ...args]);
      };
    } catch {}

    // Intercept pasting of GIF images
    document.addEventListener('paste', (e) => {
      if (CONFIG.BLOCK_GIFS === false) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type === 'image/gif') {
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
  }

  function isYouTubeUrl(url) {
    return isYouTubeHostOrUrl(url);
  }

  function isYouTubeVideoElement(mediaEl) {
    if (!mediaEl || !(mediaEl instanceof HTMLMediaElement)) return false;
    if (CONFIG.BLOCK_DOCS_VIDEO === false && !isYouTubeFrame) return false;

    // Inside a YouTube embed frame or any frame with YouTube player globals
    if (
      isYouTubeFrame ||
      typeof window.ytcfg !== 'undefined' ||
      typeof window.ytplayer !== 'undefined'
    ) {
      return true;
    }

    // Inside Google Slides/Docs explicit video player wrapper
    if (mediaEl.closest?.('.punch-viewer-video-wrapper, .punch-video-player, .docs-material-video-player')) {
      return true;
    }

    // Check for YouTube URLs on src or data-src
    if (
      isYouTubeUrl(mediaEl.src) ||
      isYouTubeUrl(mediaEl.currentSrc) ||
      isYouTubeUrl(mediaEl.getAttribute('src')) ||
      isYouTubeUrl(mediaEl.getAttribute('data-src'))
    ) {
      return true;
    }

    // URL-agnostic YouTube HTML5 player DOM fingerprint
    if (
      mediaEl.classList?.contains('html5-main-video') ||
      mediaEl.classList?.contains('video-stream') ||
      mediaEl.closest?.('.html5-video-player, #movie_player, .ytp-player-content')
    ) {
      return true;
    }

    const sources = mediaEl.querySelectorAll('source');
    for (let i = 0; i < sources.length; i++) {
      if (isYouTubeUrl(sources[i].src || sources[i].getAttribute('src'))) {
        return true;
      }
    }

    return false;
  }

  const origPause = HTMLMediaElement.prototype.pause;
  const origLoad = HTMLMediaElement.prototype.load;

  function destroyMediaElement(media) {
    if (!media || !(media instanceof HTMLMediaElement)) return;
    try {
      origPause.call(media);
      media.muted = true;
      media.volume = 0;
      media.autoplay = false;
      media.removeAttribute('src');
      media.removeAttribute('data-src');
      if (media.srcObject) {
        media.srcObject = null;
      }
      const sources = media.querySelectorAll('source');
      for (let i = 0; i < sources.length; i++) {
        sources[i].remove();
      }
      origLoad.call(media);
      media.style.setProperty('display', 'none', 'important');
      media.remove();
    } catch {
      // Ignore DOM teardown errors
    }
  }

  function sweepExistingMedia() {
    try {
      const mediaNodes = document.querySelectorAll('video, audio');
      for (let i = 0; i < mediaNodes.length; i++) {
        if (isYouTubeVideoElement(mediaNodes[i])) {
          destroyMediaElement(mediaNodes[i]);
        }
      }
      if (isYouTubeFrame) {
        try {
          // Stop any in-flight network requests and wipe the YouTube embed DOM
          window.stop();
        } catch {
          // Ignore
        }
        if (document.body) {
          document.body.replaceChildren();
        }
      }
    } catch {
      // Ignore
    }
  }

  // Run sweep immediately (even if script was re-injected into an already-open tab)
  sweepExistingMedia();

  if (window.__ytNukeMainInstalled) {
    return;
  }
  window.__ytNukeMainInstalled = true;

  // 1. Patch HTMLMediaElement.prototype.play, .load, .currentTime, and .paused in MAIN world.
  // Why patch .currentTime and .paused getters?
  // Because if a video was ALREADY loaded and playing before the extension ran, YouTube's player
  // reads `video.currentTime` and `video.paused` every animation frame. Hooking those getters
  // destroys already-playing detached or Shadow-DOM videos in <16ms!
  try {
    const origPlay = HTMLMediaElement.prototype.play;

    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      writable: true,
      value: function (...args) {
        if (isYouTubeVideoElement(this)) {
          try {
            origPause.call(this);
            destroyMediaElement(this);
          } catch {}
          return Promise.resolve();
        }
        return origPlay.apply(this, args);
      }
    });

    Object.defineProperty(HTMLMediaElement.prototype, 'load', {
      configurable: true,
      writable: true,
      value: function (...args) {
        if (isYouTubeVideoElement(this)) {
          try {
            origPause.call(this);
            this.removeAttribute('src');
            if (this.srcObject) {
              this.srcObject = null;
            }
          } catch {
            // Ignore
          }
          return undefined;
        }
        return origLoad.apply(this, args);
      }
    });

    const currentTimeDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
    if (currentTimeDesc && currentTimeDesc.get) {
      Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
        configurable: true,
        enumerable: currentTimeDesc.enumerable,
        get: function () {
          if (isYouTubeVideoElement(this)) {
            destroyMediaElement(this);
            return 0;
          }
          return currentTimeDesc.get.call(this);
        },
        set: function (val) {
          if (isYouTubeVideoElement(this)) {
            destroyMediaElement(this);
            return;
          }
          if (currentTimeDesc.set) {
            currentTimeDesc.set.call(this, val);
          }
        }
      });
    }

    const pausedDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'paused');
    if (pausedDesc && pausedDesc.get) {
      Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
        configurable: true,
        enumerable: pausedDesc.enumerable,
        get: function () {
          if (isYouTubeVideoElement(this)) {
            destroyMediaElement(this);
            return true;
          }
          return pausedDesc.get.call(this);
        }
      });
    }
  } catch {
    // Ignore prototype lock errors
  }

  // 2. Capture-phase media event interceptor in MAIN world (catches `timeupdate` on already-playing videos!)
  const ACTIVE_MEDIA_EVENTS = [
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
    'ratechange'
  ];

  function handleMediaEvent(e) {
    const target = e.target;
    if (target instanceof HTMLMediaElement && isYouTubeVideoElement(target)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      destroyMediaElement(target);
    }
  }

  for (let i = 0; i < ACTIVE_MEDIA_EVENTS.length; i++) {
    window.addEventListener(ACTIVE_MEDIA_EVENTS[i], handleMediaEvent, {
      capture: true,
      passive: false
    });
  }

  // 3. Inside YouTube frames, Google Docs/Slides, or unauthorized Google Drive, also disable MediaSource video buffers (MSE)
  if (isYouTubeFrame || isDocsGoogle || isGoogleSlides || isUnauthorizedDrive) {
    try {
      if (typeof window.MediaSource !== 'undefined') {
        const origIsTypeSupported = window.MediaSource.isTypeSupported;
        window.MediaSource.isTypeSupported = function (mimeType) {
          if (typeof mimeType === 'string' && mimeType.toLowerCase().includes('video')) {
            return false;
          }
          return origIsTypeSupported.call(this, mimeType);
        };

        const origAddSourceBuffer = window.MediaSource.prototype.addSourceBuffer;
        window.MediaSource.prototype.addSourceBuffer = function (mimeType) {
          if (typeof mimeType === 'string' && mimeType.toLowerCase().includes('video')) {
            throw new DOMException('YouTube MediaSource disabled by policy.', 'NotSupportedError');
          }
          return origAddSourceBuffer.call(this, mimeType);
        };
      }
    } catch {
      // Ignore MSE override errors
    }
  }

  // 4. Intercept attachShadow so closed Shadow DOM cannot hide YouTube <iframe> embeds
  try {
    const origAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init) {
      const shadowRoot = origAttachShadow.call(this, init);
      try {
        const obs = new MutationObserver((mutations) => {
          for (let i = 0; i < mutations.length; i++) {
            const added = mutations[i].addedNodes;
            for (let j = 0; j < added.length; j++) {
              const node = added[j];
              if (node.nodeType !== 1) continue;
              if (node instanceof HTMLMediaElement && isYouTubeVideoElement(node)) {
                destroyMediaElement(node);
              } else if (node.tagName === 'IFRAME') {
                const src = node.getAttribute('src') || node.getAttribute('data-src') || '';
                if (isYouTubeUrl(src)) {
                  node.remove();
                }
              } else if (node.querySelectorAll) {
                const iframes = node.querySelectorAll('iframe');
                for (let k = 0; k < iframes.length; k++) {
                  const src = iframes[k].getAttribute('src') || iframes[k].getAttribute('data-src') || '';
                  if (isYouTubeUrl(src)) {
                    iframes[k].remove();
                  }
                }
              }
            }
          }
        });
        obs.observe(shadowRoot, { childList: true, subtree: true });
      } catch {
        // Ignore shadow observer errors
      }
      return shadowRoot;
    };
  } catch {
    // Ignore attachShadow errors
  }
})();
