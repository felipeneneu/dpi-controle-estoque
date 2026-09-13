# Plan: Mimaki Integration, Chat Privacy, Notifications & Docs

**Created:** 2026-09-10
**Status:** Ready for Implementation
**Priority:** High

---

## Overview

Four major workstreams in a single release:

1. **Chat Bot Privacy** — Bot responses visible only to sender
2. **Real-Time Notifications** — Red badge system for stock/media alerts + unmatched materials
3. **Mimaki Machine Page** — Frontend detail page (no telemetry)
4. **Mimaki M2M Integration** — Backend endpoint for Electron app print logs

---

## Workstream 1: Chat Bot Privacy

### Problem
When a user sends `/help` in the `geral` room, the bot response is broadcast to everyone in the room. It should be a DM to the sender only.

### Current Flow
```
User sends /help → chat.ts saves to DB (room='geral') → emits chat:message to 'geral' room
```

### Desired Flow
```
User sends /help → chat.ts saves to DB (room='dm:system:senderId') → emits chat:message to DM room
```

### Task Breakdown

| # | Task | Agent | File(s) | Details |
|---|------|-------|---------|---------|
| 1.1 | Change bot response room to DM | backend-specialist | `backend/src/routes/chat.ts:265-282` | Set `room` to `dm:system:${senderId}` instead of `botMsg.room` |
| 1.2 | Set recipientId on bot response | backend-specialist | `backend/src/routes/chat.ts:270` | Set `recipientId: senderId` so the DM query works |
| 1.3 | Emit bot response to DM room | backend-specialist | `backend/src/routes/chat.ts:276-282` | Emit to `dm:system:${senderId}` room instead of the original room |
| 1.4 | Frontend: auto-join DM room on command | frontend-specialist | `src/lib/queries/messages.ts` | After sending a command, the `useMessages` hook should fetch from DM room |
| 1.5 | Frontend: show bot responses in DM view | frontend-specialist | `src/app/(dashboard)/chat/page.tsx` | Bot responses should appear as DMs from "GraficaOS Bot" |
| 1.6 | Handle bot DM in contacts list | frontend-specialist | `components/chat-sidebar.tsx` | Show "GraficaOS Bot" in contacts when there are bot DMs |

### Verification
- [ ] User sends `/help` in `geral` → only sender sees bot response
- [ ] Bot response appears in DM list as "GraficaOS Bot"
- [ ] Other users in `geral` do NOT see the bot response
- [ ] Bot response is persisted with `room='dm:system:senderId'`

---

## Workstream 2: Real-Time Notification Badges

### Problem
- Sidebar hardcoded badge "3" on Estoque (not dynamic)
- No notification badge for unmatched Mimaki materials
- Stock alerts don't show real-time badge count

### Task Breakdown

| # | Task | Agent | File(s) | Details |
|---|------|-------|---------|---------|
| 2.1 | Dynamic badge count in SidebarRail | frontend-specialist | `components/sidebar-rail.tsx` | Replace hardcoded "3" with real notification count from `useNotifications()` |
| 2.2 | Add notification count to sidebar | frontend-specialist | `components/sidebar-rail.tsx` | Show red badge on Estoque icon with `pending.length` |
| 2.3 | Socket.IO listener for new notifications | frontend-specialist | `components/notifications-provider.tsx` | Already exists for `notification:new` — verify it updates badge |
| 2.4 | Mimaki unmatched material notification | backend-specialist | New route or `routes/notifications.ts` | Emit `mimaki:unmatched_material` event + create notification record |
| 2.5 | Frontend: listen for mimaki:unmatched_material | frontend-specialist | `components/notifications-provider.tsx` | Add listener for `mimaki:unmatched_material`, show toast, update badge |
| 2.6 | Badge on Chat icon for unread DMs | frontend-specialist | `components/sidebar-rail.tsx` | Show badge if there are unread bot DMs |

### Verification
- [ ] Sidebar badge shows real count (not hardcoded "3")
- [ ] New stock notification → badge updates in real-time
- [ ] Mimaki unmatched material → toast + badge update
- [ ] Badge clears when notifications are acknowledged

---

## Workstream 3: Mimaki Machine Page

