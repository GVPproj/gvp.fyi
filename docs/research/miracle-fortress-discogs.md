# Miracle Fortress — Discogs catalogue and artwork audit

Research date: 2026-10-07. Compared Discogs with `src/data/releases/miracle-fortress.json` (six entries) and the [previous inventory](miracle-fortress.md). This audit started against the six-entry catalogue; the resulting implementation is recorded at the end.

## Outcome / actionable additions

- **Have You Seen In Your Dreams** and **Maybe Lately**: missing commercial singles, corroborated by the artist's archived discography. Discogs supplies the previously unresolved B-side: **Hanky Panky Nohow** on both. Verified downloadable Discogs images exist, although the former is a record-label photograph, not sleeve artwork. Durations remain unknown.
- **Poetaster** (2007) and **Miscalculations** (2011): newly identified **promotional singles**, absent from both the data and previous inventory. Add only if the site's scope includes promos; do not imply commercial single availability. Poetaster has usable sleeve art; Miscalculations only a disc photograph. Durations remain unknown.
- **Raw Spectacle (Pantha du Prince Remix)**: Discogs independently catalogues a 2011 standalone download, with a 6:15 duration. This strengthens year-only dating from the previous research, but supplies **no artwork** and no exact date. RCRD LBL is the label/distributor recorded for this particular edition, not necessarily the rights owner of later streaming editions.
- **Everything Works**: Discogs' five-track promo is **not** the existing four-track digital EP's track list. Treat as an edition/variant, not automatically a seventh distinct title. It has a different radio remix and includes the Pantha du Prince track instead of the digital EP's Alternative Club Remix.
- **Watery Grave**, **Gestures / Possession**, and **Seabird / Tropic of Canada** remain primary-source follow-ups: no matching Miracle Fortress main-artist Discogs release found. Do not infer nonexistence.

## Discogs identity, completeness and edition boundaries

