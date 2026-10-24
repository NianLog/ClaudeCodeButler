# Agent Note: 独立代理协议与 Skill 覆盖保护

Status: implemented
Scope: src/proxy-server/src/**, src/main/services/skills-management-service.ts, tests/unit/**
Last-verified: 2026-10-25


## Problem

独立代理没有校验调用方 accessToken，且所有转换器共用 Anthropic URL 与认证头。原始流数据按网络块解析，不能保证 SSE 帧完整。Skill 两种导入入口在完整校验和复制前删除原目录，失败会丢失旧内容。

## Decision

独立代理读取原 managed-mode-config.json 的 accessToken，缺 token 拒绝启动，错误认证在解析正文和请求上游前拒绝。按转换器选择协议地址和认证头，保持 Anthropic 兼容网关；普通与流式返回均转换为 Anthropic contract。不支持的内容明确报错，不删除输入语义，不跟随重定向，不自动重试。DeepSeek 明确禁用原生推理；Gemini 原生工具/推理与各原生协议的 cache_control 拒绝，不伪造能力。导入先在原 skills 根目录内独占暂存，校验完成再备份原目录并替换，失败恢复；两个入口复用提交队列，失败恢复也失败时保留备份并报告位置。

## Alternatives considered

- 废弃独立包可减少维护，但用户明确要求修复该入口，本轮保留并界定协议支持范围。
- 统一主应用与独立代理可消除双轨，但改变启动和打包边界，超出本轮的小改动约束。
- 先删除再复制最简单，却无法保留用户数据；采用同文件系统暂存、备份 rename 与失败回滚，不引入数据库或存储迁移。

## Verification

最终完整回归 46 files / 351 tests 全通过，无跳过；类型、lint 和双构建通过。C 批新增的 48 项覆盖本地 HTTP 协议、SSE、超时、断连、凭据与错误，以及真实文件系统故障注入。2026-10-24 更新兼容安全依赖后重跑独立编译入口，验证 401 零上游请求、合法请求 200、配置不改写、缺 token 退出 1。两套生产 audit 均 0，proxy 全依赖为 0，root 仅保留已披露的 3 个 PostCSS 构建链中危。最终预检、文档门禁和数据校验记录见 SECURITY_AUDIT_REPORT.md。

## Consequences

协议转换只存在于独立包，不扩展主应用集成模式，也不统一两套代理。真实提供商账户、企业网络和机器断电不在本地 fixture 验证范围。目录替换需要两次 rename，保留备份用于恢复，不能声称跨进程事务或断电原子性。导入新增大小、编码、数量和链接限制；原路径、默认不覆盖与 IPC 签名不变。不迁移配置、不发布。

## 后续导入提案（2026-10-25）

[跨工具导入与全局管理对象](../../implemented/feature/2026-10-25-agent-import-and-global-context.md)已复用本笔记的 Skill 暂存、备份与回滚；新增格式和交互的验收见对应 implemented 记录。
