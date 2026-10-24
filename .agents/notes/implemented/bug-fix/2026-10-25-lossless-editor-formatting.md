# Agent Note: 编辑器无损格式化与原文保护

Status: implemented
Scope: src/renderer/src/components/Common/CodeEditor.tsx, src/renderer/src/utils/config-editor-utils.ts, tests/unit/renderer/config-editor-utils.spec.ts, ARCHITECTURE.md, CAPABILITIES.md, DEVELOPMENT.md, CHANGELOG.md, SECURITY_AUDIT_REPORT.md, README.md, README_CN.md
Last-verified: 2026-10-25

## Problem

跨工具管理已按[已批准的扩展](../feature/2026-10-25-agent-import-and-global-context.md)实施；收尾复核发现共享 CodeEditor 的格式化仍通过 JSON.parse→JSON.stringify 重写内容。输入 9007199254740993123 会变为 9007199254740993000，-0、指数和字符串转义也会改变。重复键被折叠，Windows 换行被替换。Markdown 按非空行拆开再插入空行，会改写 frontmatter 多行值和 fenced code。

调用面包括格式化按钮与现有 Ctrl+S 绑定；共享组件用于原生配置、MCP、Skill/角色和旧配置编辑。此问题来自既有格式化实现，不是 Monaco worker 故障。包专项探针的空 worker URL 已通过实际 Worker 消息往返和 JSON 诊断证实为观测问题。

关联[持久化保护](2026-10-19-persistence-and-proxy-safety.md)与[稳定工具链](../process/2026-10-25-latest-stable-dependency-upgrades.md)，补齐 renderer 在 main 原文写入之前的保护。

## Decision

在现有 config-editor-utils 中提取 formatEditorContent(content, language)，复用已安装 jsonc-parser 的 token 空白编辑。严格 JSON 仍先校验语法，解析值不参与输出；保留数字字面量、转义、顺序、重复键和原换行。格式化不取代 main 的能力、重复/危险键与原生结构校验。

没有可靠 Markdown 排版契约时保留其原文，隐藏 Markdown/纯文本的格式化按钮；不通过全局空行重排改写 Skill、角色或 TOML。现有 JSON 快捷键绑定保留，执行时读取当前 editor readOnly 选项，写入中和只读预览不格式化。

用 executeEdits 加一组 undo stop 替代 setValue，单次格式化可以一步撤销。没有新增依赖、路径、文件写入口或配置选项。

## Alternatives considered

- 继续 JSON.parse→stringify：不能保证文本字面量和用户数据不变，拒绝。
- 正则修补数字或 Markdown：无法可靠识别转义、frontmatter 和代码块，拒绝。
- 引入 Prettier/Markdown formatter：本轮需要原文保护，已有依赖足够处理 JSON，避免新依赖和额外排版语义。
- 只在新 MCP 面板禁用按钮：旧配置/原生文件仍受影响，选择修公共实现。

## Consequences

JSON 格式化只改空白。Markdown/纯文本继续可编辑和保存，保持原文。JSON 语法验证的严格程度不变；JSONC 导入与原生局部写仍由 main codec 负责。格式化不会自动保存文件，也不构成跨进程事务。

## Testing

从原格式化实现提取的相同分支先跑反例：4 failed / 6 passed。修复后该文件 10 tests 全通过：大整数/指数/-0/转义、CRLF、重复键、非法 JSON、Markdown frontmatter/fenced code、TOML 原文。

全量 52 files / 470 tests 通过，无跳过，包含 production-key rehearsal 和本地 staging。最终原生按钮与单步撤销、类型/lint/双构建和新候选包结果统一记录于 SECURITY_AUDIT_REPORT.md。原先 853fce7 候选保留为格式化修复前基线，最终交付必须使用后续干净提交的新包。