Artist **853449**: [Discogs artist](https://www.discogs.com/artist/853449-Miracle-Fortress), [artist API](https://api.discogs.com/artists/853449). The API describes Graham Van Pelt's Montreal project and links his alias, consistent with the artist archive. Discogs is the requested catalogue source, but its community-submitted metadata is not equivalent to artist/label verification.

The [artist releases API](https://api.discogs.com/artists/853449/releases?per_page=100&sort=year&sort_order=asc) returned **30 role-index entries, one page**, including **five Main masters and three Main standalone releases**. Expanded all five masters' versions endpoints; all were single-page responses. Cross-checking [release search](https://api.discogs.com/database/search?artist=Miracle%20Fortress&type=release&per_page=100) returned **19 releases**, exactly the 16 editions under those masters plus three standalone records.

| Master | Title | Editions returned by `/masters/{id}/versions?per_page=100` | Decision |
| --- | --- | --- | --- |
| [229280](https://api.discogs.com/masters/229280/versions?per_page=100) | Five Roses | 1767481 Canadian CD; 4400187 Canadian promo; 1145232 European CD; 26646041 European promo (all 2007); 3985306 Russian CD (2008); 9540630 Canadian LP (2016) | Already represented; territorial/format editions, not six new titles. |
| [1182796](https://api.discogs.com/masters/1182796/versions?per_page=100) | Have You Seen In Your Dreams | 1557562 Canadian 12-inch; 10320639 UK promo CDr (both 2007) | One missing single, differing track lists. |
| [1316987](https://api.discogs.com/masters/1316987/versions?per_page=100) | Poetaster | 7221178 and 11586841, UK promo CDrs (2007) | One promo title; release notes explicitly say disc designs differ. |
| [229279](https://api.discogs.com/masters/229279/versions?per_page=100) | Maybe Lately | 2157849 UK promo CDr (2007); 1676314 UK 7-inch (2008) | One missing single; master year is the earlier promo year, not the commercial 7-inch year. |
| [370829](https://api.discogs.com/masters/370829/versions?per_page=100) | Was I The Wave? | 3095366 Canadian LP; 3092112 Canadian CD; 4290073 UK CD; 3286432 UK promo CD (all 2011) | Already represented. |

Standalone Main releases: **3123089**, **3211519**, **4857084**, detailed below. Other artist-index entries have Remix, Appearance or TrackAppearance roles: compilations and other artists' releases are not additional Miracle Fortress solo records. Search for Gestures returned Various compilation **18548836**, not a standalone Miracle Fortress single; this is not evidence against the artist's original free single.

The three existing 2014 singles and the precise four-track digital Everything Works EP are not separately represented in this Discogs result set. Discogs is therefore not a complete replacement for the prior primary-source inventory.

## Missing titles: dates, tracks and provenance

All dates below are the release API's `released` field, **not** database submission dates. All relevant Discogs dates have **year precision only**. Empty duration strings mean unknown, not zero. Do not copy album durations into unverified single editions.

### Have You Seen In Your Dreams

- [Release 1557562](https://www.discogs.com/release/1557562), [API](https://api.discogs.com/releases/1557562): **2007**, Canada, Secret City Records **SCR003EP**, vinyl 12-inch.
- Tracks: **A — Have You Seen In Your Dreams**; **B — Hanky Panky Nohow**. Both durations blank. B-side composer John Cale; arrangement/performance credits Graham Van Pelt and Jordan Robson Cramer.
- [Release 10320639](https://api.discogs.com/releases/10320639): **2007**, UK, Rough Trade, catalogue `none`, promo CDr. Only **1 — Have You Seen In Your Dreams**, duration blank; notes describe stickered brown card sleeve. Do not accidentally use this one-track promo as the 12-inch's track list.
- **Primary corroboration:** [archived artist discography](https://web.archive.org/web/20110503002144/http://miraclefortress.com:80/wordpress/discography/) explicitly lists Secret City, **March 13, 2007**, 12-inch / DD. Refetched successfully. Supports day precision for the artist-listed release; Discogs itself does not establish that day or the digital edition's track list.

### Maybe Lately

- [Release 1676314](https://www.discogs.com/release/1676314), [API](https://api.discogs.com/releases/1676314): **2008**, UK, Rough Trade **RTRADS412**, 7-inch, 45 RPM, single, limited edition. Notes say **200 copies**; not independently verified with the label.
- Tracks: **A — Maybe Lately**; **B — Hanky Panky Nohow**. Both durations blank.
- [Release 2157849](https://api.discogs.com/releases/2157849): **2007**, UK, Rough Trade, `none`, promo CDr; same titles at positions 1 and 2, durations blank. This explains why master 229279 has year 2007 despite the commercial edition being dated 2008.
- **Primary corroboration:** the same [artist discography](https://web.archive.org/web/20110503002144/http://miraclefortress.com:80/wordpress/discography/) says Rough Trade, **April 6, 2008**, 7-inch. As noted in prior research, that Sunday date is not independently corroborated. Discogs supports the commercial year, not an exact day. Recommend displaying **2008** for the 7-inch.

### Poetaster — newly found promo

- [Release 7221178](https://www.discogs.com/release/7221178), [API](https://api.discogs.com/releases/7221178), and [11586841](https://api.discogs.com/releases/11586841): **2007**, UK, Rough Trade, `none`, CDr single promo.
- One track: **1 — Poetaster**, duration blank in both releases. Notes cross-reference each other as different disc designs, not separate compositions/releases to count twice.
- Actual downloaded sleeve image from 7221178 reads “Miracle Fortress / Poetaster.” This physical-artifact scan strengthens identification, but no independent artist/label announcement for the promo was recovered. The album track's existence alone does not corroborate the promo's date or mastering.

### Miscalculations — newly found promo

- [Release 3211519](https://www.discogs.com/release/3211519), [API](https://api.discogs.com/releases/3211519): **2011**, UK, Secret City Records, `none`, CDr single promo; no master returned.
- Tracks: **1 — Miscalculations (Radio Edit)**; **2 — Miscalculations (Album Version)**. Both durations blank.
- Downloaded disc photograph visibly corroborates both titles, promotional status, and a **2011** Republic of Music / Secret City rights line. Rights year is not a separately verified release date. Discogs' label field lists Secret City only; the object itself additionally shows Republic of Music branding.
- No independent artist/label release announcement recovered. Do not replace the unknown radio-edit duration with the album's 327.547 seconds.

### Raw Spectacle (Pantha du Prince Remix)

- [Release 3123089](https://www.discogs.com/release/3123089), [API](https://api.discogs.com/releases/3123089): **2011**, US, **RCRD LBL**, `none`, one MP3 file, **192 kbps**; no master returned.
- **1 — Raw Spectacle (Pantha du Prince Remix), 6:15 (375 seconds)**; remix Pantha du Prince, mixed by Kassian Troyer.
- `images: []`, empty thumbnail: **no Discogs release artwork available**. Artist/label thumbnail URLs inside artist/label objects are not release covers.
- Prior [SoundCloud publisher source](https://soundcloud.com/miracle-fortress/raw-spectacle-pantha-du-prince) and [Apple single](https://music.apple.com/us/album/raw-spectacle-pantha-du-prince-remix-single/1365148367), documented in the previous inventory, corroborate the track and approximately 375-second duration. Their conflicting delivered dates remain unresolved; not refetched here. Discogs' 2011 catalogue entry reinforces year-only treatment but does not establish January 1 or whether 2017 metadata describes a reissue.

### Everything Works — edition difference, not a blind addition

[Release 4857084](https://www.discogs.com/release/4857084), [API](https://api.discogs.com/releases/4857084): **2011**, UK, Republic Of Music / Secret City Records, both catalogue `none`, CDr single promo, no master returned.

| Position | Track | Discogs duration | Seconds |
| --- | --- | --- | --- |
| 1 | Everything Works (Radio Edit) | 3:23 | 203 |
| 2 | Everything Works (Time & Space Machine Radio Edit) | 3:54 | 234 |
| 3 | Everything Works (Album Version) | 4:01 | 241 |
| 4 | Everything Works (Time & Space Machine Remix) | 6:40 | 400 |
| 5 | Raw Spectacle (Pantha Du Prince Remix) | 6:15 | 375 |

Notes describe acetate sleeve, colour insert and press-release sticker; times are **not printed on sleeve art**. Discogs notes give total **24:12**, while the displayed individual rounded times sum to **24:13**; preserve individual source values without claiming precision beyond seconds. The existing [Apple UK EP](https://itunes.apple.com/lookup?id=484646179&entity=song&country=gb), researched previously, has four tracks and a December 11 collection date. Do not transfer that exact date to this promo or overwrite the digital EP's tracks with these five.

## Artwork: verified URLs and what the images actually depict

Provenance is the corresponding release API's `images[]` entry: community-supplied Discogs scans/photos, **not artist-hosted originals or evidence of reuse permission**. All five images below were downloaded successfully and visually inspected. “Primary” is Discogs' image classification, not a promise of front-cover art.

| Release | Downloaded dimensions | API classification / visual content | Direct full image URL |
| --- | --- | --- | --- |
| 1557562 | 336 × 337 | Primary; vinyl Side A label in die-cut sleeve, **not full sleeve cover** | [JPEG](https://i.discogs.com/BkgkBodwiDr-TTez_WYYSmVekqCTTyWyQjkIxlHdq_Y/rs:fit/g:sm/q:90/h:337/w:336/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTE1NTc1/NjItMTM1ODYzMjk0/Ny03ODE4LmpwZWc.jpeg) |
| 1676314 | 597 × 600 | Primary; floral illustrated Maybe Lately sleeve | [JPEG](https://i.discogs.com/tbYYqlt5DbGpeRioBe6DqGWdGl_FJe1E-qA0l-k3O8o/rs:fit/g:sm/q:90/h:600/w:597/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTE2NzYz/MTQtMTYwMTQwOTY4/Ni04MTY4LmpwZWc.jpeg) |
| 7221178 | 600 × 600 | Primary; pale floral Poetaster sleeve | [JPEG](https://i.discogs.com/vdN2YGr_Yg6ps-Sv6MNCd_xSzMFkzoAwGLosqWIX7XI/rs:fit/g:sm/q:90/h:600/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTcyMjEx/NzgtMTQzNjQ3ODgy/OC01NjcxLmpwZWc.jpeg) |
| 3211519 | 475 × 465 | Secondary, only image; silver promo CDr photograph, **no sleeve** | [JPEG](https://i.discogs.com/dgInz0loEGln8mjZ6z-Cv0eNWHnqdDds5fKr4i-3G6E/rs:fit/g:sm/q:90/h:465/w:475/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTMyMTE1/MTktMTMyMDY3NDYz/MC5qcGVn.jpeg) |
| 4857084 | 458 × 457 | Primary; green Everything Works front insert | [JPEG](https://i.discogs.com/Wt4kOADzxwjK6gHHH6tcjmy_WVmAr6tspg2nuP7x2V4/rs:fit/g:sm/q:90/h:457/w:458/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTQ4NTcw/ODQtMTM3NzYzNzU4/Ni02ODkxLmpwZWc.jpeg) |

All **18 full-size image URLs** attached to the nine fetched non-album release records, and all **18 `uri150` thumbnail URLs**, ultimately returned **HTTP 200, `image/jpeg`**, with JPEG signatures and dimensions identified by `file`. Raw Spectacle contributes zero images. Additional artwork for the alternate promos is available in their cited release APIs and the saved manifests; those images were fetch-checked but not all visually inspected. Full-size API dimensions are occasionally rounded by one pixel relative to the actual JPEG.

### Access blockers and reproducibility

- Public Discogs artist HTML returned **403**; the official API returned **200** without credentials for artist, search, masters, versions and release endpoints. No authentication or browser challenge bypass was needed.
- Initial image GETs with Python requests' default user agent returned **403 HTML**, not images. Retrying the same documented URLs with an identifying **`User-Agent: DiscographyResearch/1.0`** returned valid JPEGs for every image. Thumbnail requests also succeeded with that header. This demonstrates session accessibility, not guaranteed anonymous browser hotlinking or permanent availability.
- Example: `curl -L -A 'DiscographyResearch/1.0' 'IMAGE_URL_FROM_TABLE' -o /tmp/mf-cover.jpg`, then `file /tmp/mf-cover.jpg`.
- [Watery Grave search](https://api.discogs.com/database/search?q=Miracle%20Fortress%20Watery%20Grave&type=release) and [Seabird search](https://api.discogs.com/database/search?q=Miracle%20Fortress%20Seabird&type=release) returned zero; [Gestures search](https://api.discogs.com/database/search?q=Miracle%20Fortress%20Gestures&type=release) returned only the Various compilation mentioned above. The artist archive does establish Watery Grave, self-released, winter 2005; this audit did not recover its Discogs ID or artwork.
- [Current Secret City product search](https://www.secretcityrecords.com/search?q=miracle+fortress&type=product), refetched, again listed only Five Roses and Was I the Wave?. It did not independently corroborate Poetaster/Miscalculations promos and should not be treated as exhaustive historical evidence.

Raw session evidence is under **`/tmp/mf-discogs/`** (not committed): `artist.json`, `releases.json`, `search.json`; `master-*-versions.json` and master detail files; `release-{id}.json` for all nine non-album editions; `all-release-search.txt`, targeted `*-search.txt`; `artist-archive.txt`, `label-search.txt`, `site-artist.txt`; `art-{id}-{index}.jpg`, `thumb-{id}-{index}.jpg`. `image-checks.json` records the initial 403 responses; **`image-checks-identified-ua.json`** records successful full-size retrievals, URLs, MIME types, byte counts and detected dimensions; `thumbnail-checks.json` records successful thumbnails. Recovered artist-hosted artwork is documented in the [previous inventory](miracle-fortress.md#recovered-historical-artwork).

## Implemented after the audit

The Miracle Fortress section now includes twelve titles: the original six, *Watery Grave EP*, the two early commercial singles, the Pantha du Prince remix, and the two newly found promos.

- *Poetaster (Promo)* uses the unchanged front-sleeve image from release **7221178**, saved as `public/images/music-releases/poetaster-promo.jpg` (600 × 600).
- *Miscalculations (Promo)* uses the unchanged disc photograph from release **3211519**, saved as `public/images/music-releases/miscalculations-promo.jpg` (475 × 465). The page explicitly describes it as a disc photograph, not recovered sleeve art.
- Both promos use Discogs' year-only dates and track titles; unknown durations are omitted. Their titles and descriptions explicitly identify promotional status. No listening links were fabricated or borrowed from album versions.
- *Have You Seen In Your Dreams*, *Maybe Lately* and *Watery Grave EP* use local copies of archived artist-site artwork instead of the Discogs images, with provenance in the linked inventory. The remix uses its current Apple digital-edition cover, not nonexistent RCRD LBL artwork.
- The five-track *Everything Works* promo is documented above but not added as a duplicate of the existing EP. Other artists' releases and compilation appearances remain outside this section.
