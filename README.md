# Name Race: join, watch, cheer

A small live Build with AI workshop. Participants scan a QR code, enter a nickname,
and watch a random eight-second race. **120 entries per room. No ADK needed.**

**Live host:** https://name-race-e9a2-261121.azurewebsites.net

## Run locally

Use Node 24.13+ and npm 11+:

```powershell
git clone https://github.com/sajeetharan/name-race-agent-workshop.git
Set-Location .\name-race-agent-workshop
npm ci
npm run check
npm run dev
```

Open http://127.0.0.1:18769. Local host controls work on loopback only.
Do not expose that local configuration through a tunnel.

## Run the live demo

1. Open the live host URL before sharing your screen.
2. In Azure Portal, open **your game app > Environment variables > HOST_PASSWORD**.
   Copy the value privately into the host login. Never show it in a recording.
3. Click **Create race room**. Share the QR code or the visible join link.
4. Participants enter nicknames and consent to display them. No email or real name is needed.
5. Review the names. Remove unsuitable entries before starting.
6. Click **Review & start race**, review the count, and type **START**.
7. Cheer for eight seconds. Code chooses a uniform random finish order, not AI or tapping.
8. Type **RESET** to reopen the same room for another round.
9. Type **DELETE** after the demo to remove the room and its nicknames.

The projector shows the latest or leading 12 racers. Every entry can win.
Each phone also shows its own racer. One browser gets one entry per room;
this is not verified real-person identity or a gambling system.
One racer can start for solo testing and wins automatically. Empty rooms cannot start.

## Concepts you can show

| Concept | Real example |
| --- | --- |
| Vibe coding | Brief, reviewed plan, one small edit and tests |
| Skill | `.agents/skills/name-race-builder/SKILL.md` |
| Development MCP | `--guide`: static game rules and build steps |
| Runtime MCP | Real stdio calls for registration, reads and host controls |
| Agent | Optional Gemini loop reads anonymous facts and chooses a bounded style |
| Human control | Only the logged-in host can start, reset, remove or delete |

See [build steps](./BUILD_GUIDE.md), [demo script](./DEMO_SCRIPT.md),
[validation and limits](./VALIDATION.md) and [deployment](./DEPLOY.md).

## Optional AI commentator

The game works without a model. The banner says **AI OFF** and the button is disabled.
To enable it, set `GEMINI_API_KEY` privately in the server environment, optionally
`GEMINI_MODEL`, then restart. Antigravity sign-in is not this API key.
Rehearse your model, network, quota and billing first.

Only anonymous labels such as **Racer 3**, phase and counts reach Gemini.
The model cannot choose the winner or control the room. Code validates its phase
and renders factual words from the real MCP result. A failed call remains an error.
Do not call an offline button result model reasoning.

Rooms are inaccessible after two hours. Expired files are cleaned on startup
and while the app is active. Host deletion removes the room immediately.
The included Azure `/home` storage preserves committed rooms across app restarts.
Use one app instance and one broker owner; this is a teaching demo, not a
production multi-instance backend. Do not deploy updates during a live race.

Licensed under [Apache-2.0](./LICENSE). See [NOTICE](./NOTICE).
