# Verified Mixcloud catalogue — #41

Public-source research snapshot: **2026-11-09**. Scope: [#41](https://github.com/GVPproj/gvp.fyi/issues/41), following the [manual content policy](dj-content.md). This pass publishes **132 distinct linked recordings**: **4 A Friendly Wave, 124 Island City, 4 Other Appearances**, including the existing October 20 launch entry. **126** have explicitly sourced exact dates, **2** have uncertain dates and **4** are undated. This is everything verified in this pass, not a claim that no further recording exists.

## Sources and coverage

| Source | Reviewed | Outcome |
| --- | --- | --- |
| [AFW uploads](https://api.mixcloud.com/afriendlywave/cloudcasts/?limit=25) | Complete pagination: 25 + 25 + 22 = **72**; detailed titles, descriptions and hosts for every upload | **6** eligible: 4 AFW, 2 Island City |
| [FSR uploads](https://api.mixcloud.com/fsrlive/cloudcasts/?limit=100) | **2,301** uploads across 24 pages; detailed metadata for every upload | **119** eligible Island City recordings |
| [FSR playlists](https://api.mixcloud.com/fsrlive/playlists/?limit=100) | All **119** playlists, all contents: 2,020 membership rows / 2,019 distinct keys | Island City playlist has **109** entries; **10** eligible uploads are missing from it; no playlist-only candidates |
| [Graham uploads](https://api.mixcloud.com/grahamvanpelt/cloudcasts/?limit=100) | All **3** uploads, all **8** displayed profile shows, all **64** public reposts | 3 Island City uploads; five profile shows point to AFW originals; reposts point to 60 FSR originals and 4 other station appearances |
| [Graham's Island City playlist](https://www.mixcloud.com/grahamvanpelt/playlists/island-city/) | All **13** entries | Pointers to FSR originals, not additional recordings |
| Public Mixcloud search | Paginated name, programme and alias searches, including `Graham Van Pelt`, `grahamvanpelt`, `Graham Vanpelt`, `Van Pelt`, `VanPelt`, `Miracle Fortress`, `MiracleFortress`, `GVP`, `Island City`, `Inside Touch`, `Think About Life`, and interview/mix combinations | Confirmed the 4 other appearances; no confirmed interview |

Pagination followed returned next links until absent. Profile counts and unique-key sets were reconciled; the core account/playlist totals above are not search-result estimates. The focused `Graham Van Pelt` search returned 125 rows and `Island City` 432; broad queries include irrelevant matches and repeated keys.

Additional sources: [AFW website](https://afriendlywave.com/) and About page (homepage contains only 31 cards, not the entire archive); [CHIR archive](https://www.chir.fm/a-friendly-wave/programme-archive/) and its [28-episode station listing](https://chirfm.vits.space/player/show/a_friendly_wave/mode/dark/theme/cyan); [FSR website](https://fsr.live/); [Graham's radio page](https://www.grahamvanpelt.com/radio); station profiles and playlist indexes for Noods, The Lot Radio, Solid Steel and n10.as, including all 485 n10.as playlist names and Noods' 24-entry GUEST playlist. These large station upload catalogues were **not** fully crawled.

Every published entry stores its exact recording-metadata URL, original-artwork URL, date sources and supplemental evidence in repository frontmatter. Following the presentation revision, cards show only artwork/title; details add the programme and Mixcloud listening link, without separate credit, date, duration or Sources blocks. Titles and full durations were taken from detailed recording metadata, not truncated cards. Original image bytes are adjacent to each entry with their actual image-format extensions; original proportions are retained. The n10.as recording supplies station-profile artwork rather than a unique episode image; that is its source-provided artwork, not invented replacement art.

## Eligibility, grouping and recording identity

- **FSR:** all 119 descriptions explicitly identify Graham as the musician/DJ who “plays and discusses his favourite records and tracks.” All host arrays are empty. The descriptions, not just Island City title matches or playlist membership, establish presenting participation. No examined title/description credits a second presenter. Durations are 116 × 3,600 seconds, 2 × 3,599 and 1 × 3,601; they were not rounded.
- **AFW:** titles, descriptions, artwork and host tags were reconciled. June 30 has **no host tag**, but its title/artwork explicitly credit Graham. July 22/29 descriptions say “now on AFW” and link the original FSR programme: both belong to **Island City**, not the uploader's programme row.
- **Shared AFW events on Graham's account:** both explicitly credit his **Island City** contribution, so each appears once in Island City, not again in AFW. These are whole shared broadcasts, not separately playable Graham sets:
  - [Cafe Mode, May 24, 2025](https://www.mixcloud.com/grahamvanpelt/a-friendly-wave-day-2-w-island-city-jefstef-rave-coach-andrew-ross-collins-20250524-174459/): **Leo Chan, Jeff Stefani and Graham Van Pelt (Island City)**; **18,419 seconds / 5:06:59**. Current title establishes the date/credits. The historical slug instead names Jefstef, Rave Coach and Andrew Ross Collins; no revision history verifies extra presenters, so those are not silently added. Description reports an audio issue during the first 15 minutes; that warning is not a Graham-set timestamp or reason to shorten the file.
  - [Weekend 2 Day 2](https://www.mixcloud.com/grahamvanpelt/a-friendly-wave-weekend-2-day-2-w-chris-dammeyer-aika-island-city-w-graham-v-20250531-170453/): **Chris Dammeyer, AIKA and Graham Van Pelt (Island City)**; **13,989 seconds / 3:53:09**. Exact date remains uncertain.
- **Other Appearances:** [Noods, December 18, 2019](https://noodsradio.com/shows/graham-van-pelt-18th-december-19) is a named Graham programme, not included merely because the tracklist plays his music. [The Lot Radio](https://www.mixcloud.com/thelotradio/graham-van-pelt-the-lot-radio-03-06-2019/) describes Graham's DJ set. [Solid Steel Hour 2](https://www.mixcloud.com/Solid_Steel/solid-steel-radio-show-23112018-hour-2-graham-van-pelt/) explicitly introduces his guest mix; Hour 1 is Frank Bretschneider's separate file and is excluded. [n10.as](https://www.mixcloud.com/n10as/11_11_2018_grahamvanpeltmp3/) is explicitly attributed to Graham by the station. All four are also reposted by Graham; reposting alone was not the inclusion rule.
- Canonical keys merge overlapping searches, host-tagged profile shows, reposts and playlist memberships. No confirmed audio reupload was found. FSR's 119 originals have distinct primary preview asset identifiers and public waveform hashes; aligned amplitude-envelope comparison found no high-similarity pair (maximum correlation 0.3401). Repeated artwork, generic descriptions and hour-long durations do **not** justify collapsing recordings. The own-account files have different durations and descriptions. These metadata checks cannot rule out edited/offset replays; no full-audio fingerprinting was performed.
- All 132 canonical recording pages were retrieved successfully. Their primary recording objects report public/listed, not draft/awaiting audio, playable and not copyright-disabled/exclusive. This is readiness evidence, not a guarantee of playback in every territory or account state. No private, unlisted or unready material is published.

## Ten verified FSR recordings omitted from its Island City playlist

All ten descriptions confirm Graham and each complete file is 3,600 seconds:

| Broadcast | Recording |
| --- | --- |
| 2021-11-05 | [05NOV2021](https://www.mixcloud.com/fsrlive/island-city-w-graham-van-pelt-05nov2021/) |
| 2022-01-14 | [14JAN2022](https://www.mixcloud.com/fsrlive/island-city-14jan2022/) |
| 2022-07-01 | [01JULY2022](https://www.mixcloud.com/fsrlive/island-city-w-graham-van-pelt-01july2022/) |
| 2022-07-22 | [22JULY2022](https://www.mixcloud.com/fsrlive/island-city-w-graham-van-pelt-22july2022/) |
| 2022-10-21 | [21OCT2022](https://www.mixcloud.com/fsrlive/island-city-with-graham-van-pelt-21oct2022/) |
| 2022-11-04 | [04NOV2022](https://www.mixcloud.com/fsrlive/island-city-w-graham-van-pelt-04nov2022/) |
| 2022-12-16 | [16DEC2022](https://www.mixcloud.com/fsrlive/island-city-w-graham-van-pelt-16dec2022/) |
| 2023-04-21 | [21APRIL2023](https://www.mixcloud.com/fsrlive/island-city-w-graham-van-pelt-21april2023/) |
| 2023-06-02 | [02JUNE2023](https://www.mixcloud.com/fsrlive/island-city-w-graham-van-pelt-02june2023/) |
| 2023-12-01 | [01DEC2023](https://www.mixcloud.com/fsrlive/island-city-with-graham-van-pelt-01dec2023/) |

## Date decisions

“Verified” means an exact date is **explicitly sourced**, not necessarily independently corroborated. Most FSR dates and older AFW dates rely on uploader titles, corroborated by the same title on the canonical page. Undated artwork or a matching upload day adds no historical precision. No date is derived solely from a slug, upload timestamp, ordinal or neighbouring week's episode.

Retain historical canonical URLs when corrected titles disagree:

| Recording's slug date | Published broadcast | Evidence |
| --- | --- | --- |
| AFW `101326` | **2026-10-20** | Current title, dated artwork, AFW website and CHIR archive agree; October 21 is upload day |
| FSR `28april2022` | **2022-04-29** | Current API and canonical-page title explicitly say 29APRIL2022 |
| FSR `19jun2022` | **2022-06-10** | Current title says 10JUN2022 |
| FSR `14feb2023` | **2023-02-17** | Current title says 17FEB2023 |
| FSR `12jan2023` | **2024-01-12** | Current title says 12JAN2024 |
| FSR `19jan2023` | **2024-01-19** | Current title says 19JAN2024 |
| FSR numeric `060421` | **2021-06-04** | Explicit title 04JUN2021, not an ambiguous numeric-slug interpretation |

AFW February 10 and March 1 were uploaded February 13 and March 19; June 30 was uploaded July 1. Preserve the explicitly titled event dates. CHIR's current archive corroborates June 30 but does not reach February/March. Graham's January 18, 2026 show is explicitly dated in its title. The Lot's numeric `03-06-2019` is **March 6**, independently established by the [contemporary tour announcement](https://www.brooklynvegan.com/tours-announced-teenage-fanclub-kim-petras-smerz-ladytron-graham-van-pelt-more/), not June 3. Solid Steel's title/artwork establish **November 23, 2018**; [95bFM's November 24 listing](https://95bfm.com/show/solid-steel) is a local syndicated airing, not a second Mixcloud recording.

Unresolved dates remain explicit in repository metadata, without a fabricated exact day:

- [FSR `0JULY2022`](https://www.mixcloud.com/fsrlive/island-city-w-graham-van-pelt-0july2022/): **July 2022; day unverified**. Title's day 0 is invalid. July 8 is explicitly an upload date, not a justified correction. Whole duration is **3,601 seconds**.
- Shared **Weekend 2 Day 2**: May 31, 2025 occurs only in the slug; title, description and artwork supply no exact date. June 5 is upload time.
- Four undated FSR originals: [unqualified w/](https://www.mixcloud.com/fsrlive/island-city-w-graham-van-pelt/), [Ep2](https://www.mixcloud.com/fsrlive/island-city-w-graham-van-pelt-ep2/), [EP. 3](https://www.mixcloud.com/fsrlive/island-city-episode-3/) and [unqualified with](https://www.mixcloud.com/fsrlive/island-city-with-graham-van-pelt/). Titles, descriptions and original artwork do not establish dates. They retain distinct source-derived identities. The first lasts **3,599 seconds**.

Verified dates sort newest first within each row. Uncertain/unknown recordings follow in stable ID order; that placement does not claim they are older.

## Exclusions, unresolved candidates and limits

- **65 AFW uploads** name other presenters without confirmed Graham participation. Account administration is not a presenter credit. The separately playable Ben J Frey March 1 Sunday Session is not merged with Graham's same-day recording.
- **Robert Kraft — Community Curation** ([source](https://www.mixcloud.com/afriendlywave/robert-kraft-a-friendly-wave-community-curation/)): description credits Kraft's stories but no interviewer; artwork/hosts do not identify Graham. Withhold pending explicit participation evidence; do not infer an interview from Graham administering AFW.
- **2,182 other FSR uploads** do not identify Graham/Island City in the examined title/key/description/host fields, including scans for GVP, Miracle Fortress and Inside Touch. Uncredited participation is still possible.
- False positives excluded: Ohranger's “Miracle Fortress” TV podcast, other Van Pelts, BCR's *A City Is An Island* interview (named guests are Timothy George Kelly and Jason Harvey), Podrophenia's unrelated Island City band, and rojiroji's city-pop programme. Music airplay, a tracklist name or a documentary connection does not establish participation.
- MixesDB links a possible **2023-10-07 Frank Bretschneider/Graham Van Pelt — Festival** replay. The linked entry/routes returned 404 and no working public Mixcloud recording was established; withhold. No confirmed interview emerged.
- Public Mixcloud HTML search rendered generic discovery instead of results in this environment; working public API searches were used. Broad `Graham` search reaches a 1,000-row cap; search appears title-focused and can miss description-only credits. External search had Google JavaScript shells, DuckDuckGo challenges, Yahoo failures and poor Bing `site:` results; relevant results from retried normal queries were followed to source pages. No access restriction was bypassed.
- AFW's sitemap-index request returned 404; FSR's website exposes no recovered historical date archive. Older schedules, deleted/private/unindexed recordings, generic shared titles and uncredited appearances remain gaps. Favourites/history API counts disagree with profile counters and were used only for discovery, never eligibility.
- No listening, transcription, voice identification, full-audio comparison, segment timing or territorial-playback test was performed. Public metadata can change. Recheck exact source links and readiness when manually updating; resolve new evidence rather than copying an old upload date. There is no feed, scheduled fetch or build-time Mixcloud request.

## Publication checks

- Typecheck, static build and all **16 tests** pass. The populated-catalogue test follows every one of the **132** local cards to its detail page, checking route/listening-link uniqueness, programme classification, artwork output, minimal presentation and absence of players/downloads. Isolated scenarios verify date ordering and reject duplicate identities/routes/URL aliases and invalid metadata, including invalid credits, durations and sources.
- Compared all 131 new titles, full durations, recording identities and original artwork against saved primary-source API/image responses. All **404 distinct public recording, evidence and artwork URLs** checked during publication returned successfully; this is a point-in-time link check, not a recurring network test.
- Initial publication inspection covered the populated overview and representative shared-broadcast, uncertain-date and other-appearance pages in Chromium at **1440 × 1100** and **390 × 844**: native row scrolling, keyboard focus to a far-end recording, local navigation, source disclosure, artwork proportions, full shared durations, explicit uncertainty and no page-level overflow. The later presentation revision intentionally removes metadata/source blocks from the UI while retaining the research data and ordering; rechecked the simplified cards/details at desktop and mobile sizes. Browser tests also cover reduced motion and the no-JavaScript journey. No new UI JavaScript was needed.
- Independent Standards and Spec reviews against `822f060` reported **zero findings on each axis**.
