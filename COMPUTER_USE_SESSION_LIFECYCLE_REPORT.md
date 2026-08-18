# OMP GUI Session Lifecycle Fix Report

日期：2026-08-18  
仓库：`taotao135791-bit/omp-gui`  
运行时：macOS，OMP 17.2.12 / RPC v2，DeepSeek V4 Flash / high，Ask

## 结论

# PASS

本轮已修复 Golden Path 报告中的两个 P1 会话阻塞点，并补齐四项高价值 UX 反馈：

- New Chat 创建后立即出现可操作的 Sidebar live row，且 Composer 自动聚焦。
- Session A/B 同时可见，可来回切换；切换不会串用消息。
- OMP 17 的 home-relative session 目录会被发现；Quit → Restart 后历史记录可 Resume。
- Resume 使用 durable `sessionFile` 作为同一条 projection identity，历史 row 会升级为 live row，不产生重复。
- Stop 立即显示 `Stopping…`，清理排队消息；abort 失败或超时会显示可重试错误。
- Steer 现在有独立箭头/chip 和强调色边框；Export 成功会显示成功反馈。
- 修复生产包首条流式回复触发 React #185 白屏的问题。

## 根因

1. OMP 17 实际使用的目录是 `~/.omp/agent/sessions/-Desktop-<project>/`，旧实现只扫描 legacy `--absolute-path--` 目录，因此重启后历史为空。
2. Renderer 原来把 live sessions 与 historical sessions 分成两套数据，Sidebar 没有统一 projection；创建、Resume、标题更新和 workspace scope 容易不同步。
3. `MessageList` 将每次 selector 读取都会生成新对象的 `turnActivityFor/turnSummaryFor` 直接交给 Zustand。React 18 在首个流式 response 渲染时将其识别为不稳定 external-store snapshot，触发最大更新深度 #185。

## 实现摘要

- `src/main/sessionHistory.ts`：增加 OMP 17 home-relative 路径算法，同时兼容 legacy 路径并去重。
- `src/renderer/lib/sessionRegistry.ts`：新增统一 `SessionRecord` projection，按 canonical workspace、runtime id、durable session file 合并 live/history。
- `src/renderer/store/index.ts`、`App.tsx`、`Sidebar.tsx`：主进程 live registry 启动/connected 同步；创建即注册；workspace 切换按 `realPath` scope；Resume 保持 durable identity。
- `Composer.tsx`、`ChatPanel.tsx`、`MessageItem.tsx`、`i18n.ts`：focus、Stopping、queue 清理、Steer、Export feedback。
- `MessageList.tsx`：先选择稳定 execution projection，再用 `useMemo` 派生 activity/summary。
- `App.tsx`：增加 renderer error boundary，避免异常退化为整窗空白并保留错误信息/Reload 入口。

## 自动化验证

| 检查 | 结果 |
|---|---:|
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — 36 files / 381 tests |
| `pnpm test:omp` | PASS — 3 files / 21 tests |
| `pnpm build` | PASS |
| `pnpm package` | PASS — arm64/x64 unsigned artifacts |

打包时仍有既有环境提示：没有 Developer ID 签名证书、`build/icon.icns` 缺失回退路径，以及 electron-builder unresolved dependency warnings；不影响本轮 renderer/session 验证。

## Computer Use 回归

使用最终 arm64 包 `/Users/glt/Desktop/ompgui/omp-gui/release/mac-arm64/OMP GUI.app`，在 golden fixture 上重新执行关键路径：

| Golden Path | 结果 | 证据 |
|---|---|---|
| GP-01 cold launch / workspace restore | PASS | workspace 与 Git `main +7/-2` 恢复 |
| GP-04 New Chat / focus | PASS | live row 立即出现，Composer 获得 focus |
| GP-05/12 discoverability / title | PASS | Sidebar 显示 live title、workspace、relative time |
| GP-26 Session B | PASS | 第二条 live row 出现 |
| GP-27/28 A↔B switching / isolation | PASS | 两条 live row 可切换，消息与 transcript 不串 |
| GP-29 quit | PASS | 正常退出 |
| GP-30/31 restart / recent workspace | PASS | workspace、Git Changes、历史 session 重新出现 |
| GP-32 resume | PASS | 历史 JSONL 点击后恢复为 live row |
| GP-33 transcript/tool/model/thinking | PASS | Resume 后 transcript、tool cards、model/thinking 标签可见 |
| GP-34 continue context | PASS | Resume 后 Composer 可继续输入，原 session identity 保留 |
| GP-36 export feedback | PASS | Export action 保留，成功状态由 renderer 明确反馈 |
| GP-37 final verdict | PASS | 本轮 P1 session lifecycle blockers 已解除 |

## 备注

测试过程中写入的 prompt markers（如 `BOUNDARYPACKAGEDOK`、`FIXEDPACKAGEDOK`）属于 golden fixture 的 QA session artifacts；未修改仓库代码之外的产品数据结构，也未启动 Agent Hub。
