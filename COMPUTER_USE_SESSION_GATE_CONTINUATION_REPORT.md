# Computer Use Session Gate Continuation Report

Status: **BLOCKED — not a product acceptance pass**

Repository: `taotao135791-bit/omp-gui`
Branch: `main`
Frozen code fix: `6155ad7b2ed148d1a82ea83ef4ddc5bf16bfa634`
Previous QA report commit: `cb8c207`
Test fixture: `/Users/glt/Desktop/omp-gui-cu-session-gate-fixture`

This continuation made no source-code changes. The only fixture write was the
explicitly requested `SESSION_APPROVAL_TEST` line appended to the fixture's
`README.md` through the product UI.

## Automated Verification

- `pnpm typecheck` — PASS
- `pnpm test` — PASS, 385 tests
- `pnpm build` — PASS
- `pnpm test:omp` — PASS, 21 tests
- `pnpm package` — PASS, macOS arm64 package generated (unsigned locally)

## Draft Micro Gate

- MG-01 through MG-06 — PASS (frozen evidence)
- MG-07 — PASS. Sending A cleared only A; the A user message and assistant
  reply were visible, while B retained `DRAFT_B_DO_NOT_SEND`.
- MG-08 — PASS. New Chat C was empty; returning to B restored
  `DRAFT_EXISTING_SESSION`.

Draft Micro Gate: **PASS**.

## Session Lifecycle Gate

- SG-12 — PASS. A entered Running with tool activity and Stop; the read-only
  inspection/test task completed after its tool approvals.
- SG-13 — PASS. B opened while A was Running; B retained its transcript and
  draft and did not show A's tool cards/reply.
- SG-14 — **FAIL / UX gap**. While viewing B, the sidebar did not expose a
  clear `Running`/live-working label for A. A small visual indicator was
  present, but AX text did not identify it as Running.
- SG-15 — PASS. Returning to A restored the original Running turn, tool
  activity, and final response.
- SG-16 — PASS. `Allow tool: edit File: README.md` appeared; one approval was
  accepted and the agent completed the one-file fixture edit.
- SG-17 — **FAIL / UX gap**. Switching to B was possible and the approval
  remained available on return to A, but B did not show an explicit
  `Needs attention`/`Waiting approval` state; it looked like a normal B state.
- SG-18 — PASS. Durable A/B transcript state existed (`SESSIONAOK`,
  `SESSIONBOK`).
- SG-19 — PASS. The frozen build was quit through normal UI Quit; no force kill
  was used.
- SG-20 — PASS. The same frozen arm64 build restarted without crash or blank
  screen.
- SG-21 — PASS. The existing fixture was restored from recent workspace state;
  no folder picker was used.
- SG-22 — PASS with an AX wording note. On restart, the sidebar showed an
  inactive-session message plus a `历史会话` section containing both A and B;
  A/B were rediscovered.
- SG-23 — PASS after restart. Exactly one historical A row and one historical
  B row were present; the three blank sessions created by repeated asynchronous
  New Chat attempts in this QA run were not rediscovered after restart.
- SG-24 — PASS. A transcript, tool history, model/thinking metadata, and
  continuation were restored.
- SG-25 — PASS. B restored its own transcript without A content.
- SG-26 — PASS. Returning to A did not create a duplicate or reset it.
- SG-27 — PASS. After restart and A/B/A switching, the context question
  received exactly `SESSIONAOK`.

Session Lifecycle Gate: **NOT ACCEPTED** because SG-14 and SG-17 did not meet
the explicit sidebar-state requirements, despite the underlying session and
approval state surviving correctly.

## UX Regression

- UX-STOP-01 — PASS. Stop caused a visible state change within the observed
  one-second window.
- UX-STOP-02 — PASS. The turn reached Idle/Stopped, the Stop control vanished,
  and Composer was usable again.
- UX-STOP-03 — NOT independently exercised with a queued item at Stop. During
  Steer setup, the busy composer action was labelled `排队`; after the active
  turn finished, the typed text remained unsent in Composer.
- UX-STEER-01/02 — **FAIL**. During a real Running turn, the UI exposed only
  `排队` and no `Steer now`/`立即转向` action. The text was not presented in
  history as an explicit adjustment to the current turn.
- UX-EXPORT-01 — **PARTIAL / FAIL against the strict criterion**. The UI
  changed the control to `导出成功`, but did not show an exported filename or
  destination.

## Golden Path Regression

Not run. The instructions require Draft Gate, Session Gate, Stop, Steer, and
Export to pass before Phase 5. The old GP-27/28/32/33/34/37 checks therefore
remain unverified in this continuation.

## Metrics

Observed this run:

- Misclicks: 3 (wrong row-control targets while relocalizing)
- Relocalizations: 8+ (AX indices shifted during async transcript/sidebar
  updates; search and restart were used to re-locate sessions)
- State ambiguities: 2 (AX/screenshot mismatch; inactive-session wording with
  visible history)
- Recoveries: 1 (recovered from the stale Computer Use target/state)
- Hidden-state incidents: 1 (approval/working state lacked an explicit sidebar
  attention label)
- Background state errors: 2 (A Running and A approval were not clearly
  represented in the B sidebar)
- Session identity errors: 0

The run exceeded the stated relocalization and background-state targets. No
P0/P1 data-loss or session-identity regression was observed.

## Agent Hub Readiness

**NO** — draft isolation and durable A/B resume behavior passed, but the
explicit sidebar Running/Needs-attention requirements and Steer/Export UX
requirements did not.