### Problem
Mimaki machine exists in DB but has no dedicated detail view. It doesn't export telemetry via network (IP: `192.168.234.28`), so it needs a simple info page instead of a telemetry panel.

### Current State
- Machine card exists in `/maquinas` list
- `isKonicaMachine()` detection exists but no `isMimakiMachine()`
- Telemetry panels exist for HP and Konica only
- Mimaki IP is `http://192.168.234.28/`

### Task Breakdown

| # | Task | Agent | File(s) | Details |
|---|------|-------|---------|---------|
| 3.1 | Create `isMimakiMachine()` helper | frontend-specialist | `src/app/(dashboard)/maquinas/page.tsx` | `return /mimaki/i.test(m.brand)` |
| 3.2 | Create `mimaki-info-panel.tsx` | frontend-specialist | `src/components/mimaki-info-panel.tsx` | Simple panel: machine name, brand, model, IP, status. No telemetry sections. |
| 3.3 | Add Mimaki tab to machine detail | frontend-specialist | `src/app/(dashboard)/maquinas/page.tsx` | When Mimaki is selected, show info panel + jobs tab (no telemetry tab) |
| 3.4 | Add Mimaki IP display | frontend-specialist | `src/components/mimaki-info-panel.tsx` | Show IP address, link to `http://192.168.234.28/` |
| 3.5 | Add M2M integration status | frontend-specialist | `src/components/mimaki-info-panel.tsx` | Show "M2M Active" badge if recent jobs received, "No Data" otherwise |
| 3.6 | Add Mimaki jobs tab | frontend-specialist | `src/components/machine-jobs-tab.tsx` | Reuse existing jobs tab for Mimaki machine |

### Verification
- [ ] Mimaki machine shows in machine list with correct image
- [ ] Clicking Mimaki shows info panel (name, IP, status)
- [ ] No telemetry panel shown for Mimaki
- [ ] Jobs tab shows Mimaki print jobs (from M2M endpoint)
- [ ] IP link opens `http://192.168.234.28/` in new tab

---

## Workstream 4: Mimaki M2M Integration Backend

### Problem
The Mimaki Tracker Electron app sends print logs via HTTP, but there's no backend endpoint to receive them. Need M2M authentication, ink/media deduction, and Socket.IO alerts.

### Architecture

```
Mimaki Tracker App → POST /api/integrations/mimaki/jobs → Backend
                                                    ↓
                                              ┌─────────────┐
                                              │ Deduct ink   │
                                              │ Match media  │
                                              │ Log job      │
                                              │ Emit alerts  │
                                              └─────────────┘
```

### Task Breakdown

