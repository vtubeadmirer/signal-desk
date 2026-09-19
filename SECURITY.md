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
- Before the first public release, pin every GitHub Action to a full commit SHA and commit a lockfile for Node dependencies; the current scaffold uses version tags and `npm install` only so the project can be bootstrapped before the first lockfile is generated.

## Release security

The repository includes two workflows:

- `build-windows.yml`: test/build workflow for development.
- `release-windows.yml`: protected release workflow intended for signed releases.

Before production:

1. Generate a Tauri updater signing key pair.
2. Put only the public key in `tauri.conf.json`.
3. Put the private key in a protected GitHub Environment secret.
4. Configure a Windows code-signing certificate in the same protected environment.
5. Replace the GitHub release endpoint placeholders.
6. Protect the release environment and release tag pattern.
7. Verify published artifacts and attestations before announcing the release.

## Known limitation of v0.1

The end-user provider binary (for example, Codex CLI) is not redistributed by this repository. The app detects the official provider CLI and guides the user to its official installation/authentication path. This is intentional: bundling or downloading third-party provider binaries without first reviewing their distribution terms would weaken the supply-chain model.
