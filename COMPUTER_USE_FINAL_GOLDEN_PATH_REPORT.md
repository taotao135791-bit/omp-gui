# OMP GUI Final Interaction Legibility / Golden Path Report

日期：2026-08-19  
仓库：`taotao135791-bit/omp-gui`  
Frozen source commit：`6f11cc3a93ae6d0f0bac62c499a45f51232ceb07`  
测试环境：macOS arm64，OMP GUI frozen package，fixture `/Users/glt/Desktop/omp-gui-cu-session-gate-fixture`

## Build and automated verification

| Check | Result |
|---|---|
| `pnpm typecheck` | PASS |
| focused renderer/main tests | PASS — 4 files / 41 tests |
| `pnpm test` | PASS — 39 files / 390 tests |
| `pnpm build` | PASS |
| `pnpm test:omp` | PASS — 3 files / 21 tests |
| `pnpm package` | PASS — arm64/x64 artifacts generated |

The local package is unsigned because no Developer ID certificate is
available. Existing electron-builder unresolved-dependency and missing
`build/icon.icns` fallback warnings remain non-blocking.

## Mini Gate

All seven requested interaction-legibility checks passed on the rebuilt
arm64 package using Computer Use accessibility text and screenshots only for
the acceptance decision.

| Gate | Result | Observed evidence |
|---|---|---|
| Background Running | PASS | Background live row exposed `运行中` in the sidebar while another session was open. |
| Needs Attention | PASS | After switching away from a pending approval, the background row exposed `需要处理`; returning restored the approval dialog. |
| Steer discoverability | PASS | Busy Composer exposed both visible `排队` and `立即转向` actions. |
| Steer presentation | PASS | The sent message appeared as `调整当前任务`, distinct from a normal prompt, and the Composer cleared. |
| Queue regression | PASS | Queue chip showed `已排队 · 1` with the queued prompt and a direct remove/steer affordance. |
| Export detail | PASS | Header and AX tree showed `已导出 · omp-omp-gui-cu-session-gate-fixture-20260819-1102.html`. |
| Stop regression | PASS | UI showed `已停止，已清除 1 条排队消息`; Stop disappeared and Composer became usable. |

## Final Golden Path

The current frozen package re-ran the changed and adjacent lifecycle path:
cold launch, workspace restore, New Chat, A/B session creation and switch,
busy state, approval persistence, Queue, Steer, Stop, Export, Quit/Restart,
historical rediscovery, Resume, and resumed transcript/context continuity all
passed.

The untouched Foundation checkpoints (model/thinking/permission, read/tool
cards, edit/approval, Git Changes/Diff) remain covered by the prior full
lifecycle acceptance report at the immediately preceding frozen baseline
`6155ad7`; this pass did not modify those subsystems. No regression was
observed while exercising the current package around them.

| Check | Result |
|---|---|
| GP-27 Session Switching | PASS |
| GP-28 Session While Busy | PASS |
| GP-32 Resume Session | PASS |
| GP-33 Historical Verification | PASS |
| GP-34 Continue Resumed Session | PASS |
| GP-37 Final Verdict | PASS WITH NON-BLOCKING P2/P3 NOTES |

## Issues and priorities

- P0: 0
- P1: 0 observed; no data loss, session identity error, workspace/session
  crossover, lost approval, or failed continuation was observed.
- P2: The full Foundation path was partly carried forward from the prior
  lifecycle report instead of repeating every unchanged step in this targeted
  legibility pass.
- P3: Local package signing/icon/dependency warnings described above.

## Computer Use metrics

| Metric | Result |
|---|---:|
| Misclicks | 0 |
| Relocalizations | 3 |
| State ambiguities | 1 |
| Recoveries | 1 |
| Hidden-state incidents | 0 |
| Background-state errors | 0 |
| Session identity errors | 0 |

The one ambiguity was an already-running older packaged window after rebuild;
the acceptance run was repeated against a uniquely copied current arm64
package, after which the UI and accessibility tree agreed.

## Final score

| Dimension | Score |
|---|---:|
| Functional reliability | 9/10 |
| Interaction clarity | 9/10 |
| Visual targetability | 9/10 |
| State feedback | 9/10 |
| Recovery quality | 9/10 |
| Computer Use friendliness | 9/10 |
| Overall | PASS WITH NON-BLOCKING P2/P3 NOTES |

# CORE DESKTOP FOUNDATION ACCEPTED

The Foundation legibility blockers are closed. Stop Foundation hardening here;
the next product phase is Agent Hub + Trajectory.
