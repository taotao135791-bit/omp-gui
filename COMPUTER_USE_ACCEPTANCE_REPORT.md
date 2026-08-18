# OMP GUI Desktop Computer Use Acceptance Report

**测试日期**：2026-08-18  
**测试构建**：`/Applications/OMP GUI.app`，UI 版本 `0.11.0`  
**测试方式**：macOS Computer Use，仅通过桌面 UI 操作；未修改 OMP GUI 源码。  
**测试夹具**：`/Users/glt/Desktop/omp-gui-cu-fixture`、`/Users/glt/Desktop/omp-gui-cu-fixture-2`

## 结论

**结果：部分通过，暂不建议作为验收通过版本。**

核心路径（冷启动、选择项目、读取文件、Markdown/Mermaid 渲染、模型切换、文件引用、Changes、导出）可用；但会话重启持久化和权限询问存在高优先级问题，工作区切换还存在跨项目状态泄漏/陈旧预览。

- P0：0
- P1：3
- P2：3
- P3：0
- 已验证通过或基本通过：20 项
- 部分通过/失败：6 项
- 未执行：插件实际安装、真实图片上传、删除会话/文件、回滚、后台子 Agent、通知权限；这些动作要么需要额外确认，要么当前环境没有安全的产品级测试入口。

## 全链路结果

| 阶段 | 结果 | 证据 |
|---|---|---|
| 冷启动 | PASS | 应用退出后重新启动无黑屏、无崩溃；项目路径恢复到第一个夹具 |
| 选择工作区 | PASS | 可通过原生文件夹选择器打开两个独立夹具，取消也不会破坏当前工作区 |
| 文件树/预览 | PASS | 可展开 `src`、打开 `math.ts`，预览内容准确 |
| 首次只读对话 | PASS | Agent 能读取项目并给出正确项目说明，消息/侧栏标题同步 |
| Markdown/Mermaid | PASS | heading、列表、表格、代码、链接、引用和合法 Mermaid 正常渲染；非法 Mermaid 显示源码并给出失败提示 |
| 模型/思考切换 | PASS | V4 Flash → V4 Pro、high → max；历史消息标签保留原模型/级别 |
| 文件引用/命令 | PASS | `@` 可列出文件、`@math` 可筛选并插入 `@src/math.ts`；`/model` 返回当前模型 |
| 写入与 Changes | PARTIAL | Changes 列表、diff、未跟踪文件显示正确；“询问”模式未显示确认就创建了文件 |
| 队列/转向/停止 | PASS | 可排队、立即转向、停止生成；队列消息最终执行并保留历史 |
| 导出 | PASS | 成功导出 HTML 到 Downloads：`omp-omp-gui-cu-fixture-20260818-1431.html` |
| 重启恢复 | FAIL | 应用可启动，工作区和文件变更保留，但已建立会话全部消失 |

## 功能矩阵

| 模块 | 结果 | 备注 |
|---|---|---|
| Chat / New Chat | PASS | 新会话创建、空态、标题生成正常 |
| Streaming / tool cards | PASS | 运行中、思考、读取/命令工具卡片和最终回答可见 |
| Model picker | PASS | 两个 DeepSeek 模型可选，历史标签准确 |
| Thinking picker | PASS | `高`、`最高` 可选，标签准确 |
| Permission picker | PARTIAL | UI 可切换询问/完全访问/禁用 Bash/只读，但询问模式实际未弹确认 |
| Read-only mode | PARTIAL | 实际文件未被修改，但拒写路径耗时约 38 秒并发生间接工具诊断尝试 |
| File tree | PASS | 两个夹具的目录结构可显示 |
| Preview | PARTIAL | 单项目预览准确；切换工作区后可能保留上一个项目的预览 |
| Changes / diff | PASS | clean、`+1/-0`、新文件 diff 均正确 |
| `@` references | PASS | 文件列表、筛选、插入引用均正常 |
| Slash commands | PASS | 命令菜单和 `/model` 正常 |
| Queue / steer / stop | PASS | 队列与转向按钮可见并可操作 |
| Attachments / image picker | PASS（入口） | 原生选择器可打开和取消；实际上传未执行 |
| Export HTML | PASS | 导出文件已生成 |
| Sessions | FAIL | 重启后会话列表为空；工作区切换时旧会话仍可能成为当前会话 |
| Search / pin | PASS | 会话搜索、置顶、取消置顶正常 |
| Plugins | BLOCKED | 插件页正常，显示 0 个插件；未执行实际安装，避免未经确认运行插件代码 |
| Settings / language / theme | PASS | 中英文、浅色/深色切换正常；最终已恢复中文/浅色 |
| Updater | FAIL | 安装包显示更新失败，缺少 `app-update.yml` |
| CLI / RPC | PASS | CLI 可用，路径正确；RPC 显示 v2，兼容性受支持 |

## 缺陷清单

### QA-001 — P1 — 会话重启后丢失

