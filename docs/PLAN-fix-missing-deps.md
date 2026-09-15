# PLAN: Fix Missing Dependencies After Branch Switch

## Context

After switching from `versao-estavel` to `feature/m1-bobina-checkin`, the application fails to start with two module resolution errors:

1. **Backend**: `Cannot find package 'node-schedule'` in `grafica-app/backend/src/lib/scheduler.ts`
2. **UI**: `Cannot resolve 'lucide-react'` in `grafica-app/src/components/title-bar.tsx`

Both packages are correctly listed in their respective `package.json` files and `node_modules` directories exist. The root cause is stale/corrupted `node_modules` from the previous branch.

## Root Cause

Branch switch → `node_modules` not re-resolved for the new branch's dependency tree. Node.js ESM resolver fails to find packages that physically exist but have broken symlinks or stale cache.

## Task Breakdown

| # | Task | Agent | Est. |
|---|------|-------|------|
| 1 | Reinstall backend dependencies (`npm install` in `grafica-app/backend/`) | General | 1 min |
| 2 | Reinstall UI dependencies (`npm install` in `grafica-app/`) | General | 1 min |
| 3 | Verify backend starts without `node-schedule` error | General | 30s |
| 4 | Verify UI compiles without `lucide-react` error | General | 30s |

## Implementation Plan

### Step 1: Reinstall backend dependencies
```bash
cd grafica-app/backend && npm install
```

### Step 2: Reinstall UI dependencies
```bash
cd grafica-app && npm install
```

### Step 3: Verify
- Start the app and confirm both backend and UI launch without module errors
- The Google Fonts timeout warning is unrelated (network issue, not a code bug)

## Verification Checklist

- [ ] `node-schedule` resolves in `grafica-app/backend/`
- [ ] `lucide-react` resolves in `grafica-app/`
- [ ] Backend starts without `ERR_MODULE_NOT_FOUND`
- [ ] UI compiles without `Module not found` error
- [ ] Application loads in Electron

## Notes

- The Google Fonts `Inter` timeout warning is expected if offline/proxy — not a blocker
- The Electron DevTools errors (`Autofill.enable`, `language-mismatch`) are Chromium internal warnings — harmless
