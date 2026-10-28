# ARCHITECTURE.md — 架构现状与演进计划

> 活文档。新增/移动模块、改变分层边界、引入新依赖或新数据流时，必须在同一提交更新本文件。
> 更新时间：2026-10-28（1.5.1）。

> 2026-10-25 最新本机验收：资源三批与网络 A+B 已完成；642 项测试和 22 组真实 Electron 流程通过，无跳过/未捕获异常。干净源码 2086a94 的未签名候选已通过业务及载荷核验，暂不发布。详见[验收报告](SECURITY_AUDIT_REPORT.md)；早期 37e020e 验收保留在历史记录中。

### 资源闭环三批

网络缓解 B：main/独立代理复用现有 ESLint 限制 Node 原生 fetch、Resolver、WebSocket/EventSource 和快照入口，保留 OS lookup、Chromium 与 renderer 接口。健康检查以请求时的服务实例为边界，旧成功/失败回调不操作重启后的新实例；两条回归先失败后转绿。62 项规则与 20 项生命周期测试、全量与真实 Electron/新候选验收均通过。

网络缓解 A（2026-10-25）：上游 TLS 显式绑定规范目标；下载 HEAD 委托现有 HTTP 工具，禁复用、收尾响应并设五秒总时限，保持 2xx/3xx 和 Chromium 下载语义。Node HEAD 为用户批准的临时例外，2026-11-01 或下次入口/依赖变更复核。配置路径、数据格式与公共 IPC 不变，见[决定与证据更正](.agents/notes/implemented/bug-fix/2026-10-25-reachable-node-network-mitigations.md)。下段保留实施前的厂商回补证据，不代表当前应用缓解未验收。

运行时安全复核（2026-10-25）：当前 Electron 45 的 9 份相关内置 JS 源码与未修复 Node 24.22.0 一致，TLS/DNS 反例仍未拒绝。Brotli 已由 Chromium 包含修复，其余七项 Node 上游修复缺失，内置 c-ares/Undici 另有公告版本风险。宿主 Node/npm 更新不能替换内嵌运行时；现有 URL/Host/鉴权/agent:false 缓解保持。用户本轮暂缓安装生命周期和签名，不改程序代码，不发布。详见[运行时证据](.agents/notes/implemented/process/2026-10-25-latest-stable-dependency-upgrades.md)。

- `LegacyResourceEditor` 将旧 Skill/子 Agent 的新增、更新、删除与角色导入委托资源服务，旧表单提交完整包/文件 revision；不再用 delete/add 更新。字段修改保留未知权限元数据和附件，路径不变；不支持的 YAML 布局明确要求原文编辑。
- 原生文件读取返回字节 revision；编辑/恢复必须提供 expectedRevision。恢复前备份当前版本，另可核对预览时的 backup revision；新副本存 SHA-256/实际大小，旧副本标记无历史摘要。备份内容和目录继续受路径、链接、大小与当前规则授权限制。
- MCP 恢复将受控历史文件拆成服务器来源，复用窗口绑定的预览/应用和局部原文写入，保留其他当前设置。新旧原生 MCP 三条写入口均核对备份摘要等于被修改版本。Qoder 显式限制和项目审批参与转换与 revision。
- 通用文件恢复独立展示整文件范围与两个版本，走 dirty/busy 守卫；缺失原文件仍可进入受控历史。原子替换与 revision 检查不等同于外部 CLI 的跨进程事务。
- 来源按 kind 和有效 registry 路径逐候选发现，返回缺失/受限/损坏诊断；目录坏项隔离且占用原名称。引用先检查本机目标与完整路径，再独立授权，允许查看/复制但不可写。预算用尽即停止遍历，未完整确认的目标集合禁止修改。
- codec 按 tool/kind 解释原生字段；Skill 可选前言与目标必填字段分别处理，OpenCode 角色取文件名。已知 OpenCode 全局限制参与来源 revision，无法表达时阻止导入；写后回读必须匹配本次实际计划，失败明确报告已写入、需核对。
- 原生编辑器区分展示用候选模板与 main 已解析的实际路径，精确打开/创建被点击候选；后端仍逐次重推授权。旧表单保留正文起始空行，提交中禁用关闭和输入，错误常驻；确认操作等待 AntD Hook Modal 结果，使已处理失败保持弹窗且不再冒出未捕获异常。
- `tests/e2e/agent-resource-workflows.mjs` 在 Windows 启动真实 Electron 和生产 out，以独立路径、真实 bridge/IPC 和原生截图检验完整资源流程；不向 renderer 提供 fs，不安装外部 Agent，不替代目标机安装或跨平台验收。