| # | Task | Agent | File(s) | Details |
|---|------|-------|---------|---------|
| **Schema** | | | | |
| 4.1 | Add `mimaki_jobs` table | database-architect | `backend/src/db/schema.ts` | Columns: id, machine_id, folder_timestamp (unique), job_name, order_code, quantity_units, pages, width_mm, height_mm, ink_*_cc (8 channels), ink_total_cc, raw_material_name, length_meters, material_status (BOUND/PENDING_BIND), stock_item_id (nullable FK), created_at |
| 4.2 | Generate migration | database-architect | `backend/drizzle/` | `npx drizzle-kit generate` for the new table |
| 4.3 | Apply migration | database-architect | Turso DB | `npx drizzle-kit push` or manual SQL |
| **M2M Auth** | | | | |
| 4.4 | Create M2M auth middleware | backend-specialist | `backend/src/middleware/m2m-auth.ts` | Fastify preHandler hook checking `X-API-Secret` or `Authorization: Bearer` against `MIMAKI_INTEGRATION_SECRET` env var (fallback to settings table) |
| 4.5 | Add `MIMAKI_INTEGRATION_SECRET` to .env | backend-specialist | `backend/.env.example` | Document the new env var |
| **Main Endpoint** | | | | |
| 4.6 | Create `POST /api/integrations/mimaki/jobs` | backend-specialist | `backend/src/routes/mimaki.ts` | Full endpoint with Zod validation, M2M auth, business logic |
| 4.7 | Media length calculation | backend-specialist | `backend/src/routes/mimaki.ts` | `length_meters = (height_mm * pages * quantity_units) / 1000` |
| 4.8 | Ink deduction logic | backend-specialist | `backend/src/routes/mimaki.ts` | Match stock items by category=INK_SUPPLY, deduct cc values, create stock_transactions |
| 4.9 | Media matching logic | backend-specialist | `backend/src/routes/mimaki.ts` | Search stock_items where category=PAPER_MEDIA and name matches raw_material_name |
| 4.10 | Material binding | backend-specialist | `backend/src/routes/mimaki.ts` | If match found: deduct length_meters, set material_status=BOUND. If not: set PENDING_BIND |
| 4.11 | Socket.IO emit for unmatched | backend-specialist | `backend/src/routes/mimaki.ts` | Emit `mimaki:unmatched_material` to `estoque` room when PENDING_BIND |
| 4.12 | Transaction atomicity | backend-specialist | `backend/src/routes/mimaki.ts` | Wrap all DB mutations in `db.transaction()` |
| **Manual Binding** | | | | |
| 4.13 | Create `POST /api/integrations/mimaki/jobs/:id/bind-material` | backend-specialist | `backend/src/routes/mimaki.ts` | JWT-protected, deducts length_meters from selected stock_item_id, updates status to BOUND |
| **Registration** | | | | |
| 4.14 | Register routes in app.ts | backend-specialist | `backend/src/app.ts` | Add mimaki routes with prefix `/api/integrations/mimaki` |
| 4.15 | Swagger annotations | backend-specialist | `backend/src/routes/mimaki.ts` | Tag: "Mimaki Integration" |
| **Frontend** | | | | |
| 4.16 | Add bind-material dialog | frontend-specialist | `src/components/mimaki-bind-dialog.tsx` | Dialog to select stock item and bind to unmatched job |
| 4.17 | Show unmatched jobs in Mimaki panel | frontend-specialist | `src/components/mimaki-info-panel.tsx` | List PENDING_BIND jobs with bind button |
| 4.18 | Socket.IO listener for unmatched | frontend-specialist | `components/notifications-provider.tsx` | Listen for `mimaki:unmatched_material`, show toast with job details |

### Request Schema

```json
{
  "machine_id": "string (required)",
  "folder_timestamp": "string (required, unique)",
  "job_name": "string (required)",
  "order_code": "string | null",
  "quantity_units": "number (required)",
  "pages": "number (required)",
  "width_mm": "number (required)",
  "height_mm": "number (required)",
  "ink_cyan_cc": "number (default 0)",
  "ink_magenta_cc": "number (default 0)",
  "ink_yellow_cc": "number (default 0)",
  "ink_black_cc": "number (default 0)",
  "ink_white1_cc": "number (default 0)",
  "ink_white2_cc": "number (default 0)",
  "ink_varnish1_cc": "number (default 0)",
  "ink_varnish2_cc": "number (default 0)",
  "ink_total_cc": "number (default 0)",
  "raw_material_name": "string | null"
}
```

### Response Schema (201)

```json
{
  "job_id": "string",
  "length_meters": 3.824,
  "material_status": "BOUND | PENDING_BIND",
  "stock_item_id": "string | null",
  "deductions": {
    "ink": { "cyan_cc": 12, "magenta_cc": 8, ... },
    "media": { "item_name": "Vinil Branco", "meters": 3.824 }
  }
}
```

### Verification
- [ ] M2M endpoint rejects requests without valid API secret (401)
- [ ] M2M endpoint accepts valid requests and creates job record
- [ ] `length_meters` is calculated correctly
- [ ] Ink is deducted from stock items
- [ ] Media is matched and deducted if raw_material_name matches
- [ ] Unmatched materials emit `mimaki:unmatched_material` event
- [ ] Manual binding endpoint deducts media and updates status
- [ ] All mutations are atomic (transaction)
- [ ] Swagger docs show new endpoint

---

## Workstream 5: Documentation Update

### Task Breakdown

