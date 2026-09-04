# CAPABILITIES.md — 能力清单与成熟度

> 活文档。新增/修改用户可见功能、registry capability、adapter 时，必须在同一提交更新本文件。
> 更新时间：2026-09-04（v1.5.0 开发中，基线提交 `d7ea569`）。

状态标记：`稳定`（v1.4.0 已发布且回归通过）｜`1.5.0 新增`（本版落地，待实机验收）｜`基础`（foundation 完成，能力受限）｜`规划`（未实现）。

## 1. 面板级功能矩阵

| 功能 | 说明 | 状态 |
| --- | --- | --- |
| 配置管理 | Claude Code 多类型配置（settings/claude.json/claude.md/项目配置）创建、编辑、复制、导入导出、备份、激活切换；Monaco 编辑器 + JSON/Markdown 校验；新建预填按 `USER_OVERRIDE > REGISTRY > EMBEDDED` 解析的 artifact 模板；v1.5.0 顶部工具下拉框可在该工作区通道与多工具配置集通道间切换 | 稳定（模板来源机制与工具下拉框 1.5.0 新增） |
| 多工具配置集 | registry `configSet` 声明驱动的命名快照：创建（live 内容，缺失文件回退默认模板）、逐文件编辑、激活（全组校验后逐文件授权/备份/原子写）、删除、isInUse 比对、名称搜索；配置页与托盘快速切换菜单均可用，托管模式下激活被拦截 | 1.5.0 新增 |
| 云模板库 | Claude 配置面板与配置集面板共用的签名云模板通道：仅显示/导入**当前所选工具**的模板（跨工具模板不可见不可导入），一键导入；`CONFIG_SET` 模板导入为本地配置集（不动生效配置），`ARTIFACT` 模板保存为 artifact 默认模板覆盖。清单与 item 均经 Ed25519 签名 + pinned origin + 哈希校验，导入复用既有写路径 | 1.5.0 新增 |
| MCP 管理 | 全局/项目级 MCP server 管理，本地 command 型与远程 http 型，启用/禁用/复制/归档/可用性验证 | 稳定 |
| 子 Agent / Skill 管理 | `.claude` 下 agents/skills 的清单与管理面板 | 稳定 |
| 项目管理 | Claude 项目关联与会话读取（路径校验防护） | 稳定 |
| 统计分析 | Claude Code JSONL 日志流式解析，用量/模型/token 统计 | 稳定（生命周期竞态修复于 1.5.0） |
| 自动化规则 | 时间/文件变化/应用事件触发的条件-动作规则；custom-command 经 command-executor 参数化执行 + 系统通知 | 稳定 |
| 环境检查 | Claude Code 及相关工具版本检测 | 稳定 |
| 托管模式 | accessToken 鉴权的本地代理，API 上游热切换，4 provider transformer（Anthropic/OpenRouter/DeepSeek/Gemini），日志轮转与诊断 | 稳定（传统无鉴权 fallback 已于 v1.4.0 移除） |
| AI 工具配置面板 | registry 驱动的通用工具面板：检测、artifact 发现、raw 查看、校验、编辑、备份恢复，全部 capability-aware | 1.5.0 新增（懒加载） |
| 设置 | 主题/语言/终端/编辑器偏好；registry 版本检查、确认安装与回滚；artifact 模板覆盖管理（三方 diff 预览） | 模板与 registry 控件 1.5.0 新增 |
| 性能快照 | About/Performance 按需导出 per-process CPU/内存、renderer timings、watcher/scan runtimeMetrics | 1.5.0 新增（本地存储，不上传） |
| 单实例运行 | CCB 仅允许一个进程：二次启动自动退出并恢复/聚焦已有窗口，弹系统通知提示 | 1.5.0 新增 |
| 系统通知应用名 | Windows 通知显示 "Claude Code Butler/CCB" 应用身份而非原始 AUMID 包名 | 1.5.0 修复 |

## 2. Registry 能力模型（v1.5.0 核心）

能力动词（allowlist 封闭集合，未知即拒绝）：`DISCOVER`、`READ`、`VALIDATE`、`EDIT`、`BACKUP`、`RESTORE`。

### 2.1 内置 adapter 状态

| Tool | artifact | 格式 | 能力 | 状态 |
| --- | --- | --- | --- | --- |
| Claude Code | `user-settings`（`~/.claude/settings.json`） | JSON | 全部六项 | 1.5.0 新增（兼容 v1.4 直连通道并存） |
| Claude Code | `mcp-registry` | JSON | 全部六项 | 1.5.0 新增 |
| Claude Code | `global-instructions`（CLAUDE.md） | MARKDOWN | 全部六项 | 1.5.0 新增 |
| Codex CLI | `user-config`（`~/.codex/config.toml`） | TOML | 全部六项（`TOML_FILE_V1`） | 1.5.0 放开写入（smol-toml parse 校验 + 原文写回保注释） |
| Codex CLI | `auth`（`~/.codex/auth.json`） | JSON | 全部六项 | 1.5.0 新增（API key / ChatGPT token 刷新元数据；敏感文件不进日志/统计） |
| Codex CLI | `agents-instructions`（`~/.codex/AGENTS.md`） | MARKDOWN | DISCOVER/READ/EDIT/BACKUP/RESTORE | 1.5.0 新增（用户记忆文件为 AGENTS.md，非 CLAUDE.md） |
| Gemini CLI | `user-settings`（`~/.gemini/settings.json`） | JSON | 全部六项 | 1.5.0 新增 |
| Gemini CLI | `env`（`~/.gemini/.env`） | TEXT | 全部六项 | 1.5.0 新增（`GEMINI_API_KEY`） |
| Gemini CLI | `instructions`（GEMINI.md） | MARKDOWN | DISCOVER/READ/EDIT/BACKUP/RESTORE | 1.5.0 新增 |
| Antigravity | `global-mcp`（`~/.gemini/config/mcp_config.json`） | JSON | 全部六项 | 1.5.0 新增 |
| Antigravity | `cli-settings`（`~/.gemini/antigravity/settings.json`） | JSON | 全部六项 | 1.5.0 新增 |

