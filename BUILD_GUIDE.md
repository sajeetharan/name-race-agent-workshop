# Build it in small steps

1. **Write the brief.**
   "Build a live Name Race. Phones join by QR code and nickname. Up to 120 entries.
   The host reviews and starts. Code picks a random winner. Do not send names to AI."
2. **Review the plan.**
   "Read AGENTS.md. Show the files, data flow, permissions and checks before editing."
3. **Build the rules.** Read `src/race.ts`: registration, versions, fair shuffle,
   persistence, expiry and public snapshots. Run `npm test`.
4. **Build the screens.** Read `public/`: phone form, QR invite, race and review dialog.
   Check two separate browsers, small screens, keyboard controls and reduced motion.
5. **Use the Skill.** Ask your coding agent to use `name-race-builder` for one small
   approved wording change. Check actual host discovery; a file alone does not prove loading.
6. **Connect guide MCP.** Review `mcp_config.example.json`, replace the path, and merge
   it manually into the installed host. Discover and call `get_build_steps`.
   This guide cannot read or change a running room.
7. **Inspect real runtime MCP.** See `src/mcp.ts` and the visible call/result trace.
   The HTTP adapter validates the host; its private broker authority never reaches the browser.
8. **Build a bounded agent.** Read `src/agent.ts`. The model gets only
   `read_race_summary`, once, for the selected room. It returns a validated style
   and actual phase. Code supplies all factual words. No participant names are sent.
9. **Verify and deploy.** Run `npm run check`, rehearse a host and separate participant,
   and follow [deployment](./DEPLOY.md). Keep all passwords out of source and screenshots.
