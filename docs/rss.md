# Combined RSS feed

Subscribe at `/rss.xml`. The static Astro endpoint uses `@astrojs/rss`, the configured
site URL and site title/description. It reads only repository content at build time:
no feed service, Mixcloud API, synchronization or runtime server is involved.
The complete published Blog, Likes, Software, Music and DJ catalogue is included.

## Publishing and editing

- Blog uses its existing `date`; Likes uses its existing `created` timestamp.
- Software, Music and DJ require `publishedAt: YYYY-MM-DD`: the day the entry is
  published **on this site**, not the project, release or broadcast's original date.
  Set this explicitly when adding an entry. Dates are validated calendar dates;
  date-only values mean midnight UTC. Never use filesystem timestamps or build time.
- Every entry has an authored, persistent `id`. RSS GUIDs are opaque, non-permalink
  identities, namespaced by content type (`urn:gvp.fyi:music:<id>`, for example).
  Blog and Software now have explicit IDs too. Keep IDs and publication dates on
  edits, title changes, folder renames and slug changes. Never reuse a removed ID.
  Update slugs/folders and redirects separately; the feed links to the current
  local canonical detail URL, not to the GUID or an external listening page.
- Blog, Software and Music require a plain-text `summary`. Describe the content,
  not its implementation. Do not put Markdown, imports, HTML, scripts or interactive
  components in it. The feed does not render full MDX posts or embedded applications.
  Software tooling/website/repository and Music artist/release/credits/listening
  metadata are added to the summary automatically.
- Likes summaries use rendered body text (with unsafe/interactive markup removed),
  attribution and source/asset links. Quotes and notes retain their full text in the
  feed, independently of the shorter overview preview.
- Keep original Music `release_date` precision and `display_date` qualifications.
  Keep DJ `broadcast.status` and uncertain notes; never manufacture an exact day
  from a year, month, upload timestamp or guess. DJ descriptions name the programme,
  participation credit, broadcast-date status and **full linked recording** duration.
  Shared broadcasts remain shared, not wholly Graham's set. Publish a recording
  once, in its programme, even when its uploader differs.
- Items sort newest first, then by GUID in ascending code-point order for ties.
  New categories of content should join only when published entries have local
  detail pages. There are no category feeds, pagination, enclosures or players.

## Initial archive backfill

All current Software, Music and DJ entries have repository evidence of introduction
into the public site catalogue. We recovered that day and persist it in frontmatter;
we do **not** claim exact production deployment timestamps. Later migrations into
Astro content collections do not constitute new publications.

| Entries | `publishedAt` | Repository evidence |
| --- | --- | --- |
| All seven Software projects | `2026-10-09` | `968a8f2`: public software catalogue and detail routes |
| Six Graham Van Pelt releases | `2026-10-07` | `30d0e37`: initial public music catalogue and detail routes |
| Twelve Miracle Fortress releases | `2026-10-07` | `9540b37`: catalogue expansion |
| Think About Life and other credits except No Joy (17) | `2026-10-07` | `1236f23`: catalogue expansion |
| No Joy 7-inch | `2026-10-07` | `b94a461`: addition to published catalogue |
| DJ `afw-2026-10-20` | `2026-11-09` | `a05a33f`: DJ launch |
| Other 131 current DJ recordings | `2026-11-09` | `d89f357`: verified catalogue addition |

No current entry needed an invented historical date or a first-feed fallback.
For a future archive addition without reliable site-publication evidence, deliberately
use the day it is first added to the feed as `publishedAt`, and record that decision
here with its ID. That is a site announcement date, never an original release or
broadcast date. Ordinary subsequent edits must retain it.

Run `pnpm check`, `node --test tests/rss.test.js` and `pnpm test` when updating the
feed contract. Tests inspect generated XML and rebuild isolated content fixtures.
