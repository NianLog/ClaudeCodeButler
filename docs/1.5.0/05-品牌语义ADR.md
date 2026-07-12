# ADR：CCB 品牌语义升级

## 状态

Accepted（修订 2）— 产品所有者确认至少一个 `C` 必须代表 `Coding`，并否决上一版 `Coding Configuration Bridge` 候选。

## 背景

`Claude Code Butler` 准确描述了项目早期目标，但 v1.5.0 将管理范围扩展到多 AI 工具和动态规则库。继续使用旧全称会产生三个问题：

1. 用户会误以为非 Claude Code 配置属于附加或非官方能力。
2. domain/API 命名容易继续围绕 Claude 扩展，阻碍通用架构。
3. 品牌愿景仍是“单工具助手”，无法表达配置桥接与控制平面价值。

同时，`CCB`、仓库名、`.ccb` 数据目录、GitHub links、appId 和用户认知已有稳定价值，直接更换缩写会引入迁移和发现成本。

## 已接受方案

### Coding Context Butler

- 中文描述：代码上下文管家。
- `Coding` 保留项目因 coding 而生的核心定位，并覆盖 Claude Code、Cursor、Codex CLI、Gemini CLI 等 AI coding tools。
- `Context` 覆盖配置、instructions、MCP、Agents、Skills、rules 等完整 coding context。
- `Butler` 延续原产品的趣味、亲切感与用户认知，不把产品降格为抽象基础设施。
- 保留 `CCB` acronym 和现有技术 identity。

## 未采用方案

- `Config Control Base`：技术语义清晰，但品牌辨识度较弱，也没有保留 coding-first 的产品根基。
- `Cross-tool Configuration Butler`：传承 Butler 语义，但仍偏桌面助手，不足以表达规则平台。
- `Coding Configuration Bridge（编程配置桥）`：曾在修订 1 中采用，后因语义过于基础设施化、中文表达生硬且缺少产品性格被产品所有者否决。
- 使用泛化的 AI/cognitive 语义：覆盖范围较宽，但弱化了项目服务 AI coding workflows 的核心定位。

## 决策

采用 `CCB — Coding Context Butler（代码上下文管家）` 作为 v1.5.0 产品全称，保留：

- package name `ccb`
- user data directory `.ccb`
- appId `com.claudecode.butler`（v1.5.0 暂不改，避免 Windows identity/shortcut/update 迁移）
- repository path `ClaudeCodeButler`（先保留 redirect compatibility，再单独规划 rename）

逐步更新 display name、README、About、window title、installer productName 和文案。domain identifiers 使用 `tool/registry/artifact`，不得使用品牌名作为业务概念。

## 后续展示决策

以下事项不影响本 ADR 的 `Accepted` 状态，可在对应 UI/installer 实施阶段决定：

1. 中文界面展示“CCB”“代码上下文管家”或组合名称的具体层级。
2. v1.5.0 installer 显示 `CCB`，还是 `CCB - Coding Context Butler`。
3. repository rename 是否推迟到 v1.5.0 发布后，以降低代码迁移和链接失效风险。
