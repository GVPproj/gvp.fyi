# Private publishing: storage and delivery options

Researched **2026-10-12 (UTC)** for [issue #5](https://github.com/GVPproj/gvp.fyi/issues/5), part of [#3](https://github.com/GVPproj/gvp.fyi/issues/3).

**Status: research and proposed options, not owner decisions or an implementation plan approved for execution.** Official pages and upstream source were fetched with `curl`; issues and comments were read with `gh`. No accounts, credentials, deployed configuration, billing dashboards, or production behavior were inspected. No infrastructure changes were made.

Read alongside `CONTEXT.md`, `OBJECT-STORAGE.md`, and `pocketbase/README.md`. No ADR directory was present. At the start of this research, `OBJECT-STORAGE.md` was an options document; any decision update should follow owner selection, not this research alone.

## Summary and proposed defaults

1. **Keep PocketBase originals private; publish a separate, explicit set of public assets.** S3 compatibility is a storage interface, not a publishing/privacy boundary. Never expose the PocketBase storage bucket wholesale through a CDN.
2. **First option for this small site:** private R2 Standard storage for PocketBase, with selected images/downloads materialized into the Astro/Netlify deployment at build time. This minimizes public-media infrastructure while making deployed media independent of PocketBase. Verify actual Netlify delivery allowances and that image transformations really produce deployed files, rather than runtime origin fetches.
3. **If public media needs its own lifecycle/domain:** evaluate a separate R2 public-media bucket and custom domain first. AWS S3 + CloudFront is a strong alternative where existing account experience, private-origin control, or AWS features outweigh setup complexity. B2 is attractive for larger originals/archives, but its CDN integration and non-partner egress deserve explicit evaluation.
4. **Keep MP3 hosting unchanged initially**, as #5 requires. Do not turn this into an audio migration or recurring-backup project.
5. Provider selection does **not** decide draft semantics. Preserve Likes' default: a new collection item is a published item unless deliberately saved as a draft item. If unfinished edits to a published item must survive unrelated builds privately, publish from snapshots/revisions, not mutable editing records.

These are recommendations for owner review, not adopted defaults.

## PocketBase: verified limits and privacy implications

The repo's backend notes/tests target **0.40.4**, not a verified current deployment. Live PocketBase docs identify **0.40.5**. Source checks below use the **v0.40.4 tag** so implementation behavior is not inferred solely from moving documentation. [P1–P4]

- **Files are public by default when their complete PocketBase URL is known.** Random filename suffixes are not an authorization policy. Making a record private does not automatically protect an unprotected file field. Mark sensitive fields **Protected** and use appropriate collection **View API rules**. [P1, P3]
- For protected fields, the file endpoint obtains auth from the short-lived file token and checks record access against the View rule. The docs' usual token lifetime is about two minutes. **Protected does not invariably mean “requires a token”: an empty/public View rule permits access without one.** Test anonymous access, owner access, and build access explicitly. [P1, P3]
- Normal file URLs remain `/api/files/{collection}/{record}/{filename}` when storage is S3. The handler opens the configured filesystem and calls `fsys.Serve`; the filesystem reads the object and uses Go `http.ServeContent`. It is **not an automatic redirect to a bucket/CDN or an S3 presigned URL**. Public requests still need PocketBase and traverse its serving path, with potential storage requests, backend bandwidth and CPU costs. [P3, P4]
- The serving implementation supports range/conditional HTTP requests, but this is not proof of production seeking, proxy behavior, or performance. Test `206`, `Content-Range`, MIME types and byte integrity end-to-end before any future audio relocation. [P4]
- A direct bucket URL or CDN origin request **bypasses PocketBase View rules and file-token checks**. A PocketBase file token is not an S3 credential. Provider IAM, bucket policy, presigned URLs, and any CDN authorization are separate systems. Therefore keep originals private and export only the approved public bytes. This is an architectural consequence of the two independent access paths. [P1, P3, A4]
- PocketBase thumbnails can be generated on demand and stored; changing storage does not provide the responsive image pipeline requested in #3. A CDN cache in front of PocketBase is also not independent availability: cold/expired requests still require PocketBase. [P1, P3]
- S3 stores uploaded files, **not the PocketBase SQLite database or the application itself**. Built-in backup ZIPs include local uploads but **exclude files uploaded to S3**, even when the ZIP destination is itself an S3 bucket. Database and object recovery must be covered separately. [P2]
- Treat changing the configured storage backend as a migration affecting existing file consumers, including Likes and shared-backend content. Do not assume changing settings migrates existing objects. Inventory originals/thumbnails, test copying and retrieval, and rehearse rollback separately; migration automation was not verified here.

### Build-time access proposal

Prefer a dedicated read-only build identity, allowed to read only approved published snapshots and their protected files. It needs metadata list/view access and the ability to obtain a file token; it does not need PocketBase superuser access, editing rights, or blanket S3 access. A token that expires during a build must be renewed server-side. Do not put auth tokens or token-bearing source URLs into public HTML, logs, source maps, or reusable public caches.

Direct read-only S3 access is an alternative export implementation, **not an authorization equivalent**: object access cannot evaluate PocketBase publishing rules. It requires an approved manifest and appropriately scoped object permissions. A publisher writing a separate public-media bucket needs narrowly scoped write permissions there; public visitors need no credentials. The eventual schema must demonstrate that build permissions cannot read draft items or unfinished revisions.

## Public-media delivery independent of PocketBase

| Approach | PocketBase offline after successful publication | Operational implications |
| --- | --- | --- |
| Materialize selected assets into the static deployment | HTML and copied/generated files remain available | Recommended first experiment at the small scale described by #3. Build fails closed on missing data/files. Verify Netlify image-service behavior, deploy retention and removal semantics; no runtime PocketBase URL may remain in images, PDFs or other downloads. |
| Separate public-media bucket + CDN/domain | HTML and published objects remain available, including cold CDN misses | Extra upload/publish manifest, credentials, cache management and orphan cleanup. Upload immutable/versioned objects before deploying references; retain previous deployment assets for rollback. |
| PocketBase file URLs, even with S3 behind them | Not reliably available | Reject if independent image availability is required. CDN hits may mask an outage but do not remove the dependency. |

For a separate bucket, “private origin” and “private content” are different: an S3 origin restricted to CloudFront can still intentionally serve public media anonymously through CloudFront. Never connect that unrestricted public distribution to all draft originals.

Unpublication requires a successful replacement site deployment **and**, if removal of bytes is required, object deletion and CDN invalidation/purge. Browser caches, old deployment URLs and copies already downloaded cannot be revoked. Choose an explicit removal target and cache TTL policy; do not promise instant privacy after publication. Versioned immutable URLs simplify replacement but do not solve deletion.

## Current published pricing (USD, before taxes)

These are **public list prices, not quotes or verified account entitlements**. Region, plan, billable-unit rounding, other account usage and contracts matter. Hot/Standard storage is the relevant baseline; infrequent-access storage adds retrieval/minimum-duration complications for little benefit here.

| Component | AWS S3 Standard + CloudFront | Cloudflare R2 Standard | Backblaze B2 pay-as-you-go |
| --- | --- | --- | --- |
| Storage | **$0.023/GB-month**, first 50 TB in `us-east-1` | **$0.015/GB-month** | Current main page: **$6.95/TB/30 days**, approximately **$0.00695/GB-month** using decimal units |
| Writes/listing | S3 PUT/COPY/POST/LIST **$0.005/1,000** | Class A **$4.50/million** | Ordinary Class A/B/C calls currently **free**; see source discrepancy below |
| Reads | S3 GET/other Tier 2 **$0.0004/1,000** | Class B **$0.36/million** | Ordinary GET/HEAD calls free; Class D **$0.004/10,000** after 2,500 free daily, not the ordinary object-read path |
| Transfer | S3 → CloudFront origin fetch transfer free; S3 requests still apply. CloudFront PAYG initial paid US/Europe band **$0.085/GB**; US HTTPS requests **$0.01/10,000**. S3 → PocketBase outside AWS/build runners may incur S3 internet egress. | Internet egress **free**, but storage and operations are not | Free egress up to **3× average monthly stored bytes**; then **$0.01/GB**. Eligible CDN/compute-partner routes can have unlimited free B2 egress; CDN charges/terms are separate. |
| Main setup | S3 bucket/IAM, CloudFront origin access control (OAC), bucket policy, certificate/domain and cache policy | S3-compatible endpoint/token for private bucket; separate public bucket with production custom domain for CDN delivery | Regional S3-compatible endpoint/application key; separate public bucket + CDN configuration, or private published-media origin + authenticated proxy |

Sources: S3 pricing and official regional price JSON [A1–A2]; CloudFront PAYG [A3]; R2 [R1]; B2 pricing and transaction details [B1–B2]. The S3 JSON confirms Standard storage and request rates rather than relying on similarly priced **S3 Tables**, which is a different product. CloudFront viewer geography is independent of S3 bucket region.

### Free allowances: do not assume this repo gets a zero bill

- **AWS signup credits:** the current program for new accounts (from July 15, 2025) offers up to $200 in credits, with a six-month Free plan; credits and expiry depend on account eligibility and plan. Do **not** assume the historical 12-month S3 allowance, new-account credits, or any remaining balance applies to the owner's account. [A1, A6]
- **CloudFront PAYG recurring allowance:** the current pricing table says **1 TB transfer and 10 million HTTP/HTTPS requests monthly**. These are not per-repo gifts; other eligible account usage consumes the allowance. Some worked examples on the same page inconsistently mention 20 million requests. Use the explicit 10-million table conservatively and confirm billing terms before selection. [A3]
- **CloudFront flat-rate plans are a different choice, not an extra PAYG discount.** Current Free plan: **$0/distribution/month**, **100 GB transfer**, **1 million requests**, and **5 GB S3 Standard storage credits**. Pro: **$15/month**, 50 TB transfer, 10 million requests and 50 GB storage credits. Flat-rate plans advertise no overage charges, but sustained substantial excess can lead to delivery/performance adjustments; upgrade may be necessary. S3 storage credits do not erase S3 request charges or all other AWS usage. Do not stack incompatible offers or assume eligibility. [A5, A7]
- **R2:** recurring Standard allowance of **10 GB-month**, **1 million Class A**, and **10 million Class B** operations/month. Infrequent Access gets no such free tier. Treat this as shared account allowance, not a fresh allocation for each bucket or this project. R2 rounds billable usage **up to whole billing units**, including millions of operations: slightly exceeding an operation allowance can cost more than fractional-rate arithmetic suggests. [R1]
- **B2:** first **10 GB storage per account** free; 3× egress is based on actual average storage, not a universal traffic allowance. Tiny storage means a tiny non-partner egress allowance. Confirm account contract/plan; the current page specifies free A/B/C calls for PAYG customers. [B1–B2]
- **No owner-account free capacity was verified.** DNS, Netlify, PocketBase hosting/Fly transfer, backups, monitoring, Workers, image processing and support can create additional costs even when the object-storage invoice is zero.

### Illustrative monthly estimate — not a forecast

Assume **20 GB total stored** across originals and published derivatives; **10,000 write/list operations**, **100,000 storage reads**, and **100 GB delivered in 1 million HTTPS viewer requests**. These deliberately round numbers are **not measured site traffic**. CloudFront delivery assumed US/Europe; storage reads are separately specified rather than assuming all viewer requests hit origin. Ignore backup copies, versions, logs, DNS, private download transfer and ancillary services.

| Path | Estimate and assumptions |
| --- | --- |
| S3 + CloudFront PAYG, no allowances available | S3: `20 × .023 + 10,000/1,000 × .005 + 100,000/1,000 × .0004 = $0.55`. CloudFront: `100 × .085 + 1,000,000/10,000 × .01 = $9.50`. **Total ≈ $10.05**. |
| Same, sufficient CloudFront PAYG allowance remaining | **≈ $0.55** for S3; no S3 credits assumed. |
| S3 + CloudFront Free flat-rate, eligible and within limits | Illustratively **≈ $0.435** S3: `(20−5) × .023 + .05 + .04`; CloudFront $0. Depends on storage credit application and request/transfer eligibility. Exactly at the modeled viewer limits; not unlimited service. |
| R2 with full Standard allowance remaining | `(20−10) × .015 =` **$0.15**; modeled operations inside allowance, egress $0. |
| R2 with account allowances already exhausted | Storage $0.30 plus one rounded Class A million ($4.50) and one Class B million ($0.36): **≈ $5.16 standalone billable-unit illustration**. Incremental project cost depends on pre-existing account usage and rounding boundaries; fractional operation cost is not the invoice. |
| B2, first 10 GB allowance available; direct non-partner downloads | Storage `(20−10) × .00695 = $0.0695`; egress `(100−3×20) × .01 = $0.40`; ordinary operations $0. **≈ $0.47**. |
| Same B2 storage, eligible partner delivery | **≈ $0.07 B2-only**, plus whatever the CDN/proxy costs. If storage allowance is already used, modeled storage is approximately $0.139 instead. |

Use provider-defined GB/TB and byte-hour accounting for an actual quote. Private editing/build downloads add to transfer and operation totals, as do thumbnails, retries, HEAD/LIST calls, object versions and restore tests. At the roughly 4.2 MB of local images reported by #3 (not a fresh inventory of all Likes files), workflow simplicity matters more than sub-cent storage differences.

## Provider operations and trade-offs

### AWS S3 + CloudFront

- Keep S3 Block Public Access enabled. For published assets use CloudFront **OAC**, a distribution-scoped read bucket policy, and a regular S3 origin, **not the S3 website endpoint**; OAC does not work with website endpoints. Sign origin requests and use HTTPS. Only approved public assets belong under that origin's allowed scope. [A4]
- Strong native private-origin model without a custom proxy. More IAM, certificate, DNS, cache and billing configuration than R2's public-domain route. A separate private PocketBase bucket avoids confusing origin privacy with draft privacy.
- PAYG has geographic delivery pricing and cost exposure after allowances. Flat-rate Free/Pro may be attractive but have feature/usage constraints; notably the current Free/Pro matrix does not include custom caching rules. Validate required removal/cache controls against the chosen plan. [A3, A5, A7]
- Budget S3 → non-AWS PocketBase/build transfer separately from S3 → CloudFront. The S3 page lists a shared first 100 GB internet-transfer allowance across AWS services/regions (with exclusions), not an entitlement dedicated to these files. [A1]

### Cloudflare R2

- Private bucket for PocketBase; bucket-scoped S3-compatible credentials. Public-media bucket separately exposed via a **custom domain in the same Cloudflare account**. Domain onboarding/DNS authority must be checked with the owner; do not assume the current zone is already suitable. [R2]
- `r2.dev` is a **rate-limited development endpoint**, not the production media URL. Custom domains provide Cloudflare caching; cache eligibility depends on file type/configuration, not simply storing an object in R2. Disable the development public URL if it would bypass desired domain controls. [R2]
- No internet egress fee is appealing for both private build reads and public downloads. Request billing/rounding still matters, especially uncached traffic and bots. No Worker is required for the simple public-bucket/custom-domain route; authenticated custom delivery would be a separate design and cost.
- Best candidate for operational simplicity if Cloudflare domain/account integration is acceptable. Still test PocketBase compatibility with the exact endpoint, region/path-style settings, object lifecycle and least-privilege token before adoption.

### Backblaze B2

- Lowest published storage rate among these hot-storage options. The benefit becomes more material for growing private originals than for this site's current image size. Ordinary API calls are currently free for PAYG. [B1–B2]
- Public B2 + Cloudflare uses a proxied hostname, TLS, and a **bucket-scoped URL rewrite rule**; Backblaze warns that the shared origin hostname otherwise permits fetching another customer's bucket via your domain. CDN caching requires deliberate configuration. Direct public B2 URLs remain an alternate route, which may incur non-partner egress. [B3]
- For a private **published-media** origin, Backblaze documents a Cloudflare Worker holding an application key and authenticating origin requests. That adds code, secret rotation, Worker limits/cost and failure modes. It must not blindly proxy the private PocketBase originals bucket. [B4]
- “Free partner egress” applies to the eligible route, not every download from B2. Downloads to PocketBase/Fly or build services cannot be assumed to qualify. CDN product restrictions and charges must be checked for the actual media workload; the B2 partnership is not blanket permission for unlimited free video/audio CDN hosting. [B1, B3]

## Private administration, recovery, and owner gates

Object storage providers do not make the PocketBase dashboard private. Proposed approach: private network/VPN or an authenticated access gateway around administration, **plus** PocketBase authentication; allow a narrowly scoped machine route for CI/builds. Keep any still-required public APIs working until #3's migration/retirement is verified. An IP allowlist may be simpler for stable owner/build addresses; dynamic CI addresses make it less convenient. Public Netlify and Tailscale pricing and private-access prerequisites were investigated below; account entitlements and current network topology remain unverified, and no gateway is selected.

PocketBase recommends superuser IP restrictions (available since 0.38), supports optional superuser MFA, and can encrypt settings containing SMTP/S3 credentials. Use those controls where compatible, with a recovery path. The repo explicitly separates the existing ordinary Likes owner from superusers; do not replace working authorization with browser-exposed administrative credentials. [P2; `pocketbase/README.md`]

Before implementation, the owner needs to resolve:

- **Privacy/publication:** snapshot semantics for edits to published items; independent image/download availability; publication/removal latency; whether public derivative retention for rollback is acceptable.
- **Provider/budget:** existing eligible accounts, region/jurisdiction needs, available allowances, DNS authority, expected storage/traffic, and acceptable monthly spend. No account state was inferred here.
- **Access:** authorize account creation/billing/MFA if needed; approve scoped PocketBase storage and publisher credentials; provision them only through private secret stores. The content-fetch identity gets read-only published-snapshot/file access, not content-publication rights, build-trigger secrets, or owner credentials. Netlify's deployment capability is separate from that identity; authorized backend publication requests alone use the server-side build hook.
- **Recovery:** acceptable data loss and recovery time; one-off pre-migration database backup **and independent object copy**, manifests/checksums, and a restore rehearsal. Include settings-encryption key recovery if enabled. Agree any future backup cadence separately; do not silently revive the declined recurring-backup project. [P2]
- **Conditional human blockers:** if authorization, signup, payment/MFA, DNS delegation or dashboard-only steps are actually necessary, create a separate `ready-for-human` setup issue blocking the affected implementation, with exact non-secret actions. No such tickets were created during this research; no dashboard visit is presumed necessary.

Suggested acceptance experiment after approval: upload a private draft and a published revision; verify anonymous draft original/thumbnail denial through **every** endpoint; build using least privilege; inspect output for draft data/token leakage; disable PocketBase in a controlled test; verify deployed HTML and all images/downloads, including cold-cache requests; unpublish and measure removal behavior; restore database plus objects. Test provider S3 compatibility and existing Likes retrieval before migration. This research did not execute those tests.

## Netlify delivery and private owner access: targeted follow-up

Public pages fetched **2026-10-12**; USD list prices, not verified account entitlements. These options do not authorize changes to the shared Fly backend.

**Netlify static delivery.** Current [pricing](https://www.netlify.com/pricing/) lists Free **$0/month, 300 credits**, Personal **$9/month, 1,000 credits**, and Pro **from $20/month, 3,000 credits** (unlimited members); Enterprise is custom. Free/Personal permit one member. Personal recharge costs **$5/500 credits**, Pro **$10/1,500**; auto-recharge is disabled by default. Production deployments cost **15 credits each**, bandwidth **20 credits/GB**, and web requests **2 credits/10,000**. Copied images/PDFs therefore consume both bandwidth and request credits alongside HTML; Image CDN traffic also counts. Free's 300 credits are not an additional independent bandwidth allowance: even ignoring requests/deployments, they buy only 15 GB. Exhaustion pauses sites; the page warns that one project's excess pauses all account projects. Static independence from PocketBase is not independence from Netlify billing limits. [Plan documentation](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/) distinguishes accounts created before **September 4, 2025** on legacy Free/Starter/Pro plans; switching is irreversible. Check the owner's actual plan and shared consumption before estimating costs or proposing migration. Materialize approved assets during builds; runtime image-origin behavior still needs verification.

**Tailscale owner administration.** Current [pricing and eligibility](https://tailscale.com/pricing) lists Personal **$0**, **six users**, unlimited user devices, **50 tagged resources**, **three ACL groups**, and **1,000 ephemeral-resource minutes/month**. Personal is **non-commercial only**; a personal website does not establish eligibility if the shared backend also serves commercial work. Public-email/personal-GitHub signup normally enters Personal; custom-domain/work signup has different ownership/trial implications. Standard is **$8/user/month** with 1,000 ephemeral minutes; Premium **$18/user/month** with 10,000; Enterprise custom. Additional tagged resources are **$1/month each**. Do not apply historical three-user/100-device limits or assume an existing tailnet migrated.

Operationally, enroll owner devices and run a persistent Tailscale endpoint on Fly or a reachable gateway; approve its identity/state lifecycle, access rules, connectivity and recovery before rollout. [Serve](https://tailscale.com/kb/1242/tailscale-serve) exposes a local service inside the tailnet; do not substitute public Funnel. Restrict owner administration across **all public Fly hostnames and administrative API routes**, not just `/_/`, while preserving required shared public APIs. Keep PocketBase authentication and authorization. For CI, the [GitHub Action](https://tailscale.com/kb/1276/tailscale-github-action) creates tagged ephemeral nodes with policy-limited access and cleanup; budget runner minutes and provision supported workload/OAuth authentication privately. Grant only the build route and a separate PocketBase published-content read identity, not owner privileges. Netlify-hosted builds do not automatically join that tailnet; choose an explicitly network-enabled build runner or scoped read gateway.

**Cloudflare Access alternative.** This is an authenticated gateway, not tailnet-only access. [Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/) requires a running `cloudflared` connector with outbound connectivity; approve hostname/DNS, identity policy and origin-bypass prevention. CI can use [service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/) and a machine policy, separately from PocketBase read authorization; rotation/expiry adds operations. The [official pricing page](https://www.cloudflare.com/plans/zero-trust-services/) returned HTTP 403 during this follow-up, so **current Access prices/seat limits were not verified** and no zero-cost entitlement is assumed.

## Uncertainties and source discrepancies

- All pricing was fetched on the date above and can change. Existing contracts, discounts, taxes, credits, eligibility and account-wide consumption remain unknown.
- **B2 sources disagree on storage:** the current main pricing page says $6.95/TB/30 days; a note on the transaction page still says $0.005/GB/month. Use the main pricing page's **$6.95** as the research baseline, flag the stale/conflicting note, and confirm the actual rate before purchasing. Do not reuse historical $6/TB or paid ordinary-GET assumptions without checking.
- **CloudFront PAYG examples disagree on free request counts:** use the explicit 10-million table, not examples mentioning 20 million. Flat-rate plan allowances are separate and must not be added to PAYG allowances.
- PocketBase official docs are newer than the repo baseline. No production version/settings/schema, custom file hooks, storage migration behavior, IAM compatibility, or actual token lifetimes were measured.
- The small image sizes in #3 exclude an audited inventory of all existing PocketBase/ Likes originals, thumbnails, versions and backups. Actual monthly costs need that inventory plus request/traffic geography and cache-hit measurements.
- Netlify/Tailscale public pricing and private-access prerequisites are covered above; actual account plans/eligibility, Cloudflare Access pricing (fetch blocked), image-service behavior, browser cache/removal behavior and CDN media restrictions still need verification before implementation.

## Primary sources fetched

All retrieved **2026-10-12**. Source identifiers above refer to these official documents/source files.

### AWS

- **A1:** [Amazon S3 pricing](https://aws.amazon.com/s3/pricing/) — storage classes, requests, transfer exceptions and current signup-credit program.
- **A2:** [AWS Price List: AmazonS3, current us-east-1 JSON](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/us-east-1/index.json) — `TimedStorage-ByteHrs`, `Requests-Tier1`, `Requests-Tier2` Standard rates.
- **A3:** [CloudFront pay-as-you-go pricing](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/) — recurring allowance, geographic delivery/request prices and example inconsistencies.
- **A4:** [Restrict access to an S3 origin with CloudFront](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html) — OAC, signed requests, bucket policy, website endpoint restriction.
- **A5:** [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/) — flat-rate prices, allowances, features and non-combination terms.
- **A6:** [AWS Free Tier](https://aws.amazon.com/free/) — new-account Free/Paid plans and credits; not evidence of owner eligibility.
- **A7:** [CloudFront flat-rate pricing plans](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html) — usage allowance policy, performance adjustment, S3 storage credits and additional charges.

### Cloudflare

- **R1:** [R2 pricing](https://developers.cloudflare.com/r2/pricing/) — Standard/IA rates, free tier, rounding, operation classes and egress.
- **R2:** [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/) — custom-domain requirements, caching and `r2.dev` limitations.

### Backblaze

- **B1:** [B2 Cloud Storage pricing](https://www.backblaze.com/cloud-storage/pricing) — $6.95/TB, PAYG transactions, 10 GB allowance, 3×/partner egress.
- **B2:** [B2 transaction pricing](https://www.backblaze.com/cloud-storage/transaction-pricing) — operation classification, free A/B/C and paid D; conflicting storage-rate footnote.
- **B3:** [Deliver public B2 content through Cloudflare CDN](https://www.backblaze.com/docs/cloud-storage-deliver-public-backblaze-b2-content-through-cloudflare-cdn) — bucket privacy, DNS, scoped rewrites, TLS and caching.
- **B4:** [Deliver private B2 content through Cloudflare CDN](https://www.backblaze.com/docs/cloud-storage-deliver-private-backblaze-b2-content-through-cloudflare-cdn) — Worker/authenticated origin approach and secret handling.

### PocketBase

- **P1:** [Files upload and handling](https://pocketbase.io/docs/files-handling/) — default public access, protected fields/View rules, tokens, thumbnails and S3 storage.
- **P2:** [Going to production](https://pocketbase.io/docs/going-to-production/) — backup exclusions, superuser restrictions/MFA and settings encryption.
- **P3:** [v0.40.4 file API implementation](https://github.com/pocketbase/pocketbase/blob/v0.40.4/apis/file.go) ([raw fetched source](https://raw.githubusercontent.com/pocketbase/pocketbase/v0.40.4/apis/file.go)) — `fileApi.download`, protected-file authorization and filesystem serving.
- **P4:** [v0.40.4 filesystem implementation](https://github.com/pocketbase/pocketbase/blob/v0.40.4/tools/filesystem/filesystem.go) ([raw fetched source](https://raw.githubusercontent.com/pocketbase/pocketbase/v0.40.4/tools/filesystem/filesystem.go)) — S3 filesystem and `Serve`/`http.ServeContent` behavior.
