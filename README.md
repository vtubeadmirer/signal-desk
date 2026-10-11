# Signal Desk — Secure Desktop v0.2

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

Do not publish a release until you have configured:

- Tauri updater public key in `src-tauri/tauri.conf.json`
- Tauri updater private key in GitHub protected environment secret
- Windows code-signing certificate/password
- repository owner/name in the updater endpoint
- protected release environment/tag rules

The release workflow intentionally fails while placeholders or missing signing secrets remain.

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
node --test tests/agent.test.cjs tests/backup.test.cjs
npm run build
```

## v0.2.1: independent news and community lists

General news is the default tab; Community/Memes has its own tab. Each collection request fetches only that tab's source type and independently selects up to 20 candidates. Collecting one type preserves the other type's previous results, category filter, expanded state and collection timestamp. Saved interests personalize only the matching type. AI analysis receives up to 15 candidates from the current tab and category. Server-side source filtering and type-prefixed event IDs prevent mixing or AI update collisions. Broadcast Prep and Archive can show all saved items or filter by General News / Community/Memes. Backup format v1 remains compatible.

## v0.2.2: candidate rejection and tighter editorial gates

Each candidate has a selection checkbox and a one-click Reject action. Select multiple candidates and reject them together. Preferences are persisted before hiding cards; a storage failure leaves existing state intact. Settings → Excluded List supports search and restoring entries. Saved notes and broadcast plans are retained. Rejected saved items no longer contribute positive personalization.

Matching uses normalized URL identity and exact normalized titles (at least eight Unicode letters/digits). Exclusions are sent as compact SHA-256 fingerprints and applied before clustering/ranking/top-20 truncation, so later eligible candidates can replace rejected ones on collection. This does not infer that all topics or words in a rejected post are unwanted. Titles rewritten by reposters may require another rejection.

Backup format v1 includes an optional rejectedItems field; old v1 backups without it remain valid. Restore preview displays the exclusion count. Preferences are bounded to 1,000 entries and can be managed in Settings.

Editorial gates now cover assassination, foreign missile/strike/death reports and explicit ethnic/gender slurs. The exception for explicitly domestic national emergencies remains for crisis-related strike/death keywords; privacy, harassment and ordinary crime exclusions remain enforced. Screening uses supplied title/summary metadata, not automatically fetched community bodies.
