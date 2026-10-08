# Possible future object storage for music

Status: options and migration notes, not a decision or scheduled change.

## Current setup

Watery Grave EP's five MP3s live in `public/audio/watery-grave/` and are copied into the Astro build for static delivery by Netlify. The release metadata in `src/data/releases/miracle-fortress.json` supplies each track's `audio_url`; `src/pages/music-releases/[slug].astro` renders native audio controls with `preload="none"` and no autoplay.

This is a reasonable starting point for one EP. Audio does not pass through a Netlify Function, PocketBase, or Fly. Local browser tests cover playback, seeking, byte-range responses, mobile layout, and rendering without JavaScript. Production delivery and the Netlify account's bandwidth allowance still need verification.

## What object storage means

Object storage holds files in a bucket, separately from the website's code and deployment. Amazon S3 is one provider; Cloudflare R2 and Backblaze B2 are alternatives with S3-compatible APIs.

The browser would fetch each MP3 directly from a public storage/CDN URL, ideally under a domain we control, for example:

```text
https://audio.gvp.fyi/watery-grave/01-watery-grave.mp3
```

The native player and static Astro page can remain unchanged. Only the track URLs need to change. PocketBase does not need to manage these files, and moving music would not require moving existing Likes assets.

## When to reconsider static hosting

- More releases make Git history and deployment artifacts inconveniently large.
- Tracks are added or replaced frequently.
- Netlify bandwidth usage or pricing becomes unattractive.
- We want audio uploads to happen independently of website deployments.

Uploading bytes could happen independently after a move, but changing the release JSON or track list would still require a site rebuild.

## Candidate options

| Option | Why consider it | Trade-offs to check |
| --- | --- | --- |
| Stay on Netlify | No new service, credentials, or publishing workflow | Audio remains in Git/deployments; delivery consumes Netlify usage |
| Cloudflare R2 with a public custom domain | S3-compatible storage; currently no internet egress fees; worth evaluating first for public music | Storage and request charges, custom-domain setup, caching behavior, and current terms |
| Amazon S3 with CloudFront | Established object storage and CDN, with an option to keep the bucket private behind the CDN | More configuration; storage, requests, CDN delivery, and applicable transfer charges |
| Backblaze B2 with a CDN | Another S3-compatible option worth comparing on total cost | Current egress allowances, CDN partner conditions, caching, and domain setup |

These are candidates, not verified quotes. Check current official pricing and account terms before choosing. “No egress fees” does not mean every part of the service is free.

Serving files from PocketBase on Fly is also technically possible, but would tie public audio delivery to backend availability, volume capacity, backups, and transfer usage. There is no current need to add that coupling just for music playback.

## Suggested migration path

1. **Choose a provider and delivery domain.** Compare costs against actual traffic. Prefer a domain we control so URLs need not expose the storage provider.
2. **Create a music-only bucket.** Keep upload credentials private and narrowly scoped. Never put storage secrets in public Astro environment variables or browser code. Public playback needs read access through the chosen delivery endpoint, not public write access.
3. **Upload the existing MP3s unchanged.** Preserve stable, readable paths and verify checksums against the originals. Retain an independent copy of the source files; a delivery bucket alone is not a backup plan.
4. **Configure delivery.** Use HTTPS, `Content-Type: audio/mpeg`, byte-range support, and appropriate cache headers. For long-lived immutable caching, give replacements new versioned or content-hashed URLs rather than overwriting cached files.
5. **Test before switching.** Verify HTTP `206` responses and `Content-Range`, playback and seeking on desktop/mobile, no initial audio downloads, and no-JavaScript rendering. Basic cross-origin audio playback usually does not require CORS; configure it if future JavaScript fetching or Web Audio processing needs it. Check any site content-security policy permits the new media origin.
6. **Update `audio_url` values and redeploy Astro.** Keep the old static files during the transition so rollback is simply a metadata change and rebuild.
7. **Monitor delivery and cost.** Set usage alerts where available. Public URLs can be downloaded or hotlinked, so budget for traffic beyond visits to the release page.
8. **Retire duplicate deployment files deliberately.** Preserve old `/audio/...` links with redirects if removing those files. Removing binaries in a new commit does not remove them from existing Git history; history rewriting would be a separate, coordinated decision, not part of the default migration.

## Provisional recommendation

Keep the current static Netlify setup for this EP. If the catalogue or traffic grows enough to justify another service, evaluate R2 with `audio.gvp.fyi` first, alongside S3/CloudFront and B2 on current total cost and operational simplicity.

No object storage resources, credentials, DNS records, or deployment changes are created by this document.
