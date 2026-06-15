# Changelog

本文件记录 CCB (Claude Code Butler) 的所有显著变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本 Semantic Versioning](https://semver.org/lang/zh-CN/)。

发布产物与历史版本：[GitHub Releases](https://github.com/NianLog/ClaudeCodeButler/releases)

---

## [Unreleased] — v2.0 大版本重构（安全重做 + 性能优化 + 质量基建）

基于 v1.3.2 全量审计（4 维度：安全/架构/性能/功能）的系统性重做。规划详见 [`docs/v2.0/`](./docs/v2.0/)。

### Security（安全重做）
- **[P0]** 移除传统代理 fallback：其无鉴权 + CORS 全开构成上游 API Key 越权使用风险，现只保留带 accessToken 鉴权的集成模式
- **[P0]** 三服务（config/agents/skills）存在性检查反模式修复：原 `fs.access` 与主动 throw 共用 catch 导致同名创建静默覆盖，现独立捕获 ENOENT（蟑螂同修）
- **[P0]** rule-storage 持久化改为原子写（temp+rename）+ 失败抛错：原 catch 吞错导致规则静默丢失
- **[P1]** 新增 `command-executor` 基础设施（参数化 spawn shell:false + 元字符黑名单 + 审计），rule-engine 与 environment-check 自定义命令接入，消除任意 shell 执行 RCE
- **[P1]** 新增 SSRF 防护（`ssrf-guard`）：fetchUrl 拒绝环回/内网/链路本地地址（127/10/192.168/172.16/169.254/localhost）
- **[P1]** 集成代理移除 CORS 全开 + 日志 content 截断（`truncateContentForLog`），避免完整上游响应广播到所有渲染窗口
- **[P1]** project-management 会话读取接口补路径校验（`resolveSafeChildPath`），消除路径穿越；移除 sessionId 子串放宽
- **[P1]** 托管模式重启改为 Promise 链串行化，消除连续操作竞态导致的 settings.json 错误还原
- **[P2]** rule-engine cron 表达式边界校验（time 正则 + days 非空，scheduleRule/create/update 三重防护）
- **[P2]** managed-mode disable 还原顺序修正（避免二次还原更旧备份）+ calibrate 校准启用时无备份警告

### Performance（性能优化，解决内存三大根因）
- **[P0]** Monaco Editor worker 正确配置（vite `?worker` 真实语言 worker），修复原空 blob 导致语法诊断退回主线程，编辑器内存 **-30~80MB**
- **[P0]** ClaudeCodeAnalytics 去除 JSONL 临时拷贝，改为 `createReadStream` 只读直读，分析期峰值 **-100~300MB**
- 托管日志 body 截断（2KB 上限），解决完整 HTTP 请求/响应体驻留内存
- ProjectManagement 改用 `PrismAsyncLight` 按需注册语言（bash/json/markdown），包体积 **-500KB+**
- 窗口启用 `backgroundThrottling`，托盘隐藏时降低后台 CPU
- 修复 App.tsx 托盘切换监听器累积泄漏（onSwitchConfig 返回 unsubscribe + cleanup 调用）

### Added
- 安全基础设施：`utils/command-executor.ts`、`utils/ssrf-guard.ts`
- 测试基础设施：`vitest.config.ts` + `@vitest/coverage-v8`（v8 覆盖率收集）
- 托管模式运维手册 [`docs/14-托管模式运维手册.md`](./docs/14-托管模式运维手册.md)（Runbook + 回滚预案）
- 架构决策记录 [`docs/adr/`](./docs/adr/)（4 份 ADR）
- v2.0 规划文档 [`docs/v2.0/`](./docs/v2.0/)（PRD + 架构设计 + 实施路线图）
- 托管模式代理转换器单元测试（28 项，覆盖 4 provider + 工厂路由）
- command-executor 单元测试（13 项，含元字符注入防护）、rule-storage 单元测试（2 项）

### Fixed
- OpenRouter 转换器 `max_tokens=0` 下限保护边界缺陷（被 falsy 短路跳过）
- `.gitignore` 错误忽略 `docs/` 导致 27 个项目文档未纳入版本控制
- 清理 `TerminalLogViewer.tsx.bak` / `.bak2` 残留备份文件
- 全局修复 antd 静态 Modal/message 警告：AutomationPanel/EnvironmentCheckPanel/ModernConfigPanel 的 `Modal.xxx` → `App.useApp().modal`，message 类组件统一 `useMessage` hook（消除控制台 `Static function can not consume context` 警告）

### 验收反馈优化（v2.0 测试反馈）
- MCP 校验全面放宽：移除前端+后端强制字段校验（command/url），新增 `rawConfig` 透传机制——前端将原始 JSON 直接传给后端，后端原样写入 `.claude.json`，完整保留 `{url, headers}` 等 Claude Code 原生格式的所有字段
- 配置激活热重载：切换配置时先写随机假 `ANTHROPIC_BASE_URL`，延时 1s 后写真实配置，强制 Claude Code 热重载（解决同 baseUrl 仅换 key 不重载）
- 自动化规则 custom-command 执行成功后推送通知（自动/手动触发均通知，增强用户感知）
- 修复规则通知推送：sendNotification 改用 Electron `Notification` API 主进程直接显示系统通知（原仅 `webContents.send` 但 renderer 无对应监听，链路断裂导致无系统消息）

### Architecture（架构解耦，Phase 3 进行中）
- 新增基础设施层：`utils/atomic-json-writer.ts`（原子写 + 容错读）、`path-manager` 扩展 `.claude` 路径常量（userSettingsPath/claudeJsonPath/claudeMdPath/claudeProjectsDir）
- ManagedModeService 渐进拆分第一步：提取 `ManagedModeConfigStore`（配置读写 + accessToken 生成），ManagedModeService 委托保持 26 个 IPC 调用点零感知；配置写入改原子（temp+rename）
- config-service 清理 13 处内联 `require` 反模式，统一顶部 import + 接入 pathManager 常量

### Changed
- CI 质量门禁加固：test 增加 `--coverage` + artifact 上传；lint 补充治理注释
- 测试用例 13 → **60 项**（command-executor 13 + rule-storage 2 + transformers 28 + ConfigStore 4 + 原 13）
- 移除传统代理 fallback 整条 dead code（spawn/Utf8LineDecoder/parseAndEmitLog/emitLog/waitForServiceReady 等）
- 清理本地构建产物 ~1.6GB 与临时日志

### Known Issues / 待办
- P1.6 依赖升级（express 4→5、axios CVE、npm workspaces 合并）独立分支处理
- Phase 3 架构解耦（ManagedModeService 2053 行上帝服务拆分、JsonStore/pathManager 基础设施提取）待进行

---

## [1.3.2] - 2026-03-22

### Added
- 文档体系全面同步至 v1.3.2 阶段（`docs/README.md` 索引更新）
- Windows 开发日志 UTF-8 乱码排查与修复记录
- Portable 启动慢根因确认与安装版方案补充

### Changed
- 新建配置默认模板优化；配置复制延迟到保存时创建并增加防重名处理
- MCP 远程服务器配置支持与启用态可用性验证

---

## [1.3.0] - 2026-01-22

### Added
- 子 Agent 管理功能
- Skill 管理功能
- 环境检查功能

---

## [1.2.2] - 2025-12-02

### Fixed
- 修复托管模式配置同步和重启机制问题
- 添加 `package-lock.json` 并修复 CI/CD 配置（解决 GitHub Actions 依赖锁定与 native modules 问题）

---

## [1.2.0] - 2025-12

> 注：此版本无独立 release 提交，特性并入 v1.2.2 修复周期。托管模式稳定性与 CI/CD 基础建设阶段。

---

## [1.1.5] - 2025-11-30

### Added
- MCP 服务器管理功能

### Changed
- 托管模式日志轮转机制
- Claude Code 版本信息管理优化

---

## [1.1.2] - 2025-11-30

### Fixed
- 托管模式日志持久化和性能优化

---

## [1.1.0] - 2025-11-30

### Added
- 项目初始化（`chore: initial project setup`）
- 配置文件管理（多类型：claude-code / mcp-config / project-config / claude-json / claude-md）
- 自动化规则引擎（定时 / 文件变化 / 应用事件触发）
- 项目管理
- 统计分析（含 Claude Code JSONL 日志解析）
- 托管模式（API 上游热切换，代理服务器 + Transformer 转换器）

---

[Unreleased]: https://github.com/NianLog/ClaudeCodeButler/compare/v1.3.2...HEAD
[1.3.2]: https://github.com/NianLog/ClaudeCodeButler/releases/tag/v1.3.2
[1.3.0]: https://github.com/NianLog/ClaudeCodeButler/releases/tag/v1.3.0
[1.2.2]: https://github.com/NianLog/ClaudeCodeButler/releases/tag/v1.2.2
[1.2.0]: https://github.com/NianLog/ClaudeCodeButler/compare/v1.1.5...v1.2.2
[1.1.5]: https://github.com/NianLog/ClaudeCodeButler/compare/v1.1.0...v1.2.0
[1.1.2]: https://github.com/NianLog/ClaudeCodeButler/compare/v1.1.0...v1.1.5
[1.1.0]: https://github.com/NianLog/ClaudeCodeButler/releases/tag/v1.1.0
