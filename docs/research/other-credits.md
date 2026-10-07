# Graham Van Pelt — credits on other artists’ releases

Research date: **2026-10-07**. Subsequent implementation is documented below.

## Scope and result

This is a source-backed working inventory, **not an exhaustive production discography**. It excludes releases led by Graham Van Pelt, Miracle Fortress and Think About Life, and compilations that merely license their recordings. Remixes **of other artists** are included separately: their credited artist remains Diamond Rings or Snow Patrol, even when Graham’s credit uses Miracle Fortress.

Found **eight performance/technical-credit release candidates**, **two outside-artist remix releases**, one additional National Parks Project EP lead, and a verified composition-only credit. Four of the ten main/remix releases have artist/label text verifying the contribution itself; the remaining six have precise secondary credit transcriptions, often with independently verified primary release information. **Do not describe all ten as primary-verified credits.**

Read `docs/agents/domain.md`, `CONTEXT.md` and the existing Miracle Fortress / Think About Life research notes before investigating. Used Python `requests` to retrieve artist websites, artist/label Bandcamp pages, archived label and artist pages, and supplementary Discogs/Apple APIs. No search snippet is treated as proof of a credit. All durable findings and follow-up leads from this pass are below.

### Evidence policy

- **High:** artist/label explicitly names the contribution; any scope or identity qualification is stated.
- **Medium:** a specific Discogs release transcribes the credit, but retrieved primary pages do not independently verify that role. Primary verification of an album’s existence/date does **not** promote its credit to High.
- **Lead:** release or association exists, but the requested contribution is not established.
- Dates describe the cited edition or announcement. A later Bandcamp date is not silently substituted for an original release date. January 1 dates are retained as printed but not assumed to be independently established original days.
- “Recorded by,” “engineered,” “mixed,” “mastered,” “beat by,” and “remix” are distinct credits. No role is expanded into another without evidence.

## Performance, recording, production, mixing and mastering

### 1. Sing That Yell That Spell — *Sing That Yell That Spell* / *S/T*

