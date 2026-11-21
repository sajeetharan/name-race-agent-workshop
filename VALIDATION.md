# Validation and limits

Local checks cover TypeScript, browser JavaScript syntax, 120 concurrent joins,
duplicate/stale/full-room guards, actual stdio MCP calls, persistent reconnect,
private proof removal, anonymous agent inputs, authorization, host/guest HTTP,
origin/Host validation, assets, QR output and the exact 8192/8193-byte boundary.

No live Gemini request or Antigravity host configuration was performed.
The model tests use a scripted provider with real MCP. Rehearse your own key,
model access and guide/Skill discovery; errors do not become hidden fallbacks.

## Azure and browser rehearsal

- Prebuilt release deployed successfully; HTTPS `/healthz` checks the real MCP broker.
- Host login verified privately. Unauthenticated host control returns 403;
  registration without consent returns 400.
- Registered 120 synthetic entries on the live service; entry 121 returns 409.
  A burst of 120 full-room reads had 1,394 ms p95 and 1,787 ms maximum latency.
  These are rehearsal measurements, not a shared-plan performance guarantee.
- Browser nickname entry, cookie identity after reload, live count, real winner,
  and winner persistence passed. No horizontal overflow at 375, 768, 1024 or 1440 px.
- Live QR PNG is byte-identical to a QR generated for the canonical HTTPS join URL.
- Reduced-motion regression passed through a second real race: progress stays at
  zero while running, then jumps once to 100 at finish. Host login is masked,
  keyboard reachable, and its button is 48.8 px high.
- Synthetic test rooms are deleted after rehearsal. Create a fresh room shortly
  before the session: its two-hour lifetime starts when it is created.

The file store requires one runtime owner. Atomic writes preserve committed data,
but are not a distributed lock. Use one app instance, and do not deploy during a race.
One browser entry is not one verified person. This is a public nickname workshop,
not an authenticated multiplayer platform, a gambling product or an abuse-proof service.

```powershell
npm run check
```
