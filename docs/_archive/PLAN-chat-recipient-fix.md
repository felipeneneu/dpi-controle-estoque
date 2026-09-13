# Plan: Fix Chat recipient_id Missing Column

**Created:** 2026-09-10
**Status:** Ready for Implementation
**Priority:** Critical — Chat feature completely broken

---

## Problem Summary

The chat system crashes with `SQL_INPUT_ERROR: no such column: messages.recipient_id` when loading messages. The `recipient_id` column exists in the Drizzle schema but was never applied to the production Turso database.

---

## Root Cause Analysis

| Layer | Expected | Actual |
|-------|----------|--------|
| `schema.ts:88` | `recipientId: text('recipient_id')` | ✅ Defined |
| `drizzle/0007_sticky_the_renegades.sql` | `ALTER TABLE messages ADD recipient_id` | ✅ Exists on disk |
| Turso Database | Column present | ❌ **Column missing** |
| `server.ts:96-98` | Migration file names match disk | ❌ **Wrong names** |

**Root Cause:** Migration 0007 was generated but never applied to the Turso database. The fallback error handler in `server.ts` references wrong migration filenames (`0005_cold_gravity`, `0006_chemical_hellfire`) instead of the actual files (`0005_repair_machine_telemetry`, `0006_grey_tomorrow_man`), causing silent failures.

---

## Files Affected

| File | Line(s) | Issue |
|------|---------|-------|
| `grafica-app/backend/src/routes/chat.ts` | 80-96 | Query references `recipient_id` (correct code, missing column) |
| `grafica-app/backend/src/routes/chat.ts` | 125 | DM query also references `recipient_id` |
| `grafica-app/backend/src/routes/chat.ts` | 247, 268, 279, 291 | INSERT references `recipient_id` |
| `grafica-app/backend/src/db/schema.ts` | 88, 96 | Schema + index definition |
| `grafica-app/backend/src/server.ts` | 76 | `safeAddCol` fallback for `recipient_id` |
| `grafica-app/backend/src/server.ts` | 91-98 | **Wrong migration filenames** in fallback |

---

## Task Breakdown

### Phase 1: Apply Missing Migration (Critical Fix)

**Agent:** database-architect
**Task:** Apply the `recipient_id` column to the Turso database

**Options (pick one):**

**Option A — Push schema directly:**
```bash
cd grafica-app/backend
npx drizzle-kit push
```

**Option B — Manual SQL via Turso CLI:**
```sql
ALTER TABLE messages ADD COLUMN recipient_id text REFERENCES users(id);
CREATE INDEX IF NOT EXISTS chat_messages_recipient_idx ON messages (recipient_id);
```

**Option C — Run full migrations:**
```bash
cd grafica-app/backend
npx drizzle-kit migrate
```

**Verification:** After applying, confirm column exists:
```sql
PRAGMA table_info(messages);
```
Should show `recipient_id` column.

---

### Phase 2: Fix Migration Fallback in server.ts

**Agent:** backend-specialist
**File:** `grafica-app/backend/src/server.ts`
**Lines:** 91-98

Replace wrong migration filenames:

```typescript
// BEFORE (lines 96-98):
'0005_cold_gravity',
'0006_chemical_hellfire',

// AFTER:
'0005_repair_machine_telemetry',
'0006_grey_tomorrow_man',
```

---

### Phase 3: Broaden Migration Error Handling

**Agent:** backend-specialist
**File:** `grafica-app/backend/src/server.ts`
**Line:** 55

Current condition is too narrow — only catches `duplicate column name`, `no such table`, `already exists`. Broaden to catch all migration errors so fallback logic runs:

```typescript
// BEFORE:
if (msg.includes('duplicate column name') || msg.includes('no such table') || msg.includes('already exists')) {

// AFTER:
console.warn('[migration] Erro na migração. Aplicando correções manuais...');
```

---

### Phase 4: Clean Up Empty Database File

**Agent:** backend-specialist
**File:** `grafica-app/backend/local-replica.db`
**Issue:** File is 0 bytes — will confuse SQLite/LibSQL

**Action:** Delete the empty file and let it be recreated on next startup.

---

### Phase 5: Verification

- [ ] `PRAGMA table_info(messages)` shows `recipient_id` column
- [ ] `GET /api/chat/messages?room=geral` returns messages without error
- [ ] `GET /api/messages/dm/:recipientId` works
- [ ] `POST /api/chat/messages` with `recipientId` saves correctly
- [ ] Bot messages (`recipientId: null`) still work
- [ ] Server starts without migration errors in logs

---

## Agent Assignments

| Phase | Agent | Responsibility |
|-------|-------|---------------|
| Phase 1 | database-architect | Apply migration to Turso |
| Phase 2 | backend-specialist | Fix `server.ts` filenames |
| Phase 3 | backend-specialist | Broaden error handling |
| Phase 4 | backend-specialist | Clean up empty DB file |
| Phase 5 | debugger | Verify fix end-to-end |

---

## Risk Assessment

- **Low risk:** Phase 1 adds a nullable column — no data loss possible
- **Low risk:** Phase 2-3 are string fixes in error handling
- **No risk:** Phase 4 deletes an empty file

---

## Verification Checklist

- [ ] `recipient_id` column exists in `messages` table
- [ ] Chat room messages load without SQL errors
- [ ] Direct messages work
- [ ] Sending messages with `recipientId` works
- [ ] Server startup logs show successful migration
- [ ] No `SQL_INPUT_ERROR` in logs after restart
