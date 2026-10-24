# Agent Note: 1.5.1 跨工具导入、全局管理对象与四主题改进

Status: implemented
Scope: src/shared/**, src/main/services/**, src/main/ipc/**, src/main/ipc-handlers.ts, src/main/utils/agent-resource-queue.ts, src/main/utils/mcp-data.ts, src/main/utils/renderer-exit-guard.ts, src/main/index.ts, src/preload/index.ts, src/renderer/src/**, tests/unit/**, ARCHITECTURE.md, CAPABILITIES.md, SECURITY_AUDIT_REPORT.md, DEVELOPMENT.md, CHANGELOG.md, README.md, README_CN.md, PRODUCT.md, DESIGN.md, .impeccable/design.json
Last-verified: 2026-10-25

## Problem

日常维护多个 Agent 时，各模块分别选择目标容易误写；原 MCP、Skill、子 Agent 面板只覆盖 Claude。用户于 2026-10-25 批准：四款现有工具做管理与互导，新增六款仅作导入来源；采用已评审交互原型，保留原路径与用户数据，分批提交，暂不发布。

复用[代理协议与 Skill 覆盖保护](../bug-fix/2026-10-20-proxy-protocol-and-skill-import.md)和[持久化失败边界](../bug-fix/2026-10-19-persistence-and-proxy-safety.md)。[稳定工具链](../process/2026-10-25-latest-stable-dependency-upgrades.md)为前置；[后续产品路线](../../proposed/feature/2026-10-20-configuration-reliability-roadmap.md)仍为 proposed，未把云同步、账号和运行编排带入本版。

## Decision

### E：全局管理对象与原生资源

Header 只有 Claude Code、Codex CLI、Gemini CLI、Antigravity 四个可写管理目标。切换只重新读取，不激活配置、不创建资源目录、不执行 CLI。配置管理保留旧工作区、配置快照、原生文件编辑/验证/备份/恢复；移除独立“AI 配置工具”导航，内部通用文件面板继续复用。Claude 项目、统计、托管、自动化等明确显示 Claude 作用域。

新的 agent-context-store 在切换目标、离开模块、刷新和退出时统一处理 dirty/busy：保存成功才继续；失败或取消保留原目标与草稿；写入中拒绝切换。草稿保留在当前进程内存，未实现磁盘自动草稿或崩溃恢复。退出先问 renderer，再清理后台服务并等待资源队列排空。请求 generation 防止旧响应覆盖新上下文。

目标路径逐次由 effective registry 授权：Claude MCP 为 ~/.claude.json 的 mcpServers，Codex 为 ~/.codex/config.toml 的 mcp_servers，Gemini 为 ~/.gemini/settings.json 的 mcpServers，Antigravity 为 ~/.gemini/config/mcp_config.json 的 mcpServers。Skill 整包与 Markdown/TOML 子 Agent 在各自原生候选目录内管理；Codex 识别 ~/.agents/skills 与旧 ~/.codex/skills，Antigravity 保留现有候选。Claude workspace 继续经 LEGACY_COMPAT facade，不移动目录。

### F：十种来源、受控转换和恢复

| 来源 | MCP | Skills | 子 Agent | 本轮边界与依据 |
| --- | --- | --- | --- | --- |
| Claude Code | 用户 ~/.claude.json 的 mcpServers；项目 .mcp.json | ~/.claude/skills 与项目 .claude/skills，SKILL.md + 附件 | ~/.claude/agents 与项目 .claude/agents 的 Markdown/YAML frontmatter | [目录](https://code.claude.com/docs/en/claude-directory)、[Skills](https://code.claude.com/docs/en/skills)；保留现有 CCB 行为 |
| Codex CLI | ~/.codex/config.toml 与可信项目 .codex/config.toml 的 mcp_servers | 按当前官方发现位置与兼容目录识别；不移动已有 .codex/skills | ~/.codex/agents 与项目 .codex/agents 的独立 TOML；name、description、developer_instructions | [MCP](https://learn.chatgpt.com/docs/extend/mcp)、[技能](https://learn.chatgpt.com/docs/build-skills)、[子 Agent](https://learn.chatgpt.com/docs/agent-configuration/subagents)；AGENTS.md 是指令，不是角色定义 |
| Gemini CLI | settings.json 中 mcpServers；HTTP 字段与 stdio 分别识别 | ~/.gemini/skills 与项目 .gemini/skills | .gemini/agents 或 ~/.gemini/agents 的 Markdown/YAML；区分 kind: local/remote、原生工具名、功能开关 | [设置](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/settings.md)、[Skills](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/skills.md)、[角色](https://github.com/google-gemini/gemini-cli/blob/main/docs/core/subagents.md)；旧版兼容不等于自动迁移到 Antigravity |
| Antigravity | 用户 ~/.gemini/config/mcp_config.json、项目 .agents/mcp_config.json；新远程字段 serverUrl，与旧 url/httpUrl 分开转换 | App 全局 ~/.gemini/config/skills；新 CLI ~/.gemini/antigravity-cli/skills；项目 .agents/skills，兼容旧 .agent/skills | 官方 custom subagents 的 .agents/agents、~/.gemini/config/agents Markdown | [Skills](https://antigravity.google/docs/skills/)、[迁移](https://antigravity.google/docs/cli/gcli-migration/)、[子 Agent](https://antigravity.google/docs/subagents?tab=cli)；App/CLI 区分，现有路径不自动改写 |
| Cursor | ~/.cursor/mcp.json、项目 .cursor/mcp.json；mcpServers | .cursor/skills、.agents/skills 及官方兼容目录；可递归分类 | .cursor/agents 的 Markdown/YAML；readonly、is_background 与模型字段有原生语义 | [MCP](https://cursor.com/docs/mcp)、[Skills](https://cursor.com/docs/skills)、[角色](https://cursor.com/docs/subagents)；不能把 readonly 当普通说明文字丢掉 |
| Qoder | CLI 的 ~/.qoder/settings.json、项目/本地设置中 mcpServers；IDE 单独识别或文件导入 | 用户与项目 .qoder/skills | 用户与项目 .qoder/agents Markdown/YAML | [设置](https://docs.qoder.com/cli/settings-reference)、[MCP](https://docs.qoder.com/cli/mcp-reference)、[Skills](https://docs.qoder.com/extensions/skills)、[角色](https://docs.qoder.com/cli/subagent)；WS、OAuth、trust、alwaysAllow 不能直接套用到其他工具 |
| WorkBuddy | 桌面与 CodeBuddy 引擎区分；确认公开路径后启用默认探测，否则支持本机 JSON 文件导入 | 官方确认兼容 .codebuddy/skills；桌面技能来源按发行版本识别 | 官方确认兼容 .codebuddy/agents；不把 UI“专家”内存数据假定为公开文件 | [项目兼容说明](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Project)、[引擎 MCP](https://www.workbuddy.ai/docs/enterprise/222639541654876160)；不依据第三方教程直接启用猜测的桌面路径 |
| TRAE | 项目 .trae/mcp.json；全局支持 Raw Config JSON 文件导入，未核实的 AppData 路径不猜测 | 用户与项目 .trae/skills，SKILL.md；.agents/skills 是否启用按设置判断 | 公开通用角色规范未确认，BLOCKED | [MCP](https://docs.trae.cn/ide_add-mcp-servers)、[Skills](https://docs.trae.ai/ide/skills)；不读取私有数据库或宣称所有自定义 Agent 可无损导入 |
| Pi | 当前 pi.dev 发行从 0.99.0 起内置 MCP：~/.pi/agent/mcp.json、项目 .pi/mcp.json；stdio/HTTP，不支持旧 SSE | ~/.pi/agent/skills、.pi/skills 与 .agents/skills，包资源一起保留 | 通用原生角色规范未确认，BLOCKED | [安装](https://pi.dev/docs)、[MCP](https://pi.dev/docs/latest/mcp)、[配置](https://pi.dev/docs/latest/configuration)、[Skills](https://pi.dev/docs/latest/skills)；当前 @earendil-works 为 1.4.0，旧 @mariozechner 为 0.73.1，不能仅凭 Pi 名称沿用旧结论 |
| OpenCode | opencode.json/jsonc 中 mcp；local command 是 argv 数组，environment 字段独立；remote 有 headers/OAuth | .opencode/skills、~/.config/opencode/skills 及 Claude/Agent Skills 兼容目录 | .opencode/agents、~/.config/opencode/agents Markdown 或配置中的 agent；区分 primary/subagent | [配置](https://opencode.ai/docs/config/)、[MCP](https://opencode.ai/docs/mcp-servers/)、[Skills](https://opencode.ai/docs/skills/)、[角色](https://opencode.ai/docs/agents/)；provider/model、permission 不能机械映射 |

这些官方资料用于确认公开格式；fixture 解析成功不等于对应真实客户端已经加载运行。TRAE、Pi 通用子 Agent 文件规范未确认，明确拒绝自动转换。WorkBuddy 仅公开 CodeBuddy 文件；TRAE 全局 MCP 使用主进程文件选择器，不猜 AppData 私有库。来源十款均可被选择，只有前四款是写入目标。

- IPC 只接工具/种类/资源 ID。选择项目或文件由主进程原生 picker 授权；来源 ID/预览 ID 窗口绑定、30 分钟有效。预览最多 50 项、转换内容最多 2 MiB，来源只读。
- 来源/目标/registry/启停 sidecar 的 revision 在 apply 前重验。重复 apply 复用同一收据，不在结果未知时自动重发。单项写入有备份和明确结果，批量不是跨文件事务，不声称跨进程锁定外部 CLI。
- JSONC 局部 raw subtree 编辑保留注释、未选字段和超出 JS 精度的整数；TOML 仅编辑可安全定位的原生 table，复杂内联/非连续布局明确阻止覆盖并提示另存。解析前拒绝重复键、危险原型键，旧 raw MCP IPC 也只允许 MCP 子树，不再绕过 registry。
- MCP 区分 stdio/HTTP/SSE，按原生字段转换。新建模板使用空命令，填写并通过验证后才能保存，不写入可执行的占位示例。变量不读取本机秘密；预览遮蔽 literal env/header/argv/query 凭据，真实转换字节只在主进程保留。无法等价的 OAuth、trust、autoApprove、工具过滤、权限或变量语义逐项 BLOCKED，不静默丢字段。Claude 用户级/Antigravity 等变量展开证据不足处明确警告。
- Gemini enablement sidecar、allowed/excluded 与 Claude 项目 disabled 列表纳入 revision；不能保持停用语义的转换被阻止。旧 Claude toggle 保持归档后从原生配置移除、再恢复的行为。
- 子 Agent 模型、原生工具名、只读和权限逐项映射；无法保持约束时阻止。非法目标名称可要求显式 RENAME，重命名同时修改原生元数据。原生编辑保留高级使用入口。
- Skill 沿用完整目录校验/暂存/切换，不运行脚本；附件与二进制保持。拒绝遍历、链接/硬链接、ADS、保留名、非法 UTF-8；2000 项、单项 10 MiB、总计 50 MiB、深度 32。
- 目录备份作为受控 BACKUP 来源，复用来源→预览→应用流程恢复。只读 resource-backups/UUID/content，metadata.originalPath 不用于寻址或决定恢复目标。实际快照 hash 必须匹配原 revision 后才落备份；瞬时外部修改会中止保存/删除并保留原件。MCP 恢复复用原生文件历史备份，恢复范围明确为整个原生文件。
- 所有新旧资源写入、配置集/恢复入口共用 main 资源 mutation 队列。备份失败不得修改原件；旧归档恢复用 peek→原生写入→确认移除，失败保留副本，归档清理失败报告部分完成。

### 规则库兼容

新 MANAGE_MCP / MANAGE_DIRECTORY、SKILL_DIRECTORY_V1 / SUBAGENT_DIRECTORY_V1 为封闭协议扩展，只用于 minimumAppVersion>=1.5.1。embedded registry 1.3.0、definition 1.5.1；签名、size/hash/schema/SemVer/回滚链不放宽。installed 相同版本优先，保留自定义路径和受限能力；只有早于 1.5.1 的 definition 做新增能力兼容比较，不能借版本合并自动恢复新协议显式删除的权限。

### G：四主题和交互层次

参考[AstrLink](https://github.com/Calcium-Ion/AstrLink)的侧栏、工作区与资源组织，保留 CCB 栈和标识。四个主题 ID、设置持久化不变；色阶代替大面积粗边框，暗色降低字重，使用等宽数字、双环焦点、长路径省略/复制、明确文字状态与 reduced-motion。控件边界和文字对比度优先于“相邻层一律差 1%–3%”。

编辑使用抽屉，短决定用 Modal，轻结果用 Toast，持续错误用 Alert；表单不点蒙层关闭。可恢复删除仍要求明确动作，因为恢复是独立、有失败可能的操作，当前不提供即时撤销。没有添加未要求的打字模糊、思考框、拖拽或点赞特效。完整 token 与组件规范见根 DESIGN.md 和 .impeccable/design.json。

## Alternatives considered

- 把全部十款工具做可写目标：配置协议和权限差异扩大验证面，先完成四目标与六来源。
- 转换后统一重写 JSON/TOML：会损坏注释、未知字段和大整数，采用原生局部写。
- 任意路径 IPC 或可执行 adapter 插件：破坏主进程 allowlist 和 declarative registry，拒绝。
- 仅删除旧配置界面：会丢失原生编辑、验证和恢复；改为配置页复用。
- 在每页继续保留目标选择器：仍有上下文不一致，统一到 header。
- 把不同工具权限强行当成同义字段：可能扩大授权，无法等价就阻止。
- 新建独立恢复事务/磁盘自动草稿/云平台：当前可用已有流程完成，避免增加范围。

## Consequences

四目标的用户级资源可管理互导，十来源按公开格式识别与预览；项目配置导入来源保留作用域，通用写入仍指向明确的用户级目标。真实工具版本、功能开关与模型账号决定最终加载，不把“已配置”称为运行正常。外部 CLI 并发写入只有 revision 检查，不保证跨进程事务；失败不盲目重试。备份沿用本地文件模型，无自动清理旧备份。

## Testing

- 52 files / 470 tests 全通过，无跳过；包含 production-key rehearsal 和本地模板 staging。新增格式、权限、CAS、恢复、预览脱敏、原型污染与归档故障测试覆盖实际反例。
- 独立恢复安全复核 2 files / 42 tests，通过原瞬时外部修改反例；相关后端集成 14 files / 176 tests 全通过。
- 原生 Electron 45 的生产 React/IPC/sandbox，隔离 HOME/APPDATA：12 项交互通过，四主题（主按钮文字对比度最低 5.13:1、次级文字最低 5.00:1、输入边界最低 3.17:1，Input/Select 两圈焦点均实际生效）、1440/1280 桌面、目标切换、脱敏导入、失败保稿、保存再切换、附件恢复、退出拦截。截图用离屏捕获，不能等同屏幕阅读器或真实安装升级验收。
- 类型检查、全量 lint 与双构建通过。正式 preflight、DDE、依赖审计和候选包最终结果见 SECURITY_AUDIT_REPORT.md；暂不 tag、push 或发布。

共享编辑器的最后一段原文保护见[无损格式化](../bug-fix/2026-10-25-lossless-editor-formatting.md)，原生检查12项包含实际格式化按钮与单步撤销。


最终验收：源码289a832、sourceDirty=false 的未签名三产物已核验，52个out文件与ASAR一致，ZIP/NSIS payload一致，目录/ZIP/Portable业务和旧profile正常退出；两类离线worker真实诊断、保值格式化/撤销及篡改拒绝通过。三轮原生快照中位页面加载估算 1446.43ms，总工作集 528.53MiB（可能重复计共享页，非独占内存），不宣称性能提升。完整报告见根 SECURITY_AUDIT_REPORT.md；云CI、真实安装和厂商回补仍未验证，暂不发布。