## 1. 产品与架构定位

CCB（Claude Code Butler）是本地优先的 Windows 桌面应用（Electron 45.1.0 + React 19 + TS），核心价值是把分散在用户主目录的 AI CLI 工具配置（`~/.claude/settings.json`、MCP 注册表、Codex `config.toml` 等）纳入统一的生命周期管理：发现、校验、编辑、备份、恢复、模板化。

v1.4.0 及以前是"Claude Code 专用管理器"：路径、格式、业务逻辑硬编码在各 service 中。v1.5.0 起演进为**规则驱动的多工具配置控制平面**：工具能力以 declarative JSON registry 声明，应用侧只实现有限的、审计过的内置 capability handler。这是典型的 Strangler 渐进迁移，而非重写。

## 2. 进程与分层模型

```
┌─────────────────────────────────────────────────────────────┐
│ Renderer（sandbox: true，无 Node）                            │
│  React 19 + AntD 6 + Zustand；面板懒加载；Monaco 按需 runtime │
│  （editor 核心 + JSON + Markdown，仅 editor/json 两个 worker）│
│  只发 IPC 请求，不接触真实路径                                  │
├──────────── preload（contextBridge，唯一桥）──────────────────┤
│ Main Process（Node，全部 fs/路径/子进程/网络归属于此）           │
│  services/  业务服务   utils/   安全基础设施                    │
│  网络出口：net.fetch（Chromium 栈，系统代理感知）；              │
│  托管上游转发：utils/upstream-http-client（Node http/https）    │
│  registry   契约来自 src/shared，运行时由 main 推导 allowlist    │
├──────────── src/shared（跨进程 domain contract）──────────────┤
│  tool-registry.ts / tool-registry-validator.ts               │
│  builtin-tool-registry.json（内置 adapter 声明）               │
├──────────── src/proxy-server（独立 npm 包）───────────────────┤
│  Express 5 托管模式代理 + 4 个 provider transformer           │
│  （遗留独立包；主应用内为集成模式 Express 实例）                 │
└─────────────────────────────────────────────────────────────┘
```

分层规则（强制）：

1. renderer 永远不持有真实文件路径，所有路径由 main 从 effective registry 推导。
2. `src/shared` 是唯一跨进程契约层，禁止反向依赖 main/renderer。
3. 安全基础设施（`command-executor`、`ssrf-guard`、`path-security`、`atomic-json-writer`、`window-security`）是所有业务服务的强制入口，不得绕过直用 `child_process`/`fs`/`fetch` 裸 API。
4. legacy Claude 路径一律经 `ClaudeWorkspacePathFacade`（v1.5.0 固定 `LEGACY_COMPAT`）。

## 3. v1.5.0 核心架构：规则驱动 Registry

### 3.1 Domain model

```
ToolDefinition ──1:N── ConfigArtifactDefinition ──N:1── Capability
  (检测方式)            (路径模板/格式/范围)          (DISCOVER/READ/
                                                           VALIDATE/EDIT/
                                                           BACKUP/RESTORE)
```

- **ToolDefinition**：`toolId`、平台、detectors（`COMMAND_EXISTS` / `PATH_EXISTS`，无 shell 执行）。
- **ConfigArtifactDefinition**：per-platform 路径模板（仅 `HOME`/`APPDATA`/`LOCALAPPDATA`/`XDG_CONFIG_HOME`/`CCB_DATA` 变量）、format（`JSON`/`JSONC`/`YAML`/`MARKDOWN`/`TEXT`/`TOML`）、scope、handler（`JSON_FILE_V1`/`MARKDOWN_FILE_V1`/`TEXT_FILE_V1`/`TOML_FILE_V1`）、可选 `editGroup`/`configSet`。
- **Capability**：最小权限动词。adapter 只声明被验证过的能力——内置 4 工具（Claude Code/Codex/Gemini CLI/Antigravity）除记忆类 MARKDOWN 文件（无 VALIDATE 语义）外均已放开全部六项能力。
- **editGroup**：纯 UI 聚合元数据（validator 限每组 ≤4 成员），把同工具相关 artifact（如 Codex `config.toml + auth.json`）聚合为一个"配置集"面板分页；保存语义 = 全组 VALIDATE 通过 → 顺序逐文件走既有 per-artifact authorize→backup→原子写链，不新增写路径、不放宽安全边界。
- **configSet**：运行时快照切换元数据（每组 ≤4 成员，与 editGroup 正交）。同工具同 `configSet` 的 artifacts 构成可命名快照、整体激活的配置单元；由 `ToolConfigSetService` 落地（见 §3.6）。

