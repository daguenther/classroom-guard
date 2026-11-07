/**
 * ============================================================================
 * Classroom Guard - Central Configuration
 * ============================================================================
 *
 * This file defines the default settings and operating modes for Classroom Guard.
 * Settings can be overridden dynamically at runtime via Google Admin Console
 * (chrome.storage.managed) without republishing the extension.
 * ============================================================================
 */

(() => {
  'use strict';

  // Guard against duplicate execution syntax errors when re-injected
  if (typeof globalThis !== 'undefined' && (globalThis.CLASSROOM_GUARD_CONFIG || globalThis.YT_GUARD_CONFIG)) {
    return;
  }

  const CONFIG = {
    /**
     * Operating Mode:
     * Options: 'TARGET_DOMAINS_ONLY' (default) | 'BLOCK_ALL_EXCEPT_ALLOWLIST'
     */
    MODE: 'TARGET_DOMAINS_ONLY',

    /**
     * Domains where embedded YouTube video playback is strictly prohibited.
     * Used in 'TARGET_DOMAINS_ONLY' mode.
     */
    TARGET_DOMAINS: [
      'docs.google.com'
    ],

    /**
     * Domains where video embeds are permitted when MODE is set to
     * 'BLOCK_ALL_EXCEPT_ALLOWLIST'.
     */
    ALLOWED_TOP_DOMAINS: [
      'youtube.com',
      'classroom.google.com',
      'ixl.com',
      'vids.google.com'
    ],

    /**
     * Whether video playback inside Google Docs, Slides, and Sheets is blocked.
     * Default: true.
     */
    BLOCK_DOCS_VIDEO: true,

    /**
     * If true (default), permits access to Google Vids (vids.google.com and docs.google.com/videos).
     * YouTube embeds remain strictly blocked, but Google Vids video editing and playback are allowed.
     */
    ALLOW_GOOGLE_VIDS: true,

    /**
     * If true (default), removes the "Search the web" image insertion feature
     * and Google Images search sidebars across Google Docs and Slides.
     * Safe Stock images and Google Drive / local file uploads remain permitted.
     */
    BLOCK_IMAGE_SEARCH: true,

    /**
     * If false (default), GIFs are allowed (searching, importing, pasting, and uploading).
     * Set to true if you want to block GIFs.
     */
    BLOCK_GIFS: false,

    /**
     * If true (default), disables the "Explore" research tool (web and image search
     * panel / shortcuts) in Google Docs and Slides.
     */
    BLOCK_EXPLORE_TOOL: true,

    /**
     * If true, also strips/removes docs.google.com presentation/doc embed iframes
     * when placed on third-party websites.
     */
    BLOCK_DOCS_EMBED_IFRAMES: false,

    /**
     * Whether Google Drive video previews opened from Google Classroom are allowed.
     */
    ALLOW_CLASSROOM_DRIVE: true,

    /**
     * If true (default), blocks Google Search AI Overview.
     */
    BLOCK_AI_OVERVIEW: true,

    /**
     * Strategy for blocking AI Overview in Google Search:
     * - 'web_filter': Redirects searches to Google's clean "Web" results view (udm=14),
     *   preventing AI Overview generation at the network layer.
     * - 'hide_only': Keeps default search tab and hides AI Overview via CSS/DOM.
     */
    AI_OVERVIEW_STRATEGY: 'web_filter',

    /**
     * If true (default), blocks and redirects Google Search AI Mode (udm=50).
     */
    BLOCK_AI_MODE: true,

    /**
     * Additional heading terms to detect and block AI Overview.
     */
    AI_OVERVIEW_HEADING_TERMS: [],

    /**
     * Additional CSS selectors to hide in Google Search.
     */
    AI_OVERVIEW_SELECTORS: [],

    /**
     * Additional image search terms to block in Google Docs/Slides.
     */
    IMAGE_SEARCH_TERMS: [],

    /**
     * Video and streaming domains to block when inside targeted contexts.
     */
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

  // DO NOT Object.freeze so that runtime policy updates can update configuration cleanly!
  if (typeof globalThis !== 'undefined') {
    globalThis.CLASSROOM_GUARD_CONFIG = CONFIG;
    globalThis.YT_GUARD_CONFIG = CONFIG;
  }
})();
