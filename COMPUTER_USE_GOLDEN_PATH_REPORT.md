# OMP GUI Computer Use Golden Path Acceptance Report

## 1. Environment

- **Repository**: `taotao135791-bit/omp-gui`
- **Commit / branch**: `1b588dd` / `main`
- **Build**: `/Applications/OMP GUI.app`
- **Observed UI version**: `0.11.0`
- **Runtime**: DeepSeek V4 Flash, `high`
- **Permission mode**: `询问` / Ask
- **Fixture**: `/Users/glt/Desktop/omp-gui-cu-golden-fixture`
- **Fixture baseline commit**: `e7732e3`
- **Platform**: macOS desktop
- **Preconditions**: `pnpm typecheck` PASS; `pnpm test` PASS (375 tests); `pnpm build` PASS
- **Source changes**: none; only this report and QA evidence artifacts were added

## 2. Golden Path Verdict

# FAIL

The core read → edit → approve → test → diff → queue → steer → stop flow works. The Golden Path cannot be accepted because after creating Session B the UI provides no usable A/B session list or switch target, and after a normal quit/restart the previous sessions are gone. GP-32 through GP-34 therefore cannot be completed.

Recent workspace and Git Changes survive restart, but the conversational state needed to resume the work does not.

## 3. Score

| Dimension | Score |
|---|---:|
| Functional reliability | 5/10 |
| Interaction clarity | 6/10 |
| Visual targetability | 8/10 |
| State feedback | 5/10 |
| Recovery quality | 4/10 |
| Computer Use friendliness | 6/10 |
| **Overall** | **5/10** |

## 4. Metrics

- **Misclicks**: 0
- **Relocalizations**: 4; mainly after modal/diff transitions and when locating the active stop/queue controls
- **State ambiguities**: 4; Stop feedback, post-New-Chat focus, Steer presentation, and silent Export completion
- **Recoveries**: 2; re-opened/reselected the right panel after diff navigation and repeated Stop observation/click because the first click had no immediate visible state change

## 5. Journey Table

| Step | Result | Observation |
|---|---|---|
| GP-01 Cold Launch | PASS | Cleanly closed and relaunched; no white/black screen, crash, or blocked window controls |
| GP-02 Workspace Opening | PASS | Opened the golden fixture through the native folder picker |
| GP-03 Workspace Visual Verification | PASS | Correct workspace name, `main`, clean Changes, file tree, and composer |
| GP-04 New Chat | PASS WITH ISSUES | Empty chat and controls visible; focus remained on New Chat instead of Composer |
| GP-05 Discoverability | PASS | Model, Thinking, and Permission were visually findable in one scan |
| GP-06 Model | PASS | DeepSeek V4 Flash was visible and usable |
| GP-07 Thinking | PASS | Current `高` state was visible and a supported level was available |
| GP-08 Permission | PASS | Ask mode visible; edit and bash approvals appeared as expected |
| GP-09 First Prompt | PASS | Read-only project summary request sent successfully |
| GP-10 Agent Start | PASS | User message, Running state, tool activity, and Stop appeared quickly |
| GP-11 Tool Cards | PASS | Read cards named the operation and target file; cards were expandable |
| GP-12 First Completion | PASS WITH ISSUES | Final answer and Composer recovery were clear; active session was not visible as a normal sidebar item |
| GP-13 Modification Prompt | PASS | Agent edited only `src/math.ts` and `tests/math.test.ts` |
| GP-14 Approval | PASS | Separate Approve/Deny UI appeared for both edits and the test command |
| GP-15 File Modification | PASS | `multiply` and two assertions were added; `npm test` completed |
| GP-16 Git Changes | PASS | `+7 / -2`, two changed files, names and counts matched the fixture |
| GP-17 Diff Interaction | PASS | math and tests diff selections showed the correct current file |
| GP-18 Second Prompt | PASS | Session context described the completed changes correctly |
| GP-19 Long-running Turn | PASS | Read/test task entered Running state |
| GP-20 Queue | PASS | Second request appeared as `已排队 · 1` |
| GP-21 Queue Understandability | PASS WITH ISSUES | Queue item and `立即转向` were visible, but an approval modal could temporarily obscure the continuation state |
| GP-22 Steer | PASS | Steer text could be entered while the current turn was busy |
| GP-23 Steer Verification | PASS WITH ISSUES | Steer text appeared in the active history, but its relationship to the current turn was not visually obvious |
| GP-24 Stop | PASS | Stop control was reachable during a long read-only turn |
| GP-25 Stop Verification | PASS WITH ISSUES | Turn eventually stopped and Composer recovered, but the first click produced no immediate clear visual confirmation |
| GP-26 Second Session | PASS | Session B returned `SESSION_B_OK` |
| GP-27 Session Switching | FAIL | After Session B was created, no A/B session entries or switch controls were visible |
| GP-28 Session While Busy | BLOCKED | Cannot switch to another session while busy because GP-27 has no usable target |
| GP-29 Quit | PASS | Normal UI quit completed |
| GP-30 Restart | PASS WITH ISSUES | App and Recent Workspace restarted correctly; session history did not |
| GP-31 Recent Workspace | PASS | Golden fixture remained in Recent Projects and opened through the UI |
| GP-32 Resume Session | FAIL | Sidebar showed `还没有会话，点击新建对话开始。` |
| GP-33 Historical Verification | FAIL | No prior user/assistant/tool history was available after restart |
| GP-34 Continue Resumed Session | BLOCKED | No Session A remained to continue |
| GP-35 Final Git Check | PASS | `src/math.ts +4/-0` and `tests/math.test.ts +3/-2` remained after restart |
| GP-36 Final Export | PASS | A new session exported successfully to Downloads: `omp-omp-gui-cu-golden-fixture-20260818-1604.html` |
| GP-37 Final Verdict | FAIL | Core session continuity is not reliable enough for Golden Path acceptance |

