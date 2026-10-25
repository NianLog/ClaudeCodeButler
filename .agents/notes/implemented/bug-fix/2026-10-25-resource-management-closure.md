# Agent Note: 资源管理真实路径、权限保持与备份恢复闭环

Status: implemented
Scope: src/main/**, src/preload/index.ts, src/shared/**, src/renderer/src/**, tests/**, package.json
Last-verified: 2026-10-25

## Problem

用户反馈 Skills 发现失败和 MCP 恢复错误。对提交 80d2979 的全路径复核新增 19 个失败反例，并在隔离 HOME 的真实 Electron 中复现 5 个场景；既有 466 pass / 4 条件 skip 没有覆盖这些路径。旧高级编辑仍先删除再新建，丢失附件、原文件和未展示的权限字段；原生文件保存缺少 revision，恢复未备份当前状态并丢弃草稿。来源发现、默认路径和通用 YAML 假设也不符合部分工具的实际格式。

用户已批准分三批修复，保留全部配置路径和用户数据，不做大重构，不发布。

## Decision

三批代码、本机回归和干净提交的新候选包核验已完成；暂不发布，不能视为目标机/云 CI/跨平台生产验收通过。

1. 数据与权限：旧表单通过主进程委托统一资源更新和备份，不再组合 delete/add；保留完整原文中的未知字段与附件。原生文件保存/恢复核对 expectedRevision，恢复前备份当前文件。新备份校验字节摘要与大小，旧副本标记无历史摘要并保持可恢复。Qoder 顶层停用策略参与转换与 revision。
2. 发现与格式：按当前资源种类有界扫描，逐候选诊断；有效 registry 中的现有路径优先，列举所有配置层。坏条目不隐藏正常项，未知写入边界仍拒绝。链接只在目标独立命中有效白名单时作为只读引用展示。按 tool/kind 解释原生字段；MCP 从受控历史副本拆分服务器并走现有 preview/apply，避免覆盖无关配置。
3. 交互与验收：恢复进入 dirty/busy 守卫，缺失原文件仍可查历史。导入先发现并选中可用来源，扫描后才提示未找到。自动化规则、环境排查归入工具，显示真实作用域；补齐错误态翻译。19 个反例全部入库，完成真实 Electron 全流程、完整回归和干净提交候选验证。

## Historical decision review

- [跨工具导入](../../implemented/feature/2026-10-25-agent-import-and-global-context.md)：部分重叠；本记录补齐真实路径与旧入口，按项 MCP 恢复取代其整文件恢复选择。保留旧记录及其历史验收，明确其不足。
- [持久化失败边界](../../implemented/bug-fix/2026-10-19-persistence-and-proxy-safety.md)：部分重叠；沿用原子写和单进程队列，增加草稿版本检查，不把原子替换称为外部并发保护。
- [Skill 覆盖保护](../../implemented/bug-fix/2026-10-20-proxy-protocol-and-skill-import.md)：部分重叠；继续复用完整包暂存和回滚，补齐旧更新路径。
- [后续路线](../../proposed/feature/2026-10-20-configuration-reliability-roadmap.md)：范围不同；继续 proposed，不引入云账号、同步或运行编排。

## Alternatives considered

- 保留 MCP 整文件恢复作为默认入口：实现复用最直接，但会撤回无关服务器和 Agent 设置；改为按项预览，整文件恢复留在原生文件工具中。
- 忽略所有读取异常并返回空：能消除报错，但会伪装成未安装，且后续可能覆盖不可见条目；返回逐项状态，写入仍重新验证实际目标。
- 跟随任意链接：可以读到更多安装，但不能证明目标在授权范围内；链接本身不授予权限，只读引用必须再次独立授权真实路径。
- 重写全部高级界面和服务：会扩大兼容验证范围；保留专有导出等能力，更新/删除等写入委托已有资源服务。

## Verification

验收要求：19 个审查反例入库转绿；真实 Electron 验证发现、导入、旧编辑、附件/权限保持、保存冲突、删除及按项/整文件恢复、缺失原件、dirty/busy 与失败反馈。验证使用隔离目录，随后完成类型、lint、测试、双构建、preflight、依赖审计和干净提交候选核验；分批本地提交，暂不发布。

第一批验证：10 个写入/恢复反例全部转绿；相关 8 files / 134 tests 通过，类型检查零错误，全量 lint 零错误（16 个既有非空断言 warning）。

第二批验证：其余 9 项全部转绿，R1～R19 均已入库。资源、发现、路径、旧兼容编辑、MCP/归档、artifact、registry 和 preload 的核心组合 20 files / 267 tests 通过，无跳过；后端类型与 lint 零错误。补充预算停止、链接改向/授权撤销、保存后单项回读失败和外部改写、OpenCode 权限变化等反例。

扫描按当前 kind，空来源继续检查其他候选，错误单独诊断。链接先逐段检查本机路径，再读取目标并独立授权；链式链接和 UNC 不读取。总预算用尽后保留已发现项及一条诊断，集合未完整确认时拒绝写入。保存后需核实实际计划；写成但回读失败明确要求核对，不能返回空内容成功或自动重试。

第三批修复：自动化规则与环境排查移至“工具”，明确独立于全局 Agent 的操作作用域。旧表单使用明确保存动作、提交状态与常驻错误，正文提取不再吞掉起始空行。原生文件保留被点击候选的 main 解析路径，缺失第二候选创建不会退回首路径；历史标签区分“记录摘要”和“实际校验”。确认弹窗等待 Hook Modal 的结果，失败保留弹窗且不产生未捕获 Promise。

完整验证：57 files / 555 tests 全通过，无跳过；本地提供既有 rehearsal 密钥配置和 web staging 样本。覆盖率 statements 50.25%、branches 54.37%、functions 48.91%、lines 50.50%（统计 main/proxy/shared，不含 renderer）。类型零错误，lint 零错误/15 个既有非空断言 warning，lint:changed、root/proxy 构建、正式 preflight 和 root/proxy 全依赖 audit（均零漏洞）通过。

真实 Windows Electron 45 使用生产 out、真实 preload/IPC、独立 HOME/AppData/临时目录完成 19 组验收，未捕获 renderer 异常为零，正常退出，5 个既有用户文件摘要保持不变。包含默认发现、同 sourceId 重扫、空来源后继检查、文件/项目选择、遮罩预览与逐项结果、写中切换/退出保护、失败删除、按项恢复、缺失原件、旧 Skill/角色附件与权限/正文空白、保存失败留稿、外部版本冲突、整文件恢复草稿决策/回退副本、多候选精确创建、四主题和 1280 布局。多候选写错与起始空行丢失均在旧实现先复现失败，再修复转绿。

复跑命令（Windows，使用 `.nvmrc` 工具链）：`npm.cmd run build`，随后 `npm.cmd run test:electron`。脚本只使用 `release/electron-e2e/profile-*` 夹具并保留截图/JSON；打包清理 release 前应另存证据。它不安装外部 Agent，不执行模型付费请求，不放宽 renderer sandbox，不向真实用户路径写入。

候选核验：从干净源码 `37e020ee59432fa499bc7b0e6aa07acccb9abfdb` 构建未签名 Portable/NSIS/ZIP。Portable 和 ZIP 解压版业务通过；ZIP/NSIS 程序及 ASAR 载荷匹配；52 个 ASAR 生产文件逐字节匹配 out。ASAR 两项 fuse 开启、私钥与 axios 不在包内；篡改副本拒绝启动且不创建 settings。两份 CycloneDX SBOM 与六项 SHA-256 核验通过，来源记录 sourceDirty=false。真实 1.5.0 写入的独立 profile 在新包中兼容；离线编辑/worker、窗口安全、编译独立代理鉴权与配置保持通过。NSIS 仅解包核验，未执行安装/注册表写入。

## 官方格式核对（2026-10-25）

| 来源 | 已确认与适配 | 边界与依据 |
| --- | --- | --- |
| Claude / Cursor | Claude Skill 前言字段可选；Cursor 支持纯正文与共享 Skill，MCP 使用 `.cursor/mcp.json` | [Claude Skills](https://code.claude.com/docs/en/skills)、[Cursor MCP](https://cursor.com/docs/mcp)、[Cursor Skills](https://prod.cursor.com/help/customization/skills)。源文件有效与目标必填字段分别验证，不补造描述。 |
| Qoder | CLI 用户配置、项目 settings / `.mcp.json` / local 分层单列 | [CLI MCP](https://docs.qoder.com/cli/mcp-reference)、[Subagent](https://docs.qoder.com/cli/subagent)、[Skills](https://docs.qoder.com/cli/Skills)。不隐式合层，不声称覆盖 IDE 私有配置。 |
| WorkBuddy | `.codebuddy` 的代码项目/用户兼容 profile | [官方项目说明](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Project)。桌面连接器私有存储未确认。 |
| TRAE | 项目 `.trae/mcp.json` 保留为兼容候选 | [MCP 文档](https://docs.trae.ai/ide/model-context-protocol)本次未能取回正文，不作为全局路径证据。用户级 MCP 返回不可选的未确认诊断，要求手选导出文件，不猜 HOME/APPDATA。 |
| Pi | 用户 `.pi/agent/mcp.json` 与项目 `.pi/mcp.json` 内置协议 | [官方 MCP](https://pi.dev/docs/latest/mcp)。扩展可替换内置实现，不猜扩展角色或复制鉴权会话。 |
| OpenCode | `opencode.json[c]` MCP、以文件名命名的 Markdown agents、原生 Skill 字段 | [MCP](https://opencode.ai/docs/mcp-servers/)、[Agents](https://opencode.ai/docs/agents/)、[Skills](https://opencode.ai/docs/skills/)。已知全局权限、工具限制或 JSON 同名覆盖无法映射则 BLOCKED，配置变化中止；不宣称迁移企业审批与远程授权。 |

## Consequences

revision 检查不能提供外部 CLI 的跨进程事务；旧无摘要副本不能被追溯证明历史完整性。尚未取得官方结构的桌面变体不假定等价。补修已重建并校验；后续[内嵌 Node 复核](../process/2026-10-25-latest-stable-dependency-upgrades.md)确认七项上游修复缺失，运行时安全门禁未通过。后续[网络 A+B 缓解](2026-10-25-reachable-node-network-mitigations.md)已完成 642 项回归、22 组真实 Electron 与源码 2086a94 新候选本机验收；厂商缺失事实不变，应用入口另行验收。签名与安装/覆盖升级/卸载按用户要求暂缓，云 CI 和其他平台未验证。
