try {
  importScripts('/config.js');
} catch (e) {
  try {
    importScripts('../config.js');
  } catch (err) {}
}

const CONFIG = (typeof globalThis !== 'undefined' && (globalThis.CLASSROOM_GUARD_CONFIG || globalThis.YT_GUARD_CONFIG))
  ? (globalThis.CLASSROOM_GUARD_CONFIG || globalThis.YT_GUARD_CONFIG)
  : {
      MODE: 'TARGET_DOMAINS_ONLY',
      TARGET_DOMAINS: ['docs.google.com'],
      ALLOWED_TOP_DOMAINS: ['youtube.com', 'classroom.google.com', 'ixl.com', 'vids.google.com'],
      BLOCK_DOCS_VIDEO: true,
      BLOCK_IMAGE_SEARCH: true,
      BLOCK_GIFS: false,
      BLOCK_EXPLORE_TOOL: true,
      BLOCK_DOCS_EMBED_IFRAMES: false,
      ALLOW_CLASSROOM_DRIVE: true,
      BLOCK_AI_OVERVIEW: true,
      AI_OVERVIEW_STRATEGY: 'web_filter',
      BLOCK_AI_MODE: true,
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

function isAllowedUrl(urlString, allowedDomains = CONFIG.ALLOWED_TOP_DOMAINS) {
  if (!urlString) return true;
  if (
    urlString.startsWith('chrome://') ||
    urlString.startsWith('chrome-extension://') ||
    urlString.startsWith('edge://') ||
    urlString.startsWith('about:')
  ) {
    return true;
  }
  try {
    const host = new URL(urlString).hostname.toLowerCase();
    return allowedDomains.some(
      (domain) => host === domain || host.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

async function getManagedConfig() {
  try {
    const policy = await chrome.storage.managed.get([
      'mode',
      'targetDomains',
      'blockDocsVideo',
      'extraBlockedDomains',
      'extraAllowedTopDomains',
      'blockDocsEmbedIframes',
      'blockImageSearch',
      'blockExploreTool',
      'blockGifs',
      'allowGoogleVids',
      'blockAiOverview',
      'aiOverviewStrategy',
      'blockAiMode',
      'aiOverviewHeadingTerms',
      'aiOverviewSelectors',
      'imageSearchTerms'
    ]);

    const mode = policy.mode || CONFIG.MODE;
    const targetDomains = Array.isArray(policy.targetDomains) && policy.targetDomains.length > 0
      ? policy.targetDomains.map((d) => String(d).toLowerCase().trim()).filter(Boolean)
      : CONFIG.TARGET_DOMAINS;
    const blockDocsVideo = typeof policy.blockDocsVideo === 'boolean'
      ? policy.blockDocsVideo
      : (CONFIG.BLOCK_DOCS_VIDEO !== false);
    const extraBlocked = Array.isArray(policy.extraBlockedDomains)
      ? policy.extraBlockedDomains.map((d) => String(d).toLowerCase().trim()).filter(Boolean)
      : [];
    const extraAllowed = Array.isArray(policy.extraAllowedTopDomains)
      ? policy.extraAllowedTopDomains.map((d) => String(d).toLowerCase().trim()).filter(Boolean)
      : [];
    const blockImageSearch = typeof policy.blockImageSearch === 'boolean'
      ? policy.blockImageSearch
      : (CONFIG.BLOCK_IMAGE_SEARCH !== false);
    const blockExploreTool = typeof policy.blockExploreTool === 'boolean'
      ? policy.blockExploreTool
      : (CONFIG.BLOCK_EXPLORE_TOOL !== false);
    const blockGifs = typeof policy.blockGifs === 'boolean'
      ? policy.blockGifs
      : (CONFIG.BLOCK_GIFS === true);
    const allowGoogleVids = typeof policy.allowGoogleVids === 'boolean'
      ? policy.allowGoogleVids
      : (CONFIG.ALLOW_GOOGLE_VIDS !== false);
    const blockAiOverview = typeof policy.blockAiOverview === 'boolean'
      ? policy.blockAiOverview
      : (CONFIG.BLOCK_AI_OVERVIEW !== false);
    const aiOverviewStrategy = policy.aiOverviewStrategy || CONFIG.AI_OVERVIEW_STRATEGY || 'web_filter';
    const blockAiMode = typeof policy.blockAiMode === 'boolean'
      ? policy.blockAiMode
      : (CONFIG.BLOCK_AI_MODE !== false);
    const aiOverviewHeadingTerms = Array.isArray(policy.aiOverviewHeadingTerms) ? policy.aiOverviewHeadingTerms : [];
    const aiOverviewSelectors = Array.isArray(policy.aiOverviewSelectors) ? policy.aiOverviewSelectors : [];
    const imageSearchTerms = Array.isArray(policy.imageSearchTerms) ? policy.imageSearchTerms : [];

    const effective = {
      mode,
      targetDomains,
      blockDocsVideo,
      allowedDomains: [...new Set([...CONFIG.ALLOWED_TOP_DOMAINS, ...extraAllowed])],
      extraBlockedDomains: extraBlocked,
      blockImageSearch,
      blockExploreTool,
      blockGifs,
      allowGoogleVids,
      blockAiOverview,
      aiOverviewStrategy,
      blockAiMode,
      aiOverviewHeadingTerms,
      aiOverviewSelectors,
      imageSearchTerms
    };

    // Cache in local storage for content script access
    try {
      await chrome.storage.local.set({ classroomGuardPolicy: effective });
    } catch {}

    return effective;
  } catch {
    return {
      mode: CONFIG.MODE,
      targetDomains: CONFIG.TARGET_DOMAINS,
      blockDocsVideo: CONFIG.BLOCK_DOCS_VIDEO !== false,
      allowedDomains: CONFIG.ALLOWED_TOP_DOMAINS,
      extraBlockedDomains: [],
      blockImageSearch: CONFIG.BLOCK_IMAGE_SEARCH !== false,
      blockExploreTool: CONFIG.BLOCK_EXPLORE_TOOL !== false,
      blockGifs: CONFIG.BLOCK_GIFS === true,
      allowGoogleVids: CONFIG.ALLOW_GOOGLE_VIDS !== false,
      blockAiOverview: CONFIG.BLOCK_AI_OVERVIEW !== false,
      aiOverviewStrategy: CONFIG.AI_OVERVIEW_STRATEGY || 'web_filter',
      blockAiMode: CONFIG.BLOCK_AI_MODE !== false,
      aiOverviewHeadingTerms: [],
      aiOverviewSelectors: [],
      imageSearchTerms: []
    };
  }
}

/**
 * Syncs rules based on operating mode, feature toggles, and enterprise policy.
 */
async function syncManagedDynamicRules() {
  try {
    const config = await getManagedConfig();
    const {
      mode,
      targetDomains,
      allowedDomains,
      extraBlockedDomains,
      blockDocsVideo,
      blockAiOverview,
      aiOverviewStrategy
    } = config;

    // 1. Manage Static Rulesets (enable/disable whole rule resources)
    const enableRulesetIds = [];
    const disableRulesetIds = [];

    // Docs video ruleset
    if (blockDocsVideo) {
      enableRulesetIds.push('video_lockdown_rules');
    } else {
      disableRulesetIds.push('video_lockdown_rules');
    }

    // AI Overview ruleset (only enabled if strategy is web_filter and feature is on)
    if (blockAiOverview && aiOverviewStrategy === 'web_filter') {
      enableRulesetIds.push('ai_overview_rules');
    } else {
      disableRulesetIds.push('ai_overview_rules');
    }

    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds,
      disableRulesetIds
    });

    // 2. Manage Dynamic Rules
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existingRules.map((r) => r.id);
    const addRules = [];

    if (blockDocsVideo) {
      if (mode === 'TARGET_DOMAINS_ONLY') {
        const additionalTargets = targetDomains.filter((d) => d !== 'docs.google.com');
        if (additionalTargets.length > 0) {
          addRules.push({
            id: 2001,
            priority: 1000,
            action: { type: 'block' },
            condition: {
              requestDomains: CONFIG.VIDEO_DOMAINS,
              initiatorDomains: additionalTargets,
              resourceTypes: [
                'main_frame',
                'sub_frame',
                'script',
                'xmlhttprequest',
                'media',
                'object',
                'other'
              ]
            }
          });
          addRules.push({
            id: 2002,
            priority: 1000,
            action: { type: 'block' },
            condition: {
              urlFilter: '*youtube*',
              initiatorDomains: additionalTargets,
              resourceTypes: [
                'sub_frame',
                'script',
                'xmlhttprequest',
                'media',
                'object',
                'other'
              ]
            }
          });
        }
      } else {
        addRules.push({
          id: 2001,
          priority: 1000,
          action: { type: 'allowAllRequests' },
          condition: {
            requestDomains: allowedDomains,
            resourceTypes: ['main_frame']
          }
        });
        addRules.push({
          id: 2002,
          priority: 100,
          action: { type: 'block' },
          condition: {
            requestDomains: [...CONFIG.VIDEO_DOMAINS, ...extraBlockedDomains],
            excludedInitiatorDomains: allowedDomains,
            resourceTypes: [
              'main_frame',
              'sub_frame',
              'script',
              'xmlhttprequest',
              'media',
              'object',
              'other'
            ]
          }
        });
      }
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules
    });

    return config;
  } catch (err) {
    console.error('Failed to sync rules:', err);
    return null;
  }
}

async function enforceOnTab(tabId) {
  if (!tabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['config.js', 'content/nuke-main.js'],
      world: 'MAIN',
      injectImmediately: true
    });
  } catch {}

  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['config.js', 'content/nuke-isolated.js'],
      world: 'ISOLATED',
      injectImmediately: true
    });
  } catch {}
}

