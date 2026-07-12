# CCB v1.5.0 产品需求文档（PRD）

## 1. 背景

v1.4.0 已完成 Claude Code 场景的安全、性能与架构治理，但 domain model 仍把 `.claude`、`CLAUDE.md`、`settings.json`、MCP、Agent、Skill 和 analytics 直接写入 service、IPC 与 renderer。继续为 Cursor、Codex CLI、Gemini CLI 或未来工具添加 enum 与分支，会形成 `N tools × N features` 的维护矩阵。

v1.5.0 将 CCB 转向“规则驱动的配置控制平面”：应用提供稳定、安全的通用能力，规则库描述工具、配置资产、路径、格式、检测方式和能力映射。工具规则变化时优先更新规则库，而不是重发应用。

## 2. 产品愿景

让用户在一个本地优先的桌面应用中发现、理解、备份、验证和管理多个 AI 工具的配置；让维护者通过受约束的 JSON 规则演进适配，而不是不断复制业务代码。

品牌继续使用原始名称 `CCB — Claude Code Butler`。名称记录项目起源，但不再作为 domain boundary；多 AI Agent 工具通过通用 registry、artifact 与 capability model 接入，产品范围由架构和功能说明表达，而不是强行改写缩写寓意。

## 3. v1.5.0 目标

### 3.1 规则驱动平台

- 建立 versioned registry manifest 与 rule bundle JSON protocol。
- 内置 Claude Code adapter，确保现有用户无感迁移。
- 支持工具 detection、config artifact discovery、format、validation profile、backup/restore 与 capability 声明。
- 支持内置规则与已安装远程规则合并；同 `toolId` 只允许显式、可回滚的版本覆盖。
- 应用更新检查流程可同时检查 registry manifest，但不自动下载 rule bundle。
- 用户可查看规则库当前版本、可用版本、来源、hash、兼容性和更新说明，并明确触发更新。

### 3.2 性能增强

- 建立 cold start、renderer ready、idle working set、tray-hidden working set、main/renderer process CPU、watcher count、initial bundle 与 lazy chunk 基线。
- 降低启动期不必要 service initialization、目录扫描和大型 module loading。
- 将工具扫描按 adapter/capability 懒加载；未启用工具不得启动 watcher 或解析其配置。
- 规则库解析一次后按 `registryVersion + appVersion` 缓存，不在 renderer 重复持有完整规则对象。
- 保持 v1.4.0 安全门禁与 0 dependency vulnerabilities 基线。

### 3.3 业务与模板更新

- 默认模板从全局单例升级为 artifact-specific template。
- Claude Code 内置规则和模板作为兼容基线，后续可通过 registry 更新声明式字段。
- 规则不能覆盖用户本地模板；更新时保留 user override，并提供差异预览。

## 4. 非目标

以下能力不纳入 v1.5.0，避免首版平台化失控：

- 不开放远程 JavaScript、shell、PowerShell、AppleScript、WASM 或 native plugin。
- 不建立公开社区 marketplace、评分、账号或云同步。
- 不承诺 v1.5.0 首发适配所有 AI 工具；首发以 Claude Code 完整兼容和一个只读示例 adapter 验证通用性。
- 不在规则中表达任意网络请求、任意正则或复杂迁移脚本。
- 不一次性重写 Config/MCP/Agent/Skill/Managed Mode 全部 UI。

## 5. 核心用户故事

1. 作为现有 Claude Code 用户，升级后仍能看到并管理原配置，且无需手工迁移 `.ccb` 数据。
2. 作为多工具用户，我能看到本机检测到的 AI tools，并选择启用管理范围。
3. 作为谨慎用户，我能自动获知规则库有更新，但只有点击确认后才下载和安装。
4. 作为维护者，我能通过 JSON 增加一个使用已支持 format/capability 的工具，而不修改 renderer/main code。
5. 作为维护者，我不能通过规则库下发可执行代码或越过批准的路径变量。
6. 作为性能敏感用户，禁用的工具不会启动 watcher、扫描目录或增加长期驻留对象。

## 6. 功能需求

### FR-1 Registry lifecycle

- 内置 registry 永远可用，远程更新失败不影响应用启动。
- Installed registry 使用原子写入；安装成功前保留 last-known-good。
- Manifest check 与 bundle download 分离。
- 所有 version 使用 strict SemVer；schema 与 minimum app version 必须兼容。

### FR-2 Tool and artifact discovery

- `toolId`、`artifactId` 为 lowercase kebab-case stable identifiers。
- path 使用受限 variables（如 `${HOME}`、`${APPDATA}`、`${XDG_CONFIG_HOME}`）和 platform variants。
- discovery 只支持 `FILE`、`DIRECTORY`、`COMMAND_EXISTS` 等内置 detector types。
- artifact format 首版支持 `JSON`、`JSONC`、`YAML`、`TOML`、`MARKDOWN`、`TEXT`；只有应用已实现 parser 的 format 才可写入/验证。

### FR-3 Capability model

- 首版 capability：`DISCOVER`、`READ`、`VALIDATE`、`EDIT`、`BACKUP`、`RESTORE`、`ACTIVATE`、`WATCH`。
- capability 必须由应用内置 handler registry 实现；规则仅声明使用，不提供 handler body。
- 高风险 capability（`ACTIVATE`、`WATCH`）必须有额外 compatibility 和 path policy 检查。

### FR-4 Compatibility

- Claude-specific service 在迁移期可保留 facade，但新增代码必须依赖通用 `ToolRegistryService` 与 `ConfigArtifactService` contract。
- 原 `ConfigType` 不继续增加 tool-specific enum；逐步替换为 `toolId + artifactId + format`。
- `.ccb/claude-configs` 数据目录 v1.5.0 只读兼容并迁移到 `.ccb/workspaces/claude-code`，迁移需幂等、可回滚；在迁移实现完成前不得删除旧目录。

## 7. 性能与质量指标

性能数字必须由相同机器、相同数据集、production build、三次运行的 median 生成。首次人工验收前只建立采集工具，不填写虚假结果。

| 指标 | v1.5.0 目标 |
| --- | --- |
| Cold start to renderer ready | 相对 v1.4.0 baseline 降低至少 20% |
| Idle total working set | 相对 baseline 降低至少 15% |
| Tray-hidden total working set | 相对 baseline 降低至少 20% |
| Disabled adapter background watchers | 0 |
| Initial renderer JS | 不高于 v1.4.0；新增 registry UI 必须 lazy chunk |
| Registry manifest check | <= 50 KB response，15 s timeout，失败不阻塞启动 |
| Rule bundle default limit | <= 2 MB，超过拒绝 |
| Automated tests | 新 domain >= 80% statements；full suite 不回退 |
| Security | Semgrep 0 unsuppressed findings；npm audit 0 vulnerabilities |

## 8. 发布验收

- Claude Code 的配置扫描、编辑、备份、激活、MCP、Agent、Skill 和 managed mode 关键路径无回归。
- 至少一个第二工具的只读 adapter 仅通过 JSON rule 加载并完成 detection/artifact discovery。
- 远程 bundle 的 hash mismatch、schema mismatch、downgrade、oversize、unknown capability 均被拒绝。
- manifest 检查不会自动安装 bundle；离线启动使用 last-known-good。
- 性能报告包含原始样本、环境和 median，不只给百分比结论。
