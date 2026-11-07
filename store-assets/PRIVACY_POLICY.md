# Privacy Policy for Classroom Guard

**Last updated: October 13, 2026**

**Classroom Guard** does not collect, store, log, or transmit any personal data, student information, or browsing history. All content filtering rules execute locally on the user's device.

## Data Collection and Storage
- **No Personal Data:** This extension does not collect names, email addresses, IP addresses, or account identifiers.
- **No Browsing History:** This extension does not log, store, or transmit URLs visited, searches conducted, or media viewed.
- **No Analytics or Third-Party Services:** This extension does not use cookies, telemetry, analytics SDKs, or external servers.

## Permissions Usage
- **`declarativeNetRequest` & Host Permissions (`<all_urls>`):** Used strictly locally on the device to block unauthorized embedded YouTube video streams and players on websites outside of approved school domains (`youtube.com`, `classroom.google.com`, and `ixl.com`).
- **`scripting` & `tabs`:** Used strictly locally on browser startup or extension installation to apply video and image search playback restrictions to already-open tabs.
- **`storage`:** Used strictly to read school enterprise policies deployed via the Google Admin Console and manage in-memory session markers locally.

## Contact & Deployment Note
This policy is provided as a ready-to-use template for schools and school districts deploying Classroom Guard internally. Because the extension runs 100% locally and transmits zero data, districts can host this policy directly on their internal IT knowledge base, district website, or GitHub Pages when configuring private deployment.

For technical questions or issues regarding the open-source codebase, open an issue on the GitHub repository. For district student policy inquiries, please contact your school district's IT Administration department.