### 3.2 Registry 组成与优先级

```
effective registry = merge(INSTALLED_REMOTE, EMBEDDED_BUILTIN)   # installed 覆盖 embedded
template 解析      = USER_OVERRIDE > REGISTRY > EMBEDDED
```

- 内置 registry：`src/shared/builtin-tool-registry.json`（registryVersion 1.2.0：Claude Code、Codex CLI、Gemini CLI、Antigravity 四工具；1.2.0 起 Codex/Gemini/Antigravity 声明 `configSet` 分组）。
- 远程 registry：Ed25519 detached 签名（pinned `keyId → SPKI` trust map）→ SHA-256 → size → schema → SemVer → minimumAppVersion → downgrade policy，全链 fail-closed；installed/last-known-good 原子存储支持显式 rollback（无 last-known-good 时回退 embedded 基线并清除 installed/metadata 残留）。
- 验证器 bounded：限制 bundle/manifest 大小、JSON 深度/节点数、路径变量、detector/handler/capability allowlist。
- 启动只检查小 manifest，完整 bundle 需用户显式确认安装。

### 3.3 迁移策略（Strangler 四阶段）

| 阶段 | 内容 | v1.5.0 状态 |
| --- | --- | --- |
| Phase A | Registry foundation + 内置 Claude 兼容 adapter | ✅ 完成 |
| Phase B | 通用 read path（detection/discovery/read）+ Codex | ✅ 完成 |
| Phase C | 通用 write path（codec/校验/原子编辑/备份恢复） | ✅ 基础完成（4 内置工具全量；TOML 用 smol-toml parse 校验 + 原文写回；editGroup 配置集聚合；缺失文件可按 registry 声明创建） |
| Phase D | 旧 Claude 面板向 registry 驱动迁移、特性提取 | ⬜ 未开始（v1.5.0 明确不做大爆炸迁移） |

### 3.4 启动与性能架构

- Renderer 启动调度器：首屏仅 AppStore + Settings 关键初始化；Configs/Rules、ExecutionLogs/Stats 拆为 idle batches；组件卸载取消未启动批次。
- Main 生命周期：app update 与 registry manifest 检查并发；StatisticsService 串行 lifecycle barrier、interval `unref()`；`before-quit` 单次 guard 确保清理完成。
- 单实例契约：`app.requestSingleInstanceLock()` 于模块顶层获取，拿不到锁的实例立即 `app.quit()`；首实例在 `second-instance` 中恢复/聚焦主窗口并弹通知。任何新窗口形态（含未来 about/settings 窗口）都必须复用该契约，禁止绕过。
- Windows 应用身份：进程级 `app.setAppUserModelId(APP_INFO.APP_ID)`（ready 前设置，与 electron-builder `build.appId` 一致）+ `app.name = APP_INFO.FULL_NAME`；通知构造处不再 per-notification 覆盖 AUMID（改一处需同步另一处）。
- 按需 performance snapshot/export API（PERF-01~08 指标，本地存储，无定时采样、无上传）。

### 3.5 网络出口与依赖极简（v1.5.0）

- 主进程简单出网（更新检查、npm registry、registry manifest/bundle、健康检查）统一走 Electron `net.fetch`（Chromium 网络栈，遵循系统代理），配 `AbortSignal.timeout`。
- 托管模式上游转发（`/v1/messages`）走 `utils/upstream-http-client.ts`：Node `http/https` + 可选 `https-proxy-agent` CONNECT 隧道；返回 `IncomingMessage` 原生流供 SSE 直通；建连阶段超时映射 `ECONNABORTED`→504；非 2xx 错误体与响应体均有大小上限。
- Registry 下载（`NetFetchRegistryHttpClient`）`redirect: 'error'` + 流式大小限制，fail-closed 不变。
- root 生产依赖收敛为 6 个（chokidar/express/js-yaml/node-cron/https-proxy-agent/smol-toml）：axios、uuid 已移除（asar 内 node_modules 包数 84，无 .map、无 axios/uuid）；smol-toml 为 TOML parse 校验专用（1.8.0，零传递依赖，主包体仍在基线内）。

