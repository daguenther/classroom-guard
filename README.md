# Classroom Guard

An ultra-lightweight, future-proof Manifest V3 Chrome Extension designed for K–12 student Chromebook and browser deployments.

Classroom Guard provides **three independent, policy-configurable protections**:

1. **Setting 1: Video Lockdown in Google Docs, Slides & Sheets**
   - Completely destroys embedded YouTube, YouTube Education, and HTML5 video players in Google Docs, Slides, and Sheets (including embedded presentations on third-party websites like `pubembed`).
   - YouTube directly on `youtube.com` and inside Google Classroom remains accessible (or can be locked down network-wide via `BLOCK_ALL_EXCEPT_ALLOWLIST` mode).
   - Google Vids (`vids.google.com`) is preserved for student video editing.

2. **Setting 2: Web Image Search & Explore Removal in Docs & Slides**
   - Removes the unvetted `Insert > Image > Search the web` menu item, toolbar button dropdown, right-click `Replace image > Search the web`, and image search side panels in Google Docs and Slides.
   - Safe Stock images, Google Drive, and local file uploads remain accessible.
   - Disables the built-in Explore research tool and shortcuts (`Ctrl+Alt+Shift+I` / `Cmd+Option+Shift+I`).
   - Includes optional GIF blocking (`blockGifs`).

3. **Setting 3: Google Search AI Overview & AI Mode Blocker (New in v1.6.0)**
   - **Network-Level Defense (Primary)**: Automatically routes student Google searches to Google's clean "Web" results view (`udm=14`), completely preventing the AI Overview from ever generating.
   - **AI Mode Defense**: Blocks and redirects AI Mode (`udm=50`) queries so students cannot switch into generative AI mode.
   - **Semantic DOM Fallback**: Detects AI Overview cards by heading text and container hierarchy across languages, hiding them instantly even if Google changes URL patterns.
   - **Zero Ongoing CPU**: The search mutation observer automatically disconnects 10 seconds after page load.

---

## Remote Configuration via Google Admin Console (`schema.json`)

All features are independently controllable without republishing the extension. In **Google Admin Console → Devices → Chrome → Apps & extensions → Users & browsers**, select your Students Organizational Unit (OU), select **Classroom Guard**, and configure **Policy for extensions**:

### Example 1: Full Classroom Protection (All 3 Settings Enabled)
```json
{
  "blockDocsVideo": {
    "Value": true
  },
  "blockImageSearch": {
    "Value": true
  },
  "blockExploreTool": {
    "Value": true
  },
  "blockAiOverview": {
    "Value": true
  },
  "aiOverviewStrategy": {
    "Value": "web_filter"
  },
  "blockAiMode": {
    "Value": true
  }
}
```

### Example 2: Allow Web Image Search, Keep Videos and AI Overview Blocked
```json
{
  "blockDocsVideo": {
    "Value": true
  },
  "blockImageSearch": {
    "Value": false
  },
  "blockAiOverview": {
    "Value": true
  }
}
```

### Example 3: Use DOM Hide-Only for Google Search (Retains Standard Search Layout)
```json
{
  "blockAiOverview": {
    "Value": true
  },
  "aiOverviewStrategy": {
    "Value": "hide_only"
  }
}
```

### Example 4: Remote Future-Proof Patches (No Extension Update Required)
If Google alters search classes or introduces new bypass terms, push them instantly from the Admin Console:
```json
{
  "aiOverviewHeadingTerms": {
    "Value": ["new ai overview label"]
  },
  "aiOverviewSelectors": {
    "Value": ["div[data-new-ai-container]"]
  },
  "imageSearchTerms": {
    "Value": ["custom new image search text"]
  }
}
```

---

## Policy Reference Table

| Policy Key | Type | Default | Description |
|------------|------|---------|-------------|
| `blockDocsVideo` | Boolean | `true` | Setting 1: Blocks embedded YouTube and HTML5 videos in Google Docs, Slides, and Sheets. |
| `blockImageSearch` | Boolean | `true` | Setting 2: Removes 'Search the web' / Google Images in Docs/Slides. |
| `blockExploreTool` | Boolean | `true` | Setting 2: Disables Explore tool in Docs/Slides. |
| `blockGifs` | Boolean | `false` | Setting 2: Blocks GIF searching, uploading, and pasting in Docs/Slides. |
| `blockAiOverview` | Boolean | `true` | Setting 3: Blocks Google Search AI Overviews. |
| `aiOverviewStrategy` | String (`web_filter` \| `hide_only`) | `web_filter` | Setting 3: `web_filter` (redirects to clean Web tab `udm=14`) or `hide_only` (keeps default search tab and removes card via DOM/CSS). |
| `blockAiMode` | Boolean | `true` | Setting 3: Blocks and redirects Google Search AI Mode (`udm=50`). |
| `aiOverviewHeadingTerms` | Array of strings | `[]` | Custom heading labels to detect and block AI Overview. |
| `aiOverviewSelectors` | Array of strings | `[]` | Custom CSS selectors to hide in Google Search. |
| `imageSearchTerms` | Array of strings | `[]` | Custom labels to block in Docs image insertion menus. |
| `mode` | String (`TARGET_DOMAINS_ONLY` \| `BLOCK_ALL_EXCEPT_ALLOWLIST`) | `TARGET_DOMAINS_ONLY` | When set to `BLOCK_ALL_EXCEPT_ALLOWLIST`, blocks video embeds across all non-allowlisted websites. |
| `allowGoogleVids` | Boolean | `true` | Allows Google Vids video editing tool. |
| `extraBlockedDomains` | Array of strings | `[]` | Additional streaming domains to block. |
| `extraAllowedTopDomains` | Array of strings | `[]` | Additional educational domains to allow in allowlist mode. |

---

## Local Testing (Unpacked)

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Click **Load unpacked** and select this directory.
3. Test **Google Search**:
   - Search for `photosynthesis` or `causes of the civil war` on `google.com`.
   - Notice the search automatically switches to the clean "Web" tab (`udm=14`) with **no AI Overview card**.
   - Notice standard tabs (Images, News, Videos, Maps, Shopping) remain fully functional.
   - Attempt to navigate to `google.com/search?q=test&udm=50` (AI Mode) — notice it is immediately blocked and redirected.
4. Test **Google Docs / Slides**:
   - Open any presentation or document.
   - Click **Insert → Image**: notice **Search the web** is completely removed (Safe Stock, Drive, and Upload remain).
   - Check the bottom-right corner: the **Explore** widget is removed.
   - Open a presentation with an embedded YouTube video: the video player is stripped and blocked from streaming.
