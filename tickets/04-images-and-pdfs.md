# 04: Collect and view images and PDFs

**What to build:** The owner can upload images and PDFs into Likes, publish or draft them, and visitors can view them without relying on external source URLs.

**Blocked by:** 02: Edit, draft, publish, and delete items.

**Status:** ready-for-agent

- [ ] Images and PDFs upload to durable PocketBase storage on the existing persistent Fly volume, not Git, deployment output, or ephemeral disk.
- [ ] Uploads have explicit, documented size and supported-format limits enforced server-side, with clear validation and failure messages.
- [ ] Image items retain their proportions within square grid previews and open an enlarged on-site viewer with keyboard dismissal and appropriate focus handling.
- [ ] PDF items have an identifiable card and open the stored PDF in a new tab; generated PDF thumbnail previews are not required.
- [ ] Standalone uploads do not require a destination URL. Optional source attribution and descriptive text can be recorded.
- [ ] Draft asset fields are protected: anonymous and non-owner requests cannot download originals or thumbnails, even with a known file URL. Published assets remain accessible to visitors.
- [ ] Editing, publication transitions, and permanent deletion work for uploaded items; deleting or replacing an owned asset cleans up unused stored files without deleting assets still in use.
- [ ] Upload failures and abandoned operations do not silently accumulate orphaned assets; cleanup behavior is defined and verified.
- [ ] Automated verification covers upload validation, persistence, public viewing, draft-file isolation, publication transitions, and asset cleanup.
