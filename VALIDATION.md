# Validation and limits

## Current five-question quiz

### One-click host controls and Antigravity final question

- Strict build, browser JavaScript syntax and all **11 tests** pass on the
  current Node runtime.
- CLOSE_NEXT closes and opens the next question in one serialized mutation.
  Tests verify stale/duplicate-click rejection, next-question grade privacy,
  server-owned opening time, retained scoring, final podium and RESET.
  Separate CLOSE/NEXT and existing persisted rooms remain supported.
- An isolated browser rehearsal registered 120 synthetic entries and displayed
  all 120 leaderboard rows beside the question on desktop and below it on a
  narrow phone screen, with no horizontal page overflow.
- Every question advanced with one host button click and no typed confirmation.
  The leaderboard reflected the submitted answer, the previous result stayed
  visible, and closing question five displayed the named podium.
- The final question now asks about reviewing an Antigravity implementation
  plan before clicking Proceed.
- The prebuilt release was deployed to the existing HTTPS app. Live checks
  verified health, released UI code, private host login, QR joining, all five
  one-click transitions, private grades, previous results, a 500-point final
  leaderboard and the winner. Synthetic rooms were deleted; cleanup was
  confirmed with the API result and HTTP 404.

### Earlier five-question release

- Strict build, browser JavaScript syntax and all ten tests pass on Node 26 and
  the minimum supported Node 24.13.
- Tests cover one racer, 120 concurrent registrations and real MCP answers,
  score-first/time-second ranking, exact ties, one-shot/idempotent answers,
  stale rounds, closed questions, private grades, reconnect and legacy room files.
- HTTP tests reject unjoined answers, forged phone timestamps, unauthorized host
  controls, invalid Host/Origin, and the exact 8193-byte body boundary.
  Server receipt timestamps exclude queued storage processing time.
- A real four-player browser rehearsal completed all five questions. A phone
  retained its saved answer after reload; its car progressed 20/40/60/80/100%.
  Review cancel restored focus, four car colors were distinct, and the named
  top-three podium ranked equal scores by actual answer time.
- No horizontal overflow at 375, 768, 1024 or 1440 px. Reduced motion disables
  car transitions without hiding earned progress or the final result.
- Current compiled quiz files deployed to the existing HTTPS Azure app.
  A live test registered 120 synthetic entries, rejected entry 121, accepted
  600 answers across all five questions, verified every final score, and
  produced 120 distinct car hues and a real named podium.
- A burst of 120 full, completed-quiz reads measured 1,898 ms p95 and 1,972 ms
  maximum. This is a rehearsal measurement, not a shared-plan guarantee.

No live Gemini request or Antigravity host configuration was performed.
Model tests use a scripted provider with real MCP. Rehearse your own key,
model access and guide/Skill discovery; errors do not become hidden fallbacks.
The commentator receives anonymous labels, not participant names or answers.

## Operational limits

Scores become visible when the host closes a question. The API does not reveal
the current answer key or grade while it is open. Questions and answers remain
public in this teaching repository: this is not a proctored or abuse-proof exam.
Response timing includes network and polling delay. Exact score/time ties share
a rank; the podium displays the first three ranked entries.

The file store requires one runtime owner. Atomic writes preserve committed data,
but are not a distributed lock. Use one app instance and do not deploy mid-quiz.
Previous waiting rooms upgrade at START; completed random rooms upgrade at RESET
without losing names. Synthetic rehearsal rooms are deleted after verification.
Create a fresh room near the session: its two-hour lifetime starts at creation.

One browser entry is not one verified person. This is a public nickname workshop,
not an authenticated multiplayer platform or a gambling product.

## Earlier random-race checks

Before the quiz revision, the same service passed private host login, consent,
source isolation, cookie identity/reload, random race result persistence and a
live QR PNG byte comparison against the canonical HTTPS join URL. Those earlier
race timing measurements do not describe the new quiz scoring.

```powershell
npm run check
```
