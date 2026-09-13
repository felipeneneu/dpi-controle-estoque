# HP Latex 330 Agent Integration

## Goal
Implement an agent that polls the HP Latex 330 printer, downloads its accounting Excel file, parses jobs, and auto-deducts stock — only when the printer is online.

## Tasks

- [ ] 1. Install `xlsx` (SheetJS) dependency in backend → Verify: `npm ls xlsx` in grafica-app/backend
- [ ] 2. Add `printJobs` table to `schema.ts` + create drizzle migration → Verify: `npm run db:push` succeeds
- [ ] 3. Create `agents/hp-latex/downloader.ts` — HTTP GET with printer-online check (quick probe to `http://192.168.234.10/` before downloading `.xls`) → Verify: unit test with mock HTTP
- [ ] 4. Create `agents/hp-latex/parser.ts` — parse `.xls` to JSON, handle PT-BR decimal format, extract ink per color from sub-rows → Verify: test with sample Excel data
- [ ] 5. Create `agents/hp-latex/job-detector.ts` — compare Excel jobs vs `print_jobs` table, return only new ones → Verify: test deduplication logic
- [ ] 6. Create `agents/hp-latex/stock-deductor.ts` — for each new job, deduct ink (by color) and media from `stock_items`, create `stock_transactions`, emit Socket.IO alerts → Verify: test stock deduction + notification
- [ ] 7. Create `agents/hp-latex/index.ts` — orchestrator with polling loop (setInterval), exponential backoff on offline, cleanup temp files → Verify: `npm run build` passes
- [ ] 8. Initialize agent in `server.ts` (conditional on `HP_AGENT_ENABLED`) → Verify: server starts, logs `[HP Agent] Aguardando impressora...`
- [ ] 9. Add env vars to `.env.example` → Verify: `HP_AGENT_ENABLED`, `HP_LATEX_IP`, `HP_POLL_INTERVAL_MS`, `HP_DOWNLOAD_TIMEOUT_MS`
- [ ] 10. Full build + typecheck → Verify: `npm run build && npm run typecheck` in grafica-app/backend

## Done When
- [ ] Agent starts with server, checks printer before downloading
- [ ] Jobs are parsed and stored in `print_jobs`
- [ ] Stock is auto-deducted (ink + media)
- [ ] Socket.IO notifications fire on new jobs / low stock
- [ ] Temp `.xls` files are cleaned up
- [ ] Backoff works when printer is offline
- [ ] Build passes with no TypeScript errors

## Notes
- Printer IP: `192.168.234.10` (different subnet, but PC1 can reach it)
- Excel URL: `http://192.168.234.10/hp/device/webAccess/accounting.xls?cost=y`
- Printer offline = connection refused/timeout → skip cycle, retry with backoff
- Printer online check: quick GET to `http://192.168.234.10/` (root page), if 200 → proceed
- File structure: `grafica-app/backend/src/agents/hp-latex/`
