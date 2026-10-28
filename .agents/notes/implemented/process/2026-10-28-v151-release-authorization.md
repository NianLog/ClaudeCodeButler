# Agent Note: 1.5.1 发布授权、运行时回补与单版本签名例外

Status: implemented
Scope: package.json, package-lock.json, .github/workflows/release.yml, scripts/verify-release.ps1, tests/unit/scripts/release-signature-policy.spec.ts, SECURITY_AUDIT_REPORT.md
Last-verified: 2026-10-28

## Problem

用户已明确授权发布 1.5.1，再开新分支探索 Tauri/Rust 架构；此前签名和真实安装生命周期暂缓的决定保留。45.0.0 的厂商回补门禁曾未通过，旧未签名候选不能直接冒充新发布产物。

## Decision

先升级官方稳定 Electron 45.1.0，其发布说明包含 Node 24.22.1；实际内嵌 API、源码和组件版本仍须核验。保留既有 TLS 目标绑定、HEAD 清理及禁复用措施，避免在发版阶段扩大网络行为变更。源码、测试、CI、发布载荷均从同一发布基线核对后才公开 Release。

未签名例外严格限定 tag/package 1.5.1：workflow 默认其他版本强制签名；校验脚本只在明确开关及 1.5.1 时接受 NotSigned，任何无效签名仍拒绝。ASAR、ZIP 对齐、SBOM、SHA-256、云端 provenance 和质量检查继续阻塞。发布说明明确未签名及安装/升级/卸载尚未实测。授权发布不等于这些验收已通过。

本记录部分更新[原发布门禁](2026-10-19-supported-runtime-and-release-gates.md)的单版本签名政策，并承接[运行时证据](2026-10-25-latest-stable-dependency-upgrades.md)和[应用缓解](../bug-fix/2026-10-25-reachable-node-network-mitigations.md)。旧证据作为历史保留，实际回补结果再更新当前结论。架构探索在独立分支记录，不改变本版格式、路径或用户数据。

## Alternatives considered

- 直接发布 45.0.0 旧候选能省重建，但最新稳定版已含所需 Node 更新，故先核验升级。
- 永久关闭签名检查会影响后续版本；只接受用户已授权的 1.5.1 例外。
- 先迁移 Tauri 再发 1.5.1 会扩大兼容性风险；按用户要求先发布再探索。

## Consequences

未签名 Windows 包可能出现系统信誉提示；SHA-256 和 GitHub provenance 不替代 Authenticode。安装生命周期验收仍缺失。用户最终要求停止本机安装包传输，云端包的本机启动/ASAR 比对/篡改验收未完成，发布说明明确披露；不把此前的旧候选或源码构建验收替代这项证据。

## Verification

运行时 ZIP 与官方 SHA-256 一致；实际内嵌 Node 24.22.1，九份 JS 规范换行后匹配上游修复源码。6 个 TLS / 6 个 DNS 反例全部拒绝；内置 c-ares 1.34.9 与 Undici 7.30.1 已脱离重新取得的 19 项公告范围。61 files / 647 tests 无跳过通过，新增 5 项签名策略回归；双构建、类型、lint、双全依赖审计及 preflight 通过。真实 Electron 22 组流程、14 组 TLS 场景、下载兼容和用户文件摘要保护通过。云端回执与公开发布结果另行补充，不将本机测试计为云 CI。

首次云 CI（40640243361）暴露 Windows 8.3 临时目录别名差异；本机把 TMP/TEMP 指向同类短路径后，Skill 夹具稳定复现 10 fail / 14 pass。修复仅将五组测试新建的临时根目录经 realpath 规范化，清理前仍校验规范父目录和夹具名称，未放宽生产路径、链接或恢复保护。短路径下完整回归 61 files / 647 tests 无跳过通过。官网 version.txt 仍为 1.5.0，用户已明确官网稍后手动上传，GitHub 发布继续。

发布回执：tag v1.5.1 指向 099b0b5104648fec3382964d6236f27fdf917dad，2026-10-28 14:51 UTC+8 公开为 Latest。[main CI](https://github.com/NianLog/ClaudeCodeButler/actions/runs/40641003379) 和 [tag Quality + Windows Release](https://github.com/NianLog/ClaudeCodeButler/actions/runs/40641276956) 均成功；云端 637 tests 通过 / 10 条件跳过。7 个云资产及来源证明已生成；4 份小文件本机验签通过，验证声明中全部 7 个摘要与 GitHub 服务器摘要一致。用户要求停止安装包下载/上传后，未继续传输大文件；官网上传包由用户后续部署。