async function sweepAllOpenTabs() {
  try {
    await syncManagedDynamicRules();
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:')) {
        await enforceOnTab(tab.id);
      }
    }
  } catch (err) {
    console.error('Failed to sweep open tabs:', err);
  }
}

async function recoverIfCrashedOrStarting() {
  try {
    const { activeSession } = await chrome.storage.session.get('activeSession');
    if (!activeSession) {
      await chrome.storage.session.set({ activeSession: true });
      await sweepAllOpenTabs();
    }
  } catch {
    await sweepAllOpenTabs();
  }
}

recoverIfCrashedOrStarting();

// --- Classroom Opener & Drive Access Tracking ---

async function markClassroomTab(tabId) {
  if (!tabId) return;
  try {
    const data = await chrome.storage.session.get('classroomAllowedTabs');
    const tabs = Array.isArray(data.classroomAllowedTabs) ? data.classroomAllowedTabs : [];
    if (!tabs.includes(tabId)) {
      tabs.push(tabId);
      await chrome.storage.session.set({ classroomAllowedTabs: tabs });
    }
  } catch {}
}

async function isClassroomTab(tabId) {
  if (!tabId) return false;
  try {
    const data = await chrome.storage.session.get('classroomAllowedTabs');
    const tabs = Array.isArray(data.classroomAllowedTabs) ? data.classroomAllowedTabs : [];
    return tabs.includes(tabId);
  } catch {
    return false;
  }
}

