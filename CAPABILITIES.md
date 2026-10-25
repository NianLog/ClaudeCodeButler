# CAPABILITIES.md — 能力清单与成熟度

> 活文档。新增/修改用户可见功能、registry capability、adapter 时，必须在同一提交更新本文件。
> 更新时间：2026-10-25（1.5.1 未发布候选；v1.5.0 已发布）。

> 当前验收状态：三批补修完成；57 files / 555 tests（含 19 个原反例）、19 组真实 Electron 流程通过，无跳过/未捕获异常。干净源码 37e020e 的未签名 Portable/NSIS/ZIP 已核验载荷/ASAR/SBOM/摘要，暂不发布；目标机、云 CI 和跨平台验收分别记录。

恢复边界：MCP 页按服务器恢复并保留其他当前配置；原生文件页明确按整文件恢复，先处理草稿、查看差异并备份当前版本。文件缺失仍可查受控历史；旧无历史摘要副本明确提示。旧 Skill/子 Agent 表单更新保留附件、未知权限字段与原路径，保存过期版本会被拒绝。

发现边界：按当前资源种类先检查默认位置，优先使用四管理目标的有效 registry 自定义路径；单个坏项不挡住正常项，显示诊断并禁止覆盖。共享链接只在真实目标再次授权后作为只读引用，达到扫描预算的集合禁止写入。新增六来源为已确认原生/兼容 profile；TRAE 全局、桌面私有配置和扩展角色未确认时明确受限，不能等价迁移的权限保持 BLOCKED，详见[格式依据](.agents/notes/implemented/bug-fix/2026-10-25-resource-management-closure.md)。

交互边界：自动化规则、环境排查与设置归入“工具”，按操作自身目标运行；四主题保持原身份。旧编辑保存保留正文空白，失败常驻提示且留稿；原生文件支持精确打开/创建多个候选中的指定位置，不把缺失第二候选写成首路径。

状态标记：`稳定`（v1.4.0 已发布且回归通过）｜`1.5.0 新增`（本版落地，待实机验收）｜`基础`（foundation 完成，能力受限）｜`规划`（未实现）。

内嵌运行时门禁（2026-10-25）：复核确认当前 Electron 45 尚未包含七项 Node 24 上游修复；TLS/DNS 旧行为在实际候选中可复现。Brotli 已有修复证据，c-ares/Undici 另有公告版本风险。功能与依赖 audit 通过不表示该门禁通过；签名、安装/覆盖升级/卸载按用户要求暂缓，未发布。见[运行时 DDE](.agents/notes/implemented/process/2026-10-25-latest-stable-dependency-upgrades.md)。

## 1. 面板级功能矩阵

网络缓解 B 已加入入口约束和真实下载/TLS 回归；快速重启不会被旧健康回调关闭。旧的未回补事实与当前应用风险分开跟踪，签名/安装仍暂缓，完整门禁及新候选验收继续。

网络安全补修 A：代理上的 HTTPS IP 目标按规范目标校验证书；下载预检禁用连接复用并释放响应，保留原有状态和超时反馈。51 项相关回归通过；B 批与完整/真实业务验收进行中，尚未重新打包或发布。见[网络缓解 DDE](.agents/notes/implemented/bug-fix/2026-10-25-reachable-node-network-mitigations.md)。

