# ADR：CCB 品牌语义升级

## 状态

Accepted（修订 3）— 产品所有者决定保留原始名称 `Claude Code Butler`，不再为扩展范围强行改写 `CCB` 寓意。

## 背景

`Claude Code Butler` 准确描述了项目早期目标，但 v1.5.0 将管理范围扩展到多 AI 工具和动态规则库。继续使用旧全称会产生三个问题：

1. 用户会误以为非 Claude Code 配置属于附加或非官方能力。
2. domain/API 命名容易继续围绕 Claude 扩展，阻碍通用架构。
3. 品牌愿景仍是“单工具助手”，无法表达配置桥接与控制平面价值。

同时，`CCB`、仓库名、`.ccb` 数据目录、GitHub links、appId 和用户认知已有稳定价值，直接更换缩写会引入迁移和发现成本。

## 已接受方案

### Claude Code Butler

- 保留项目原始名称、用户认知和 `CCB` acronym。
- 名称用于记录产品起源，不再承担精确描述全部支持工具的职责。
- 多 AI Agent 配置管理范围通过产品副标题、UI 和文档表达。
- Domain model 继续使用 `tool/registry/artifact/capability`，不因品牌回退重新耦合 Claude。

## 未采用方案

- `Config Control Base`：技术语义清晰，但品牌辨识度较弱，也没有保留 coding-first 的产品根基。
- `Cross-tool Configuration Butler`：传承 Butler 语义，但仍偏桌面助手，不足以表达规则平台。
- `Coding Configuration Bridge（编程配置桥）`：曾在修订 1 中采用，后因语义过于基础设施化、中文表达生硬且缺少产品性格被产品所有者否决。
- `Coding Context Butler（代码上下文管家）`：曾在修订 2 中采用，但配置文件管理与 context 概念并不等价，语义偏离核心业务，后被产品所有者否决。
- 使用泛化的 AI/cognitive 语义：覆盖范围较宽，但弱化了项目服务 AI coding workflows 的核心定位。

## 决策

采用 `CCB — Claude Code Butler` 作为 v1.5.0 产品全称，保留：

- package name `ccb`
- user data directory `.ccb`
- appId `com.claudecode.butler`（v1.5.0 暂不改，避免 Windows identity/shortcut/update 迁移）
- repository path `ClaudeCodeButler`（先保留 redirect compatibility，再单独规划 rename）

逐步更新 display name、README、About、window title、installer productName 和文案。domain identifiers 使用 `tool/registry/artifact`，不得使用品牌名作为业务概念。

## 后续展示决策

以下事项不影响本 ADR 的 `Accepted` 状态，可在对应 UI/installer 实施阶段决定：

1. 中文界面以 `CCB` 或 `Claude Code Butler` 为主，副标题说明多 AI Agent 配置管理能力。
2. v1.5.0 installer 继续显示 `CCB`，避免不必要的安装 identity 变化。
3. repository rename 是否推迟到 v1.5.0 发布后，以降低代码迁移和链接失效风险。
