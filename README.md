# Signal Desk — Secure Desktop v0.8

Signal Desk is a local-first Windows desktop prototype for broadcast-news curation.

It is based on the existing Signal Desk specification:

- collect approved RSS/Atom/official feeds
- extract title, URL, publication time and short description
- recent-news filtering
- URL/title similarity deduplication
- rule-based categories and discussion frames
- sensitive-topic exclusion / manual review
- compress results to a small daily shortlist
- optionally run AI analysis on the top candidates
- keep final broadcast selection human-controlled

## What is implemented here

- Tauri 2 desktop shell
- React UI
- Python sidecar
- RSS/Atom collection with security validation
- candidate scoring compatible with the project terminology
- security-focused provider adapter for OpenAI Codex CLI
- AI analysis with structured JSON output
- Tauri updater configuration scaffold
- Windows GitHub Actions build/release workflows
- security documentation and tests

## Important: provider installation

The app does **not** silently download and install third-party AI CLIs. For v0.1 it detects the official Codex CLI and uses its official login flow. This is deliberate supply-chain hardening.

OpenAI currently documents ChatGPT-login support for Codex CLI, `codex login status`, and non-interactive `codex exec`; the app's provider adapter checks authentication without reading provider tokens and uses a read-only, ephemeral execution profile for news analysis.

## Local development

Requirements:

- Node.js 22+
- Rust toolchain compatible with Tauri 2
- Python 3.13+ for the sidecar development/test path

```bash
npm ci
npm run build
python -m unittest discover -s python/tests -v
npm run tauri dev
```

The current environment used to create this package does not include Rust/Cargo, and registry access was unavailable for dependency installation, so the Tauri desktop binary was not compiled here. The Windows GitHub Actions workflow is provided for the Windows build environment. A committed package-lock.json and npm ci are used for reproducible frontend installs.

## Configure news feeds

Do not enable feeds unless their collection and broadcast/commercial-use terms permit your intended use. Copy `config.sources.example.json` into the app's source settings or enter feeds in the Sources tab.

The collector intentionally accepts HTTPS feed URLs only and rejects private/loopback network destinations.

## First AI connection

1. Install the official Codex CLI from OpenAI's documentation.
2. Run `codex login` and complete the ChatGPT login in the browser.
3. Launch Signal Desk.
4. Confirm the AI status changes to connected.
5. Run `뉴스 가져오기`.
6. Review the candidates.
7. Run `AI 분석` only on the compressed top candidates.

## Release

The updater public key and release endpoint are configured. To publish a signed release:

1. Add the updater private key as the `TAURI_SIGNING_PRIVATE_KEY` secret of the protected `release` environment (the key was generated with `tauri signer generate` and is kept outside the repository).
2. Optionally add the Windows code-signing secrets (`WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD`, `WINDOWS_CERTIFICATE_TIMESTAMP_URL`). Without them the installer is unsigned and SmartScreen warns once; updates are still verified by the updater signature.
3. Push a `v*` tag (for example `v0.6.0`). The workflow builds, signs the updater manifest, attests the installer and creates the GitHub Release. Installed apps then offer the update on next launch.

The workflow refuses to run without the updater private key.

## Collection and analysis behavior

Only articles with valid publication dates within the last 48 hours are shortlisted (five minutes of clock skew is accepted). Undated articles are excluded. Feed failures appear in the collection status. AI facts and caveats are shown for human review; AI results also update saved articles. The analysis schema is embedded in the Python executable.

The analysis prompt alone does not enforce tool or filesystem isolation. Updater keys, repository endpoint, Windows signing secrets and release manifest generation still require configuration before production release.

## Development Windows builds

The build-windows workflow runs for main pushes, pull requests, and manual dispatches. It uses src-tauri/tauri.dev-build.conf.json to disable updater artifact signing for development installers. Installer and portable artifacts are uploaded only after successful build steps. The protected release workflow continues to require updater and Windows signing keys. Development packages are unsigned and should be downloaded manually from Actions; they are not updater releases.

