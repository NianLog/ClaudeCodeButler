# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

主要用户是日常切换多个 AI Agent、维护本机配置的个人开发者。用户已确认这一优先级；首次迁移通过资源页的导入流程完成。

## Product Purpose

CCB 是本地优先的 Electron 配置管理桌面应用。帮助用户查看、修改和恢复 AI 工具的配置，减少重复配置和切换时的误操作。

## Operating Context

- 当前代码版本为尚未发布的 1.5.1，Windows 是本轮已实际验收的平台；其他平台的构建声明不等于本轮实机验证。
- 技术栈为 Electron、React、TypeScript、Ant Design 和 Zustand。具体已安装版本以两套 package-lock.json 为准。
- 用户已有配置、备份、主题选择和 Claude workspace 必须保留；Claude workspace 继续使用 LEGACY_COMPAT。

## Capabilities and Constraints

- 现有 registry 声明 Claude Code、Codex CLI、Gemini CLI 和 Antigravity CLI 的配置资产。
- 现有 MCP、Skills、子 Agent 业务服务以 Claude Code 原生目录为基础；其他工具的完整资源管理尚未实现，不能由 registry 中存在工具名称推断出来。
- 本轮新增需求是跨工具识别、转换和导入；取消独立的“AI 配置工具”界面，在内容区 header 统一选择管理对象。
- 切换管理对象应读取对应配置。配置的实际应用、覆盖和导入必须保持独立、明确的写入动作。
- 所有文件系统和路径授权归主进程；renderer 保持 sandbox、contextIsolation 和现有导航限制。
- 本轮保留“暂不发布”的约束；正式代码签名门禁继续保留。

## Brand Commitments

保留 CCB 名称、现有标识、中英双语以及四个主题 ID：ccb-dark-pro、ccb-minimal、ccb-terminal、ccb-light。界面组织参考用户提供的 AstrLink；参考不等于替换产品功能或技术栈。

## Evidence on Hand

- ARCHITECTURE.md、CAPABILITIES.md、CHANGELOG.md 和 .agents/notes/ 记录当前实现与验收边界。
- Git 检查点 ed53f23 保存此次扩展之前的 1.5.1 候选源码。
- 未开展新的真实用户访谈；不能把设计偏好或外部产品资料写成用户量、任务成功率或付费意愿的证明。

## Product Principles

- 全局选择器统一管理对象；导入流程另外标明来源与目标。
- 预览先说明要改哪些文件、哪些字段不能兼容，再允许写入。
- 不能转换的权限、认证或运行语义必须明确处理，避免静默丢弃。
- 保留现有路径和用户数据，优先复用现有服务、备份和原子写入机制。
