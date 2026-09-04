# ARCHITECTURE.md — 架构现状与演进计划

> 活文档。新增/移动模块、改变分层边界、引入新依赖或新数据流时，必须在同一提交更新本文件。
> 更新时间：2026-09-05（分支 `wip/v1.5.0-migration`）。

## 1. 产品与架构定位

CCB（Claude Code Butler）是本地优先的 Windows 桌面应用（Electron 40 + React 18 + TS），核心价值是把分散在用户主目录的 AI CLI 工具配置（`~/.claude/settings.json`、MCP 注册表、Codex `config.toml` 等）纳入统一的生命周期管理：发现、校验、编辑、备份、恢复、模板化。

v1.4.0 及以前是"Claude Code 专用管理器"：路径、格式、业务逻辑硬编码在各 service 中。v1.5.0 起演进为**规则驱动的多工具配置控制平面**：工具能力以 declarative JSON registry 声明，应用侧只实现有限的、审计过的内置 capability handler。这是典型的 Strangler 渐进迁移，而非重写。

## 2. 进程与分层模型

```
┌─────────────────────────────────────────────────────────────┐
│ Renderer（sandbox: true，无 Node）                            │
│  React 18 + AntD 5 + Zustand；面板懒加载；Monaco 按需 runtime │
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

1. **收尾 v1.5.0 发布链**：production publisher key 离线仪式、实机性能与业务验收。这是当前最高优先级，任何新特性让路。
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