### 3.6 多工具配置集与托盘切换（v1.5.0）

配置管理存在两条正交通道，由配置页顶部工具下拉框统一入口：

- **Claude 工作区通道（legacy）**：`ConfigService` + `~/.ccb/claude-configs` 工作区目录，含热重载切换技巧与状态同步；claude-code 刻意不声明 `configSet`，避免双份快照存储。
- **Registry 配置集通道（generic）**：`ToolConfigSetService`（`src/main/services/tool-config-set-service.ts`），快照存于 `<CCB 数据目录>/config-sets/<toolId>/<set-uuid>/`（temp+rename 原子写，随机 setId 寻址）。创建 = 快照 live 内容（缺失文件回退 registry 默认模板）或显式内容导入（`createConfigSetFromContents`，云模板专用入口：未知/重复成员拒绝，未覆盖成员同样回退）；激活 = 先全组 VALIDATE 再逐文件 `editArtifact`（复用既有授权/备份/原子写链，无新写路径）；isInUse = live 与快照逐文件内容比对。IPC 通道 `toolRegistry:*ConfigSet*` 6 条 + 云模板 2 条（见 §3.7），preload 桥接 DTO 全部来自 `@shared`。

托盘快速切换菜单（`tray-manager.ts`）为两层结构：Claude Code 子菜单走遗留通道（保留热重载），其余声明 `configSet` 的工具各一个子菜单（`●` 标记 isInUse）；托管模式拦截在托盘/面板 UI 层（与遗留 `config:activateConfig` 同层），激活成功经 `tray:switch-config` 事件通知 renderer 刷新（payload 含 toolId 以区分通道）。

空 `requestedPath` 语义：artifact 读写/校验 IPC 对"registry 声明但文件缺失"的场景传空串，由主进程 `authorizeArtifact` 解析为声明的首个候选路径——renderer 仍不构造任何真实路径。

### 3.7 云模板通道（templates/v1，v2 提案落地）

- **契约**：`@shared/template-cloud`（index/负载强类型与上限常量）+ `@shared/template-cloud-validator`（闭集/pinned origin/SemVer/SHA-256/Base64 模式校验与 canonical JSON 签名输入重建）；发布侧 `web/software/ccb/registry/tools/common.cjs` 为忠实再实现，客户端校验为权威（staging 联检单测防两侧漂移）。
- **服务**：`TemplateCloudService`（`src/main/services/template-cloud-service.ts`，工厂注入共享 `ArtifactTemplateService` 实例避免 settings 并发丢失）。`listTemplates` 拉取并验证 index（≤50KB → 结构闭集 → trust map → canonical Ed25519 签名 → minimumAppVersion 门槛，并发去重）；`importTemplate` 下载内容寻址 item（pinned URL → ≤2MB → SHA-256/尺寸 → 按 kind 负载闭集 → templateId/toolId 一致性）后分流：`CONFIG_SET` → `createConfigSetFromContents`（本地快照，不动生效配置）；`ARTIFACT` → `saveArtifactTemplateOverride`（默认模板 user override）。信任链、网络栈（`NetFetchRegistryHttpClient`）与 pinned origin（`dev.niansir.com`）全部复用规则库更新链，无新增写路径。
- **IPC/UI**：`toolRegistry:listCloudTemplates` / `toolRegistry:importCloudTemplate`（renderer 仅传 templateId + 可选显示名，不接触 URL/内容）；共享组件 `CloudTemplateLibraryModal`（`src/renderer/src/components/Config/`）由 Claude 配置面板与配置集面板共用，**仅显示/导入当前所选工具（toolId）的模板**——跨工具模板不可见不可导入，过滤发生在 renderer（清单拉取/导入 IPC 不带 toolId，信任链仍在 main 侧不变）。

