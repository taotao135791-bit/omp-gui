# Steer ACK Truth Report

Date: 2026-08-19

## Frozen baseline

- Repository: `taotao135791-bit/omp-gui`
- Frozen commit: `dc94cb52ddebcc853a8327b8f1989b8a9fc1d038`
- QA package: arm64 frozen app copied from the build of this commit
- Fixture: `/Users/glt/Desktop/omp-gui-cu-session-gate-fixture`

No Foundation Golden Path was reopened in this gate.

## Automated verification

- `pnpm typecheck` — PASS
- `pnpm test` — PASS, 41 files / 400 tests
- `pnpm test:omp` — PASS, 3 files / 21 tests
- `pnpm build` — PASS
- `pnpm package` — PASS for arm64 and x64
- `git diff --check` — PASS

Expected packaging warnings remain unchanged: unsigned macOS artifact, icon fallback, and optional unresolved dependency warnings.

## ACK truth checks

### Direct Steer

PASS. A running read-only task accepted a Composer Steer. The draft cleared only after the runtime ACK, a visible `调整当前任务` card was added, and the next visible response followed the steer (`只看 src` and did not inspect `tests`).

### Queued Steer

PASS. A queued message remained visible as `已排队 · 1` while the active turn ran. After the active `sleep 15` fixture turn ended, the queued message executed and returned the visible README first line `# Session Gate Fixture`.

### Queue Steer

PASS. A queued item exposed `立即转向`. After activation, the queue item was consumed only after the ACK and a visible `调整当前任务` card was added.

### FIFO and duplicate protection

PASS in automated store tests. Queue reservation is session-scoped, preserves FIFO, and prevents duplicate dispatch while a Queue Steer request is pending.

### Failure ownership

PASS in automated tests. A false/rejected runtime ACK creates no transcript message and no trajectory fact. Direct Steer restores the session-scoped draft; queued Steer releases its reservation and keeps the item queued.

### Failure feedback

PASS in automated tests and source review. Direct and queued failures use distinct recoverable copy. A normal successful queue drain clears only the stale queue-Steer error; `chat.sendFailed` and fatal `chat.sessionDead` ownership remains intact.

## Computer Use micro acceptance

All checks used fresh AX state after each action and visible UI text/screenshots only for acceptance.

| Case | Result | Evidence |
|---|---|---|
| CU-01 Direct Steer | PASS | Composer cleared; `调整当前任务` visible; response explicitly followed `只看 src` |
| CU-02 Queue | PASS | `已排队 · 1` visible; item drained after active turn; README first line returned |
| CU-03 Queue Steer | PASS | queued item consumed after ACK; `调整当前任务` visible |
| CU-04 A/B isolation | PASS | new B opened with empty Composer/no queue/error; switching back restored A transcript and Steer card |
| CU-05 Stop | PASS | active safe turn stopped; session returned to idle; Composer usable |

Automation note: two stale AX element retries occurred because a fixture turn completed between observation and click. Fresh-state relocalization recovered both; no product-level misclicks, hidden-state incidents, background-state errors, or session-identity errors were observed.

## Gate result

STEER ACK TRUTH CLEAN

FOUNDATION REMAINS ACCEPTED

READY FOR: AGENT HUB + TRAJECTORY