**步骤**：创建并运行多个会话 → 退出 `/Applications/OMP GUI.app` → 重新冷启动。  
**期望**：最近会话、消息历史和当前会话可恢复。  
**实际**：应用冷启动正常，项目路径仍为 `omp-gui-cu-fixture`，Changes 中的 `cu-approval.txt` 仍存在，但会话区显示“还没有会话”。等待 3 秒后仍未恢复。  
**复现**：稳定复现 1/1。  
**影响**：桌面应用核心连续性丢失，用户无法恢复工作上下文。

### QA-002 — P1 — 工作区切换保留其他项目的活动会话

**步骤**：在 fixture 1 中创建并运行会话 → 切换到 fixture 2。  
**期望**：当前会话与工作区关联正确，避免把 fixture 1 的上下文带入 fixture 2。  
**实际**：切换到 fixture 2 后，侧栏仍显示并选中 `OMP-GUI-CU-FIXTURE`，主区域继续展示 fixture 1 的历史内容；只有手动新建会话后才出现 `OMP-GUI-CU-FIXTURE-2`。  
**复现**：稳定复现 1/1。  
**影响**：用户可能在错误项目上下文中继续发起读取或写入操作。

### QA-003 — P1 — “询问”权限模式未出现逐项确认

**步骤**：当前会话权限切换为“询问” → 请求创建 `cu-approval.txt`。  
**期望**：文件写入前出现明确确认 UI。  
**实际**：未出现确认弹窗或批准按钮；Agent 直接报告“已编辑 1 个文件”，文件实际创建成功。设置页同时显示“改文件和执行命令前逐条问你”。  
**复现**：稳定复现 1/1。  
**影响**：权限模式的安全承诺与实际行为不一致。

### QA-004 — P2 — 工作区切换后右侧预览陈旧

**步骤**：打开 fixture 2 的 `README.md` 预览 → 切回 fixture 1 → 打开设置/查看右侧面板。  
**期望**：右侧面板立即显示当前工作区内容。  
**实际**：侧栏路径为 fixture 1，但预览仍显示 fixture 2 的 README；手动点击“文件”标签后才刷新为 fixture 1。  
**复现**：稳定复现 1/1。  
**影响**：用户可把旧项目内容误认为当前项目内容。

### QA-005 — P2 — 只读模式拒写路径过慢且发生间接工具尝试

**步骤**：新会话默认设为“只读” → 请求修改 `src/math.ts`。  
**期望**：立即明确拒绝写入并结束回合。  
**实际**：读取文件后，Agent 报告 `EPERM`，又尝试调用 `mcp__node_repl_js` 做诊断；约 38 秒后才停止。`src/math.ts` 最终未被修改。  
**复现**：1/1。  
**影响**：安全边界最终有效，但反馈慢、工具面暴露过宽，用户体验和可解释性较差。

### QA-006 — P2 — 安装包更新器缺少 app-update.yml

**步骤**：设置 → 关于 → 更新。  
**期望**：更新检查成功，或在未配置更新源时显示明确的“不可用”状态。  
**实际**：显示“更新失败”，错误为：`ENOENT: no such file or directory, open '/Applications/OMP GUI.app/Contents/Resources/app-update.yml'`。  
**复现**：稳定复现 1/1。  
**证据**：[设置页截图](qa-artifacts/settings-update-failure.png)。

## UX / 产品观察

- 右侧 Files / Preview / Changes 的结构清楚，clean 状态和 diff 反馈完整。
- 模型与思考级别会写入每条历史消息，适合审计和复盘。
- 非法 Mermaid 的降级体验较好：保留源码且明确提示渲染失败。
- 空会话初始思考级别显示 `—`，运行时加载后才显示实际级别；建议给出更明确的“正在读取运行时默认值”状态。
- 简单只读任务在 V4 Flash 上约需 20 秒以上；在最高思考级别下任务耗时明显增长，建议在 UI 上强化运行中/可停止的反馈。

## Runtime truth

- DeepSeek provider：已连接。
- OMP CLI：可用，`/Users/glt/.local/bin/omp`。
- Oh My Pi：`v17.2.12`。
- RPC：`v2`，运行时支持 `v1, v2`，兼容性显示“受支持”。
- 插件：0 个已安装/启用。
- fixture 1 的实际写入仅为 QA 测试创建的 `cu-approval.txt`；只读模式测试确认 `readonly-test` 未写入 `src/math.ts`。

## 修复优先级

1. 修复会话持久化与工作区—会话绑定，重启和切换项目时不得丢失或串用上下文。
2. 修复“询问”模式的逐项确认链路，确保任何文件写入/命令执行都经过可见批准。
3. 切换工作区时清理或重新验证右侧面板的文件、预览和 diff 状态。
4. 修复发布包更新器资源打包，或把更新不可用状态改成非错误式提示。
5. 让只读拒写尽早结束，禁止使用与产品任务无关的间接工具进行诊断。