## 4. 现状评估（资深视角：优势与债务）

### 4.1 做得对的

- **安全边界清晰且 fail-closed**：沙箱渲染、能力 allowlist、签名链、原子写、无 shell 执行。v1.4.0 的安全重做（P0/P1 项清零）+ v1.5.0 的 registry 安全模型形成了可持续的防线，而非一次性补丁。
- **迁移策略克制**：facade 兼容旧路径、不移动用户数据、幂等可回滚，符合桌面软件"用户数据神圣"原则。
- **质量门禁自动化**：211 项单测、Semgrep 双扫描 0 findings、preflight 脚本、CI 覆盖率 artifact；2026-09-04 起 lint 零错误并转 CI 阻塞 + 变更文件 ratchet（`npm run lint:changed`），生产依赖 audit 进入 CI 门禁。
- **性能有度量契约**：拒绝无数据优化，PERF 指标定义先于优化落地。

### 4.2 架构债务（按风险排序）

| # | 债务 | 现状 | 风险 | 建议 |
| --- | --- | --- | --- | --- |
| D1 | `ManagedModeService` ~1812 行上帝服务 | v1.4.0 已提取 `ManagedModeConfigStore`，剩余体量仍集中 | 改动扩散、测试难 | 继续按 Store/Converter/Lifecycle 三轴拆分，每次提取保持 IPC 契约零感知 |
| D2 | `ipc-handlers.ts` ~926 行集中注册 | 所有 handler 单文件注册 | 合并冲突热点、边界模糊 | 按 service 分文件注册，入口聚合 |
| D3 | 旧 Claude 面板未走 registry 通道 | Config/MCP/Agent/Skill 面板仍直连专用 service | 双轨维护成本 | Phase D 渐进收敛，先 read 后 write |
| D4 | ~~Lint 存量 ~71 error~~ | **2026-09-04 已清零**：CI 转阻塞门禁 + `lint:changed` ratchet 双保险 | 已消除 | 保持 ratchet 防倒退；新增代码零 error 为硬约束 |
| D5 | locales 单文件 ~140 KB | 首屏全量解析 | 启动/内存 | 按 feature namespace 拆分 |
| D6 | Renderer 组件测试缺失 | 覆盖率不含 renderer | UI 回归靠人工 | 优先给 Registry/Template/Backup 交互流补组件测试 |
| D7 | watcher 按 service 各自为政 | PERF-06 已可观测计数 | 冗余句柄/IO | 按 artifact 去重 + 统一 debounce/dispose |

## 5. 设计改进计划（v1.5.x ~ v1.6）

按"先收尾、再优化、后扩张"排序：

1. **完成 1.5.1 安全发布验收**：有效代码签名、真实安装升级与性能验收；保留 publisher key 离线备份任务。v1.5.0 已发布，不能继续把旧候选计划写成当前状态。
2. **D1/D2 偿还**：ManagedModeService 第二轮拆分（log-rotation、transformer 路由、process lifecycle 各自成模块）；ipc-handlers 分域注册。
3. **性能二次优化（数据驱动）**：依据实机 PERF-01~07 baseline，按 top contributor 决定是否做 service 懒初始化分级（`BOOT_CRITICAL`/`AFTER_RENDERER_READY`/`ON_DEMAND`）、config scan 定向化、watcher 去重、locale 拆分。
4. **测试体系升级**：核心服务覆盖率到 40%+ 后开启 Vitest thresholds 硬门禁；为 registry 安装/回滚、模板迁移补集成级测试。
5. **Phase D 启动评估**：v1.6 规划旧面板向 registry 通道收敛，先从 MCP 管理（JSON 格式、与 registry artifact 最接近）试点。

## 6. 拓展计划（v1.6+ 方向池）

- **新工具 adapter**：Cursor、Windsurf 等按 registry 声明接入；每个 adapter 必须先 read-only 验证 detection/discovery，再逐能力放开 write。Gemini CLI 与 Antigravity 已于 v1.5.0 内置。
- **~~TOML codec~~**：已完成——smol-toml bounded parse 校验（TOML_FILE_V1），保存原文写回保留注释。
- **future workspace 物理迁移**：`.ccb/claude-configs` → 通用 workspace 布局的物理搬迁，前置条件是迁移演练证明可无损回滚（facade 已预留路径声明）。
- **registry 分发运营化**：publisher key 轮换/吊销流程文档化、last-known-good 灰度策略。
- **明确不做**（当前共识）：public marketplace、账号体系、云同步、远程可执行插件。