## v0.2: community signals and portable backups

- Default community lists: DCInside Virtual Streamer, Chzzk and AoeGame recommended lists; Ruliweb humor best; FMKorea best2. Existing users receive the presets once, preserving their existing RSS settings. Sources can be disabled or their supported list URLs changed in Settings.
- Collection reads one public list page per source on explicit collection requests, honors current robots.txt rules, pins public DNS addresses, and caches successful pages for five minutes. No login cookies, challenge bypass, post bodies, comments, author profiles, images or attachments are collected. Blocked or changed pages report a collection error. FMKorea post links are for the user to open, not automatic post fetching.
- Title, publication time inferred from list metadata, original link and list recommendation/comment/view counts are retained. Counts measure activity, not truth. Community items always require manual review. Title-only screening cannot identify harmful material hidden in a post body; inspect the original before broadcasting.
- Crime/victim incidents, personal harassment and adult-content keywords are excluded before scoring. General political stories are excluded; direct creator/game/platform policy stories remain eligible. Emergency exceptions require explicit South Korean context in the supplied metadata. Foreign and unclear emergencies are excluded. This is conservative text matching, not a geopolitical fact checker.
- Settings → Backup/Restore exports saved articles, AI results, interests, labels, notes, broadcast dates, source configuration and the selected broadcast date to versioned JSON. Restore validates the file, previews its contents and replaces current data only when the user clicks Restore. Export current data first if it should be retained. Provider credentials are excluded; log in separately on the other PC.
- Backups are limited to 4 MB and 2,000 saved articles. File access is scoped to paths selected by native file dialogs. A storage write failure rolls back the previous values. The backup carries saved data, not the transient current-news collection or the full external source content.

Verification commands:

```powershell
python -m unittest discover -s python/tests
node --test tests/*.test.cjs
npm run build
python scripts/live_check.py   # optional: hits the real default feeds and community lists
```

## v0.2.1: independent news and community lists

General news is the default tab; Community/Memes has its own tab. Each collection request fetches only that tab's source type and independently selects up to 20 candidates. Collecting one type preserves the other type's previous results, category filter, expanded state and collection timestamp. Saved interests personalize only the matching type. AI analysis receives up to 15 candidates from the current tab and category. Server-side source filtering and type-prefixed event IDs prevent mixing or AI update collisions. Broadcast Prep and Archive can show all saved items or filter by General News / Community/Memes. Backup format v1 remains compatible.

## v0.2.2: candidate rejection and tighter editorial gates

Each candidate has a selection checkbox and a one-click Reject action. Select multiple candidates and reject them together. Preferences are persisted before hiding cards; a storage failure leaves existing state intact. Settings → Excluded List supports search and restoring entries. Saved notes and broadcast plans are retained. Rejected saved items no longer contribute positive personalization.

Matching uses normalized URL identity and exact normalized titles (at least eight Unicode letters/digits). Exclusions are sent as compact SHA-256 fingerprints and applied before clustering/ranking/top-20 truncation, so later eligible candidates can replace rejected ones on collection. This does not infer that all topics or words in a rejected post are unwanted. Titles rewritten by reposters may require another rejection.

Backup format v1 includes an optional rejectedItems field; old v1 backups without it remain valid. Restore preview displays the exclusion count. Preferences are bounded to 1,000 entries and can be managed in Settings.

Editorial gates now cover assassination, foreign missile/strike/death reports and explicit ethnic/gender slurs. The exception for explicitly domestic national emergencies remains for crisis-related strike/death keywords; privacy, harassment and ordinary crime exclusions remain enforced. Screening uses supplied title/summary metadata, not automatically fetched community bodies.

## v0.3.0: learned rejection weights

Rejected titles are now used to infer interpretable negative preferences, separately for news and community posts. No provider call is required. Shared topic patterns and specific token pairs are inferred from persisted rejection history; general terms such as game/news/meme/AI are excluded from token learning. Balanced mode requires a recognized specific topic or a token pair. Strict mode additionally permits a specific token of at least three characters.