| # | Task | Agent | File(s) | Details |
|---|------|-------|---------|---------|
| 5.1 | Rewrite README.md | documentation-writer | `grafica-app/README.md` | Update with current architecture, features, Mimaki integration |
| 5.2 | Update 01_PRD | documentation-writer | `docs/01_PRD_PRODUCT_REQUIREMENTS.md` | Add Mimaki M2M requirements |
| 5.3 | Update 02_TRD | documentation-writer | `docs/02_TRD_TECHNICAL_REQUIREMENTS.md` | Add Mimaki tech specs |
| 5.4 | Update 03_FRD | documentation-writer | `docs/03_FRD_FUNCTIONAL_REQUIREMENTS.md` | Add Mimaki functional requirements |
| 5.5 | Rewrite 04_USER_STORIES | documentation-writer | `docs/04_USER_STORIES.md` | New stories for Mimaki, chat privacy, notifications |
| 5.6 | Update 05_HLD | documentation-writer | `docs/05_SYSTEM_DESIGN_HLD.md` | Add Mimaki integration to system design |
| 5.7 | Update 06_LLD | documentation-writer | `docs/06_LOW_LEVEL_DESIGN_LLD.md` | Add Mimaki endpoint details |
| 5.8 | Update 07_ADR | documentation-writer | `docs/07_TECHNICAL_DECISIONS_ADR_RFC.md` | M2M auth decision |
| 5.9 | Update 08_Engineering | documentation-writer | `docs/08_ENGINEERING_GUIDELINES.md` | Add Mimaki patterns |
| 5.10 | Update 09_Ops | documentation-writer | `docs/09_OPS_AND_INFRASTRUCTURE.md` | Add Mimaki env vars |
| 5.11 | Update 10_RBAC | documentation-writer | `docs/10_RBAC_SPECIFICATION.md` | M2M auth role |
| 5.12 | Update 11_Testing | documentation-writer | `docs/11_TESTING_TWO_PCS_LAN.md` | Add Mimaki testing |
| 5.13 | Update 12_Guia | documentation-writer | `docs/12_GUIA_DE_USO.md` | User guide for Mimaki features |
| 5.14 | Update 13_LAN | documentation-writer | `docs/13_LAN_CONEXAO_SERVER_CLIENT.md` | Add Mimaki network setup |
| 5.15 | Create 14_MIMAKI | documentation-writer | `docs/14_MIMAKI_INTEGRATION.md` | Dedicated Mimaki integration doc |
| 5.16 | Create 15_RELEASE_NOTES | documentation-writer | `docs/15_RELEASE_NOTES.md` | v1.0 release notes |

---

## Agent Assignments Summary

| Workstream | Primary Agent | Support |
|------------|---------------|---------|
| 1. Chat Privacy | backend-specialist | frontend-specialist |
| 2. Notifications | frontend-specialist | backend-specialist |
| 3. Mimaki Page | frontend-specialist | — |
| 4. M2M Backend | backend-specialist | database-architect |
| 5. Documentation | documentation-writer | — |

---

## Implementation Order

```
Phase 1 (Parallel):
├── 4.1-4.3: Database schema (database-architect)
├── 5.1-5.16: Documentation (documentation-writer)
└── 1.1-1.3: Chat bot privacy backend (backend-specialist)

Phase 2 (After Phase 1):
├── 4.4-4.15: M2M endpoint (backend-specialist)
├── 1.4-1.6: Chat bot privacy frontend (frontend-specialist)
├── 2.1-2.6: Notification badges (frontend-specialist)
└── 3.1-3.6: Mimaki page (frontend-specialist)

Phase 3 (After Phase 2):
├── 4.16-4.18: Mimaki frontend (frontend-specialist)
└── Verification
```

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| M2M auth secret management | Fallback to settings table if env var not set |
| Media name matching (fuzzy) | Use LIKE with wildcards, log unmatched for manual binding |
| Ink deduction atomicity | Use Drizzle transactions |
| Socket.IO event duplication | Idempotent job insertion (folder_timestamp unique) |
| Chat DM room naming | Follow existing `dm:userA:userB` convention with `system` as one user |

---

## Verification Checklist

- [ ] Bot responses are DM to sender only
- [ ] Sidebar badge shows real notification count
- [ ] Mimaki machine page shows info (no telemetry)
- [ ] M2M endpoint receives and processes print logs
- [ ] Ink is deducted automatically
- [ ] Media is matched and deducted (or flagged as PENDING_BIND)
- [ ] Unmatched materials trigger real-time alerts
- [ ] Manual binding works via frontend dialog
- [ ] All documentation files are updated
- [ ] TypeScript compiles without errors
- [ ] ESLint passes
