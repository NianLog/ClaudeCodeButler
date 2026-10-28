# Agent Note: 受支持运行时与正式发布门禁

Status: implemented
Scope: package.json, package-lock.json, src/proxy-server/package.json, src/proxy-server/package-lock.json, .github/workflows/release.yml, scripts/**
Last-verified: 2026-10-25


## Problem

Electron 40 已停止维护，依赖审计已不再双零，正式预检未进入 CI，本地安装包未签名。版本抓取 IPC 接受任意 URL，超过实际业务所需的权限。

## Decision

2026-10-28 补充：用户已授权发布 1.5.1；Electron 45.1.0 的 Node 回补已实测。仅 1.5.1 暂缓 Authenticode，损坏签名始终拒绝，后续版本恢复默认强制签名。安装生命周期仍未实测。具体变更与证据见[发布授权](2026-10-28-v151-release-authorization.md)；下文保留原门禁建立过程。

当前版本是未发布的 1.5.1 修复候选，保留应用身份、配置路径与文件格式。使用已核对的 Electron 44.9.3，并优先采用兼容现有调用的依赖修复，删除未使用的代理依赖。版本抓取改为主进程固定 HTTPS 地址、正文上限、超时和拒绝重定向；保留旧 fetchUrl 方法签名但只接受这个固定地址，兼容现有调用并拒绝任意 URL。

2026-10-24 重新审计发现新增高危公告，更新 Electron 44.9.3、两包 body-parser 2.4.0、独立包 follow-redirects 1.16.1、root Vite 7.3.7 和 fast-uri 3.1.9。升级限制在原有主版本和现有调用范围，未改 registry trust map 或关闭 TLS。Electron 镜像下载包与 GitHub 官方 SHASUMS256.txt 独立比对一致。生产审计必须按最终锁文件重跑，旧 10 月 20 日数字不作为本轮结论。

用户已确定先完成 1.5.1，后续配置诊断与恢复路线记录于[1.6 产品提案](../../proposed/feature/2026-10-20-configuration-reliability-roadmap.md)。该提案不扩展本版范围，不把记录规划等同于实现；1.5.1 沿用暂不发布的约束。

2026-10-20 用户确认暂时没有正式签名，先完成未签名本地候选，签名不阻塞本轮交付。正式发布的 forceCodeSigning 与 Authenticode 门禁仍保留；签名接入另行跟进，不把自签名当作公众信任证书。

正式候选预检、两套依赖审计、回归、构建及 Windows 代码签名检查均阻塞发布；CI 为安装包生成 SHA-256、依赖 SBOM 与来源证明。打包启用 ASAR integrity validation 与 onlyLoadAppFromAsar，保留企业 CA 的环境变量支持。SBOM 区分 root 构建图与独立 proxy 生产图，不穷举 Chromium 内部依赖。证书不在源码中保存，未配置有效证书时正式发布失败。Registry publisher key 与代码签名证书分开，Registry 验证链保持原样。

## Alternatives considered

- 升级 UI 框架或统一两套代理会扩大兼容风险，本轮只处理 A、B 所需的运行时、依赖和门禁。
- 允许未签名正式包可以继续产出 release，但无法解决发布者身份问题，因此只允许本地开发包使用明确的未签名路径。
- 实现通用 URL 抓取及 DNS 绑定适合更宽业务，本项目版本检查只需一个固定地址，因此保留兼容签名并收窄能力。

## Verification

固定版本 URL 可用，任意其他 URL 被拒；旧用户路径与数据不迁移；完整回归、两套审计和双构建运行；正式发布缺证书失败；文档记录真实验证范围和外部证书前置条件。

## Consequences

证书配置、云端 workflow 执行和真实安装升级仍需维护侧环境验证。不得关闭 TLS 校验、改变受信 Registry key 或把未来安装验收写成已完成。历史 Note 检索无同主题决定，v1.5.0 的身份、数据兼容和发布流程文档继续适用。

## Local validation boundary

早期 A/B 验证包使用 store 压缩，不是最终候选。最终候选保留 maximum 压缩和明确的未签名开关；旧快照或中断压缩文件不计入交付。ASAR 篡改、未签名校验以及缺证书 forceCodeSigning 已验证拒绝。Windows ICO 从原 PNG 生成并作为构建输入，保留现有图案。正式证书正向链、云端 provenance 与人工安装升级未验。

生产构建的 UI 与文件系统组合验收发现并补齐托管重启问题和[隐藏祖先目录导致监控为空](../../implemented/bug-fix/2026-10-24-hidden-workspace-watcher.md)；旧 runtime 或零监控条目的性能样本保留作诊断，最终值必须取修复后同一候选。签名按用户要求暂缓，不阻止本地候选交付；不 tag、不上传、不发布。

最终生产目录已验证 47 个 out 文件与 ASAR 字节一致，46 files / 351 tests 无跳过；1.5.0 副本写出配置和主题，再由 1.5.1 使用同一隔离目录完成回归。性能三轮复用保留数据的 profile，采集可见/隐藏各 60 秒，watcher 目录/条目非零且稳定。该结果证明本地业务与数据兼容，不替代目标机 NSIS 安装/覆盖升级/卸载。root/proxy 生产审计均 0，root 仅保留 3 项 PostCSS 构建链中危，复核日期和理由见 SECURITY_AUDIT_REPORT.md。

maximum 三产物全部生成；ZIP 与 NSIS 的 exe/ASAR 对齐已验收目录，ZIP/Portable 实际业务和 app.quit 正常退出通过。两份 CycloneDX、构建元数据和 6 项 SHA-256 清单齐全且匹配，元数据保留 sourceDirty=true。当前 runtime 实际验证新窗口/跨 document 导航拒绝、hash 导航允许及 ASAR header 篡改启动拒绝。第三轮隐藏时新增 GPU 进程的原始样本保留，不宣称性能改善。

## 2026-10-25 新增范围

本笔记中的 44.9.3、回归与未签名包记录继续代表扩展前基线，Git 已保存为 ed53f23。用户追加的工作见[稳定依赖与运行时安全提案](../../implemented/process/2026-10-25-latest-stable-dependency-upgrades.md)和[跨工具导入及全局管理对象提案](../../implemented/feature/2026-10-25-agent-import-and-global-context.md)。新范围已批准实施，源码全量 52 files / 470 tests 通过；具体版本、运行时未决门禁与候选包验收见新记录，旧包不充作新包，暂不发布保持。
