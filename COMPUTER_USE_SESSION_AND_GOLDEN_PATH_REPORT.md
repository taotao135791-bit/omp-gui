# OMP GUI Desktop Acceptance QA — Session & Golden Path Report

日期：2026-08-18  
测试方式：Computer Use / 纯视觉桌面交互  
验收原则：Session Lifecycle Gate 失败后立即停止后续大规模回归

## 1. Environment

| 项目 | 值 |
|---|---|
| Commit | `9e2059c0bc630e92720f861d7b43dfe964cef96f` |
| Branch | `main` |
| Repository status | clean，测试期间未改源码 |
| OMP GUI | `0.11.0`，冻结 arm64 包 `release/mac-arm64/OMP GUI.app` |
| OMP | `17.2.12` (`omp/17.2.12`) |
| macOS | `26.5` |
| Model | DeepSeek V4 Flash |
| Thinking | high |
| Permission | Ask / 询问 |
| Fixture | `/Users/glt/Desktop/omp-gui-cu-session-gate-fixture` |
| Fixture baseline | `6f4b694`，全新 Git fixture |

Fixture 通过 UI folder picker 打开，确认路径、目录结构和 Git `main` 分支正确。测试过程中没有对 fixture 发送修改任务。

## 2. Session Lifecycle Gate

**SESSION LIFECYCLE GATE = FAIL**

| Gate | 结果 | 观察 |
|---|---|---|
| SG-01 Cold Launch | PASS | 最终冻结包正常打开，无 crash/白屏 |
| SG-02 Open Workspace | PASS | 通过 folder picker 打开全新 fixture；路径、文件区、`main` 正确 |
| SG-03 Create Session A | PASS | New Chat 后创建 A |
| SG-04 Composer Focus | PASS | 未点击 Composer，直接键盘输入进入输入框 |
| SG-05 Complete Session A | PASS | 主区域收到 `SESSIONAOK` |
| SG-06 Sidebar Session A | PASS | Sidebar 有 A row、标题、时间和 active state |
| SG-07 Create Session B | PASS | New Chat 后创建 B |
| SG-08 Sidebar A + B | PASS | A/B 两条 live rows 同时可见 |
| SG-09 A → B → A → B | PASS | 通过 Sidebar row path 点击切换，A/B transcript 正确恢复 |
| SG-10 Session Isolation | PASS | A/B 消息、model、thinking、permission 未串；但 draft 问题见 SG-11 |
| SG-11 Draft Isolation | **FAIL** | A 中输入未发送草稿后切到 B，B Composer 仍显示 A 的 `DRAFT_A_DO_NOT_SEND` |
| SG-12 Busy Session Switching | BLOCKED | Gate 在 SG-11 失败后停止 |
| SG-13 Switch to B While A Running | BLOCKED | 未继续 |
| SG-14 Sidebar Running State | BLOCKED | 未继续 |
| SG-15 Return A | BLOCKED | 未继续 |
| SG-16 Approval in Background | BLOCKED | 未继续 |
| SG-17 Return to Approval | BLOCKED | 未继续 |
| SG-18 Normal Quit | BLOCKED | 按 Gate 规则停止；随后关闭了 QA app，不作为本轮 restart 证据 |
| SG-19 Restart | BLOCKED | 未继续 |
| SG-20 Recent Workspace | BLOCKED | 未继续 |
| SG-21 Session Rediscovery | BLOCKED | 未继续 |
| SG-22 No Duplicate Sessions | BLOCKED | 未继续 |
| SG-23 Resume A | BLOCKED | 未继续 |
| SG-24 Resume B | BLOCKED | 未继续 |
| SG-25 Resume A Again | BLOCKED | 未继续 |
| SG-26 Continue Context | BLOCKED | 未继续 |
| SG-27 Session Gate Verdict | **FAIL** | Draft isolation failure blocks certification |

### SG-11 失败复现

1. 在 Session A Composer 输入 `DRAFT_A_DO_NOT_SEND`，不发送。
2. 点击 Sidebar 的 Session B row。
3. 主区域正确切换到 B，并显示 B 的 `SESSIONBOK` transcript。
4. 但 B 的 Composer 同时显示 `DRAFTADONOTSEND`。

截图证据：本次 Computer Use 截图中主区域标题为 `Reply exactly SESSIONBOK`，输入框却显示 `DRAFTADONOTSEND`。

