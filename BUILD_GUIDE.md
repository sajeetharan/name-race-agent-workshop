# Build it in small steps

1. **Write the brief.**
   "Build a live Name Race. Phones join by QR code and nickname. Up to 120 entries.
   Use three talk questions for new rounds. The host opens and closes each question.
   Correct answers move colored cars. Rank by score, then correct-answer time.
   Announce the top three names on a podium. Do not send names to AI."
2. **Review the plan.**
   "Read AGENTS.md. Show the files, data flow, permissions and checks before editing."
3. **Build the rules.** Read `src/questions.ts` and `src/race.ts`: one-shot answers,
   score/time ranking, private grades, persistence, expiry and public snapshots.
   Answer receipts increment the read version; host commands use `controlVersion`
   so incoming answers do not invalidate a host-approved CLOSE_NEXT. This action
   closes and advances atomically; separate CLOSE/NEXT remain available. Run `npm test`.
4. **Build the screens.** Read `public/`: phone answers, QR invite, colored cars,
   live leaderboard, previous-question result, podium and review dialog.
   A host click approves question progression; starting/resetting/deleting still
   require typed confirmation.
   Check two separate browsers, small screens, keyboard controls and reduced motion.
5. **Use the Skill.** Ask your coding agent to use `name-race-builder` for one small
   approved wording change. Check actual host discovery; a file alone does not prove loading.
6. **Connect guide MCP.** Review `mcp_config.example.json`, replace the path, and merge
   it manually into the installed host. Discover and call `get_build_steps`.
   This guide cannot read or change a running room.
7. **Inspect real runtime MCP.** See `src/mcp.ts` and the visible call/result trace.
   The HTTP adapter validates the host; its private broker authority never reaches the browser.
   `submit_answer` uses the participant's cookie proof and a private server timestamp.
   The model never receives this tool, proof or timestamp authority.
8. **Build a bounded agent.** Read `src/agent.ts`. The model gets only
   `read_race_summary`, once, for the selected room. It returns a validated style
   and actual phase. Code supplies all factual words. No participant names are sent.
9. **Verify and deploy.** Run `npm run check`, rehearse a host and separate participant,
   and follow [deployment](./DEPLOY.md). Keep all passwords out of source and screenshots.
