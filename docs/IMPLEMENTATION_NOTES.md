# Implementation Notes

## Mapping to the existing Signal Desk specification

The existing handoff specifies these five categories:

- 사회·생활
- 버튜버·크리에이터
- IT·플랫폼
- 시청자 권리·안전
- 게임·인터넷 방송 토론

This v0.1 keeps those categories, with `게임·인터넷 방송` used as the internal label.

The existing decision meanings are preserved:

- `candidate`: human should review; not a broadcast approval
- `manual_review`: extra checking needed
- `exclude`: privacy/identity/severe sensitive material

The existing project documents a 0–18-ish internal score and 0–100 display score. This implementation follows that model and adds `talkability`, `verification_cost`, `source_ready`, and `context_required` so the user sees a small, preparation-friendly shortlist.

## Deliberate departures for security

- Standard-library Python networking instead of `requests` in the packaged sidecar, reducing runtime dependencies.
- HTTPS-only feed collection.
- Reject non-global IP destinations to reduce SSRF risk.
- Reject XML DOCTYPE/ENTITY declarations.
- Do not fetch article bodies automatically.
- Do not let AI browse arbitrary URLs.
- Do not pass the user's whole environment to the provider process.
- Do not write auth tokens into logs.
