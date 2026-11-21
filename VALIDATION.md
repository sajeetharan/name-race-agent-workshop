# Validation and limits

Local checks cover TypeScript, browser JavaScript syntax, 120 concurrent joins,
duplicate/stale/full-room guards, actual stdio MCP calls, persistent reconnect,
private proof removal, anonymous agent inputs, authorization, host/guest HTTP,
origin/Host validation, assets, QR output and the exact 8192/8193-byte boundary.

No live Gemini request or Antigravity host configuration was performed.
The model tests use a scripted provider with real MCP. Rehearse your own key,
model access and guide/Skill discovery; errors do not become hidden fallbacks.

The file store requires one runtime owner. Atomic writes preserve committed data,
but are not a distributed lock. Use one app instance, and do not deploy during a race.
One browser entry is not one verified person. This is a public nickname workshop,
not an authenticated multiplayer platform, a gambling product or an abuse-proof service.

```powershell
npm run check
```