## 7. 决策记录

- 品牌保留 `Claude Code Butler`，名称记录起源不限制架构。
- v1.5.0 不做物理目录迁移、不接受未测量性能结论、远程规则不携带代码。
- v1.4.0 遗留决策：移除无鉴权传统代理 fallback（P0），只保留 accessToken 集成模式。

## 8. 1.5.1 持久化、请求与发布约束

- `writeTextAtomic` / `writeJsonAtomic` 统一写入：按规范绝对路径在单进程排队；独占随机临时文件、文件 sync、rename；失败抛错，仅清理自己的临时文件，POSIX 保留原 mode。配置、MCP、规则、配置集、备份与恢复复用该入口。它保证单文件替换，不提供多文件事务或与外部 CLI 的并发合并。
- Settings IPC 复用一个 `SettingsService`；读写排队，完整校验后一次写入，成功才提交内存快照；renderer 依 success 返回值更新保存状态，保存期间的新编辑保持未保存。
- 托管 settings 读取只忽略 ENOENT，损坏或非对象拒绝覆盖；备份目录权限错误、写入与还原失败传回 IPC。UI 重启实际调用服务，服务商切换后仅刷新状态。启动/停止与配置写入不是事务，部分完成时返回真实错误和状态，不声称全部回滚。
- 集成代理直接 listen 并处理 EADDRINUSE，删除基于健康请求的端口预判；stop 在 3 秒宽限后关闭剩余连接，等待真实 close 回调，再释放运行引用或继续 restart。
- Registry 配置创建允许不存在的父目录，创建后重新授权路径链；已有目标先完成备份再覆盖。配置集先检查全部 VALIDATE 结果，再逐文件激活。
- `postUpstream` 普通请求总超时覆盖正文，成功 SSE 只限制响应头阶段；下游 aborted/close 经 AbortSignal 取消上游。`readBodyStream` 还限制正文时长、字节数和不完整关闭。
- `system:fetchUrl` 保留旧参数形式，但主进程仅接受固定版本 HTTPS URL，复用有 15 秒时限、64 KiB 上限和拒绝重定向的 net.fetch 客户端。
- Electron 固定 45.0.0；构建启用 ASAR integrity validation + onlyLoadAppFromAsar。保留 Node 环境变量 fuse 的默认值，兼容企业 `NODE_EXTRA_CA_CERTS`。
- 两种配置 watcher 复用 `utils/watch-path-filter.ts`，只忽略监控根目录内部的隐藏项；`.ccb` 等隐藏祖先不导致整个目录被排除。保持现有事件契约，不新增 renderer 自动刷新。
- 正式 tag 发布先过 quality/preflight，要求代码签名凭据、forceCodeSigning 及 Authenticode 有效；ZIP 的 exe 和 ASAR 与已验证目录比对。SBOM 是有明确边界的 npm 依赖图，校验清单与 GitHub provenance 绑定最终产物。
- 架构决策见 [.agents 持久化记录](.agents/notes/implemented/bug-fix/2026-10-19-persistence-and-proxy-safety.md) 与 [发布门禁记录](.agents/notes/implemented/process/2026-10-19-supported-runtime-and-release-gates.md)。

## 9. 1.5.1 独立代理与 Skill 导入保护（C 批）

