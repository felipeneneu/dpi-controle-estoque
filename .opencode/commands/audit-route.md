CLASSIFICATION: SURVEY/INTEL
AGENT: orchestrator
OUTPUT: Session Intel only — do NOT create a plan file, do NOT modify any code.
CONTEXT REQUIRED: Read ARCHITECTURE_RULES.md, PROJECT_RULES.md first.

TASK:
Audit a single route given its URL: $ARGUMENTS

Use `python .opencode/skills/webapp-testing/scripts/playwright_runner.py` to actually navigate to the route (do not just read the source file — the point is to see what a real user sees and can interact with). Combine this with reading the underlying page/component code to cross-check what's rendered against what's real.

## What to determine, in this order

1. **Purpose (plain language)**: what does a first-time user think this page is for, based purely on what's visible? Not the technical name — the real-world thing it represents.

2. **Classification**: is this page:
   - FUNCTIONAL — reads/writes real data, every visible action does something real
   - PARTIAL — some actions work, some don't (list exactly which)
   - DECORATIVE — looks complete but nothing persists or connects to real data
   - BROKEN — errors, blank states, or crashes on load/interaction

3. **Interactive inventory**: list every clickable element (button, link, toggle, form field) on the page. For each: does it do something real (state change persisted to DB, navigation to a real destination) or is it dead (no handler, local-state-only, links nowhere)? Use Playwright to actually click and observe, not just read the JSX for an onClick prop — a handler that exists but silently fails counts as broken, not functional.

4. **Data source check**: for anything showing numbers, lists, or status — is it reading from the real, current database state, or is it hardcoded/stale/mismatched with what the underlying tables actually contain? Cross-reference against DATABASE_RULES.md.

5. **Loading/empty/error states**: does the page show a reasonable state while data loads, when there's no data yet, and when something fails? Or does it flash blank/zero values, or crash?

6. **Cross-links**: does this page link out to every other page a user would reasonably expect to reach from here (e.g. a client page linking to that client's orders)? List anything missing.

7. **Impact rating**: if this page is broken or decorative, how much does that matter — CRITICAL (blocks money/data integrity), MODERATE (confuses daily use but no data risk), COSMETIC (only affects polish/first impressions). Justify the rating in one sentence.

## Report format
Structured exactly per the 7 sections above, in plain language for section 1, technical with file references for the rest. End with a one-line verdict: "Ready as-is" / "Needs Phase B/C/G-style fix before relying on it" / "Should not be used yet."