async function markClassroomFile(fileId) {
  if (!fileId) return;
  try {
    const data = await chrome.storage.session.get('classroomAllowedFiles');
    const files = Array.isArray(data.classroomAllowedFiles) ? data.classroomAllowedFiles : [];
    if (!files.includes(fileId)) {
      files.push(fileId);
      await chrome.storage.session.set({ classroomAllowedFiles: files });
    }
  } catch {}
}

async function isClassroomFile(fileId) {
  if (!fileId) return false;
  try {
    const data = await chrome.storage.session.get('classroomAllowedFiles');
    const files = Array.isArray(data.classroomAllowedFiles) ? data.classroomAllowedFiles : [];
    return files.includes(fileId);
  } catch {
    return false;
  }
}

// Native Chromium opener-tab tracking (detects when Classroom opens any Drive tab)
chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.openerTabId) {
    try {
      const opener = await chrome.tabs.get(tab.openerTabId);
      if (opener && opener.url && opener.url.toLowerCase().includes('classroom.google.com')) {
        await markClassroomTab(tab.id);
      }
    } catch {}
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    const data = await chrome.storage.session.get('classroomAllowedTabs');
    if (Array.isArray(data.classroomAllowedTabs)) {
      const updated = data.classroomAllowedTabs.filter((id) => id !== tabId);
      await chrome.storage.session.set({ classroomAllowedTabs: updated });
    }
  } catch {}
});

// Automatically inject approval token when an allowed tab visits drive.google.com
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab && tab.url && tab.url.includes('drive.google.com')) {
    const match = tab.url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    const fileId = match ? match[1] : null;

    let isAllowed = false;
    if (await isClassroomTab(tabId)) {
      isAllowed = true;
    } else if (fileId && (await isClassroomFile(fileId))) {
      isAllowed = true;
      await markClassroomTab(tabId);
    } else if (tab.openerTabId) {
      try {
        const opener = await chrome.tabs.get(tab.openerTabId);
        if (opener && opener.url && opener.url.toLowerCase().includes('classroom.google.com')) {
          isAllowed = true;
          await markClassroomTab(tabId);
          if (fileId) await markClassroomFile(fileId);
        }
      } catch {}
    }

    if (isAllowed) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          func: () => {
            window.__ytGuardClassroomAllowed = true;
            try {
              sessionStorage.setItem('__yt_guard_classroom_allowed', 'true');
            } catch {}
          },
          world: 'MAIN',
          injectImmediately: true
        });
      } catch {}
    }
  }
});

// Messaging bridge with content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'ALLOW_CLASSROOM_DRIVE') {
    if (message.fileId) markClassroomFile(message.fileId);
    if (sender.tab && sender.tab.id) markClassroomTab(sender.tab.id);
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === 'CHECK_DRIVE_ALLOWED') {
    (async () => {
      const tabId = sender.tab ? sender.tab.id : null;
      const fileId = message.fileId || null;
      let allowed = false;

      if (tabId && (await isClassroomTab(tabId))) {
        allowed = true;
      } else if (fileId && (await isClassroomFile(fileId))) {
        allowed = true;
      } else if (sender.tab && sender.tab.openerTabId) {
        try {
          const opener = await chrome.tabs.get(sender.tab.openerTabId);
          if (opener && opener.url && opener.url.toLowerCase().includes('classroom.google.com')) {
            allowed = true;
            if (tabId) await markClassroomTab(tabId);
          }
        } catch {}
      }

      sendResponse({ allowed });
    })();
    return true;
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.session.set({ activeSession: true });
  await sweepAllOpenTabs();
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.storage.session.set({ activeSession: true });
  await sweepAllOpenTabs();
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'managed') {
    await sweepAllOpenTabs();
  }
});
