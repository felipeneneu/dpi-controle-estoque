# PLAN: Fix Chat Send & Commands

## Problem Summary
Messages bounce back to input (not sending) and commands don't get processed.

## Root Causes Identified

| # | Bug | Severity | File |
|---|-----|----------|------|
| 1 | Silent error swallowing in `send()` — no user feedback | CRITICAL | `chat/page.tsx:149-164` |
| 2 | JWT expiration not detected — all POSTs return 401 | CRITICAL | `chat/page.tsx:112` + `api.ts` |
| 3 | Optimistic + Socket.IO duplicate during transition | CRITICAL | `messages.ts:50-59` |
| 4 | Enter key fills command but does not send | HIGH | `chat/page.tsx:166-183` |
| 5 | `isCommand` not persisted to database | HIGH | `chat.ts:264-281` |
| 6 | No try-catch in command handlers — DB errors crash silently | MEDIUM | `chat-commands.ts` |
| 7 | Response schema strips `isCommand` from HTTP response | MEDIUM | `chat.ts:20-34` |

---

## Task Breakdown

### Phase 1: Fix Silent Error Swallowing (Bug 1 — CRITICAL)

**Agent:** frontend-specialist

- [ ] **1.1** Add `toast.error()` in `send()` catch block with specific error message
- [ ] **1.2** Show different messages for 401 (token expired), 400 (validation), 500 (server)
- [ ] **1.3** If 401, redirect to `/auth` page

**File:** `grafica-app/src/app/(dashboard)/chat/page.tsx`

---

### Phase 2: Fix JWT Expiration Detection (Bug 2 — CRITICAL)

**Agent:** frontend-specialist

- [ ] **2.1** Add `validateToken()` call on chat page mount (before sending)
- [ ] **2.2** Add token check in `useSendMessage` mutation (pre-flight)
- [ ] **2.3** Redirect to `/auth` if token invalid

**Files:** `grafica-app/src/app/(dashboard)/chat/page.tsx`, `grafica-app/src/lib/queries/messages.ts`

---

### Phase 3: Fix Duplicate Messages (Bug 3 — CRITICAL)

**Agent:** frontend-specialist

- [ ] **3.1** In `onMutate`, use a stable optimistic ID based on content+timestamp
- [ ] **3.2** In `onSettled`, clear the optimistic message from cache when real one arrives
- [ ] **3.3** In `live` merge, detect and skip messages with same content+sender within 2s window

**File:** `grafica-app/src/app/(dashboard)/chat/page.tsx`, `grafica-app/src/lib/queries/messages.ts`

---

### Phase 4: Fix Command UX (Bug 4 — HIGH)

**Agent:** frontend-specialist

- [ ] **4.1** When command palette is open and user presses Enter, send the command directly (not just fill input)
- [ ] **4.2** Remove trailing space from `selectCommand()`

**File:** `grafica-app/src/app/(dashboard)/chat/page.tsx`

---

### Phase 5: Add try-catch to Command Handlers (Bug 6 — MEDIUM)

**Agent:** backend-specialist

- [ ] **5.1** Wrap each command handler in try-catch
- [ ] **5.2** Return error message to user instead of crashing

**File:** `grafica-app/backend/src/lib/chat-commands.ts`

---

### Phase 6: Fix Response Schema (Bug 7 — MEDIUM)

**Agent:** backend-specialist

- [ ] **6.1** Add `isCommand` to `messageResponseSchema` properties

**File:** `grafica-app/backend/src/routes/chat.ts`

---

### Phase 7: Build & Verify

- [ ] **7.1** Backend: `npx tsc --noEmit`
- [ ] **7.2** Frontend: `npx next build`
- [ ] **7.3** Manual test: Send message → appears once, no bounce
- [ ] **7.4** Manual test: Type `/help` + Enter → sends immediately
- [ ] **7.5** Manual test: Command response appears in chat
- [ ] **7.6** Manual test: Expired token → redirect to login

---

## Verification Checklist

| Check | Status |
|-------|--------|
| Backend compiles | ⬜ |
| Frontend builds | ⬜ |
| Messages send without bouncing | ⬜ |
| No duplicate messages | ⬜ |
| Commands process on Enter | ⬜ |
| Command errors show in chat | ⬜ |
| Expired token redirects to login | ⬜ |