A matching rule starts at 40 points and gains 10 points per additional rejection, capped at 80. A full match of at least 40 suppresses the item before grouping/ranking/top-20 selection; partial token overlap applies a smaller penalty, with zero-score results omitted. Positive personalization cannot bring a strongly suppressed item back. Inferred rules do not hide explicitly domestic national emergencies, while exact user exclusions remain authoritative.

Settings → Excluded List shows learned topics/pairs, evidence counts and maximum penalties. Toggle learning, switch strength, search/filter rules, or mute individual rules. Undoing feedback removes its contribution; remaining feedback can still support the same rule. Rules are recalculated from the history after restart and bounded to 300 per stream so community feedback cannot crowd out news feedback.

Returned candidates retain their pre-penalty score and penalty explanation; collection status reports suppressed and demoted counts. Frontend rescoring avoids double penalties and restores base scores when a rule is disabled. Candidate metadata and learning settings are backed up; old format-v1 backups remain valid. The dictionary is embedded in the sidecar and a packaged IPC smoke test exercises it in Windows CI.

## v0.4.0: faster, isolated collection and maintenance hardening

- Sources are fetched concurrently (up to eight at a time) with a 120-second overall budget. One slow feed no longer delays the rest; a feed that exceeds the budget is reported as skipped. In the live check the nine default news feeds now complete in about a second instead of running one after another.
- The sidecar processes each request on its own worker thread, so a long collection no longer blocks the health check or AI analysis that follows it.
- Duplicate clustering pre-computes title tokens and URL identity once per article instead of per comparison, and ignores tracking parameters such as `utm_*` and `fbclid` when deciding whether two links are the same story. Rejection fingerprints are unchanged, so existing exclusion lists and backups keep working.
- Atom feeds now use the `rel="alternate"` link (or a link without `rel`) as the article URL; `self` and `enclosure` links are never mistaken for the story.
- Feed failures report their actual reason (HTTP status, timeout, XML parse error, robots.txt restriction) instead of a generic message. No feed content or provider output is included.
- Short headlines from `official` tier feeds are no longer dropped as low value when the feed provides no description.
- `robots.txt` group matching requires the exact `SignalDesk` user-agent name; partial or empty agent names no longer claim the dedicated group.
- If the Codex CLI rejects one of the options the app relies on, the analysis error now says the CLI needs updating rather than a generic failure.
- The startup update check is skipped while `tauri.conf.json` still carries placeholder updater keys or endpoints.
- The sidecar debug log rotates at 1 MB.
- The React UI is split into `src/storage.ts` and `src/components/` (candidate card, prep, archive, settings panels, excluded list, update modal); `App.tsx` keeps state and handlers only. The header version comes from `package.json` at build time.
- Every GitHub Action is pinned to a commit SHA. A new weekly `live-check` workflow collects from the real default feeds and community pages and fails when most RSS feeds stop responding. Community results are reported as warnings on GitHub runners, because Korean community sites may block datacenter IPs and a runner cannot tell a block from a layout change; run `python scripts/live_check.py` from a Korean connection for the strict parser check.

## v0.5.0: file-backed data, cancel, shortcuts, YouTube feeds, cue sheets

