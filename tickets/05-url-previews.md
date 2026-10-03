# 05: Paste URLs to generate previews

**What to build:** Pasting a URL into the owner editor fetches a useful title, description, and locally stored preview image, without making metadata extraction a prerequisite for saving.

**Blocked by:** 04: Collect and view images and PDFs.

**Status:** done (verified locally; deployment pending)

- [x] An owner-only PocketBase server endpoint retrieves metadata for supported public HTTP(S) URLs and returns visible progress/success/failure feedback in the editor.
- [x] Fetched title, description, and preview can be reviewed and overridden; later fetch completion does not overwrite explicit owner edits.
- [x] A URL can be saved even if metadata or image retrieval fails, with manual metadata entry available.
- [x] Preview images are copied into durable PocketBase storage and use the same publication protection and cleanup guarantees as uploaded assets.
- [x] Preserve source provenance and distinguish fetched metadata from owner overrides. Do not archive full pages.
- [x] The fetcher rejects credentials and unsupported schemes and blocks local, private, link-local, metadata-service, and other non-public network destinations. Validate resolved destinations and every redirect, including image downloads, against SSRF and DNS-rebinding risks.
- [x] Apply bounded redirects, timeouts, response sizes, image sizes/types, and owner-request rate limits. Never execute fetched scripts or render untrusted fetched HTML.
- [x] Automated verification uses controlled fixtures for normal metadata, missing fields, failures, redirects, malicious destinations/content, image storage, and manual overrides.