| 功能 | 说明 | 状态 |
| --- | --- | --- |
| 配置管理 | Claude Code 多类型配置（settings/claude.json/claude.md/项目配置）创建、编辑、复制、导入导出、备份、激活切换；Monaco 编辑器 + JSON/Markdown 校验；新建预填按 `USER_OVERRIDE > REGISTRY > EMBEDDED` 解析的 artifact 模板；1.5.1 header 全局选择器统一该工作区、配置集和资源管理目标 | 稳定（模板来源机制与工具下拉框 1.5.0 新增） |
| 多工具配置集 | registry `configSet` 声明驱动的命名快照：创建（live 内容，缺失文件回退默认模板）、逐文件编辑、激活（全组校验后逐文件授权/备份/原子写）、删除、isInUse 比对、名称搜索；配置页与托盘快速切换菜单均可用，托管模式下激活被拦截 | 1.5.0 新增 |
| 云模板库 | Claude 配置面板与配置集面板共用的签名云模板通道：仅显示/导入**当前所选工具**的模板（跨工具模板不可见不可导入），一键导入；`CONFIG_SET` 模板导入为本地配置集（不动生效配置），`ARTIFACT` 模板保存为 artifact 默认模板覆盖。清单与 item 均经 Ed25519 签名 + pinned origin + 哈希校验，导入复用既有写路径 | 1.5.0 新增 |
| MCP 管理 | 四管理目标的用户级原生定义 CRUD/互导；Claude 旧高级面板保留项目/启用禁用/复制/归档/探测 | 1.5.1 扩展，旧通道保留 |
| 子 Agent / Skill 管理 | 四目标原生目录管理、互导与完整包恢复；Claude 高级面板保留 | 1.5.1 扩展 |
| 项目管理 | Claude 项目关联与会话读取（路径校验防护） | 稳定 |
| 统计分析 | Claude Code JSONL 日志流式解析，用量/模型/token 统计 | 稳定（生命周期竞态修复于 1.5.0） |
| 自动化规则 | 时间/文件变化/应用事件触发的条件-动作规则；custom-command 经 command-executor 参数化执行 + 系统通知 | 稳定 |
| 环境检查 | Claude Code 及相关工具版本检测 | 稳定 |
| 托管模式 | 主应用为 accessToken 鉴权的 Anthropic 兼容本地代理、上游热切换、日志与诊断；独立包另有 4 类转换器及明确的协议子集 | 集成模式稳定；独立包 1.5.1 C 批修复，真实服务商待验 |
| 原生配置文件（配置页） | 原 AI 工具面板迁入配置管理：检测、artifact 发现、raw 查看、校验、编辑、备份恢复，全部 capability-aware | 1.5.0 新增（懒加载） |
| 设置 | 主题/语言/终端/编辑器偏好；registry 版本检查、确认安装与回滚；artifact 模板覆盖管理（三方 diff 预览） | 模板与 registry 控件 1.5.0 新增 |
| 性能快照 | About/Performance 按需导出 per-process CPU/内存、renderer timings、watcher/scan runtimeMetrics | 1.5.0 新增（本地存储，不上传） |
| 单实例运行 | CCB 仅允许一个进程：二次启动自动退出并恢复/聚焦已有窗口，弹系统通知提示 | 1.5.0 新增 |
| 系统通知应用名 | Windows 通知显示 "Claude Code Butler/CCB" 应用身份而非原始 AUMID 包名 | 1.5.0 修复 |

## 2. Registry 能力模型（v1.5.0 核心）

能力动词（allowlist 封闭集合，未知即拒绝）：`DISCOVER`、`READ`、`VALIDATE`、`EDIT`、`BACKUP`、`RESTORE`；1.5.1 扩展 `MANAGE_MCP`、`MANAGE_DIRECTORY`。

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

## 5. 1.5.1 安全可靠性修复

现有工具、路径、配置格式及 LEGACY_COMPAT 不变。本批修复并发临时文件冲突、无效配置集仍可保存/激活、首次创建配置失败、备份失败仍覆盖、设置保存失败显示成功等问题。设置全部保存先完整校验后单次替换；读取损坏文件会明确失败并保留原文。

托管模式启用/重启写入失败、停止/禁用还原失败均返回错误；系统设置损坏、非对象或不可读时不覆盖。重启按钮等待真实 IPC 成功，切换服务商检查结果并刷新状态，避免只显示成功或重复重启。

重启不再用旧健康连接判断端口占用；停止给请求 3 秒宽限后关闭剩余连接，并等待端口实际释放。已在本地生产构建中验证成功重启、错误反馈和配置准确还原。

配置监控只忽略监控根目录内部的隐藏项，`.ccb` 等隐藏祖先不会导致整个目录被排除。实际监听与原事件契约通过真实文件系统回归验证；本次不增加 renderer 自动刷新行为。

