# PLAN: Fix Chat DM & Notifications

## Problem Summary
Chat DMs don't load when selecting a contact, and notifications don't fire in real-time.

## Root Causes Identified

| # | Bug | Severity | File |
|---|-----|----------|------|
| 1 | `selectedContactId` never read from URL `?contact=` param | CRITICAL | `chat/page.tsx:50` |
| 2 | DM query key mismatch in `useSendMessage` optimistic updates | HIGH | `messages.ts:44-62` |
| 3 | `unreadCount` hardcoded to 0 | MEDIUM | `chat.ts:193` |
| 4 | No per-user notification targeting (broadcast to `estoque` room) | MEDIUM | `notifications-provider.tsx` |
| 5 | `chat:leave` has no room validation | LOW | `app.ts:163` |

---

## Task Breakdown

### Phase 1: Fix Chat DM Loading (Bug 1 — CRITICAL)

**Agent:** frontend-specialist

- [ ] **1.1** Read `selectedContactId` from `useSearchParams().get("contact")` instead of local `useState`
- [ ] **1.2** Wrap chat page in `<Suspense>` boundary (required for `useSearchParams()`)
- [ ] **1.3** Ensure Socket.IO joins the correct DM room when contact changes
- [ ] **1.4** Verify `useDmMessages` is called with correct `recipientId`

**File:** `grafica-app/src/app/(dashboard)/chat/page.tsx`

---

### Phase 2: Fix DM Query Key Mismatch (Bug 2 — HIGH)

**Agent:** frontend-specialist

- [ ] **2.1** Update `useSendMessage` to detect DM vs channel and use correct query keys
- [ ] **2.2** Optimistic update targets `messageKeys.dm(recipientId)` for DMs
- [ ] **2.3** `onSettled` invalidates `messageKeys.dm(recipientId)` for DMs
- [ ] **2.4** `onError` rollback targets correct key

**File:** `grafica-app/src/lib/queries/messages.ts`

---

### Phase 3: Fix Notifications Real-time Delivery (Bug 4 — MEDIUM)

**Agent:** backend-specialist + frontend-specialist

- [ ] **3.1** Backend: Add personal room per user (`user:${userId}`) on socket connection
- [ ] **3.2** Backend: Emit notifications to personal room instead of only `estoque`
- [ ] **3.3** Frontend: Join personal room in `NotificationsProvider`
- [ ] **3.4** Keep `estoque` room for stock events (global broadcast is fine)

**Files:** `grafica-app/backend/src/app.ts`, `grafica-app/src/components/notifications-provider.tsx`

---

### Phase 4: Fix `chat:leave` Validation (Bug 5 — LOW)

**Agent:** backend-specialist

- [ ] **4.1** Add `isAllowedRoom()` check to `chat:leave` handler

**File:** `grafica-app/backend/src/app.ts`

---

### Phase 5: Verification

- [ ] **5.1** Build frontend: `npx next build`
- [ ] **5.2** Typecheck backend: `npx tsc --noEmit`
- [ ] **5.3** Manual test: Select contact in sidebar → DM loads
- [ ] **5.4** Manual test: Send DM → appears instantly (optimistic)
- [ ] **5.5** Manual test: Stock deduction → toast appears

---

## Verification Checklist

| Check | Status |
|-------|--------|
| Frontend builds | ⬜ |
| Backend compiles | ⬜ |
| DM loads when clicking contact | ⬜ |
| DM messages send and appear | ⬜ |
| #geral still works | ⬜ |
| Notifications toast fires | ⬜ |
| `chat:leave` validates room | ⬜ |