- **Data file.** All app data now lives in one JSON document under the per-user app data folder (`%LOCALAPPDATA%\com.signaldesk.desktop\signal-desk\state.json`), written atomically. It survives WebView cache clears and has no browser quota; the saved-article cap rises to 5,000. Existing installs migrate from `localStorage` automatically on first launch; the backup format (v1) is unchanged. Restoring a backup writes the file first and only then replaces what is on screen.
- **Cancel collection.** While a collection runs, 「중단하고 지금까지로」 asks the sidecar to stop waiting and build candidates from the sources that already answered. The sidecar supports a `cancel` request targeting a running `collect` by request ID.
- **Keyboard shortcuts** on the news and community lists (outside text fields): `J`/`K` or arrows move the cursor, `X` rejects, `S` toggles interest, `B` toggles broadcast prep, `C` toggles the exclusion checkbox, `O`/Enter opens the original.
- **YouTube channel feeds.** Settings → 뉴스 소스 has a field for a channel ID or `youtube.com/channel/UC…` URL; it adds YouTube's official per-channel Atom feed as an `official` source. Only titles, descriptions and watch links are collected through the normal HTTPS-only RSS path. `@handle` URLs cannot be resolved offline; copy the channel ID from the channel's share menu.
- **Broadcast cue sheet.** The 방송 준비 tab can copy or save a markdown run sheet for the selected date: numbered stories ordered by score with source, link, summary, AI discussion points, caveats, labels and your notes.
- The sidecar capability set adds scoped read/write for the app's own local-data directory only.

Verification: `python -m unittest discover -s python/tests`, `node --test "tests/*.test.cjs"`, `npm run build`.

## v0.6.0: watchlist, prior-broadcast badge, snapshots, release signing