- 独立 `src/proxy-server` 保留原启动方式、配置路径与已有 axios 依赖，不并入主应用。只监听回环地址；`/v1` 在解析正文前校验原配置的 accessToken，缺凭据拒绝启动，重复或冲突认证头拒绝请求。健康检查保持公开。配置与 token 在启动时读取，轮换后须重启独立进程。
- `transport.ts` 按 transformer 选择 Anthropic Messages、Chat Completions 或 Gemini Content 地址与头；未知 transformer 拒绝，不从请求接受任意上游地址，不跟随重定向。主应用仍使用原集成代理，不因此获得原生转换能力。
- 请求与响应转换复用 `transformers/chat-completions.ts`、`gemini-content.ts`；`stream.ts` 为每个请求创建独立 SSE 帧缓冲，UTF-8 解码保留分段状态。普通请求时限覆盖正文，成功 SSE 清除响应头时限，下游断开取消上游，不自动重试。支持范围见 [独立包说明](src/proxy-server/PROTOCOL.md)。
- Skill 目录与文件列表导入共用 `commitSkillImport` 队列：根目录及链接检查 → 独占暂存 → 完整文件/元数据校验 → 原目录 rename 为备份 → 暂存目录替换 → 清理。安装失败恢复原目录；恢复也失败则保留备份路径并报告。只清理本次 mkdtemp 创建的目录。双 rename 不是断电事务，也不锁外部 CLI。
- C 批旧 Claude 通道的 Skill 位于 `~/.claude/skills`，默认不覆盖，IPC 签名不变；不执行导入的 SKILL.md 或脚本。拒绝 traversal、UNC、ADS、保留名、重复路径、链接、无效 Base64/UTF-8；导入上限为 2000 项（目录导入含子目录）、单文件 10 MiB、总计 50 MiB、深度 32。


## 10. 稳定工具链与运行时边界（2026-10-25）

Electron 45.0.0 / React 19 / AntD 6 / Zustand 5，Vite 8 与 ESLint 10；main/preload 仍为 CJS。两套锁文件与禁 lifecycle 的 .npmrc 独立维护。集成代理先鉴权后解码，MCP 探测使用 net.fetch 并取消正文；普通上游请求临时关闭空闲连接复用，解压后的请求移除 Content-Encoding。Chromium Brotli 已核实包含修复，保留 br。内嵌 Node 24.22.0 的其他厂商回补仍待核实，正式发布继续阻塞。

决策与兼容例外见 [.agents 工具链记录](.agents/notes/implemented/process/2026-10-25-latest-stable-dependency-upgrades.md)。


## 11. 全局 Agent 资源与导入边界（2026-10-25）

Renderer 的 agent-context-store 统一四管理目标、dirty/busy 与请求代次；ConfigurationWorkspace 复用旧工作区/配置集和原生文件面板，AgentResourcesPage 共用 MCP/Skill/子 Agent 列表与编辑抽屉。旧 AI 工具导航迁入配置管理。退出先由 renderer 确认草稿，再停止后台并排空资源写队列。

preload.agentResources → 独立 agent-resource-handlers → AgentResourceService；codecs 负责有限原生转换，files 负责受限文件/整包校验，backups 只把本机 UUID/content 转为只读来源。全部真实路径在主进程从 effective registry 重推，renderer 只传 ID；会话窗口绑定、30 分钟有效，apply 重验来源/目标/规则/启停 sidecar。旧 MCP、Skill、Agent、artifact、配置集与恢复写入口共享同一 mutation 队列，不承诺跨进程事务。

MANAGE_MCP / MANAGE_DIRECTORY、SKILL_DIRECTORY_V1 / SUBAGENT_DIRECTORY_V1 是 1.5.1 有限协议扩展。内置 registry 1.3.0，definition 1.5.1；installed 同版优先，旧自定义路径与受限能力保留，新协议不自动提权。Claude workspace 保持 LEGACY_COMPAT。切换和扫描不创建资源目录。

JSONC 采用拒绝危险键/重复键后的局部 raw 修改，保留注释与未知大整数；TOML 仅改可安全定位的 table。Skill 沿用全包暂存/备份/切换，附件保持。备份实际快照必须先匹配 revision，metadata.originalPath 不决定任何恢复路径。旧归档恢复只有原生写成功后才确认移除；清理失败报告部分完成。

六新增工具只是导入来源；不能等价的认证、停用、权限、模型和工具限制逐项阻止，不猜字段。详细契约、官方来源与取舍见 [.agents 导入记录](.agents/notes/implemented/feature/2026-10-25-agent-import-and-global-context.md)；四主题规范见 [DESIGN.md](DESIGN.md)。


共享 CodeEditor 的 JSON 格式化复用现有 jsonc-parser 做 token 空白编辑，保留大整数、转义和换行；严格 JSON 校验不变。格式化使用可撤销编辑，只读/写入中不处理。Markdown/纯文本保留原文，不做空行重排。见[无损编辑记录](.agents/notes/implemented/bug-fix/2026-10-25-lossless-editor-formatting.md)。
