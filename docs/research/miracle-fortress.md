# Miracle Fortress discography research

## Scope and outcome

Research used Python `requests` against the artist's current and archived websites, Secret City Records, artist/label Bandcamp pages, artist-branded SoundCloud publisher metadata, and Apple’s first-party catalogue API. This note records historical completeness, metadata provenance and date/label verification for the Music Releases section.

**A two-album Bandcamp import is not a complete Miracle Fortress discography.** Primary artist archives establish an early EP, two early physical singles, and two 2011 free digital releases. Publisher metadata additionally supports three 2014 singles and a remix single; Apple's UK catalogue supplies a four-track EP missing from its US results. Exact original dates remain unresolved for some items.

The existing `src/data/releases/graham-van-pelt.json` uses `title`, `artist`, `release_date`, `url`, Bandcamp `album_id`/`art_id`, `tracks` (`title`, duration in seconds, `track_num`), `about`, and presentation fields such as `display_date`, optional `display_title`, `streaming`, and video IDs. **Do not invent Bandcamp IDs for historical releases or substitute a SoundCloud/Apple ID.** Supporting these gaps may require a separate non-Bandcamp representation.

## Supported release inventory

Dates are release dates unless explicitly qualified. Links in the source column support the corresponding claims.

| Release | Kind | Date supported by sources | Label / territory | Evidence and listening availability |
| --- | --- | --- | --- | --- |
| **Watery Grave EP** | EP | **Winter 2005**, no exact day | **Self Released** | Both archived artist discographies explicitly list this title, season/year, label and digital format. [A1, A2] No current official listening page verified. |
| **Have You Seen In Your Dreams** | 12-inch / digital single | **2007-03-13** | **Secret City** | Both artist discographies agree; one explicitly titles it `Have You Seen In Your Dreams 12”`. [A1, A2] The album recording can be heard on *Five Roses*, but that is not evidence of the single's full track list or original master. |
| **Five Roses** | Album, 12 tracks | **2007-05-22** North America; **2007-09-03** UK/Europe | **Secret City Records** North America; **Rough Trade** UK/Europe | Current label product and Bandcamp agree on May 22. [L1, B1] Archived artist discography gives Rough Trade territory/date and catalogue `RTRADCD 404`, Secret City `SCR004`; one archive instead says May 21 for North America. [A2] Prefer May 22, corroborated by current label, Bandcamp and earlier artist archive. [A1] Listen: [Bandcamp](https://miraclefortress.bandcamp.com/album/five-roses), [Apple](https://music.apple.com/us/album/five-roses/1101196452). |
| **Maybe Lately** | 7-inch single | **2008-04-06**, as printed by artist; exact day needs corroboration | **Rough Trade** | Explicit entry in artist discography. [A2] This is a Sunday date, so preserve the evidence without silently correcting it. Current standalone official listening page not verified; the song is on *Five Roses*. |
| **Was I the Wave?** | Album, 10 tracks | **2011-04-26**; **2011-09-05** UK/Europe | **Secret City Records**; **Republic of Music** UK/Europe | Current label/Bandcamp and artist discography agree on April 26; archive gives `SCR017`. [L2, B2, A2] Artist announcement explicitly gives September 5 and Republic of Music. [A3, A5] Listen: [Bandcamp](https://miraclefortress.bandcamp.com/album/was-i-the-wave), [Apple](https://music.apple.com/us/album/was-i-the-wave/859788356). |
| **Gestures** / **Possession** | Free digital single, A/B pairing | **2011-06-30** artist publication/release announcement | Artist-hosted; no label named | Artist post title: `New old stock: “Gestures” free digital single`; ordered tracks `01 – Gestures`, `02 – Possession`; recorded 2010 at Fun Dimension, mixed at The Pines. [A4] Follow-up explicitly describes these uploads as free “digital singles” with A- and B-sides. [A3] Live listening for B-side: [Possession on artist SoundCloud](https://soundcloud.com/miraclefortress/possession). Its 2013 upload date is **not** the original release date. [S5] |
| **Seabird** / **Tropic of Canada** | Two-track free digital release | **2011-08-10** artist publication/release announcement | Artist-hosted; no label named | Artist offers both tracks in one post; written toward the end of 2010, concurrently with *Was I the Wave?*. [A5] Treat the paired title as a descriptive grouping, not a verified printed commercial release title. Historical Topspin widget present; working current audio not verified. |
| **Everything Works – EP** | Four-track remix EP | **2011-12-11**, Apple UK catalogue date | **Secret City Records under exclusive license to Republic of Music** | First-party Apple API identifies separate EP, four tracks, date and rights line. [P2, P3] This is platform-delivered metadata, not independently verified against an original artist/label announcement. Listen: [Apple UK](https://music.apple.com/gb/album/everything-works-ep/484646179). |
| **Here's To Feeling Good All The Time** | Single | **2014-06-03** | **Secret City Records** | Artist announces first of a series of summer singles on June 3; SoundCloud `release_date`, publisher metadata and Apple agree. [A6, S1, P1] Listen: [SoundCloud](https://soundcloud.com/miracle-fortress/heres-to-feeling-good-all-the), [Apple](https://music.apple.com/us/album/heres-to-feeling-good-all-the-time-single/884097676). |
| **Let Me Be The 1** | Single | **2014-09-09** | **Secret City Records** | SoundCloud publisher release metadata and Apple agree. [S2, P1] Listen: [SoundCloud](https://soundcloud.com/miracle-fortress/let-me-be-the-1), [Apple](https://music.apple.com/us/album/let-me-be-the-1-single/911397262). |
| **Even In America** | Single | **2014-09-16** | **Secret City Records** | SoundCloud publisher release metadata and Apple agree. [S3, P1] Listen: [SoundCloud](https://soundcloud.com/miracle-fortress/even-in-america), [Apple](https://music.apple.com/us/album/even-in-america-single/911392433). |
| **Raw Spectacle (Pantha du Prince Remix)** | Remix single | **2011** rights year; **original day unresolved** | **Secret City Records** | SoundCloud has release date **2017-05-19**, upload **2018-03-28**, but 2011 copyright/phonogram rights. Apple identifies the single with **2011-01-01**. [S4, P1] Do not treat Jan 1 or the later upload as a verified original release date. Listen: [SoundCloud](https://soundcloud.com/miracle-fortress/raw-spectacle-pantha-du-prince), [Apple](https://music.apple.com/us/album/raw-spectacle-pantha-du-prince-remix-single/1365148367). Apple credits Miracle Fortress **& Pantha du Prince**. |

## Metadata useful to implementation

### Albums: Bandcamp metadata

From Bandcamp `data-tralbum`:

| Title | `album_id` | `art_id` | `album_release_date` |
| --- | --- | --- | --- |
| Five Roses | 3809650388 | 255904965 | `22 May 2007 00:00:00 GMT` |
| Was I the Wave? | 2176362726 | 669685075 | `26 Apr 2011 00:00:00 GMT` |

Both pages identify Miracle Fortress and link back to Secret City Records. [B1, B2] `display_date` can safely use `2007, Secret City Records` / `2011, Secret City Records`, with territory-specific labels in supporting prose rather than implying all editions share one label.

### Singles: publisher metadata, not upload timestamps

SoundCloud HTML contains `window.__sc_hydration`; objects with `hydratable: "sound"` expose `release_date`, `label_name`, `publisher_metadata`, and `duration` in milliseconds. The artist-branded `miracle-fortress` account is **not verification-badged**, but the structured publisher records name Secret City, include UPC/ISRC and composer Graham Van Pelt, and agree with Apple's delivered metadata for the three 2014 singles. This is stronger evidence than the visible “published on” date alone; it is not proof of account ownership by itself.

| Single | UPC | ISRC | SoundCloud duration (seconds) |
| --- | --- | --- | --- |
| Here's To Feeling Good All The Time | 680341380001 | CA0RZ1400019 | 271.126 |
| Let Me Be The 1 | 680341380049 | CA0RZ1400021 | 430.299 |
| Even In America | 680341380056 | CA0RZ1400020 | 260.753 |
| Raw Spectacle (Pantha Du Prince Remix) | 680341171104 | CA0RZ1100060 | 375.193 |

The first three all show upload dates in March 2016, despite 2014 release dates. [S1–S4] `Possession` is on the separate `miraclefortress` account identifying Graham Van Pelt, with description `2011`, no `release_date` and a January 6, 2013 upload. [S5] Its original pairing/date is established by the archived artist post, not by SoundCloud. [A4]

### Everything Works EP track list

Apple UK lookup [P3], durations converted from `trackTimeMillis`:

1. Everything Works (Radio Edit) — 203.253 seconds
2. Everything Works — 241.213 seconds
3. Everything Works (Time & Space Machine Remix) — 399.787 seconds
4. Everything Works (Time & Space Machine Alternative Club Remix) — 397.795 seconds

The album version's individual track date remains April 26, 2011, while the EP collection date is December 11. Do not use the earliest constituent track date as the EP's release date. [P3]

## Catalogue gaps and limits

- **Historical catalogue matters:** Secret City's current artist page and product search list only the two albums. [L3, L4] Bandcamp album sidebars likewise show only the two albums. [B1, B2] Those are present-day availability lists, not exhaustive release histories.
- **Watery Grave:** primary evidence supports winter 2005 and self-release, but no exact date, track list, Bandcamp ID or live official audio was recovered in the initial pass. Artwork was subsequently recovered from the archived artist discography (see below). Guessed `/album/watery-grave` URLs on both Miracle Fortress and Graham Van Pelt Bandcamp returned 404; this is not evidence the EP never existed.
- **Early singles:** artist confirms *Have You Seen In Your Dreams* and *Maybe Lately*, but full single track lists, B-sides, catalogue numbers and working standalone players remain unresolved. Do not reuse album metadata as if it described the original single.
- **Unreleased album is not a release:** the artist calls **Hoop Dreams** an “ill-fated and ultimately discarded album.” Material recorded 2008–2010 later fed *Was I the Wave?* and free singles. Do not add *Hoop Dreams* as a released album. [A3]
- **2011 free releases:** the archived artist posts used Topspin/Flash download widgets. Archival announcement text establishes release existence, but the widgets do not establish current playability. Only *Possession* received a verified live SoundCloud page in this pass. [A4, A5, S5]
- **Remix date conflict:** 2011 rights year, Apple's January 1 date and SoundCloud's 2017 release date are distinct evidence. Original remix publication date and whether the later metadata represents a reissue remain unverified. [S4, P1]
- **Regional gap:** *Everything Works – EP* appears in Apple GB artist lookup but not the US search result set fetched here. Absence from one territory is not nonexistence. [P1–P3]
- **Original vs territorial album dates:** distinguish *Five Roses* May 22 / September 3, and *Was I the Wave?* April 26 / September 5. The artist's May 21 typo/conflict is documented above rather than propagated. [A1–A3, L1, L2]
- **Label scope:** current artist biography says he released on Rough Trade, Secret City, Arbutus and Every Conversation, but does not map Every Conversation to a specific Miracle Fortress record. Do not assign that label to any individual release from this fact alone. [G1]
- **Current domain unsafe as artist citation:** `miraclefortress.com` now redirects to a domain-sale page. Use timestamped archived artist citations below, not the live domain. Archive indexing also contains unrelated later material.
- No album-specific Spotify or Tidal links were verified in this pass. Secret City's global footer links are label profiles, **not album listening links**. Bandcamp and Apple album links above are source-backed; SoundCloud pages were retrieved but audio playback itself was not tested.
- Search-engine requests were mostly blocked, script-only or irrelevant. This inventory therefore claims supported releases and explicit remaining gaps, **not guaranteed exhaustiveness**.

## Sources

### Live artist/label and Bandcamp

- **L1:** [Secret City — Five Roses](https://www.secretcityrecords.com/products/five-roses). Product Details: label Secret City Records, release date May 22, 2007.
- **L2:** [Secret City — Was I the Wave?](https://www.secretcityrecords.com/products/was-i-the-wave). Product Details: label Secret City Records, release date April 26, 2011.
- **L3:** [Secret City — Miracle Fortress](https://www.secretcityrecords.com/pages/miracle-fortress).
- **L4:** [Secret City product search](https://www.secretcityrecords.com/search?q=miracle+fortress&type=product). Two results in fetched response.
- **B1:** [Miracle Fortress Bandcamp — Five Roses](https://miraclefortress.bandcamp.com/album/five-roses). Release date, label credits, tracks and embedded metadata.
- **B2:** [Miracle Fortress Bandcamp — Was I the Wave?](https://miraclefortress.bandcamp.com/album/was-i-the-wave). Release date, label credits, tracks and embedded metadata.
- **G1:** [Graham Van Pelt — About](https://www.grahamvanpelt.com/about).

### Archived artist primary sources

These are historical artist-authored pages preserved by the Internet Archive, not secondary discographies.

- **A1:** [Artist discography, April 7, 2011 capture](https://web.archive.org/web/20110407012628/http://miraclefortress.com:80/wordpress/discography-1/).
- **A2:** [Artist discography, May 3, 2011 capture](https://web.archive.org/web/20110503002144/http://miraclefortress.com:80/wordpress/discography/).
- **A3:** [Was I The Wave UK / European Release + Unreleased material for download, July 2, 2011](https://web.archive.org/web/20110711212113/http://miraclefortress.com:80/wordpress/2011/07/02/was-i-the-wave-uk-european-release-unreleased-material-for-download/).
- **A4:** [New old stock: “Gestures” free digital single, June 30, 2011](https://web.archive.org/web/20110709224231/http://miraclefortress.com:80/wordpress/2011/06/30/was-i-the-wave-ukeurope-release-and-b-sides/).
- **A5:** [More free tracks and European tour dates, August 10, 2011](https://web.archive.org/web/20110822024935/http://miraclefortress.com/wordpress/2011/08/10/more-free-tracks-and-european-tour-dates/).
- **A6:** [Artist June 2014 archive: Here's To Feeling Good All The Time, June 3](https://web.archive.org/web/20140622021417/http://miraclefortress.com:80/wordpress/2014/06/).

### Artist-branded SoundCloud / publisher records

- **S1:** [Here's To Feeling Good All The Time](https://soundcloud.com/miracle-fortress/heres-to-feeling-good-all-the).
- **S2:** [Let Me Be The 1](https://soundcloud.com/miracle-fortress/let-me-be-the-1).
- **S3:** [Even In America](https://soundcloud.com/miracle-fortress/even-in-america).
- **S4:** [Raw Spectacle (Pantha Du Prince Remix)](https://soundcloud.com/miracle-fortress/raw-spectacle-pantha-du-prince).
- **S5:** [Possession, Graham Van Pelt / MiracleFortress account](https://soundcloud.com/miraclefortress/possession).

### First-party listening-platform metadata (supplementary)

- **P1:** [Apple US album search API](https://itunes.apple.com/search?term=miracle+fortress&entity=album&limit=100). Filter to artist ID `215839189`; results also include unrelated artists.
- **P2:** [Apple GB artist albums lookup](https://itunes.apple.com/lookup?id=215839189&entity=album&country=gb&limit=200).
- **P3:** [Apple GB Everything Works EP and tracks lookup](https://itunes.apple.com/lookup?id=484646179&entity=song&country=gb).

## Reproducibility / handoff

Fetched files remain in `/tmp` for this session, not committed:

- `/tmp/mf-detail-0.html` / `1.html`: Secret City album pages; `2.html` / `3.html`: corresponding Bandcamp albums.
- `/tmp/mf-history-0.html` through `7.html`: archived artist pages. In order: Gestures announcement, July 2 explanation, August 10 free tracks, February 2012 archive, June 2014 archive, About, May 2011 discography, April 2011 discography.
- `/tmp/mf-archive-2.json`: artist-site historical URL index used to locate those pages.
- `/tmp/miracle-fortress-soundcloud-metadata.json`: extracted track publisher records, dates, durations and art URLs.
- `/tmp/mf-last-4.html`: Apple US search JSON; `/tmp/mf-gap-4.html`: Apple GB catalogue JSON; `/tmp/mf-archive-1.json`: Everything Works EP and tracks JSON.

## Implemented subset

`src/data/releases/miracle-fortress.json` includes the two Bandcamp albums, the three 2014 singles, *Everything Works EP*, *Raw Spectacle (Pantha du Prince Remix)*, and historical entries for *Watery Grave EP*, *Maybe Lately*, *Have You Seen In Your Dreams*, *Poetaster (Promo)* and *Miscalculations (Promo)*. The promos and their artwork are documented in the [Discogs audit](miracle-fortress-discogs.md). The shared release layout supports artwork and listening links without inventing Bandcamp players for releases absent from that catalogue.

- Album track lists, durations, dates and artwork IDs come from B1/B2. Descriptions are short editorial summaries of those pages, not copied promotional text.
- The 2014 singles' track lists, durations (Apple milliseconds converted to seconds), artwork and listening URLs come from Apple's individual lookups: [Even In America](https://itunes.apple.com/lookup?id=911392433&entity=song), [Let Me Be the 1](https://itunes.apple.com/lookup?id=911397262&entity=song), [Here's To Feeling Good All the Time](https://itunes.apple.com/lookup?id=884097676&entity=song). These durations differ slightly from SoundCloud's encoded files, so the stored data consistently uses Apple for these releases.
- *Everything Works EP* uses the UK collection date and track metadata from P3; its availability and date are territory-specific. Public display uses only the year.
- Apple artwork URLs request the 1200-pixel rendition; album artwork uses the existing Bandcamp rendition convention.
- Historical entries without verified audio explicitly state that no listening link is available. Unverified track lists remain empty rather than being copied from similarly titled album tracks. Year-only dates stay year-only in HTML machine-readable dates; *Maybe Lately* uses 2008 while its precise date remains uncertain.
- Discogs [release 3123089](https://www.discogs.com/release/3123089) independently lists the Pantha du Prince remix as a 2011 RCRD LBL digital release. That supports a year-only entry, not Apple's January 1 placeholder as an original day. Artwork, the 375.147-second track duration, artist credit and current listening link come from [Apple's individual lookup](https://itunes.apple.com/lookup?id=1365148367&entity=song). The digital edition has Secret City rights; the description distinguishes it from the RCRD LBL release. Its 1200 × 1200 artwork returned HTTP 200 and was visually inspected.
- The *Maybe Lately* 7-inch track list comes from [Discogs release 1676314](https://www.discogs.com/release/1676314); the *Have You Seen In Your Dreams* 12-inch track list comes from [release 1557562](https://www.discogs.com/release/1557562). Both have “Hanky Panky Nohow” as B-side. Durations are unspecified, not zero or copied from album tracks. *Maybe Lately*'s 2008 vinyl edition is distinct from its 2007 promotional CD.
- Other historical releases remain research follow-ups. No claim of a complete discography is made.

### Recovered historical artwork

The artist's archived discography [A2] identifies all three images by release name. These are modest-resolution original website images, not upscaled replacements. Each archive URL returned HTTP 200 with `image/jpeg`; images were visually inspected and copied unchanged into `public/images/music-releases/` to avoid runtime archive dependencies.

| Release | Local filename | Archived source | Dimensions |
| --- | --- | --- | --- |
| Watery Grave EP | `watery-grave.jpg` | [Artist cover image](https://web.archive.org/web/20110822023008id_/http://miraclefortress.com/wordpress/wp-content/uploads/2010/12/discography-watery-grave-ep.jpg) | 300 × 283 |
| Maybe Lately | `maybe-lately.jpg` | [Artist cover image](https://web.archive.org/web/20110822022908id_/http://miraclefortress.com/wordpress/wp-content/uploads/2011/04/discography-maybe-lately-7.jpg) | 300 × 308 |
| Have You Seen In Your Dreams | `have-you-seen-in-your-dreams.jpg` | [Artist sleeve image](https://web.archive.org/web/20110822022949id_/http://miraclefortress.com/wordpress/wp-content/uploads/2011/03/discography-have-you-seen-in-your-dreams-12-300x300.jpg) | 300 × 300 |

The last image is the artist's photograph of the record in its die-cut sleeve, not an invented illustrated cover. See `miracle-fortress-discogs.md` for the separate Discogs catalogue check.