- **Watchlist** (Settings → 워치리스트·선별): names that must never slip through. A candidate whose title or summary contains a watch term is pinned above every other candidate, both in the sidecar before the top-20 cut and in the UI, and carries a 워치리스트 badge. Crime, harassment and political exclusions still apply. Up to 50 terms; included in backups (format v1, optional field).
- **Already aired badge**: a candidate that matches a story already placed on a broadcast date within the last 14 days (same link, same title, or at least three shared specific title tokens) shows 「이미 방송 MM/DD」 with the earlier title on hover, so the same story is not covered twice by accident.
- **Snapshots**: on launch the app writes a dated copy of its data file to `signal-desk\snapshots\` (one per day; a tagged copy right after the localStorage migration) and keeps the newest seven.
- **Release signing**: the updater public key and endpoint are set, so the in-app update check is active. The release workflow now requires only the updater private key; Windows code signing is optional until a certificate exists.
- Capability: `fs:allow-read-dir` for snapshot pruning inside the app's own data folder.

Verification: `python -m unittest discover -s python/tests`, `node --test "tests/*.test.cjs"`, `npm run build`.

## v0.7.0: just-chatting topic engine

Direction and ranking came from a nine-agent ideation pass recorded in `docs/JUSTCHAT_ROADMAP.md`. This release ships the first two stages of its recommended order plus the highest-scored small items.

- **채팅 질문·투표 (AI 없이).** Every candidate now carries a `talk` block computed by the sidecar from `shared/talk_angles.json`: an engagement profile (토론형 / 공감형 / 정보형, from community comment-to-recommendation ratios or news frames), two to three chat questions and one poll in the "질문? 1 보기 2 보기" shape chat polls accept. Selection is deterministic per article. Cards show the block with a 「복사」 button for the poll; the cue sheet includes it. No Codex needed. Codex `discussion_points` still appear alongside when analysis ran.
- **오늘의 토크 탭 + 방송 전 루틴.** A new first tab picks five stories from all candidates (carried-over 「못 다룸」 stories → watchlist → one follow-up slot → at least one community story → score; two per category; already-aired stories skipped), each with its reason, questions and poll. 「방송 전 루틴 실행」 collects 뉴스 → 커뮤니티 and rebuilds the picks; 「모두 담기」 fills the broadcast date; 「교체」 swaps a pick; 「브리핑 복사」 exports markdown; digit keys 1–5 open originals. Settings → 방송 전 루틴 can start the routine automatically on launch.
- **지난 방송 후속.** A newer article on a story aired within 14 days shows 「후속 · MM/DD 방송」 instead of 「이미 방송」, with the earlier note collapsed under it; the news tab has a 「지난 방송 후속 N」 filter; the cue sheet adds an 「이어서」 line.
- **수집 기록과 주간 흐름 탭.** Each collection logs its top candidates (30 days, 2,000 lines, in the state file and backups). Cards show 「N일째 화제」 for names seen three or more days this week. The 주간 흐름 tab lists persistent, rising and new names, this week's aired stories and strong candidates never picked up (with 「방송 준비에 담기」), and copies or saves a weekly recap markdown for an 「이번 주 정리」 segment. Settings suggests recurring names for the watchlist.
- **방송 후 반응.** On the 방송 준비 tab each story takes 터짐 / 보통 / 안 다룸 for the selected date. 터짐 feeds extra title keywords into personalization, 안 다룸 and 보통 stop feeding it, 안 다룸 offers 「다음 날로 이월」 and leads the next briefing. Similar candidates later show 「지난번 반응 좋았음」. Reactions are optional fields in the state file and backup format v1.
- **코너별 큐시트.** The cue sheet groups stories into 뉴스 브리핑 → 밈 리뷰 → 사연·내 경험 → 찬반 토론 with minutes per corner and a total; the 방송 준비 cards show the corner.
- **채팅 터질 순.** A sort toggle on the news and community tabs ranks by talkability, profile, comment volume and watchlist hits instead of score.
- Deliberately not done, per the judges: tray/scheduler (needs Rust and shell access), AI schema extension (Codex strict output schemas), conditional-GET cache, positive rule learning (filter-bubble risk until reactions accumulate).

Verification: `python -m unittest discover -s python/tests`, `node --test "tests/*.test.cjs"`, `npm run build`.

## v0.8.0: keyword research, settings-only backups, line endings

- **키워드 리서치 tab.** Type a topic (e.g. `RTX 5090 생산 중단`), pick 7/14/30 days, and the sidecar's new `research` op fetches Google News' login-free search RSS for it through the normal HTTPS-only pipeline (editorial gates, clustering, talk angles; up to 40 stories). The view merges those with matching current candidates, the 30-day collection log and the archive, grouped newest day first, with origin badges, sources, related terms (click to re-search), 「워치리스트에 추가」, 「방송 준비에 담기」 and a markdown 「리서치 복사」. No article bodies are fetched; Google titles are split into title and publisher. Bing's RSS returned no items in testing and is not used.
- **Settings-only backup.** 「설정만 내보내기」 writes a small backup (sources, watchlist, learning settings, routine) in the same v1 format; restoring any backup now offers 「설정만 복원」, which keeps the current archive, exclusions and collection log. It is pre-selected for settings-only files.
- `.gitattributes` normalizes line endings to LF (PowerShell scripts stay CRLF), ending the per-file CRLF warnings on Windows checkouts.
- The sidecar's `build_candidates` takes `window_hours` and `limit` (defaults unchanged: 48 h, 20).

Verification: `python -m unittest discover -s python/tests`, `node --test "tests/*.test.cjs"`, `npm run build`.


## v0.9.0 AI account connections

환경설정 → AI 연결에서 Codex, Claude, Gemini 중 하나를 선택합니다. 공식 CLI를 처음 한 번 설치한 뒤 「브라우저 로그인 연결」을 누르면 공식 도구의 로그인 터미널이 열립니다. Gemini는 Login with Google을 선택합니다. 로그인 후 「연결 테스트」로 확인합니다. Gemini 연결 테스트는 실제 모델 호출이므로 해당 계정 사용 한도를 소량 소비합니다. 계정·지역·구독에 따른 제공사 사용 한도가 적용됩니다.

공식 CLI 설치·인증은 사용자 PC에서 수행하며 로그인 토큰을 Signal Desk에 복사하거나 백업에 포함하지 않습니다. 백업에는 선택한 AI만 저장합니다. Claude와 Gemini 분석은 도구 호출을 차단하고, 분석 응답이 원문 URL·제목 등 출처 필드를 덮어쓰지 못하도록 검증합니다. 최신 공식 CLI가 필요하며 지원하지 않는 옵션이나 인증 실패는 연결 실패로 안내합니다. Grok은 제공하지 않습니다.

Windows packaged-build checks and mocked adapter tests do not substitute for a real signed-in provider test. Claude/Gemini account login and live inference must be verified on the user's PC after installing those CLIs.
