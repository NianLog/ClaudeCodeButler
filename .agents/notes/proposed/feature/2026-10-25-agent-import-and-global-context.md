# Agent Note: 1.5.1 跨工具导入、全局管理对象与四主题改进

Status: proposed
Scope: src/shared/**, src/main/services/**, src/main/ipc-handlers.ts, src/preload/index.ts, src/renderer/src/**, tests/unit/**, ARCHITECTURE.md, CAPABILITIES.md, DEVELOPMENT.md, CHANGELOG.md, README.md, README_CN.md, PRODUCT.md, .impeccable/config.json
Last-verified: 2026-10-25

## Problem

用户要求 1.5.1 加强 MCP、Skills、子 Agent 的跨工具识别、转换和导入，并学习 AstrLink 的界面组织；取消独立“AI 配置工具”页，用 header 中的全局管理对象选择器统一相关模块。用户已确认主要场景为个人开发者日常维护多个 Agent，先评审交互原型。

本轮先保存旧候选为 ed53f23，在 codex/v1.5.1-agents-ux-upgrades 上准备调研、原型和本提案。运行代码与两套项目锁文件尚未修改，新需求不属于旧包的已验收范围。

### 既有记录审计

| 命中 | 分类与处理 |
| --- | --- |
| [配置可靠性路线](2026-10-20-configuration-reliability-roadmap.md) | 部分重叠；用户把跨工具导入、全局对象与界面改进提前到 1.5.1，其他诊断/恢复路线仍属后续，互链 |
| [代理协议与 Skill 覆盖导入](../../implemented/bug-fix/2026-10-20-proxy-protocol-and-skill-import.md) | 部分重叠；沿用完整目录校验、暂存、备份、切换与回滚，不另建一套 Skill 复制机制，互链 |
| [配置写入与代理边界](../../implemented/bug-fix/2026-10-19-persistence-and-proxy-safety.md) | 部分重叠；延续失败传播、备份失败不写入、超时不盲重试，互链 |
| [新稳定依赖升级](../../implemented/process/2026-10-25-latest-stable-dependency-upgrades.md) | 同批前置；包含运行时安全核验和 React/AntD/Zustand 等升级，互链 |
| 已验收候选与隐藏工作区监控 | 无关的既有实现保留；不把新扫描接进常驻 watcher 或更改旧数据路径 |

## Proposal

### 范围与假设

1. 管理目标先保留 registry 中已有的 Claude Code、Codex CLI、Gemini CLI、Antigravity 四个 toolId。新增 Cursor、Qoder、WorkBuddy、TRAE、Pi、OpenCode 作为导入来源；“来源”不等于已承诺对这些工具提供全部写入管理。若用户希望十类工具全部成为管理目标，需要先调整本范围。
2. 跨工具转换先覆盖 MCP、Skill 包和子 Agent 定义。登录状态、OAuth token store、供应商配置与账单身份不自动互搬；原有原生文件编辑仍保留。
3. 保留现有用户级目标路径和 Claude LEGACY_COMPAT。保留 Claude 已有项目级 MCP 能力；读取其他项目来源时由主进程本机对话框授权，不新增任意 renderer 路径或 PROJECT 模板变量。
4. 配置文件按 UTF-8、1 MiB 上限处理；单个 Skill 继续沿用 2000 文件、10 MiB 单文件、50 MiB 总量、深度与链接限制。超限拒绝，不截断成成功导入。未验证的格式、权限和版本不假装兼容。
5. header 切换只改变查看与管理上下文，不应用配置、不重启 Agent、不创建其资源目录。草稿与进行中的写入需要先处理；保存失败时保留原上下文。
6. 本轮只做本地候选，不 tag、不 publish；与依赖提案中的运行时安全、代码签名门禁分别跟进。

### 已核实的来源格式与适配等级

下面是设计依据，不是当前 CCB 已完成的能力。用户级和项目级的优先级由各工具原生规则决定，不统一拍平。

| 来源 | MCP | Skills | 子 Agent | 本轮边界与依据 |
| --- | --- | --- | --- | --- |
| Claude Code | 用户 ~/.claude.json 的 mcpServers；项目 .mcp.json | ~/.claude/skills 与项目 .claude/skills，SKILL.md + 附件 | ~/.claude/agents 与项目 .claude/agents 的 Markdown/YAML frontmatter | [目录](https://code.claude.com/docs/en/claude-directory)、[Skills](https://code.claude.com/docs/en/skills)；保留现有 CCB 行为 |
| Codex CLI | ~/.codex/config.toml 与可信项目 .codex/config.toml 的 mcp_servers | 按当前官方发现位置与兼容目录识别；不移动已有 .codex/skills | ~/.codex/agents 与项目 .codex/agents 的独立 TOML；name、description、developer_instructions | [MCP](https://learn.chatgpt.com/docs/extend/mcp)、[技能](https://learn.chatgpt.com/docs/build-skills)、[子 Agent](https://learn.chatgpt.com/docs/agent-configuration/subagents)；AGENTS.md 是指令，不是角色定义 |
| Gemini CLI | settings.json 中 mcpServers；HTTP 字段与 stdio 分别识别 | ~/.gemini/skills 与项目 .gemini/skills | .gemini/agents 或 ~/.gemini/agents 的 Markdown/YAML；区分 kind: local/remote、原生工具名、功能开关 | [设置](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/settings.md)、[Skills](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/skills.md)、[角色](https://github.com/google-gemini/gemini-cli/blob/main/docs/core/subagents.md)；旧版兼容不等于自动迁移到 Antigravity |
| Antigravity | 用户 ~/.gemini/config/mcp_config.json、项目 .agents/mcp_config.json；新远程字段 serverUrl，与旧 url/httpUrl 分开转换 | App 全局 ~/.gemini/config/skills；新 CLI ~/.gemini/antigravity-cli/skills；项目 .agents/skills，兼容旧 .agent/skills | 官方 custom subagents 的 .agents/agents、~/.gemini/config/agents Markdown | [Skills](https://antigravity.google/docs/skills/)、[迁移](https://antigravity.google/docs/cli/gcli-migration/)、[子 Agent](https://antigravity.google/docs/subagents?tab=cli)；App/CLI 区分，现有路径不自动改写 |
| Cursor | ~/.cursor/mcp.json、项目 .cursor/mcp.json；mcpServers | .cursor/skills、.agents/skills 及官方兼容目录；可递归分类 | .cursor/agents 的 Markdown/YAML；readonly、is_background 与模型字段有原生语义 | [MCP](https://cursor.com/docs/mcp)、[Skills](https://cursor.com/docs/skills)、[角色](https://cursor.com/docs/subagents)；不能把 readonly 当普通说明文字丢掉 |
| Qoder | CLI 的 ~/.qoder/settings.json、项目/本地设置中 mcpServers；IDE 单独识别或文件导入 | 用户与项目 .qoder/skills | 用户与项目 .qoder/agents Markdown/YAML | [设置](https://docs.qoder.com/cli/settings-reference)、[MCP](https://docs.qoder.com/cli/mcp-reference)、[Skills](https://docs.qoder.com/extensions/skills)、[角色](https://docs.qoder.com/cli/subagent)；WS、OAuth、trust、alwaysAllow 不能直接套用到其他工具 |
| WorkBuddy | 桌面与 CodeBuddy 引擎区分；确认公开路径后启用默认探测，否则支持本机 JSON 文件导入 | 官方确认兼容 .codebuddy/skills；桌面技能来源按发行版本识别 | 官方确认兼容 .codebuddy/agents；不把 UI“专家”内存数据假定为公开文件 | [项目兼容说明](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Project)、[引擎 MCP](https://www.workbuddy.ai/docs/enterprise/222639541654876160)；不依据第三方教程直接启用猜测的桌面路径 |
| TRAE | 项目 .trae/mcp.json；全局支持 Raw Config JSON 文件导入，未核实的 AppData 路径不猜测 | 用户与项目 .trae/skills，SKILL.md；.agents/skills 是否启用按设置判断 | 尚未核实通用公开角色文件规范；先明确标注不可自动转换，参考文本单列 | [MCP](https://docs.trae.cn/ide_add-mcp-servers)、[Skills](https://docs.trae.ai/ide/skills)；不读取私有数据库或宣称所有自定义 Agent 可无损导入 |
| Pi | 当前 pi.dev 发行从 0.99.0 起内置 MCP：~/.pi/agent/mcp.json、项目 .pi/mcp.json；stdio/HTTP，不支持旧 SSE | ~/.pi/agent/skills、.pi/skills 与 .agents/skills，包资源一起保留 | 按已确认的扩展 profile 适配；未核实的扩展不解析执行代码，也不认定为统一原生角色格式 | [安装](https://pi.dev/docs)、[MCP](https://pi.dev/docs/latest/mcp)、[配置](https://pi.dev/docs/latest/configuration)、[Skills](https://pi.dev/docs/latest/skills)；当前 @earendil-works 为 1.4.0，旧 @mariozechner 为 0.73.1，不能仅凭 Pi 名称沿用旧结论 |
| OpenCode | opencode.json/jsonc 中 mcp；local command 是 argv 数组，environment 字段独立；remote 有 headers/OAuth | .opencode/skills、~/.config/opencode/skills 及 Claude/Agent Skills 兼容目录 | .opencode/agents、~/.config/opencode/agents Markdown 或配置中的 agent；区分 primary/subagent | [配置](https://opencode.ai/docs/config/)、[MCP](https://opencode.ai/docs/mcp-servers/)、[Skills](https://opencode.ai/docs/skills/)、[角色](https://opencode.ai/docs/agents/)；provider/model、permission 不能机械映射 |

同形的 MCP JSON 或标准 SKILL.md 无法单靠内容可靠判断具体来源。自动识别结合固定路径、已知 schema、版本与发行来源；手选文件无法确定来源时显示“兼容格式，来源待确认”，让用户选择 profile，不伪造准确识别。

共享 .agents/skills 可能被多个工具同时读取。发现时按真实文件位置去重并标明共享影响，不能把重复发现当成多个独立包。拒绝链接时提供选择真实目录的方式，不放宽链接红线。

### E：全局管理对象与配置页

- 在原生标题栏下方的内容区 header 放唯一的“当前管理”选择器；现有 Windows 原生标题栏保留。
- renderer 由单一 selectedToolId 驱动配置、MCP、Skills、子 Agent；各模块移除管理对象选择器。导入对话框的“来源选择”保留，它不是目标切换器。
- 切换时使旧数据失效，按需读取当前页数据，其他页延后读取；不顺便加载 auth 文件、启动命令或扫描所有来源。用请求代次丢弃旧结果，不让 Claude 的结果出现在 Codex 标题下。
- 主进程每个请求明确携带 toolId，实时取 effective registry 和允许路径；不用 singleton.setCurrentTool 这种可变全局目录，以免并发请求写错对象。旧 IPC 未传 context 时兼容默认 Claude；明确传未知 toolId 必须拒绝。
- 资源编辑发布草稿状态；切换时提供保存/放弃/取消。保存成功才切换；失败保留草稿。导入、应用配置等同对象写动作也应处理已有草稿。
- Skills/Agents 的 constructor 和 scan 不再创建原生目录；ENOENT 返回空态，权限/损坏错误正常展示。只有明确创建或导入时才初始化写入目录。
- 取消“AI 配置工具”路由与卡片入口；原生文件编辑、校验、配置集、备份、恢复归入“配置管理”。旧 ai-tools 导航状态兼容映射到 configs；保留 backend registry、adapter 与配置集服务。
- Claude 专属项目、统计、托管模式明确标识适用范围。全局选 Codex 时不把 Claude 数据伪装成 Codex；不为这些模块扩展未请求的新协议。

### 规则库兼容

已读源码：mergeToolRegistryBundles 当前让 installed 中同 toolId 的完整定义无条件覆盖 embedded；新二进制里的新增能力可能被旧缓存遮住。

推荐按经过验证的 definitionVersion 选较新的完整工具定义，同版本维持 installed 优先。不能把两份定义的路径、权限随意拼起来，也不清空或重写已签名缓存。对已安装定义中与新版不同的既有自定义路径或受限权限，先保留其选择并提示需要确认，不能自动换成内置默认。新内置定义保留既有 artifactId、配置路径和配置集分组，显式增加受控的 MCP 字段绑定、Skill/角色目录 handler。新增能力仅进入已知枚举与 minimumAppVersion 门禁，原 READ-only 文件不能因此变成任意原文编辑。

回归必须覆盖旧缓存、新缓存、同版本优先、较新的已安装受限定义、损坏缓存与 last-known-good。新目录不得意外进入旧配置集的激活组。相应 schema、协议说明、ARCHITECTURE/CAPABILITIES 与兼容性测试一起更新，签名、哈希、size、降级保护和 pinned origin 不变。

### F：导入的最小契约

复用现有 registry、ToolArtifactCodecService、ToolArtifactManagementService、ToolConfigSetService、原子写入与 Skill 暂存机制；新增一个限定为三类资源的导入服务，不建通用插件运行器或第二份配置数据库。转换是确定性本地代码，不调用模型解释或执行 Skill/Agent 中的指令。

拟定跨进程边界：

    type AgentResourceKind = 'MCP' | 'SKILL' | 'SUBAGENT'
    discoverImportSources(): Promise<ApiResponse<ImportSource[]>>
    chooseImportProject(): Promise<ApiResponse<{ sourceContextId: string }>>
    previewResourceImport({
      sourceId, sourceContextId?, targetToolId, kind, resourceIds
    }): Promise<ApiResponse<ImportPreview>>
    applyResourceImport({
      previewId, decisions
    }): Promise<ApiResponse<ImportReceipt>>

实际共享类型放入 src/shared，preload 只转发有边界的数据。选择对话框由 main 拥有；renderer 不回传任意绝对路径。previewId 在 main 绑定窗口、来源、目标、文件 hash 和 registry 状态；apply 再授权和校验，不信任 renderer 传回的旧 diff。

流程为“发现来源 → 选择资源 → 预览转换/冲突/影响范围 → 确认 → 逐项结果与恢复入口”。要求：

1. 来源只读。相同资源重复导入默认跳过；重名默认保留，可明确另名；Skill 沿用安全的备份后覆盖。源与目标为同一真实目录时直接跳过。
2. MCP 规范化保持 executable 与 argv 边界，处理 command/args 与 OpenCode command 数组、env/environment、URL/HTTP 字段、启停字段及 timeout 单位差异。不能根据 URL 结尾猜协议，不能把 WS/SSE/HTTP 静默互换。
3. 凭据值默认遮盖，日志不记录原文。保留环境变量引用，不能擅自展开成本机秘密；OAuth 登录状态不跨工具复制。原生自动发现和执行由目标工具决定，最终预览说明写入后的影响，CCB 不在导入时运行命令。
4. JSON/JSONC 用局部修改保留未选字段、注释和原始值；TOML 优先保留原文并追加经整体校验的新 MCP 表。无法安全局部覆盖时默认跳过/另名或转为人工 diff，不能 stringify 全文件并静默丢注释。
5. Skill 整包复制，保留脚本、引用和二进制附件；frontmatter 的自动调用/权限语义不支持时明确阻止或要求处理，不只复制一段 Markdown。
6. 子 Agent 保留 prompt、description 和可映射字段；模型别名、工具名与权限按目标转换。Codex 角色不能覆盖父权限、provider、MCP；Cursor readonly、OpenCode permission、Gemini kind: remote 等不能默默丢掉。无法保持约束时阻止自动应用，不靠提示词伪造沙箱。
7. 同目标的读取、校验、备份和写入放进同一队列，与旧写入口一致。过期预览、备份失败、解析失败与权限错误都不覆盖原文件。
8. 批量以单项为可恢复边界，先校验后写入；部分完成列清成功/失败/跳过，不能报整体成功。apply 重复调用共享回执；超时先核查结果，不盲目重试写入。进程重启后失效的预览要求重新读取。

### G：界面与四主题

参考仓库已在工作区外只读检出到 2cba3d6（2026-10-24），阅读了 apps/desktop/src/components/AppShell.tsx、PageHeader.tsx、styles/globals.css 与主题源码，并查看官方明暗截图。其 Apache-2.0 许可已核对；本方案学习界面组织，不复制品牌或替换成 Tauri/Bun/Rsbuild。

学习的部分是紧凑导航、统一页头、主体工作区、清楚的主次操作、列表与细节的层次。CCB 继续保留四个主题 ID、用户选择、中英双语和当前默认主题；原型的初始 Light 只便于评审，不是更改产品默认值。

四主题统一语义 token：背景、表面、文字、边框、强调、状态、焦点、密度、圆角和编辑器。Dark Pro 保持蓝色深色工作区，Minimal 保持柔和紫色，Terminal 保持绿色和等宽特点，Light 保持清楚的亮色层次。主题同步覆盖导航、表格、表单、弹窗、编辑器、日志与错误状态；不增加在线字体或一套替代组件库。

交互原型是独立 HTML、示例数据、禁外部连接、无 Electron bridge；不读取本机配置。已有 1440×980 四主题与 1280×800 截图、11 类交互自检、正文/次要文字/主按钮文字对比度检查；包括保存失败不切换、草稿存在时不绕过导入保护、OpenCode argv 数组的差异样例。它证明设计交互可评审，不证明 React 新版本、IPC 或真实文件写入已经验收。实际界面实现时再执行 Impeccable 检测与有界视觉检查。

本机评审产物：[交互原型](C:/Users/nianl/.codex/visualizations/2026/10/19/01a1549d-3784-77f2-87a8-68255dc1aa1a/ccb-151-expansion-20261024/ccb-151-interaction-prototype.html)、[11 项自检报告](C:/Users/nianl/.codex/visualizations/2026/10/19/01a1549d-3784-77f2-87a8-68255dc1aa1a/ccb-151-expansion-20261024/prototype-review/qa-report.json)。这些是工作区外的独立评审文件，不是已合入应用的功能。

### 实施顺序与文件

| 批次 | 主要文件 | 验证 |
| --- | --- | --- |
| D0/D1/D2 | 两套 package/lock、CI、preflight、构建/TS/ESLint/PostCSS；managed-mode-service、mcp-management.service、proxy transport；受升级影响的表格/图表/store/editor | 运行时修复核验、严格安装、两包审计、原基线回归、双构建 |
| E | shared registry/validator、builtin registry、tool-registry-service、Main/Preload contract、全局 context store、ModernLayout、App 与 Config 容器 | 定义版本优先级、旧缓存、旧导航、旧 IPC、快速切换和无写入读取 |
| F | 新 agent-resource-import-service 与受限转换器、现有 MCP/Skills/Agents 服务、三套 store/panel、共享类型与导入流程 | 官方格式 fixtures、权限差异、hash 冲突、重复导入、越界、备份失败、回滚、附件字节一致 |
| G | themes/index、useTheme、全局 CSS、资源页和通用表单/弹窗、locales、双语 README 与三份活文档 | 四主题视觉/键盘/错误态、真实 Windows 包与旧 profile、完整最终门禁 |

## Alternatives considered

- 每模块各存一份 selectedToolId：容易上下文不一致和旧请求覆盖，拒绝。
- header 选择即激活配置或重启 CLI：混淆查看与写入，拒绝。
- 删除整个 registry/原生文件能力：会丢失 v1.5.0 已有功能，拒绝；只移除重复前端入口。
- 新增六工具立即提供全部双向管理：用户本句明确提出的是来源导入，先完成来源适配；全管理作为另一范围。
- 所有格式转成同一 JSON 再全量覆盖：会丢失注释、未知字段和权限，拒绝。
- installed 永远覆盖内置：新适配可能长期被旧缓存遮住，拒绝继续沿用；保留同版本优先和新版本受限定义。
- 逐 artifact 混合两份规则、强制清缓存：可能拼出未审查的权限或改变用户状态，拒绝。
- 扫描整个 HOME、执行导入脚本、解析任意扩展代码：超出授权范围，拒绝。
- 单独开发云同步、团队权限或 Agent 运行编排：当前需求不需要，保持后续路线。

## Acceptance criteria

1. 用户确认本范围、依赖取舍及原型后再实施；没有审批前运行代码与项目锁文件不改。
2. 现有四目标与六新增来源逐资源形成“已支持/需处理/不可自动转换”的实际矩阵。没有原生规范、客户端版本或账号证据时明确边界，不能把结构测试写成真实客户端已运行。
3. 切换管理对象不改工具文件、不建资源目录、不执行命令；所有四主题保留原 ID 和持久化选择；旧配置、备份、workspace 与现有项目功能保持。
4. 只有一个全局目标选择器；来源选择只出现在导入。旧请求与旧错误不能覆盖新上下文；保存失败或取消切换时不丢草稿。
5. 导入是主进程授权、预览与受控写入；保留未选内容、Skill 附件与约束。损坏、越界、链接、过期 hash、失败备份和重复 apply 有可复现测试及明确反馈。
6. 新旧 registry 优先级、native file handler、MCP 受限编辑与目录 handler 有兼容测试；失败仍 fail-closed，不能回落到错误工具路径。
7. 完成新范围后同步 ARCHITECTURE、CAPABILITIES、DEVELOPMENT、CHANGELOG 与中英文案；各批更新对应 DDE 状态，不提前标 implemented。
8. 最终跑完整回归、两套审计/构建、正式 preflight、DDE 门禁、实际 Windows 包业务与安全检查、旧 profile 和四主题检查。安装/卸载、其他 OS、真实企业 CA/账号、云端 CI 分别报告有无证据。
9. 暂不发布。运行时安全与正式签名分别记录，未核实的高危修复不能因 npm audit 0 或 UI 原型通过而关闭。

## Risks

跨工具格式相似并不保证原生运行语义相同。稳定依赖的主版本更新、旧规则缓存、共享 Skill 目录、权限继承和多候选路径都可能造成误判，必须让预览说明实际影响。

原型不是应用实现；目前没有新版本 React、真实 IPC、导入落盘或目标工具原生加载的回归结果。Trae 通用角色文件、部分 WorkBuddy 桌面自动路径和任意 Pi 扩展仍待具体规范，不反向工程私有数据库来补齐宣传。Node 运行时修复和有限编码收紧见依赖提案；正式发布继续受阻。