普通代理请求不会在收到响应头后无限等待正文，客户端断连会取消上游；成功 SSE 的长静默保持兼容。版本读取限定固定 CCB 地址。跨文件激活仍是逐文件写入，磁盘故障时可能已完成前几个文件，依赖既有逐文件备份恢复。

正式 Windows 发布要求签名有效、ASAR 完整性、依赖审计、预检、回归和双构建；附 SHA-256、依赖 SBOM 和来源证明。

C 批为独立 proxy 补上本地 accessToken 校验及按协议转发：Anthropic 直通，DeepSeek/OpenRouter 普通文本与函数工具往返，Gemini 原生文本/图片输入与文本输出；均提供相应 SSE 路径。Gemini 工具、原生思考状态及其他不能无损映射的字段明确拒绝，详细边界见 [独立包说明](src/proxy-server/PROTOCOL.md)。这些原生转换不适用于主应用集成代理。

Skill 两种导入入口先暂存和校验，再备份替换；失败恢复原目录，恢复失败报告保留的备份位置。原路径、默认不覆盖及批量结果接口保持兼容。新增导入大小、文件数量、编码和链接限制，避免不完整或越界内容覆盖现有 Skill。


## 6. 1.5.1 全局管理与跨工具导入（2026-10-25）

Header 唯一全局目标：Claude Code / Codex CLI / Gemini CLI / Antigravity。配置管理保留旧工作区、配置快照、原生文件验证/编辑/备份/恢复；切换只读配置，不激活或搬迁数据。MCP、Skill、子 Agent 共用目标，不再各自选择。

| 工具 | 管理 MCP / Skill / 子 Agent | 导入来源 | 边界 |
| --- | --- | --- | --- |
| Claude Code | 三类用户级原生资源 | 三类，另含项目来源 | 旧项目、归档、高级导入导出保留 |
| Codex CLI | 三类；MCP/角色为 TOML | 三类 | 保留原 .codex 路径及现有 .agents Skill 候选 |
| Gemini CLI | 三类 | 三类 | 原生 enablement/allowed/excluded 纳入判断；远程角色不强行转换 |
| Antigravity | 三类 | 三类 | 保留现有原生目录候选；变量展开证据不足时提示 |
| Cursor / Qoder / WorkBuddy | 无 | MCP / Skill / 子 Agent | WorkBuddy 只识别公开 CodeBuddy 文件 |
| TRAE / Pi | 无 | MCP / Skill | 通用子 Agent 原生规范未核实，明确阻止 |

OpenCode 也是只读导入来源，支持 MCP、Skill、子 Agent。项目/手选来源经主进程 picker 授权；TRAE 全局 MCP 需手选。十款来源的官方格式依据见 [.agents 导入记录](.agents/notes/implemented/feature/2026-10-25-agent-import-and-global-context.md)。

导入按选择→差异/约束预览→逐项收据执行；冲突默认跳过，可显式备份替换或重命名。预览遮蔽已配置凭据，不读取系统环境秘密或迁移 OAuth 会话。不能等价的权限/认证/变量/模型/工具限制逐项阻止，不能理解为全部格式无损转换。“已配置”只确认定义存在，不代表真实运行通过。

Skill/角色通过同一受控预览流程从本机备份恢复；MCP 复用原生文件历史备份，恢复为整文件覆盖。保存失败保留草稿；离开模块/切换/退出统一处理未保存内容，草稿仅保留在本进程内存，没有磁盘自动草稿。四主题 ID 与持久化保持，字重、数字、焦点、色阶及 reduced-motion 同步更新。

新增 registry 能力仅供 minimumAppVersion>=1.5.1，旧自定义路径与权限保留；其他新来源不出现在写入目标中。用户路径、旧备份、用户数据均不迁移。实际十款客户端、账号和其他 OS 的运行仍未验收。

JSON 格式化保留数字字面量、转义、重复键和原换行，支持一步撤销；Markdown/纯文本按原文编辑，取消旧空行重排。主进程原生结构/危险键验证保持。
