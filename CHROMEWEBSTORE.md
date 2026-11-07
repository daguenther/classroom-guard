# Chrome Web Store Listing — Classroom Guard

> Last Updated: 2026-10-30

## Store Listing

**Extension Name** [REQUIRED]
Classroom Guard

**Short Description** [REQUIRED]
Blocks embedded videos, Docs image searching, and Google Search AI Overview.

**Detailed Description** [REQUIRED]
Enforces school content and focus policies across managed student devices by providing three independent, policy-managed protections: blocking embedded video playback in Google Docs/Slides, disabling in-editor web image searching, and suppressing AI Overviews and AI Mode in Google Search.

Key Features:
- Setting 1 (Docs & Slides Video Block): Prevents students from bypassing school content filters by playing embedded YouTube videos inside Google Docs, Google Slides, Google Sheets, or embedded slide presentations. Leaves YouTube accessible on approved learning sites.
- Setting 2 (Docs Web Image Search Block): Disables unvetted web image searching ("Search the web", "Google Images", and Explore panels) in Google Docs and Slides while preserving legitimate uploads from Google Drive, local storage, and safe Stock images.
- Setting 3 (Google Search AI Overview & AI Mode Block): Automatically prevents AI Overviews from generating in student Google searches by using Google's clean Web results tab, strips AI Mode entry points, and uses semantic DOM detection as a fallback.
- Future-Proof Architecture: Heading terms, CSS selectors, and domain lists can be updated remotely through Google Admin Console policy (schema.json) without republishing the extension.
- Zero-Overhead Performance: Eliminates heavy DOM sweeps and disconnects mutation observers automatically once pages finish loading.

How to Use:
Deploy the extension to student organizational units via the Google Admin Console. All three protections run automatically with no student or teacher configuration required.

Privacy and Permissions:
This extension operates entirely locally on the device. It does not collect, store, or transmit any student data, browsing history, searches, or personal information.

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Enforces classroom focus policies by blocking embedded videos, Docs web image search, and Google Search AI Overviews on managed student browsers.

**Primary Language** [REQUIRED]
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `icons/icon-128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 PNG | ✅ Ready | `store-assets/screenshot-1280x800.png` |

### Screenshot Notes
- `store-assets/screenshot-1280x800.png` is pre-generated at 1280×800 (24-bit PNG, no alpha) ready for direct upload to the Chrome Web Store Developer Dashboard.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `declarativeNetRequest` | permissions | Blocks network requests to embedded YouTube domains in Google Docs/Slides and applies the clean Web results view (udm=14) to prevent Google Search AI Overview generation. |
| `scripting` | permissions | Injects lockdown scripts immediately into already-open tabs and subframes when the extension starts or recovers from a crash so pre-loaded media cannot continue playing. |
| `tabs` | permissions | Checks the top-level URL of already-open tabs on startup to ensure lockdown scripts are only injected on non-allowlisted websites. |
| `storage` | permissions | Uses in-memory session storage (`chrome.storage.session`) for startup crash recovery and reads Google Admin Console managed policies (`chrome.storage.managed`). |
| `<all_urls>` | host_permissions | Required to detect and remove unauthorized YouTube embed frames, Docs image search menus, and Google Search AI Overviews across managed student sessions. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
See ready-to-host policy text in `store-assets/PRIVACY_POLICY.md` (host on your school website, Google Sites, or GitHub Pages and paste the live URL into the Privacy practices tab).

## Distribution

**Visibility**: Private (Domain-restricted for Google Workspace for Education deployment) or Unlisted
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]
School IT Administration

**Contact Email** [REQUIRED]
<!-- IT Admin contact email -->

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.6.0 | 2026-10-30 | Added Setting 3 (Google Search AI Overview & AI Mode blocker with udm=14 redirect and semantic DOM fallback). Fixed Object.freeze issue preventing Admin Console policy overrides. Replaced heavy full-body Docs sweeps with lightweight sidebar-only observers. | Ready to Submit |
| 1.5.7 | 2026-10-23 | Kept web image searching blocked in Google Docs & Slides while restoring support for Stickers and GIFs, and eliminated Tenor redirect network errors. | Published |
| 1.5.6 | 2026-10-22 | Blocked the new Material 3 "Google images", "GIFs", and "Stickers" sidebar sub-views and sections in Google Slides. | Superseded |
| 1.5.5 | 2026-10-22 | Fixed Google Slides blank-page bug and preserved Closure cleardot.gif UI sprites. | Superseded |
| 1.5.0 | 2026-10-13 | Rebranded to Classroom Guard. Added complete web image search lockdown and Explore tool suppression in Google Docs, Slides, and Sheets. | Superseded |
| 1.2.0 | 2026-10-07 | Added enterprise managed schema.json, URL-agnostic YouTube fingerprinting, and session crash recovery. | Superseded |
| 1.0.0 | 2026-10-07 | Initial release with YouTube-specific network and DOM/JS embed lockdown. | Superseded |