期望：B 不应显示 A 的未发送草稿；如果产品支持 per-session draft，切回 A 后应恢复 A 草稿；如果不支持，至少切换到 B 时必须清空或隔离该文本。

影响：用户可能以为正在编辑 B，却把 A 的未发送内容误发到 B，属于 Session isolation / Composer state leakage。

## 3. Golden Path Verdict

**BLOCKED**

根据本轮硬性规则，Session Gate 在 SG-11 失败后没有继续测试 Plugins、Settings、图片或完整 Golden Path。不能据此宣称本轮 Golden Path 通过。

## 4. Previous Failure Regression

| 项目 | 本轮结果 | 说明 |
|---|---|---|
| GP-27 Session Switching | PASS（idle A/B） | SG-09 已证明 A/B rows 可见且可切换 |
| GP-28 Session While Busy | BLOCKED | Session Gate 在 draft leakage 后停止 |
| GP-32 Resume Session | BLOCKED | 按规则未执行 Quit → Restart |
| GP-33 Historical Verification | BLOCKED | 未执行 |
| GP-34 Continue Resumed Session | BLOCKED | 未执行 |
| GP-37 Final Verdict | BLOCKED | Session Gate FAIL，不能给出完整 Golden Path verdict |

上一轮已提交的 lifecycle 修复在本轮 idle A/B 可见性和切换上有效；本轮新发现的 draft isolation 缺陷仍阻止完整验收。

## 5. UX Regression

| 项目 | 结果 | 说明 |
|---|---|---|
| UX-01 New Chat Focus | PASS | SG-04 已覆盖：不点击 Composer 直接输入成功 |
| UX-02/03 Stop | BLOCKED | Gate FAIL 后未执行 |
| UX-04/05 Steer | BLOCKED | Gate FAIL 后未执行 |
| UX-06 Export | BLOCKED | Gate FAIL 后未执行 |

## 6. Session Isolation

| 场景 | 结果 |
|---|---|
| A/B live rows | PASS |
| A/B transcript switching | PASS |
| A/B model/thinking/permission | PASS，未发现串用 |
| A → B draft isolation | **FAIL** |
| Busy switching | BLOCKED |
| Approval switching | BLOCKED |
| Restart / resume | BLOCKED |

## 7. Metrics

| 指标 | 本轮结果 | 目标 |
|---|---:|---:|
| Misclicks | 1 | ≤ 1 |
| Relocalizations | 2 | ≤ 2 |
| State ambiguities | 0 | ≤ 1 |
| Recoveries | 0 | 0 |
| Hidden-state incidents | 1 | 0 |
| Session identity errors | 0 | 0 |
| Time to understand draft leak | < 1s after B switch | — |

`Hidden-state incident = 1`：Composer 仍显示 A draft，但当前 session 已是 B，UI 没有提示文本属于哪个 session。

## 8. Before / After

上一轮 baseline：Overall `5/10`，Functional reliability `5/10`，Interaction clarity `6/10`，State feedback `5/10`，Recovery `4/10`，Computer Use friendliness `6/10`。

本轮不进行完整产品评分，因为 Gate FAIL 且后续阶段按规则未执行。局部变化如下：

- Session row 可见性：FAIL → PASS（idle A/B 已验证）。
- A/B idle switching：FAIL → PASS。
- New Chat focus：有问题 → PASS。
- Draft isolation：本轮新发现 FAIL。
- Restart/resume：本轮未重新认证，状态 BLOCKED。

## 9. P0 / P1 Issues

### QA-SG-001 — P1 — Composer draft leaks across sessions

**复现**：Session A 输入 `DRAFT_A_DO_NOT_SEND` 不发送 → 切换 Session B。  
**期望**：B Composer 不显示 A draft；per-session draft 设计下切回 A 恢复。  
**实际**：B 主区域显示 B transcript，但 Composer 保留 `DRAFTADONOTSEND`。  
**影响**：误发到错误 session，破坏 session isolation 和输入安全边界。  
**本轮是否修复**：否；本轮为 QA ONLY，未修改源码。

## 10. P2 / P3 UX Issues

本轮没有继续执行 Stop、Steer、Export，因此不对这些项新增结论。现有上一轮 UX 修复在 New Chat focus 上得到 PASS 验证。

## 11. Agent Hub Readiness

**NO**

原因：Session Lifecycle Gate FAIL，存在 Session Composer state leakage；GP-28、GP-32、GP-33、GP-34 未完成，不能进入 Agent Hub + Trajectory 验收。