## 6. P0 / P1 Issues

### GP-27-01 — P1 — Session A/B switching is unavailable

**Area**: Session / Sidebar  
**Steps**:

1. Create Session A and complete a read/edit flow.
2. Create Session B and receive `SESSION_B_OK`.
3. Inspect the sidebar and click the visible Chat navigation.

**Expected**: Session A and Session B appear as selectable history entries; A ↔ B can be performed three times without message or draft contamination.  
**Observed**: The sidebar showed `会话` and `搜索会话…`, but no session rows, titles, or switch targets. The main view remained on the newly created session.  
**Reproducible**: Yes, 1/1.  
**Impact**: A central desktop workflow cannot be continued or compared across sessions.

### GP-30-01 — P1 — Sessions disappear after normal restart

**Area**: Session persistence / Restart  
**Steps**:

1. Create multiple turns and Session B in the golden fixture.
2. Quit via the normal macOS UI.
3. Relaunch `/Applications/OMP GUI.app`.

**Expected**: Recent Workspace, Session A/B, messages, tool cards, model tags, and drafts remain available.  
**Observed**: Workspace and Git Changes survived (`+7/-2`), but the sidebar showed `还没有会话，点击新建对话开始。` and no prior history could be resumed.  
**Reproducible**: Yes, 1/1 in this Golden Path run; also observed in the earlier acceptance pass.  
**Evidence**: [restart screenshot](qa-artifacts/golden-path-restart-no-history.png).  
**Impact**: Resume and historical verification are impossible after a normal app restart.

## 7. P2 UX Issues

### GP-04-01 — P2 — New Chat does not focus Composer

After clicking New Chat, the empty Composer was visible but accessibility focus remained on the New Chat button. A user/Computer Use agent must perform an extra click before typing.

### GP-12-01 — P2 — Active session title is not consistently visible in the sidebar

After the first completed turn, the main area showed the current turn title, but the sidebar did not expose a normal session row. This makes history and session ownership difficult to understand even before restart.

### GP-23-01 — P2 — Steer presentation is easy to confuse with a queued/user turn

The `不用检查 docs 目录了，重点看 src 和 tests。` text appeared in the history, but there was no strong visual label explaining that it changed the current busy turn rather than starting an independent turn.

### GP-25-01 — P2 — Stop has delayed/ambiguous feedback

The Stop button was targetable, but the first click did not immediately remove Running or show a stopped state. The turn eventually ended and Composer recovered after further observation/retry.

### GP-36-01 — P2 — Export has no visible completion feedback

Export succeeded and produced the HTML file, but the UI did not show a success toast, destination, or completion state. Verification required checking Downloads outside the app.

## 8. Computer Use-specific Evaluation

### Visual Targetability

New Chat, Open Folder, Model, Thinking, Permission, Changes, Queue, and Stop were visually targetable. The main failure was not hit-target quality; it was the absence of visible Session A/B targets.

### Hit Target Quality

No accidental clicks occurred. Modal Approve/Deny buttons were large and understandable. Stop and Steer were targetable after refreshing the accessibility state.

### State Legibility

Idle, Running, tool execution, approval waiting, queued, and final states were mostly distinguishable. Stop completion and Steer semantics were less explicit. The most severe state failure was “no sessions” after restart despite the workspace and Changes surviving.

### Focus Quality

- New Chat: focus stayed on the New Chat button rather than Composer.
- Send: Composer became available again after completion.
- Approval: the modal exposed Approve/Deny and blocked the turn clearly.
- Stop: focus/state feedback was delayed.
- Session switching: no visible session target existed.

## 9. Top 10 Fixes

1. Persist Session A/B history across normal quit/restart.
2. Render session rows and make A/B switching available in the sidebar.
3. Bind active sessions to the correct workspace without hiding or replacing history.
4. Add explicit Resume/Reopen state after restart.
5. Focus Composer automatically after New Chat.
6. Give Stop an immediate “stopping/stopped” state and ensure queued work behavior is explicit.
7. Give Steer a distinct visual event card and explain its effect on the current turn.
8. Show a visible Export success toast and destination filename.
9. Keep active session title and model/thinking history visible in the sidebar.
10. Add a Golden Path regression covering quit → restart → Resume → continue-context.

## 10. Agent Hub Readiness

# NO

The existing core product is not stable enough to begin Agent Hub + Trajectory. The blocking reasons are P1-only:

- Session A/B switching is unavailable in the visible UI.
- Sessions disappear after normal restart, so Resume and trajectory continuity cannot be trusted.

