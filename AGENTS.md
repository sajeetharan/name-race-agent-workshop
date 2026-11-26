# Name Race workshop

- Read the brief and propose a small plan before changing files.
- Preserve the 120-entry cap, nickname consent, five host-paced questions, one answer per question, and code-owned score/time rankings.
- Keep current-question grades private until CLOSE. Record answer time at the HTTP adapter; never trust a phone timestamp.
- Answer receipts change the read revision, not controlVersion. START/CLOSE/CLOSE_NEXT/NEXT/RESET/REMOVE/DELETE require host review. A host click approves CLOSE_NEXT/NEXT; only START/RESET/REMOVE/DELETE require typed UI confirmation.
- A registration is one browser entry, not proof of one real person.
- Never send nicknames, viewer keys or host credentials to an AI model.
- Runtime MCP owns room state. The `--guide` MCP connection is static and read-only.
- AI can read an anonymous summary and select a bounded commentary style, not mutate the room.
- Keep errors visible. Never disguise a failed live model request as offline reasoning.
- Run `npm run check` and inspect the real call/result trace.
- Public hosting requires HTTPS, a private server secret, and one runtime owner for the data directory. HOST_MODE=browser has no login; enforce room ownership with an HttpOnly signed creator cookie.
- Never commit secrets or room data. Do not modify or delete a shared Azure hosting plan.
