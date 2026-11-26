# Name Race: join, watch, cheer

A small live quiz for **Teaching AI Coding Agents to Build It Right the First Time**
(30 minutes, including Q&A). Participants scan a QR code, enter a nickname,
and answer three questions grounded in the talk. Correct answers move their
colored cars; the top three racers appear on a named podium.
**120 entries per room. No ADK or model key needed.**

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

1. Open the live host URL before sharing your screen. **No host password or login is needed.**
2. Use the same browser throughout: only the browser that creates a room can
   control it. A private HttpOnly cookie proves ownership. Clearing cookies,
   switching browsers or using an old room does not grant host access; create a fresh room.
3. Click **Create race room**. Share the QR code; the host invite card does not display the join URL.
4. Participants enter nicknames and consent to display them. No email or real name is needed.
5. Review the names. Remove unsuitable entries before starting.
6. Click **Review & start race**, review the count, and type **START**.
7. Participants choose one answer on their phones. Each answer is final.
8. Click **Close & open next question** once. No typed CLOSE or NEXT is needed.
   The server closes answers and opens the next question atomically. Correct answers earn
   100 points and move cars one third of the track. Unanswered or wrong answers earn zero.
9. Repeat for each question. The leaderboard stays visible beside the question on
   wide screens (below it on phones), with all racers ranked. The previous answer
   and explanation remain visible while the next question is open.
10. **Close question & show podium** ends question three and announces the top three names, scores, times and colored cars. The maximum score is 300 points.
11. Type **RESET** to keep nicknames but clear answers and scores for another round.
12. Type **DELETE** after the demo to remove the room and its nicknames.

The three topics are clear briefs, scoped Skills, and verification beyond a green build.
The questions follow the conference talk's intent/context/acceptance framing
and Conference Sidekick lookup demo. This quiz is an optional audience recap,
not the talk's prepared hands-up opening poll or its live-coding application.
Ranking uses most correct answers first, then the lowest total time for correct
answers. Times are recorded at the server HTTP adapter, not supplied by phones.
They include network and polling delay, so this is not a proctored or abuse-proof exam.
Exact score/time ties share a rank; the podium displays the leading three entries.
No answer key or current-question grade is exposed by the API before the host closes it.
The question source is public in this teaching repository.

The projector shows the latest or leading 12 cars. All 120 entries are ranked.
Each phone also shows its own racer. One browser gets one entry per room;
this is not verified real-person identity or a gambling system.
One racer can test the full quiz alone, but must answer to earn points. Empty rooms cannot start.
Previously saved waiting rooms upgrade when started. A previous random race can
finish as before; RESET then upgrades it without removing nicknames.
Existing five-question rounds keep their original questions and 500-point scoring
until finished. RESET upgrades them to three questions without removing nicknames.

## Concepts you can show

| Concept | Real example |
| --- | --- |
| Vibe coding | Brief, reviewed plan, one small edit and tests |
| Skill | `.agents/skills/name-race-builder/SKILL.md` |
| Development MCP | `--guide`: static game rules and build steps |
| Runtime MCP | Real stdio calls for registration, answers, reads and host controls |
| Agent | Optional Gemini loop reads anonymous facts and chooses a bounded style |
| Human control | Only the room creator's browser can start, close/advance, reset, remove or delete; a click explicitly approves question progression |

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
The public app uses `HOST_MODE=browser`; `HOST_PASSWORD` stays private on the
server as the ownership-cookie signing secret, not a password people enter.
Anyone can create their own room, but cannot control another browser's room.
Room creation is not rate-limited; this remains a small public teaching demo.
Legacy password login is still available with `HOST_MODE=password`.

Licensed under [Apache-2.0](./LICENSE). See [NOTICE](./NOTICE).
