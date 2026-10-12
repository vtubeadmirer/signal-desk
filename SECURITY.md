# Signal Desk Security Model

Signal Desk is intentionally designed as a local-first desktop application. The security goal is not to claim zero risk; it is to constrain the blast radius if a component is compromised.

## Trust boundaries

1. React/Tauri UI is untrusted input boundary.
2. Python agent is a separate process and must validate every request.
3. RSS/Atom content is untrusted external data.
4. AI providers are external services; Signal Desk must not collect provider passwords or private tokens.
5. Release artifacts are untrusted until updater and platform signatures validate them.

## Hard requirements

- Never store provider passwords, browser cookies, or provider auth tokens in Signal Desk.
- Never execute arbitrary shell strings from the WebView.
- Sidecar execution is allowlisted and launched without a shell.
- RSS URLs are HTTPS-only and resolved addresses must be publicly routable.
- Feed payloads are size-limited and XML DOCTYPE/ENTITY declarations are rejected.
- AI analysis receives only an isolated temporary workspace containing sanitized JSON and a schema.
- AI analysis uses an ephemeral, read-only, approval-free Codex execution profile. User/project Codex config and exec-policy rules are ignored, and login shells are disabled for this workflow. The analysis prompt explicitly treats stdin as untrusted data.
- No browser automation or credential scraping.
- Telemetry is off by design in this scaffold.
- The application does not read arbitrary user files for news analysis.
- Production updater releases must use Tauri update signatures and Windows code signing. The NSIS installer is configured for current-user installation so the normal install path does not require administrator rights.
- Production release workflow must require signing secrets and must refuse placeholder updater configuration.
- Every GitHub Action in the workflows is pinned to a full commit SHA (the tag is kept as a trailing comment), and `package-lock.json` is committed and installed with `npm ci`. When bumping an action, resolve the new tag with `git ls-remote` and update the SHA; never go back to a floating tag.

## Release security

The repository includes two workflows:

- `build-windows.yml`: test/build workflow for development.
- `release-windows.yml`: protected release workflow intended for signed releases.

Release signing status:

1. The Tauri updater public key is committed in `tauri.conf.json` and the endpoint points at this repository's latest release. The matching private key is **not** in the repository; it must be stored as the `TAURI_SIGNING_PRIVATE_KEY` secret of the protected `release` GitHub Environment (plus `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if the key has one). The release workflow refuses to run without it.
2. Windows Authenticode signing (`WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD`, `WINDOWS_CERTIFICATE_TIMESTAMP_URL`) is optional until a certificate is purchased. Without it SmartScreen warns on first install, but every update is still verified against the updater public key before installation, so update integrity does not depend on the certificate. Setting one or two of the three secrets fails the workflow on purpose.
3. If the updater private key is ever lost or leaked, generate a new pair, replace the public key, and ship that change through a manually distributed build; existing installs cannot verify updates signed with a different key.
4. Protect the release environment and the `v*` tag pattern, and verify published artifacts and attestations before announcing a release.

## Known limitation of v0.1

The end-user provider binary (for example, Codex CLI) is not redistributed by this repository. The app detects the official provider CLI and guides the user to its official installation/authentication path. This is intentional: bundling or downloading third-party provider binaries without first reviewing their distribution terms would weaken the supply-chain model.

## Sidecar request isolation

The Python sidecar handles each stdin request on its own worker thread (bounded pool), and feed collection fans out across a small thread pool with a 120-second overall budget. A slow or hung feed therefore cannot block health checks or AI analysis, and a source that exceeds the budget is reported as skipped rather than stalling the whole collection. Shared state (community page cache, debug log) is guarded by locks. The debug log rotates at 1 MB and still never contains feed bodies, prompts, or provider output.

## Local data file

Since v0.5 the app's own data (sources, saved articles, notes, exclusions, learning settings) lives in one JSON document at `%LOCALAPPDATA%\com.signaldesk.desktop\signal-desk\state.json`, written atomically (temp file + rename). The filesystem capability is widened only to the app's own local-data directory (`fs:allow-applocaldata-*`); reads and writes elsewhere still require a path the user picked in a native dialog. The file contains no provider credentials. The pre-0.5 WebView `localStorage` layout is read once on first launch and migrated. Dated safety copies are kept in `signal-desk\snapshots\` (one per day on launch plus a tagged copy right after a migration; the newest seven are kept).

## Community and backup boundaries

Public-list community collection is limited to the supported hosts and list paths, checks robots.txt before uncached fetches, and reuses the DNS-pinned HTTPS transport. No post bodies or comments are fetched. Community popularity never overrides editorial exclusions or manual review. Native backup dialogs grant file scope only for selected paths; no global filesystem scope is configured. Imported JSON is version/shape/size/link validated before explicit replacement of local state. Exported JSON contains no provider tokens.
