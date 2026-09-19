# Signal Desk Threat Model — v0.1

| Threat | Primary defense | Residual risk |
|---|---|---|
| Malicious RSS prompt injection | Treat feed as untrusted, sanitize HTML, reject unsafe item links, AI read-only sandbox | Provider-side/model-level issues remain possible |
| SSRF via custom feed | HTTPS only, DNS/IP public-address validation, standard port only, redirects rejected | Host-level DNS rebinding remains a residual risk |
| Command injection | No shell, fixed sidecar, Tauri capability allowlist | Tauri/plugin bugs are still possible |
| User file exfiltration | AI sees only temporary workspace | Host/OS compromise outside app is out of scope |
| Provider token theft | Signal Desk never reads provider auth stores | Provider CLI itself remains a trusted dependency |
| Malicious update | Tauri signature + Windows code signing | Private signing key compromise remains critical |
| Supply-chain attack | Protected release workflow, attestations, signing, dependency review; lockfile required before public release | Dependency-level zero-days remain possible |
| Log leakage | No secrets in logs; UI only exposes generic errors | Third-party provider may have its own logs |
| Privacy overcollection | No telemetry, no arbitrary file access | Future features must preserve this contract |

## Security acceptance criterion

A feature is not complete if it requires Signal Desk to gain broad filesystem access, arbitrary shell execution, credential scraping, or unrestricted remote code execution.
