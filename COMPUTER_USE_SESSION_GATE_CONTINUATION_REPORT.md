# Computer Use Session Gate Continuation Report

Status: **IN PROGRESS — not a product acceptance pass**

Repository: `taotao135791-bit/omp-gui`  
Branch: `main`  
Code fix commit: `6155ad7b2ed148d1a82ea83ef4ddc5bf16bfa634`  
Test fixture: `/Users/glt/Desktop/omp-gui-cu-session-gate-fixture`

## Code Fix

The reproduced P1 was caused by `Composer.tsx` keeping unsent text and staged
images in component-local React state. Session switching changed the selected
transcript through `currentSessionId`, but the mounted Composer instance kept
the previous local state, so Session A's draft appeared in Session B.

The fix adds an in-memory `composerDrafts` map keyed by runtime `sessionId`.
Composer text and staged prompt images are written to that owning entry on
edit, loaded when the selected session changes, and cleared only for the
session that successfully sends. Failed delivery restores the same session's
draft. Session deletion prunes its entry. Slash/@ menus, image errors, and
other transient menu state reset at the session boundary; late image/file
picker callbacks cannot write into a newly selected session.

## Automated Verification

- `pnpm typecheck` — PASS
- `pnpm test` — PASS, 385 tests
- `pnpm build` — PASS
- `pnpm test:omp` — PASS, 21 tests
- `pnpm package` — PASS, macOS arm64 package generated (unsigned in this local environment)

## Draft Micro Gate

- MG-01 A draft `DRAFT_A_DO_NOT_SEND` — PASS
- MG-02 switch A → B, B does not show A draft — PASS
- MG-03 B draft `DRAFT_B_DO_NOT_SEND` — PASS
- MG-04 switch B → A, A draft restored — PASS
- MG-05 switch A → B, B draft restored — PASS
- MG-06 A → B → A → B for two rounds — PASS
- MG-07 send A draft, verify only A clears and B remains — BLOCKED pending confirmation to send the QA prompt
- MG-08 New Chat C does not inherit a draft — NOT RUN

## Remaining Session Lifecycle Gate

SG-12 through SG-26 — NOT RUN. The previous run stopped at SG-11, and this
continuation is intentionally paused before sending the next live QA prompt.

## UX Regression

Stop / Steer / Export — NOT RUN in this continuation.

## Agent Hub Readiness

**NO** — the draft isolation fix and MG-01 through MG-06 are green, but the
remaining Micro Gate and Session Lifecycle Gate have not completed.
