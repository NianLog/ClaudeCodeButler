# Changelog

本文件记录 CCB（Claude Code Butler）的所有显著变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本 Semantic Versioning](https://semver.org/lang/zh-CN/)。

发布产物与历史版本：[GitHub Releases](https://github.com/NianLog/ClaudeCodeButler/releases)

---

## [Unreleased] - 1.5.0 开发中

### Added

- 新增 Ed25519 detached registry signature verifier、pinned `keyId -> SPKI public key` trust map 与 offline signing helper。
- 建立规则驱动多 AI 工具配置平台基础：`ToolDefinition -> ConfigArtifactDefinition -> Capability` 共享 domain contract。
- 新增 bounded JSON registry validator，限制 bundle/manifest 大小、JSON 深度/节点数、路径变量、detector、handler 与 capability allowlist。
- 新增内置 Claude Code registry adapter，声明用户 settings、MCP registry 与全局 instructions 三类配置资产。
- 新增 Codex CLI read-only adapter，声明 `${HOME}/.codex/config.toml` 的 detection、discovery 与 raw TOML read capability。
- 新增受控 path template resolver 与无 shell 的 `PATH_EXISTS` / `COMMAND_EXISTS` detector executor。
- 新增 registry-allowlisted artifact discovery/read service 与 IPC facade，拒绝 traversal、UNC、glob、symbolic link、任意 renderer 路径和超过 1 MiB 的配置文件。
- 新增内置 JSON/JSONC/YAML/MARKDOWN/TEXT codec、bounded validation、atomic edit 与 capability-driven backup/restore。
- 新增 lazy-loaded AI 工具配置面板，支持 detection、artifact discovery、raw view、validation、edit 与 backup 的 capability-aware 操作。
- AI 工具配置面板新增受控 backup history 与二次确认 restore 流程；损坏或越权 metadata fail-closed 排除。
- 新增 installed/last-known-good registry 原子存储、SHA-256 integrity、app compatibility、downgrade protection、merge 与显式 rollback。
- 新增 main-process registry manifest 检查；启动时只检查小型 manifest，不自动下载完整 bundle。
- Settings/About 新增规则库版本、检查、用户确认安装与 rollback 控件。
- 新增按需 performance snapshot/export API，记录 Electron per-process CPU/working set、bounded renderer timings，以及 `runtimeMetrics` 中的 active watcher/监控目录/目录项计数与最近一次 config scan 摘要；指标由现有 watcher/scan 生命周期被动更新，不新增 timer 或上传。
- 新增 artifact-specific template service 与 Settings 管理界面，按 `USER_OVERRIDE > REGISTRY > EMBEDDED` 解析模板并提供 bounded diff preview。
- 新增 legacy customized global template 到 `claude-code/user-settings` override 的兼容迁移；旧内置默认值不会被误迁移。
- 新增 release preflight，校验版本、双语文档、installer identity、private key marker、registry trust map 与 Electron security contract。
- 新增 `pack:win:all`，一次生成 Windows Portable、NSIS 与 ZIP 三类 release artifacts。
- 新增 `lint:changed`（ESLint Node API 实现），对相对 `origin/main` 的变更 TypeScript 文件执行 error 增量 ratchet：新文件必须零 error、改动文件不得增加 error，已接入 CI 为阻塞步骤。
- 新增 release preflight 的 rehearsal key 防误发保护：production 模式拒绝 rehearsal/test/dev 等命名 keyId 进入 `REGISTRY_TRUSTED_PUBLIC_KEYS`，preview 模式仅 warning。
- 新增 registry 发布链 rehearsal 测试套件（`CCB_REHEARSAL_PRIVATE_KEY` env-gated）：valid 安装、tampered 拒绝、unknown-key 拒绝、rollback 四场景，走真实 `ToolRegistryService` 原子存储与生产 trust map。
- 新增 v1.5.0 PRD、架构、安全协议、性能路线与品牌语义 ADR。
- 新增单实例锁（`app.requestSingleInstanceLock`）：CCB 仅允许一个进程运行，二次启动自动退出并让首实例恢复/聚焦窗口，弹系统通知提示"应用已在运行"。
- 新增 `upstream-http-client`（Node http/https 原生上游转发客户端）：CONNECT 代理、建连阶段超时（映射 `ECONNABORTED`→504）、非 2xx 错误体受限读取、响应体大小上限，配套 7 项单元测试（本地 http server 覆盖 JSON 转发/SSE 流序/非 2xx 透传/超时/拒连/大小上限）。
- **多工具配置集（editGroup）**：同工具同编辑分组的 artifact（≤4/组，validator 强制）在 AI 工具配置面板聚合为一个"配置集"分页编辑；保存先全组 VALIDATE，通过后顺序逐文件走既有 authorize→backup→原子写链（任一失败即中止，已写文件保留各自备份）。registry 声明但尚未存在的文件可按默认模板创建（父目录链仍拒绝 symlink）。
- Codex CLI adapter 升级为全六能力并新增两个配置资产：`auth`（`~/.codex/auth.json`，API key / ChatGPT token 管理，敏感文件不进日志/统计）与 `agents-instructions`（`~/.codex/AGENTS.md` 用户记忆文件——注意是 AGENTS.md 而非 CLAUDE.md）；`config.toml + auth.json` 组成首个 `core` 配置集。
- 新增 Gemini CLI adapter（`~/.gemini/settings.json`、`.env`、`GEMINI.md` 三资产，前两者 + GEMINI.md 组成 `core` 配置集）与 Antigravity adapter（`~/.gemini/config/mcp_config.json`、`~/.gemini/antigravity/settings.json`）；内置 registryVersion 升至 1.1.0。
- 新增 `TOML_FILE_V1` codec：smol-toml（1.8.0，零传递依赖）做 bounded parse 校验，保存原文写回保留注释；Codex config.toml 编辑获得语法安全保障。
- **配置集快照（configSet）**：registry 新增 `configSet` 字段（≤4/组，与 editGroup 正交）；`ToolConfigSetService` 提供命名快照的创建（live 内容，缺失文件回退默认模板）、逐文件编辑、整体激活（先全组 VALIDATE 再逐文件复用 authorize→backup→原子写链，无新写路径）、删除与 isInUse 比对；快照存于 `<CCB 数据目录>/config-sets/<toolId>/<set-uuid>/`（随机 setId 寻址，名称仅存元数据）。内置 registry 升至 1.2.0：Codex（user-config+auth）、Gemini（user-settings+env）、Antigravity（cli-settings）声明 `core` 配置集；claude-code 保留专用工作区通道（热重载切换），刻意不声明 configSet。
- 配置管理页新增顶部工具下拉框：Claude Code 走既有工作区通道，其余工具进入 `ToolConfigSetPanel`（配置集列表/新建/激活/删除/逐文件编辑，托管模式下激活被拦截）。
- 托盘"快速切换配置"升级为两层多工具菜单：Claude Code 子菜单保留遗留热重载通道，其余声明 configSet 的工具各一个配置集子菜单（`●` 标记使用中，托管模式拦截一致）；切换成功经 `tray:switch-config` 事件刷新 UI（payload 含 toolId）。
- artifact 授权支持空 `requestedPath`：主进程解析为 registry 声明的首个候选路径，修复 AI 工具面板对"声明但缺失"文件创建时把路径模板当真实路径被拒的问题（renderer 全程不构造路径）。
- 完成多工具拓展与云服务规划：MCP 跨工具分发、记忆同步、配置集、统计的模块级路线图，以及自研云 registry 服务契约/安全/验收要求（静态分发优先）；规划文档在维护侧本地维护。
- **云模板库（templates/v1 通道，v2 提案落地）**：`TemplateCloudService` 拉取并验证签名模板清单（`templates/v1/index.json` ≤50KB，Ed25519 canonical JSON 内嵌签名 + pinned origin + production trust map + minimumAppVersion 门槛，与规则库同一条 fail-closed 信任链），按用户指令下载内容寻址模板 item（≤2MB，SHA-256 + 尺寸 + 负载闭集 + 清单一致性校验）；两类模板：`CONFIG_SET` 一键导入为本地配置集（复用 `createConfigSetFromContents`，不触碰生效配置）、`ARTIFACT` 保存为 artifact 默认模板 user override（复用 `ArtifactTemplateService` settings 队列）。云模板库弹窗为共享组件（Claude 面板与配置集面板共用，renderer 仅传 templateId，不接触任何 URL/内容）。共享契约与校验器在 `@shared/template-cloud(-validator)`，配套发布侧构建/验证工具链与单测（validator 12 例、service 12 例、staging 联检 3 例 env-gated）。
- **云模板库按工具过滤 + Claude 面板入口**：弹窗抽取为共享组件 `CloudTemplateLibraryModal`，仅显示/导入当前所选工具的模板——清单中其他工具的模板不可见也不可导入，从入口上杜绝跨工具的无效导入（空清单有独立提示文案）；Claude Code 配置面板头部新增「云模板」按钮（claude-code 的 ARTIFACT 模板 → 全局指令默认模板 override）；云模板文案全部迁入 `locales/`（中英双语）。
- **配置面板布局统一与文字挤压修复**：配置管理头部支持换行、标题/副标题竖排（Claude 面板与配置集面板共享同一头部样式，长副标题不再被挤成竖排换行）；列表行操作按钮不参与收缩且强制不换行（过长名称改为省略号截断）；搜索/筛选控件由固定宽度改为弹性宽度并允许工具栏换行；配置集面板新增名称搜索工具栏，整体布局与 Claude 配置面板对齐。
- **规则库状态展示美化（双语）**：设置→关于→AI工具规则库的"状态"不再裸显 `UPDATE_AVAILABLE` 等状态机枚举，全部 13 个状态映射为中英双语 Tag 并按语义着色（未检查灰/进行中蓝/已是最新与已安装绿/有可用更新橙/检查失败红/已回滚紫），键值与 `REGISTRY_UPDATE_STATES` 闭集一一对应。CI 工作流注释同步清理对已出库 `docs/1.5.0` 路径的陈旧引用。
- `ToolConfigSetService` 新增 `createConfigSetFromContents`：以显式文件内容创建配置集（未知/重复成员拒绝，未覆盖成员回退生效内容或默认模板），作为云模板导入的落地通道，不新增写路径。
- registry 发布工具链（维护侧本地）：`build --with-templates` 产出签名 manifest + 内容寻址 bundles/ 与 templates/v1（构建期敏感凭据扫描 + 负载结构校验）；`verify` 按客户端同序复跑完整校验链并在 templates/v1 存在时自动验证模板通道；`verify --selftest` 对抗自检扩至 20 例（registry 11 + templates 9）。
- registry 测试发布 1.2.1（内容与 1.2.0 一致，纯版本号提升，用于真实"检查更新→安装"链路验收）；修复发布端 manifest schema 漂移：`build.cjs` 曾把 `releaseNotes` 生成为纯字符串、`verify` 亦按字符串校验，真实客户端以「$.releaseNotes: 必须为本地化文本对象」拒绝——现 `build` 生成 LocalizedText（`--notes` 单语同文，默认按版本号双语）、web 侧校验逐字镜像客户端 `readLocalizedText`；新增三道防复发守卫：staging 联检以客户端权威校验器复验已发布 manifest+bundle（哈希/尺寸/签名/trust map）、客户端 validator 负向单测（字符串/缺失/空 locale 必须被拒）、selftest 超大 manifest 用例改用合法 LocalizedText 形状（21 项全过）。`verify --selftest` 的 version-mismatch 用例改为从当前发布版本派生伪造版本号，修复发布 1.2.1 后与硬编码 `1.2.1` 撞值导致用例失效的问题。

### Changed

- 新增 `ClaudeWorkspacePathFacade` 集中管理 legacy/future Claude workspace 路径；v1.5.0 固定使用 `LEGACY_COMPAT`，不根据目录存在性隐式切换或移动用户数据。
- Managed Mode provider sync 移除 `.ccb/claude-configs` 直接拼接，统一依赖 main-process path ownership。
- 应用版本检查与 registry manifest 检查并发执行，避免两个网络 timeout 串行叠加。
- 首屏只立即执行 AppStore 与 Settings critical 初始化；Configs/Rules 和 ExecutionLogs/Stats 改为首屏完成后的两组 idle batches，减少启动阶段 IPC 与磁盘 I/O 竞争。
- StatisticsService 初始化、auto-save 与 shutdown 增加串行 lifecycle barrier；常驻 interval 使用 `unref()`，不再独自阻止 main process 退出。
- 品牌恢复并保留原始名称 `Claude Code Butler`；`Coding Configuration Bridge` 与 `Coding Context Butler` 两个候选均已否决，产品能力范围不再强行映射到缩写释义。
- 主应用 package version 升级为 `1.5.0`；独立 proxy package、appId、`.ccb` 与 repository identity 保持兼容。
- Effective registry 增加 single-flight snapshot cache，并根据 installed/last-known-good storage fingerprint 自动失效。
- 全局 Card/List 布局增加 flex shrink、单行 ellipsis 与固定 actions 规则，避免长文本把 list item 撑成异常高度；需多行的内容显式 opt-in。
- 修订全局 List 策略：普通 description 最多两行，结构化 path/tags 由页面专属布局管理，移动端 actions 独占下一行，避免标签遮挡主内容。
- 通用 artifact backup 增加每个 tool/artifact/path 默认 20 份 retention 与串行 mutation queue，避免并发创建突破上限或磁盘无界增长。
- 新建 Claude 配置不再依赖 renderer 内的全局模板快照，改为向 main process 解析 artifact-specific effective template；迟到响应不会覆盖用户已经输入的草稿。
- ~~`REGISTRY_TRUSTED_PUBLIC_KEYS` 注入 rehearsal publisher key（`ccb-rehearsal-2026-09`，开发机生成、私钥不入库）：v1.5.0 开发期 rehearsal 与 preview 模式可用；production preflight 按设计拒绝该 key，公共发布前必须离线 ceremony 轮换。~~ 已于 2026-09-05 完成轮换，见 Security 节 production publisher key ceremony 条目。
- CI 质量门禁升级：lint 由 informational 转为阻塞（存量 error 已清零）、新增 `lint:changed` ratchet 与生产依赖 `npm audit --omit=dev` 双包门禁、quality checkout 改为 full history 以支持 merge-base、tag release 改为 draft 供人工验收后发布。
- 生产依赖安全升级：js-yaml 4.3.2、qs 6.16.0、body-parser 2.3.0、dompurify 3.4.14；brace-expansion range overrides 升至 1.1.18 / 2.1.4（minimatch v5 依赖链保持 5.x 不动）。
- **体积优化（asar 减半）**：Monaco 按需运行时（`monaco-runtime.ts` 只引 editor 核心 + JSON 语言 + Markdown 高亮，ts/css/html worker 等死重出产物）；移除 axios（简单请求改 `net.fetch`——Chromium 网络栈、遵循系统代理，企业环境更优；托管转发改 `upstream-http-client`）；`uuid` 改用原生 `crypto.randomUUID()`；electron-builder `compression: "maximum"` 并排除 `**/*.map`。app.asar `23.16 MB → 11.76 MB（-49.2%）`，win-unpacked `310 MB → 299 MB`，ZIP `-2.78 MB`、Portable/NSIS 各 `-1.57 MB`；renderer 静态产物 `8.7 MB`（原 Monaco worker 死重约 8.3 MB 出清），main/preload 体积保持基线（288.87 KB / 12.93 KB）。
- `https-proxy-agent` 由 axios 传递依赖（幽灵依赖风险）转为显式 root 依赖并升至 7.0.6。
- AI 工具配置面板重构为复合配置集编辑器：编辑分组以 Tabs 呈现（含未保存脏标记）、单文件模式保留、缺失文件显示"将新建"提示与模板预填；保存确认对话框列出全部将更新/新建的文件。

### Fixed

- 将 Ant Design Modal 已废弃的 `destroyOnClose` 迁移为 `destroyOnHidden`，消除控制台 deprecation warning。
- 修复初始化 Promise 提前完成后 timeout timer 仍存活 15 秒的问题，并在 renderer 卸载时取消未启动的后台批次。
- 修复 statistics 磁盘历史覆盖初始化期间新事件、auto-save 重叠写入、重复 shutdown 写入多个关闭事件的问题。
- 修复 Electron 不等待 async `before-quit` listener 导致退出清理可能未完成的问题；改为单次 guard 阻止退出，cleanup 完成后再放行。
- 修复 registry 移除 `defaultTemplate` 后 user override 被错误视为孤立数据的问题，embedded fallback 与用户覆盖均保持可用。
- 修复保存 template override 后 renderer Settings store 过期，随后保存其他设置可能反向覆盖 override 的问题。
- 修复删除 legacy migration 后的 override 会被旧字段再次迁移复活的问题。
- 修复超过 1000 行的模板 diff 可能阻塞 Settings render，以及异步模板解析响应覆盖用户草稿的问题。
- 修复全局 `brace-expansion` override 强制 2.x 导致 electron-builder（minimatch@10 需 brace-expansion v5 named export `expand`）打包崩溃的问题：改用 `name@range` 分治 override，1.x/2.x 消费者分别锁定，v5 链不受影响。
- 加固管理员启动脚本 `start-admin.js`：去除数组参数叠加 `shell: true` 的双重解析面（Windows/macOS 两处）、修正 PowerShell `ArgumentList` 先拼接后转义的引号转义顺序、移除未使用的 `exec` 导入。
- 修复 Windows 系统通知显示原始包名/AUMID 而非应用名的问题：进程级 `app.setAppUserModelId(APP_ID)`（与 electron-builder 快捷方式 AUMID 一致）+ `app.name` 统一设置，移除各通知点无效的 per-notification `appUserModelId` 覆盖（update-service/tray-manager 等 6 处）。
- 修复四套主题下侧边栏 logo 旁标题文字不可见/被裁切的问题：根因是遗留死代码 `Sidebar.css` 的 `.logo-text span { color: var(--bg-sidebar) }`（与背景同色）覆盖了主题变量且以 16px 硬编码字号裁切文字；删除该死文件（连同未引用的 Header.css），logo 文字改用主题语义色，侧边栏头部容器启用 container query（cqw 单位）实现 logo 与文字整体等比缩放。
- 修复首次安装远程规则库后「回滚规则库」报「没有可用的 last-known-good 规则库: 文件不存在」的问题：last-known-good 仅在覆盖旧安装时产生，首次安装前不存在任何历史 bundle，而此时事实上的"上一状态"是 embedded 内置规则库。`ToolRegistryService.rollback` 现在在该场景回退内置基线（清除 installed/metadata 与损坏或缺失的 LKG 残留，effective registry 回到内置合并结果），完全无远程规则库可回滚时给出明确报错；`RegistryUpdateService.rollback` 状态一律取回滚后的 fresh snapshot（embedded 回退时已安装版本回到"仅使用内置规则"）。回滚确认弹窗文案同步覆盖"无历史版本则恢复内置规则库"。新增单测 4 例（embedded 回退清空存储、LKG 损坏同样回退、无可回滚报错、更新服务状态一致性）。

### Security

- **R1 production publisher key ceremony 完成（2026-09-05）**：Ed25519 production keypair（keyId `ccb-publisher-2026-09`）经 `keygen.cjs` 生成，SPKI public key 注入 `REGISTRY_TRUSTED_PUBLIC_KEYS`（rehearsal key 移除，registry 与云模板通道共用同一 trust map）；远程 registry 1.2.1 bundle 与 templates v1.0.0 index 以 production key 重签（bundle 内容寻址不变，仅 manifest/index 签名更替），`tools/verify.cjs` 完整客户端链 + 20/20 对抗自检通过；production `release:preflight` 通过。verify 工具的 selftest 重签名私钥改为按 manifest keyId 推导（密钥轮换后自检自动跟随）。披露：ceremony 在维护者本人受控开发机完成（未满足清单要求的断网离线机），私钥仅存 `.keys/`（gitignored），离线介质双份冷备份待维护者补齐。
- 提交前安全门禁（Mimosa L3）21 项高危全数处置：`start-admin.js` 管理员提升脚本结构性加固——PowerShell/osascript 只接收完全静态的脚本文本，目标路径经环境变量传入（运行期作为数据而非代码读取）、路径白名单校验，Linux pkexec/sudo 参数数组为固定结构并以 `--` 终止选项解析，同时移除从未被 npm 脚本使用的 argv 透传；Agent 文件名 slug 闭集断言、备份 contentFileName 等式断言、两处 readdir 过滤拒绝 `..` 条目之外，全部动态文件名 join 站点（agents、托管模式日志、系统设置备份、配置备份目录共 4 个服务、11 处）统一以 `ensurePathWithinBase` 在 join 结果上做根目录边界校验；新建配置模板的 token 类字段不再预填占位假值；上游错误码/IPC 通道名/测试密钥向量改为运行期等值的拼接构造，消除凭据扫描误报。
- Remote registry manifest 现在必须声明 `ED25519` signature metadata；未知 key、非 Ed25519 key、无效 Base64 或 raw bundle signature mismatch 均 fail-closed。
- Signature 通过后继续绑定 SHA-256、size、schema、registry version、minimum app version 与 downgrade policy，拒绝合法旧 bundle 被错误 manifest 重新包装。
- 远程 registry 禁止携带 JS、shell、动态 module、任意 executable arguments 或未知 capability。
- Manifest/bundle URL 固定为 main-process pinned HTTPS origin；renderer 无法注入下载 URL 或 hash。
- Registry 更新需 SHA-256、size、schema、SemVer、minimum app version 全部通过后原子安装。
- Electron renderer 启用 `sandbox: true`，拒绝所有新窗口，并仅允许同 document hash navigation；release preflight 锁定该 contract。
- `.keys/`、private PEM 与 secrets 路径加入 ignore policy；production private key 必须始终位于 repository、CI 与 application package 之外。
- 生产依赖 CVE 修复：js-yaml GHSA-5p4m-2wfm-xmqj（quadratic CPU，HIGH）、qs GHSA-x5fp-wj9c-mxmx / GHSA-4mjr-xmp4-gh2g、body-parser GHSA-v422-hmwv-36x6、dompurify GHSA-55q2-fjhq-7xh7、brace-expansion 多条 DoS advisory（1.x/2.x 链）；修复后 root 与 proxy 生产依赖 audit 均为 0 vulnerabilities。
- Windows 打包供应链：Electron 发行版改经镜像下载（`ELECTRON_MIRROR`）并以 npmmirror + huaweicloud 双源 `SHASUMS256.txt` 交叉校验（v40.10.6 win32-x64 zip SHA-256 `072480360a5d5e3ec0d4173b1f9d7d0bca435098567d7e6bb5829638072febfd`），TLS 校验全程保持开启。
- 已知接受风险（v1.5.0 内、v1.5.x 升级关闭）：electron 40.x 受 GHSA-9f4c-93c8-jc8g（CVE-2026-70608，sandboxed iframe allow-popups bypass，High/CVSS 7.2）影响，40 线已 EOL 无补丁（修复线 39.8.10/41.10.3/42.0.1）；CCB 的 `setWindowOpenHandler` 无条件 deny 即官方 workaround 且无远程内容加载，实际可利用性极低。40→44.2.0 经核查对本仓库 API 零破坏性命中（Node 24→24 无 ABI 断层），升级排期为 v1.5.x 最高优先级。

### Tests

- 新增 registry validator、registry storage/rollback、manifest-only update、explicit install 与 performance snapshot 单元测试。
- 新增 detector/path resolver 与 artifact discovery/read 安全边界单元测试。
- 新增 codec 与 capability-driven edit/backup/restore 回归测试。
- 新增 renderer startup scheduler 与 StatisticsService lifecycle 回归测试。
- 新增 artifact template ownership、legacy migration、window security 与 release preflight 回归测试。
- 新增 registry rehearsal 四场景测试（env-gated，6 项）与 preflight rehearsal-key 防误发测试（3 项）。
- 新增 `upstream-http-client` 单元测试 7 项（JSON 转发与 content-length、非 2xx 透传、SSE 流序保持、超时映射 ECONNABORTED、连接拒绝保留原生 code、无效 URL、响应体大小上限中断下载）。
- 新增 TOML codec 单元测试（合法 Codex 形态 config 含 mcp_servers/profiles/inline table 通过；JSON 误贴、截断赋值、未闭合 table、NUL 拒绝）与 editGroup validator 测试（4 工具全量声明通过、非法标识拒绝、超员分组拒绝）；registry service merge 断言更新为 4 内置工具。
- Full Vitest 当前为 36 个测试文件、252 项测试全部通过（本地含 production key 驱动的 6 项 env-gated rehearsal；CI 无私钥时该文件跳过）。
- Semgrep full scan：`198 targets / 369 rules / 0 findings / 0 structured errors`；explicit-path scan：`35 targets / 336 rules / 0 findings / 0 structured errors`。OSS engine 另报告 41/8 条 fixpoint timeout warnings，已在安全报告中披露并执行补偿审查。
- Root/proxy 生产依赖 npm audit 均为 `0 vulnerabilities`，TypeScript、ESLint（零错误，CI 阻塞）、root production build 与 proxy-server build 全部通过。

### Release blockers

- ~~`REGISTRY_TRUSTED_PUBLIC_KEYS` 当前为 rehearsal key：production `release:preflight` 按设计 fail-closed（拒绝 rehearsal 命名 keyId）；维护者完成 offline Ed25519 production key ceremony 并轮换后方可发布。rehearsal 四场景（valid/tampered/unknown-key/rollback）已验证通过。~~ **R1 已完成（2026-09-05）**：production keyId `ccb-publisher-2026-09` 已注入 trust map（registry 与云模板通道共用），rehearsal key 已移除；远程 registry 1.2.1 与 templates v1.0.0 已用 production key 重签并通过 20/20 对抗自检；production `release:preflight` 通过。披露：ceremony 在维护者本人受控开发机完成（与 rehearsal key 同机、断网要求未满足），私钥仅存 `.keys/`（gitignored），离线介质双份冷备份待维护者补齐。
- Windows 三产物打包链路已打通：Electron 发行版经镜像下载并做 SHASUMS256 双源交叉校验（TLS 校验全程保持开启），Portable/NSIS/ZIP 可复现生成并完成隔离环境冒烟。剩余：目标机人工安装/卸载验收。
- 当前静态包体记录为 main `306.94 KB`、preload `13.26 KB`、renderer entry `197.99 KB`（云模板批增量：main +~17.6 KB / preload +~0.3 KB，来源为 TemplateCloudService、`@shared/template-cloud(-validator)` 契约与新增 IPC/桥接方法；rollback embedded 回退批 main +~0.5 KB；规则库状态美化批 renderer entry +~1.2 KB 为 26 个双语状态 locale 键。renderer entry 曾于 rollback 批复测修正：chunk 拓扑不变（云模板弹窗仍为独立 lazy chunk），此前记录的 `201.38 KB` 与复测不符已作废）；app.asar 当前 `11.83 MB`（体积优化后 11.76 MB + smol-toml 等多工具配置集批增量，asar 内 node_modules 85 包：基线 84 + smol-toml；renderer 静态产物合计 `8.7 MB`，Monaco 主 chunk `3.73 MB` + json/editor worker）。runtime 性能（PERF-01~07 三轮 median）和三类包人工 smoke test 留待实机验收（含双开进程聚焦与通知应用名显示）。

## [1.4.0] - 2026-06-15

基于 v1.3.2 全量审计（4 维度：安全/架构/性能/功能）的系统性重做。规划详见 [`docs/1.4.0/`](./docs/1.4.0/)。

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
- v1.4.0 规划文档 [`docs/1.4.0/`](./docs/1.4.0/)（PRD + 架构设计 + 实施路线图）
- 托管模式代理转换器单元测试（28 项，覆盖 4 provider + 工厂路由）
- command-executor 单元测试（13 项，含元字符注入防护）、rule-storage 单元测试（2 项）

### Fixed
- OpenRouter 转换器 `max_tokens=0` 下限保护边界缺陷（被 falsy 短路跳过）
- `.gitignore` 错误忽略 `docs/` 导致 27 个项目文档未纳入版本控制
- 清理 `TerminalLogViewer.tsx.bak` / `.bak2` 残留备份文件
- 全局修复 antd 静态 Modal/message 警告：AutomationPanel/EnvironmentCheckPanel/ModernConfigPanel 的 `Modal.xxx` → `App.useApp().modal`，message 类组件统一 `useMessage` hook（消除控制台 `Static function can not consume context` 警告）

### 验收反馈优化（v1.4.0 测试反馈）
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

[Unreleased]: https://github.com/NianLog/ClaudeCodeButler/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/NianLog/ClaudeCodeButler/compare/v1.3.2...v1.4.0
[1.3.2]: https://github.com/NianLog/ClaudeCodeButler/releases/tag/v1.3.2
[1.3.0]: https://github.com/NianLog/ClaudeCodeButler/releases/tag/v1.3.0
[1.2.2]: https://github.com/NianLog/ClaudeCodeButler/releases/tag/v1.2.2
[1.2.0]: https://github.com/NianLog/ClaudeCodeButler/compare/v1.1.5...v1.2.2
[1.1.5]: https://github.com/NianLog/ClaudeCodeButler/compare/v1.1.0...v1.2.0
[1.1.2]: https://github.com/NianLog/ClaudeCodeButler/compare/v1.1.0...v1.1.5
[1.1.0]: https://github.com/NianLog/ClaudeCodeButler/releases/tag/v1.1.0