**关联编辑（editGroup）**：同工具同 `editGroup` 的 artifact（每组 ≤4）在 UI 聚合为一个配置集面板分页编辑；保存时先全组 VALIDATE，全部通过后顺序逐文件走既有 authorize→backup→原子写链，任一失败即中止（已写文件保留各自备份可恢复）。Codex `config.toml + auth.json`（`core` 组）与 Gemini `settings.json + .env + GEMINI.md`（`core` 组）为首批配置集。registry 声明但尚未存在的文件可经 EDIT 以默认模板创建（父目录链仍拒绝 symlink；renderer 对缺失文件传空 requestedPath，由主进程解析声明的主候选路径）。

**配置集快照（configSet）**：同工具内 `configSet` 相同的 artifacts（每组 ≤4）构成可整体快照/切换的运行时配置单元，与 `editGroup`（编辑时 UI 聚合）语义正交。快照存于 `<CCB 数据目录>/config-sets/<toolId>/<set-uuid>/`（set.json 元数据 + `<artifactId>.txt`），目录以随机 setId 寻址、显示名仅存元数据，杜绝名字→路径注入；激活 = 先全组 VALIDATE 再逐文件 editArtifact，不引入新写路径；isInUse = live 内容逐文件比对。内置 registry v1.2.0 为 Codex（user-config+auth）、Gemini（user-settings+env）、Antigravity（cli-settings）声明 `core` 配置集；claude-code 走专用工作区通道（含热重载切换），刻意不声明 configSet。

### 2.2 通用基础设施

- **Detector**：`COMMAND_EXISTS`（`execFile` + `shell:false`）、`PATH_EXISTS`，无 shell 注入面。
- **Path resolver**：受控模板变量（`HOME`/`APPDATA`/`LOCALAPPDATA`/`XDG_CONFIG_HOME`/`CCB_DATA`），拒绝 traversal/UNC/glob。
- **Discovery/Read**：registry-allowlisted 只读服务，拒绝 symlink 与 >1 MiB 文件。
- **Codec**：JSON/JSONC/YAML/MARKDOWN/TEXT/TOML 内置（TOML 为 smol-toml parse 校验 + 原文写回），bounded 校验 + 原子编辑。
- **Backup/Restore**：capability 驱动，per tool/artifact/path 默认 20 份 retention，串行 mutation queue，二次确认恢复，损坏/越权 metadata fail-closed 排除。
- **Template**：artifact 级模板服务，来源显示、独立覆盖、移除恢复、bounded diff；legacy 全局自定义模板自动迁移为 override。

### 2.3 远程 registry 更新链（全部 fail-closed）

Ed25519 detached 签名（pinned `keyId → SPKI`）→ SHA-256 → size → schema → SemVer → minimumAppVersion → downgrade policy → 原子安装；显式回滚：优先恢复 last-known-good 历史版本，首次安装后无历史 bundle 时回退 embedded 内置基线（已安装版本显示"仅使用内置规则"）；启动仅检查 manifest，bundle 下载需用户确认。云模板通道（`templates/v1`，见上表"云模板库"）复用同一条信任链：index 内嵌 canonical JSON Ed25519 签名 + 内容寻址 item 哈希校验，同样 fail-closed。

**发布前提**：远程 registry 分发采用离线 Ed25519 publisher key ceremony——私钥离线保存、永不入库，仅 SPKI public key 进入 `REGISTRY_TRUSTED_PUBLIC_KEYS`；release preflight 强制校验 trust map 中的 key 命名与来源，非 production 命名 keyId 一律拒绝进入正式发布。

## 3. 平台与交付

- 开发/交付以 Windows 为主（Portable / NSIS / ZIP 三产物）；macOS（dmg/zip）、Linux（AppImage/tar.gz）打包配置就绪但未纳入常规验收。
- 中英双语 UI；本地优先，无强制云依赖，无 telemetry。

## 4. 明确不在当前能力范围

Public marketplace、账号体系、云同步（云端存储用户自有配置的同步通道仍未实现；云模板库为只读签名分发 + 本地导入，不涉及用户数据上行）、远程可执行插件、`.ccb/claude-configs` 物理迁移（v1.5.0 共识，详见 ARCHITECTURE.md §6）。
