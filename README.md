# Signal Desk — Secure Desktop v0.1

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