- **Release:** **March 11, 2004**, Escape Goat Records, **EGR003**, CD. The [archived label artist page](https://web.archive.org/web/20050214023523/http://escapegoatrecords.com/styts.htm) explicitly prints “Released date: March 11th 2004.” The [label product page](https://web.archive.org/web/20060721143132/http://www.escapegoatrecords.com:80/egr003.htm) independently gives March 2004 and the five tracks.
- **Credited roles:** **Mixed By, Producer, Engineer, Mastered By — Graham Van Pelt**, release-level, no track restrictions in [Discogs release 10071196](https://api.discogs.com/releases/10071196). The band also has a Producer credit, so do not call Graham the sole producer. Discogs says recorded **July 3, 2003**; that is a session date, not the release date.
- **Confidence:** **Medium for all four roles; High for the label’s release-date statement.** The retrieved label/artist pages do not print the technical credits. The physical insert remains the best verification target.
- **Identity/scope:** The [artist’s archived biography](https://web.archive.org/web/20041208151233/http://www.singthatyellthatspell.com/bio.htm) lists Colin Fisher, Lennie Haggerty and Tim Nicholls. Graham is not presented as a band member there. The [artist’s news page](https://web.archive.org/web/20041208151233/http://www.singthatyellthatspell.com/stytsnews.htm) confirms the CD came out, but does not identify its engineer.
- **Tracks:** “Screams and Flames over the Horizon”; “Improv One”; “I Am Under Their Lids, Growing Black”; “Improv 2”; “Overturned in the Road a Wheel Slowly Spinning” (capitalization normalized from the label).

### 2. Giselle Numba One — *FALL FASHIONSZ*

- **Release:** **2008**; [artist Bandcamp](https://gisellenumbaone.bandcamp.com/album/fall-fashionsz) prints **January 1, 2008**. Exact original day is not independently corroborated. Discogs calls it *Fall Fashionz*; prefer the artist’s displayed title above.
- **Track 5, “SWEDISH AND HAITIANS”:** [track page](https://gisellenumbaone.bandcamp.com/track/swedish-and-haitians) explicitly says **“BEAT BY: GVP (MIRACLE FORTRESS) AND MRS. FRESHLY.”** This is a **shared beat credit**. Its lyric heading instead says “beat by GVP, instrumentals by gz1”; retain the more explicit track About credit rather than claiming sole production.
- **Track 6, “CRAZY BITCH”:** [track page](https://gisellenumbaone.bandcamp.com/track/crazy-bitch) says **“BEAT BY: GVP (MIRACLE FORTRESS)”** and **“VOX: GISELLE NUMBA ONE (FEAT. GVP).”** Supported roles: beat contribution and featured vocals.
- The album About text independently lists GVP among beat contributors and guest vocalists, and explicitly connects GVP with Miracle Fortress.
- **Important limit:** Both track pages and the album credit **Mrs. Freshly** with production and engineering at Bak Shak Studios. Do **not** relabel Graham as album producer/engineer or credit him with all eight tracks.
- **Confidence:** **High**, including alias identification. [Discogs 12433845](https://api.discogs.com/releases/12433845) corroborates Beats on track 5 and Beats/Vocals on track 6, but omits the primary page’s shared beat attribution on track 5.

### 3. Dead Wife — *Subterranean Megazit*

- **Original:** **2009**, cassette, Campaign For Infinity. [Artist Bandcamp](https://deadwife.bandcamp.com/album/subterranean-megazit) identifies the cassette label (spelled “Campain For Infinity”) and prints 2009 in the credits. [Discogs 2536652](https://api.discogs.com/releases/2536652) specifies **August 1, 2009**, 100 pink tapes; that exact date/quantity remains secondary.
- **Current digital page:** **January 1, 2015**. Do not date the cassette to 2015.
- **Exact credit:** **“Choke recorded by Graeme Van Pelt.”** “Choke” is track 4 on Bandcamp / B2 on the cassette. The other three songs are explicitly recorded by Dead Wife.
- **Confidence:** **High for the printed track-specific recording credit; Medium–High for identity normalization.** The artist spells the name **Graeme**, not Graham. Discogs maps that exact spelling as an artist-name variation to Graham Van Pelt (506154). No independent artist correction was recovered; keep the original spelling in quoted evidence.
- No mixing, mastering, production or performance role is established here. Do not give him the entire cassette’s recording credit.

### 4. Grand Trine — *Sunglasses EP*

- **Release:** **April 1, 2010**, as printed on [artist Bandcamp](https://grandtrine.bandcamp.com/album/sunglasses-ep); the page directs purchasers to Divorce Records for the 12-inch. Discogs identifies the physical release as 2010.
- **Primary credit:** Graham’s [own Tumblr post](https://grahamvanpelt.tumblr.com/post/67671978725/full-stream-of-grand-trines-record-sunglasses) says: **“Full stream of Grand Trine’s record, Sunglasses, that I engineered a while back.”** The post embeds the EP stream.
- **Confidence:** **High for engineering involvement.** This is participant-authored testimony, not a review. It does not specify session dates, track-by-track division or sole responsibility.
- [Discogs 2164849](https://api.discogs.com/releases/2164849) gives **Recorded By** to **both David Bryant and Graham Van Pelt**, without track allocation. Preserve the collaboration rather than implying Graham recorded the entire EP alone. No primary production/mixing/mastering attribution was found.
- **Tracks:** “I Am a Magnet”; “Catatonic State”; “Love & Napalm: Export USA”; “Prescription Drugs”; “Nazi Gold.”

### 5. No Joy — *No Summer* b/w *No Joy*

- **Release:** **October 2010**, SEXBEAT **007**, two-track 7-inch. The [archived label shop](https://web.archive.org/web/20110222200607/http://sexbeat.bigcartel.com:80/product/sexbeat-007-no-joy-no-summer-b-w-no-joy) identifies No Joy as Laura Lloyd and Jasamine White-Gluz, says **300 copies**, and **“This will ship on MONDAY 18th OCTOBER.”** [Discogs 2535433](https://api.discogs.com/releases/2535433) dates the record **2010-10-18**, consistent with that announcement. Strictly, the primary wording is a shipping promise.
- **Current label audio:** [“No Summer”](https://sexbeat.bandcamp.com/track/no-summer) and [“No Joy”](https://sexbeat.bandcamp.com/track/no-joy). Both print **October 1, 2010**, and neither supplies technical credits. Keep that digital-page date separate from the physical shipping announcement.
- **Credited roles:** **Mastered By, Mixed By, Recorded By — Graham Van Pelt**, release-level, in Discogs 2535433. Notes identify **The Pines Studio** as recording location.
- **Confidence:** **Medium for the three roles and studio; High for primary release identity and label announcement.** Artist/label text retrieved in this pass does not independently name Graham.
- **Do not generalize to *Ghost Blonde*.** The [artist’s current album page](https://nojoy.bandcamp.com/album/ghost-blonde-2) credits recording/production to No Joy, mixing to Sune Rose Wagner and mastering to Paul Gold. It does not substantiate a Graham credit. Its current digital date is September 19, 2022, with November 15, 2010 separately printed in the credits.

### 6. Lily Fawn — *Lily Fawn’s Lullaby Album — Brightest, Darkest*

- **Original:** **2009**, Northern Electric, according to [Discogs 11453337](https://api.discogs.com/releases/11453337); no original day recovered.
- **Credited role:** **Bass**, specifically CD tracks **1, 3 and 15**: **“Friday Morning Hymn,” “Into the Holes,” and “Time for Bed Sleepyhead.”** No album-wide bass credit is claimed.
- **Primary listening:** [artist Bandcamp — *Lily’s Lullaby Album, Brightest Darkest*](https://lilyfawn.bandcamp.com/album/lilys-lullaby-album-brightest-darkest), linked from [Northern Electric’s artist page](https://northern-electric.ca/lily-fawn/). Bandcamp prints **September 19, 2015** and does not name Graham in its credits. Individual pages for the first two songs also do not establish his bass role.
- **Confidence:** **Medium for bass and 2009 dating; High for current authorized digital availability/date.** Needs original booklet or artist confirmation.
- **Edition warning:** Bandcamp’s sequence/titles differ from the CD transcription. On Bandcamp, **“Time For Bed Sleepy Head” is track 14**, while track 15 is “Babies Asleep In The Forest.” Map the contribution by song title, not by blindly transferring CD ordinal 15. Other changed titles/order do not themselves establish different recordings.

### 7. Various artists — *National Parks Project*: “Kathleen Lake”

- **Release:** [archived Last Gang artist/release page](https://web.archive.org/web/20120614041454/http://lastgangentertainment.com/records/artists/national-parks-project) announces **May 3, 2011 digital / May 24, 2011 physical**, explicitly distinguishing **20-track CD** and **26-song double vinyl**. Its release list labels the album May 3, 2011.
- **Credited role:** **Vocals — Graham Van Pelt** on **“Kathleen Lake”**, with Ian D’Sa (guitar) and Mishka Stein (bass, finger cymbals), in [Discogs 3767737](https://api.discogs.com/releases/3767737). Notes say the song was built part-by-part over several nights at a shelter on the shore of Kathleen Lake, Kluane National Park & Reserve, Yukon.
- **Confidence:** **Medium for vocals and recording details; High for the label’s edition/release announcement.** No lyric/liner-note primary source naming Graham’s vocal role was recovered. This is a new collaborative soundtrack recording, not a compilation licensing an existing Miracle Fortress song.
- **Current listening:** [Apple — “Kathleen Lake (Kluane, YU)”](https://music.apple.com/ca/album/kathleen-lake-kluane-yu/1107097225?i=1107097813). [Apple lookup](https://itunes.apple.com/lookup?id=1107097225&country=ca&entity=song) lists **Ian D’Sa & Mishka Stein**, omitting Graham from the display artist. Absence from that short artist field does not disprove a liner-note vocal credit.
- **Date discrepancy:** The current Apple album has **May 10, 2011**; the track has **April 29, 2011**. Neither silently replaces the historical label’s May 3/24 announcement. Actual first-publication day remains unresolved across editions/platforms.
- **Ordinal caution:** Current 20-track Apple album places the song at 18. Discogs 3767737 specifically describes the **2LP**, where it is **D4** (23rd in the listed sequence), although its notes call it “Track 18.” Use the song title and edition-specific position; do not transfer CD numbering to the vinyl.

#### Additional primary release discovery: *Kluane / Nahanni — EP*

The same [Last Gang page](https://web.archive.org/web/20120614041454/http://lastgangentertainment.com/records/artists/national-parks-project) separately lists **March 29, 2011**, **MP3**. This is a real label-documented EP, not an invented grouping of album tracks. **Lead only for Graham’s release credit:** full track list and his exact contributions to this EP were not recovered. Do not assume that every Kluane recording, including Mishka Stein’s solo track, features him. The former purchase link is a general iTunes search; a current Canadian Apple album search did not recover the EP.

### 8. Diamond Rings — *Free Dimensional*

- **Release:** **October 22, 2012**, Secret City Records, explicitly verified by the [label product page](https://www.secretcityrecords.com/products/free-dimensional).
- **Exact credit:** **Guitar — Graham Van Pelt** on **track 6, “Hand Over My Heart,”** in [Discogs 3973729](https://api.discogs.com/releases/3973729). No contribution to the other tracks is implied.
- **Confidence:** **Medium for guitar; High for release date.** The retrieved label description does not name him. It describes John O’s collaboration with producer Damian Taylor; it does not establish Graham as a producer/engineer.

## Remixes of other artists

### 9. Diamond Rings — *Show Me Your Stuff* 12-inch

- **Contribution:** **“You Oughta Know (Miracle Fortress Remix)”**, **B2**, credited **Remix — Miracle Fortress** in [Discogs 2422939](https://api.discogs.com/releases/2422939).
- **Release:** **June 18, 2010** in Discogs, One Big Silence **OBS12-001**, limited to 500 there. The [archived label catalogue](https://web.archive.org/web/20110914230154/http://onebigsilence.com/home.html) independently confirms the title, artist, catalogue number and 12-inch availability, but not date, quantity or B2 credit.
- **Confidence:** **Medium for remix/date/quantity; High for primary release identity.** No producer, mixer or instrumental role beyond the printed remix attribution is inferred.
- **Digital edition trap:** [Apple lookup for current Canadian release 407712902](https://itunes.apple.com/lookup?id=407712902&country=ca&entity=song) gives **June 22, 2010**, but only “Show Me Your Stuff” and its Hype House mix. It is **not** an accessible four-track replacement for the vinyl or proof of the Miracle Fortress remix’s release day. The label’s former iTunes ID 378398077 returned no current Canadian result.

### 10. Snow Patrol — *Fallen Empires*, Japanese edition

- **Contribution:** **“Called Out in the Dark (Miracle Fortress Remix)”**, Japanese CD bonus **track 15**.
- **Release:** **November 16, 2011**, **UICP-1131**, Japan. [Universal Music Japan’s product page](https://www.universal-music.co.jp/snow-patrol/products/uicp-1131/) explicitly prints the date, catalogue number and track 15 **“コールド・アウト・イン・ザ・ダーク MIRACLE FORTRESS REMIX.”** It describes a one-disc CD and identifies Polydor UK in the label field.
- **Confidence:** **High for the credited remix and this edition’s date.** [Discogs 5688407](https://api.discogs.com/releases/5688407) corroborates track 15 and explicitly transcribes the Remix role. Universal’s title uses the alias rather than Graham’s full name.
- Not an album-wide production credit, not a Miracle Fortress main-artist release, and **not proof that November 16 was the remix’s first release anywhere**. Earlier promotional/online circulation remains unverified.

## Verified adjacent credit, outside the requested role types

### New Found Land — *NEW FOUND LAND*: “Everything Works”

- **Release:** **March 1, 2013**, [artist album page](https://newfoundland.bandcamp.com/album/new-found-land), track 3.
- **Exact primary credit:** [track page](https://newfoundland.bandcamp.com/track/everything-works): **“written by Graham van Pelt / Miracle Fortress www.miraclefortress.com.”**
- **High-confidence songwriting credit only.** This supports an outside artist performing his composition; it does **not** establish that he performed on, recorded, mixed, mastered or produced New Found Land’s recording. Keep it out of a technical/session-credit count unless scope expands to writing.
- [Discogs 4270106](https://api.discogs.com/releases/4270106) agrees: Written-By on track 3; it names other people for production, recording, mixing and mastering.

## Exclusions and useful negative checks

- **Hidden in Buildings — *Hidden in Buildings* (2003):** [Discogs 28543864](https://api.discogs.com/releases/28543864) lists **Music By — Graham Van Pelt**. That does not establish a third-party session credit, and the possibility of another own project was not resolved. Excluded rather than assumed to qualify.
- **Inside Touch:** Graham’s [own Tumblr](https://grahamvanpelt.tumblr.com/) explicitly identifies this as his electronic project. Excluded from “other artists,” despite the scope’s three named exclusions not mentioning this alias.
- **Diamond Rings touring vs recording:** [Graham’s current About page](https://www.grahamvanpelt.com/about) names Diamond Rings among acts with which he performed. That is not, by itself, proof of any album-session credit.
- **Dead Wife catalogue:** Checked all six releases linked by the [artist index](https://deadwife.bandcamp.com/music). Only *Subterranean Megazit* names Van Pelt. [*CHOKE+JUNK (MYSPACE DAYS)*](https://deadwife.bandcamp.com/album/choke-junk-myspace-days) currently contains “Junk” and “TMZ (surfer song),” credited to Shub Roy, despite “Choke” in its title. [*DWSYHF*](https://deadwife.bandcamp.com/album/dead-wife-dwsyhf-7) credits Mark Montanchez/Choyce; [*T.T.Y.N.*](https://deadwife.bandcamp.com/album/t-t-y-n-unreleased-songs) credits Roy Vucino, Sam Pennington and Matt Smitt; [*Night of the Living Dead Wife*](https://deadwife.bandcamp.com/album/night-of-the-living-dead-wife) credits Sam Pennington and Matt Smith. The [Hunters split](https://deadwife.bandcamp.com/album/dead-wife-hunters-split-7) supplies no Van Pelt recording credit. Do not spread the “Choke” credit across the catalogue.
- **Grand Trine catalogue:** [*Free All Psychic Centers*](https://grandtrine.bandcamp.com/track/free-all-psychic-centers) credits Shub Roy, summer 2008; [“Radio Frequency Identification (BSTB 7-inch version)”](https://grandtrine.bandcamp.com/track/radio-frequency-identification-bstb-7-version) credits Sarah Fahie and Marc Montanchez for recording and Grand Trine for mixing. The [Holy Cobras split](https://grandtrine.bandcamp.com/album/grand-trine-holy-cobras-split-cs) does not supply a Van Pelt credit. These are not additional supported credits merely because *Sunglasses* is.
- **Film scores:** The [artist’s Film page](https://www.grahamvanpelt.com/film) credits original scores for *Never Happened* (2016) and *Final Offer* (2018), both written/directed by Mark Slutsky. Real primary credits, but no separate other-artist soundtrack releases were established; excluded from the release inventory.
- **Bandcamp recommendation contamination:** A search for his mastering work returned Kuf Knotz & Christine Elise’s *Hypnagogia* because a footer recommends Graham’s *Time Travel*. That snippet is not a credit; not included.

## Remaining verification priorities

1. **Original technical-credit artifacts:** Sing That Yell That Spell’s EGR003 insert; No Joy’s SEXBEAT 007 sleeve/labels; Lily Fawn’s 2009 booklet; National Parks Project’s liner notes. These can upgrade the Medium roles without relying on database transcriptions.
2. **Diamond Rings — *Free Dimensional*:** its booklet is the precise source needed to verify “Hand Over My Heart.”
3. **National Parks Project EP:** recover the *Kluane / Nahanni* track list and detailed performer credits; do not merge it automatically into the album.
4. **Outside-artist remix completeness:** artist/label archives for Diamond Rings and Snow Patrol may establish earlier digital issues or additional remixes not present in the limited discovery index.
5. **Spelling/date ambiguities:** artist confirmation of “Graeme” on Dead Wife; original release dates for Giselle and Lily; original versus digital/physical dates for No Joy and National Parks Project.

## Coverage and access limits

Discovery included searches for the full name, spelling variants, engineering/recording/mixing/mastering/production terms, and the Miracle Fortress alias; direct artist/label catalogue traversal; Graham’s current website and two populated Tumblr pages; and archival traversal of Escape Goat, Sing That Yell That Spell, SEXBEAT, One Big Silence and Last Gang. Artist Bandcamp pages were useful even when general Bandcamp search returned a JavaScript challenge.

Supplementary discovery indexes: [Graham Van Pelt, Discogs 506154](https://api.discogs.com/artists/506154/releases?per_page=100&sort=year&sort_order=asc) returned 36 role entries on one page; [Miracle Fortress, 853449](https://api.discogs.com/artists/853449/releases?per_page=100&sort=year&sort_order=asc) returned 30. These repeat titles under multiple roles and are **not** counts of distinct outside credits. Only relevant individual records were inspected; this was not an edition-by-edition Discogs audit.

Google returned script-only pages; Bing often returned unrelated results; DuckDuckGo/Mojeek challenged or blocked requests. Brave initially returned usable discovery results, then intermittently CAPTCHA/429 responses. Search coverage is therefore incomplete. AllMusic was blocked. Some guessed artist/Bandcamp URLs returned 404, which is not proof of nonexistence.

Wayback’s availability API returned 429, while many direct captures worked. Archive links above use resolved capture timestamps where recovered; a replay request can still redirect to a nearby capture. National Parks Project’s archived official site is Flash-only; its referenced `xml/config.xml` returned an archived 404. Last Gang’s archived artist page ends in a PHP memory error **after** the biography and release list; the cited text was present in the fetched HTML. Live label/artist domains sometimes failed or were inaccessible. No audio playback was tested.

## Implementation provenance — eight-entry catalogue

Implemented `src/data/releases/other-credits.json` with exactly eight entries: Grand Trine, Dead Wife, Sing That Yell That Spell, National Parks Project, the two specified Diamond Rings releases, Snow Patrol's Japanese edition, and New Found Land. Lily Fawn, Giselle and No Joy remain excluded. New Found Land is included specifically for songwriting, not session work. Each entry has a separate concise `credit` string; `about` preserves scope and distinguishes primary evidence from database transcriptions. Added an optional `credit` field to `ReleaseData`, registered an **Other Credits** category, and display the artist and contribution on its cards and detail pages. Existing categories retain their presentation.

All `tracks` arrays are deliberately empty: no complete track lists were imported. Dates retain original-release versus digital-edition distinctions: Dead Wife is 2009 rather than Bandcamp's 2015 date; National Parks Project and Show Me Your Stuff use year precision rather than resolving conflicting or secondary-only exact days. The Snow Patrol entry is specifically UICP-1131; Diamond Rings' Show Me Your Stuff is specifically OBS12-001, not the two-track digital issue.

### Live Bandcamp retrieval and availability

Fetched the three artist album pages with Python `requests`, parsing their HTML `data-tralbum` JSON (not guessed player IDs). All returned successfully. The following artwork URLs also returned successfully and passed Pillow image verification. These covers remain remote Bandcamp artwork, derived from the genuine `art_id`; no redundant local copies were added.

| Artist / edition | Album page | `album_id` | `art_id` / artwork source |
| --- | --- | --- | --- |
| Grand Trine — Sunglasses EP, current five-song digital page (April 1, 2010) | https://grandtrine.bandcamp.com/album/sunglasses-ep | 224751224 | 3510607156 — https://f4.bcbits.com/img/a3510607156_16.jpg |
| Dead Wife — Subterranean Megazit, current digital page (January 1, 2015), representing the 2009 cassette | https://deadwife.bandcamp.com/album/subterranean-megazit | 1995596338 | 3601698903 — https://f4.bcbits.com/img/a3601698903_16.jpg |
| New Found Land — NEW FOUND LAND, current album page (March 1, 2013) | https://newfoundland.bandcamp.com/album/new-found-land | 2092748882 | 379212677 — https://f4.bcbits.com/img/a379212677_16.jpg |

These are the only listening URLs/player identifiers added. Successful HTML/artwork retrieval establishes page availability, not tested audio playback or current physical stock. No listening link was invented for the other five entries, and no standard/digital edition was substituted for a credited bonus-track or vinyl edition.

### Local artwork provenance

Image URLs were taken from the release-specific cached `/tmp/gvp-credits/releases-<id>.json` records, then fetched using `User-Agent: DiscographyResearch/1.0`. Every response succeeded; every saved file was verified and fully decoded as JPEG with Pillow. Files retain the downloaded bytes. Discogs images are supporting release artwork, not new primary verification of the credits or a claim of image licensing permission.

All local paths below are under `public/images/music-releases/`:

- **`other-credits-sing-that-yell-that-spell.jpg`** — 300 × 298; [Discogs 10071196](https://api.discogs.com/releases/10071196), Canadian Escape Goat CD, EGR 003. The record's sole image is marked `secondary`; visually checked that it is the titled front cover, not a back cover. [Downloaded image](https://i.discogs.com/pyPecxONXWeUrEQto53bP8YYQYjTL0TJa3w_OmvxUPQ/rs:fit/g:sm/q:90/h:298/w:300/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTEwMDcx/MTk2LTE0OTExMDQ1/MjEtOTQ0MC5qcGVn.jpeg).
- **`other-credits-national-parks-project.jpg`** — 500 × 500; primary image from [Discogs 3767737](https://api.discogs.com/releases/3767737), Canadian 2LP, FilmCan Q1 01327 / Last Gang. This is the vinyl edition whose Kathleen Lake credit is D4, not CD track 18. [Downloaded image](https://i.discogs.com/Me6HWfAGrSHSZbA07GCL4IqtEHrCUZdclQZ6G-qww4k/rs:fit/g:sm/q:90/h:500/w:500/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTM3Njc3/MzctMTM0MzU5Njg3/My00Mzk3LmpwZWc.jpeg).
- **`other-credits-free-dimensional.jpg`** — 600 × 600; primary image from [Discogs 3973729](https://api.discogs.com/releases/3973729), Canadian Secret City CD, SCR030CD. [Downloaded image](https://i.discogs.com/29TO4LetnhBjy6XteuttgEjifXx7KagSKFQdI0vxa5s/rs:fit/g:sm/q:90/h:600/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTM5NzM3/MjktMTM1MTA0MTAx/Mi0yODA3LmpwZWc.jpeg).
- **`other-credits-show-me-your-stuff.jpg`** — 600 × 600; primary image from [Discogs 2422939](https://api.discogs.com/releases/2422939), Canadian One Big Silence limited 12-inch, OBS12-001, containing You Oughta Know (Miracle Fortress Remix). [Downloaded image](https://i.discogs.com/D3WLlE9V2ZAnZ1XRLgwgejYsxz1iOxMqV4u4_5kLr7c/rs:fit/g:sm/q:90/h:600/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTI0MjI5/MzktMTI4MzI0NTg1/MS5qcGVn.jpeg).
- **`other-credits-fallen-empires-japanese-edition.jpg`** — 600 × 598; primary image from [Discogs 5688407](https://api.discogs.com/releases/5688407), Japanese CD UICP-1131, including bonus track 15. [Downloaded image](https://i.discogs.com/TE8AHyfDk5pnw-O8NJgoWrIqWjJpkBGofnIa2VYKNJU/rs:fit/g:sm/q:90/h:598/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTU2ODg0/MDctMTQxOTAxMTYz/NS05NzA4LmpwZWc.jpeg).

Fetch script and intermediate metadata remain in `/tmp/gvp-credits/implement-fetch.py` and `/tmp/gvp-credits/implementation-*.json`, outside the repository. Existing unrelated working-tree changes were left untouched.

### Validation

`pnpm check` and `pnpm build` passed (the build retains an unrelated existing MDX directive warning). All six targeted catalogue/browser tests passed using installed Chromium: `tests/other-credits.test.js`, `tests/music-releases-browser.test.js`, and `tests/music-release-layout-browser.test.js`. Coverage includes all eight new detail pages at 320px with JavaScript disabled, local artwork decoding, scoped credits, genuine player IDs, and unique routes across the catalogue. `git diff --check` passed.
