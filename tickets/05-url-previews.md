# 05: Paste URLs to generate previews

**What to build:** Pasting a URL into the owner editor fetches a useful title, description, and locally stored preview image, without making metadata extraction a prerequisite for saving.

**Blocked by:** 04: Collect and view images and PDFs.

**Status:** ready-for-agent

- [ ] An owner-only PocketBase server endpoint retrieves metadata for supported public HTTP(S) URLs and returns visible progress/success/failure feedback in the editor.
- [ ] Fetched title, description, and preview can be reviewed and overridden; later fetch completion does not overwrite explicit owner edits.
- [ ] A URL can be saved even if metadata or image retrieval fails, with manual metadata entry available.
- [ ] Preview images are copied into durable PocketBase storage and use the same publication protection and cleanup guarantees as uploaded assets.
- [ ] Preserve source provenance and distinguish fetched metadata from owner overrides. Do not archive full pages.
- [ ] The fetcher rejects credentials and unsupported schemes and blocks local, private, link-local, metadata-service, and other non-public network destinations. Validate resolved destinations and every redirect, including image downloads, against SSRF and DNS-rebinding risks.
- [ ] Apply bounded redirects, timeouts, response sizes, image sizes/types, and owner-request rate limits. Never execute fetched scripts or render untrusted fetched HTML.
- [ ] Automated verification uses controlled fixtures for normal metadata, missing fields, failures, redirects, malicious destinations/content, image storage, and manual overrides.
