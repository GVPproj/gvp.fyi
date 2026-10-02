# 09: Back up and restore Likes

**What to build:** The owner can recover Likes records and uploaded files after losing the live instance, using an off-machine backup whose restoration has actually been tested.

**Blocked by:** 04: Collect and view images and PDFs.

**Status:** ready-for-agent

- [ ] Inspect existing backup arrangements first and preserve other applications/data on the shared PocketBase instance.
- [ ] Configure a repeatable off-machine backup covering database records and locally stored uploads; keep backup credentials out of client code and Git.
- [ ] Document the backup schedule, retention, destination, failure visibility, recovery procedure, and expected data-loss window.
- [ ] Choose a low-cost backup destination with owner approval before provisioning paid resources; document ongoing disk, backup, and bandwidth cost drivers without claiming free operation is guaranteed.
- [ ] Backups are private and protect owner credentials and draft contents; a Fly volume snapshot alone is not the primary backup plan.
- [ ] Restore a backup into an isolated instance without modifying production and verify records, authentication/access rules, original uploads, and thumbnails or their regeneration.
- [ ] Verify published content is readable, draft records and files remain inaccessible anonymously, and owner editing still works after restoration.
- [ ] If named collections or additional item types are present, verify their relationships and content survive restoration; keep a reusable recovery fixture/checklist for later additions.
- [ ] Record a successful recovery exercise and explain that backups provide disaster recovery, not per-item trash or an undo feature.
