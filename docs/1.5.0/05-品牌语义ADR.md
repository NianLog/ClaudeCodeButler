# ADR：CCB 品牌语义升级

## 状态

Provisional — 等待产品所有者最终确认。

## 背景

`Claude Code Butler` 准确描述了项目早期目标，但 v1.5.0 将管理范围扩展到多 AI 工具和动态规则库。继续使用旧全称会产生三个问题：

1. 用户会误以为非 Claude Code 配置属于附加或非官方能力。
2. domain/API 命名容易继续围绕 Claude 扩展，阻碍通用架构。
3. 品牌愿景仍是“单工具助手”，无法表达配置桥接与控制平面价值。

同时，`CCB`、仓库名、`.ccb` 数据目录、GitHub links、appId 和用户认知已有稳定价值，直接更换缩写会引入迁移和发现成本。

## 候选

### A. Cognitive Configuration Bridge（建议）

- 中文建议：智能配置桥。
- `Cognitive` 表达 AI/cognitive tools 范围，不绑定某个 vendor。
- `Configuration Bridge` 表达跨工具、跨格式连接与治理。
- 保留 `CCB` acronym 和现有技术 identity。

### B. Config Control Base

- 中文建议：配置控制基座。
- 技术语义清晰，但品牌辨识度和 AI 属性较弱。

### C. Cross-tool Configuration Butler

- 中文建议：跨工具配置管家。
- 传承 Butler 语义，但仍偏桌面助手，不足以表达规则平台。

## 建议决策

采用 `CCB — Cognitive Configuration Bridge` 作为 v1.5.0 产品全称，保留：

- package name `ccb`
- user data directory `.ccb`
- appId `com.claudecode.butler`（v1.5.0 暂不改，避免 Windows identity/shortcut/update 迁移）
- repository path `ClaudeCodeButler`（先保留 redirect compatibility，再单独规划 rename）

逐步更新 display name、README、About、window title、installer productName 和文案。domain identifiers 使用 `tool/registry/artifact`，不得使用品牌名作为业务概念。

## 需要产品所有者确认

1. 是否确认英文全称 `Cognitive Configuration Bridge`？
2. 中文展示使用“智能配置桥”还是保留英文 CCB 不翻译？
3. v1.5.0 installer 是否显示 `CCB`，还是 `CCB - Cognitive Configuration Bridge`？
4. 仓库 rename 是否推迟到 v1.5.0 发布后，以降低代码迁移和链接失效风险？
