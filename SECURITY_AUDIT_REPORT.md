# Semgrep 安全审计与改进报告

## 2026-10-28：1.5.1 发布准备与厂商回补复核

官方 [Electron 45.1.0](https://github.com/electron/electron/releases/tag/v45.1.0) 已更新 Node 24.22.1。安装缓存 ZIP 与官方 SHASUMS256 一致；实际运行确认为 Electron 45.1.0 / Chromium 156.0.8078.49 / Node 24.22.1。

- 九份内置 JS 在仅规范换行后，与已校验的 Node 24.22.1 上游源码一致；覆盖 DNS NUL、TLS 三项、HTTP Agent pending-read、快照随机缓存和 realpathSync Permission Model 七项修复。6 个 TLS 反例、6 个 DNS 反例全部拒绝，畸形 DNS 输入未发出查询。不是仅根据版本字符串判定。
- 内置 c-ares 1.34.9 / Undici 7.30.1 与本次重新获取的 19 份官方公告逐项比对，全部脱离此前受影响范围；Undici 内置源码亦匹配 Node 修复版本。此结论仅覆盖已跟踪公告，不表示没有未来漏洞。
- 原 TLS 目标绑定、HEAD 清理及禁复用措施、入口约束继续保留。HEAD 临时例外仍用于保持已验证的重定向行为；连接池恢复须另做专项回归。
- 签名及真实安装/覆盖升级/卸载经用户批准暂缓；仅 1.5.1 有未签名例外。无效签名仍拒绝，后续版本默认强制签名。本轮发布授权见[发布 DDE](.agents/notes/implemented/process/2026-10-28-v151-release-authorization.md)。

本机门禁已通过：61 files / 647 tests 全通过、无跳过；新增 5 项签名策略回归覆盖默认拒绝、单版本例外、损坏签名拒绝、正常签名和禁止其他版本例外。type-check、lint（0 error / 15 个既有 warning）、lint:changed、双构建、正式 preflight 和根/代理双全依赖 audit（0 漏洞）通过。覆盖率 statements 50.45%、branches 54.52%、functions 49.26%、lines 50.71%，不声称全路径覆盖。

真实 Electron 45.1.0 的 22 组流程通过，含 14 组 TLS/代理/Host 场景、下载 200/302 正确字节、405 拒绝和五秒超时；四主题、9 张截图、零未捕获 renderer 异常，5 个用户文件摘要不变。证据：release/electron-e2e/profile-1793166430405/evidence/qa-report.json。

外部证据目录 ccb-151-release-20261028 含官方清单、runtime/electron-451、19 份新取公告、runtime-verification.json 及完整日志。云 CI 和发布载荷核验仍待回执，随后才公开 Release。以下记录均为先前运行时的历史证据，旧“仍缺失/暂不发布”状态不代表本次授权与回补结论。

## 2026-10-25：网络 A+B 本机验收完成，未发布

A 将 TLS 证书身份绑定 URL 规范化目标，保留 CA 链、DNS/IP SAN 和代理协议；下载 HEAD 禁复用、立即清理响应并设五秒总时限，保留 2xx/3xx 与 Chromium 实际下载。B 限制 main/独立代理新增 Node fetch、Undici、Resolver、WebSocket/EventSource 和用户快照入口，保留 OS lookup 与 Chromium API。验收发现的旧健康回调竞态已以服务实例身份判断修复，迟到成功/失败均不操作新服务。未增加运行依赖、移动配置或迁移数据。

60 files / 642 tests 全通过，无跳过；类型零错误，lint 零错误/15 个既有 warning，lint:changed、root/proxy 双构建、正式 preflight 和双全依赖 audit（0 漏洞）通过。覆盖率 statements 50.45%、branches 54.52%、functions 49.26%、lines 50.71%，统计 main/proxy/shared，不含 renderer；不表示全部路径已覆盖。新增 A 反例先 16 fail / 6 pass；规则先 46 fail / 15 pass；健康竞态先 2 fail / 18 pass，均修复转绿。真实 Electron 45 的 22 组流程通过，含 14 组 TLS/代理/Host 网络案例、3 次正确字节下载、405 拒绝与五秒超时；四主题/九张截图、零 renderer 未捕获异常、正常退出，5 个用户文件摘要不变。

干净源码 2086a94 的未签名 Portable/NSIS/ZIP 完成载荷、52 个 out 文件与 ASAR 一致性、双 SBOM 和六项 SHA-256 核验，sourceDirty=false；Portable/ZIP/解包目录各 17 项业务验收通过，篡改 ASAR 被拒且未创建 settings。NSIS 仅解包，未执行安装。main 为 411422 bytes，比 37e020e 增 146 bytes。新包 sourceCommit 为 `2086a942f39ede3cdd5dc613455616bec961efb3`，最终验收文档另行提交；不是用文档提交冒称包来源。未签名产物仅为本地候选。

| 本轮候选 | 大小（bytes） | SHA-256 |
| --- | ---: | --- |
| CCB-Portable-1.5.1.exe | 105556475 | `9cc3f01830d67ed4c437178f305bb5904278bdc80c6ea9fe5bb0984eafb0de90` |
| CCB-Setup-1.5.1.exe | 116577117 | `27a7d353316e41a91662ba5cccf4f8636b94779d333d3c41188573e240d59577` |
| CCB-1.5.1-win.zip | 145785347 | `15f687e39bcf646bc6f7f1a3eecd518d3b264eb7aafab340bcc715d3d4e23513` |

证据更正：此前预先响应 PoC 消费了 HEAD 响应，只证明默认 agent 的底层复用条件；原始下载 IPC 没消费响应，对照显示连接占用、未入空闲池。不能据此声称旧 IPC 已成功错配或文件内容遭污染。本轮同时修复禁复用和连接占用。外部旧冒烟驱动也已按当前协议补传删除 revision，并改用真正损坏的 YAML 验证导入失败，不再把合法的无前言 Skill 当作无效输入；未为通过测试放宽生产检查。

七项 Node 上游修复仍缺失；c-ares 11 项、Undici 8 项当前未识别触发路径，按条件持续跟踪，不把应用缓解等同于厂商修复。Node HEAD 临时例外在下次入口/依赖变更或 2026-11-01 复核。签名、安装/覆盖升级/卸载按用户要求暂缓，云 CI 与其他平台未验，不发布。Brotli 已有厂商修复证据，保留 br。逐项触发条件、替代方案和临时例外见[网络缓解 DDE](.agents/notes/implemented/bug-fix/2026-10-25-reachable-node-network-mitigations.md)。以下是应用补修前厂商回补的历史证据；底层缺失事实仍成立，不据版本命中推定全部风险在 CCB 可利用，也不据有限回归证明未来入口安全。

## 2026-10-25：内嵌 Node 回补复核（安全门禁未通过）

当前官方稳定版仍为 Electron 45.0.0，内嵌 Node 24.22.0。本轮确认 Node 24.22.1 的八项 Node 24 相关修复中，七项上游修复未进入当前内嵌实现；Brotli 由 Chromium 包含修复。另核对到内置 c-ares / Undici 的公告版本风险。正式内嵌运行时安全门禁保持未通过，不能用 npm audit 或功能回归通过替代。

证据来自 [Electron DEPS](https://github.com/electron/electron/blob/v45.0.0/DEPS)、发行的全部 [58 个 Node 补丁](https://github.com/electron/electron/blob/v45.0.0/patches/node/.patches)、79 份经 Git blob/SHA-256 校验的参考源码，以及实际源码 37e020e 候选 exe 的内置 JS 和 API。九份相关内置源码与未修复 Node 24.22.0 字节一致，已修复 Node 对照在仅统一源码 CRLF/LF 后匹配；不改写用户文件。

| 受控检查 | Node 24.22.1 对照 | 官方 Electron 45 | 当前候选 exe |
| --- | ---: | ---: | ---: |
| 拒绝 6 个非规范 IP 的 TLS API 反例 | 6/6 | 0/6 | 0/6 |
| 按上游规则拒绝 6 个 DNS NUL 反例 | 6/6 | 0/6 | 0/6 |
| 发往本机夹具的截短 DNS 请求 | 0 | 2 | 2 |

另有合法 DNS/IP SAN 接受及规范 IP 拒绝 DNS-only SAN 的控制检查。TLS 测试针对 checkServerIdentity，不等同于完成证书链网络攻击；DNS 仅访问受控回环 UDP 服务器。诊断使用 RUN_AS_NODE，不启动 CCB 应用初始化或安装器。

- [Node 详细安全公告](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)中，DNS NUL、TLS 三项、HTTP Agent pending-read、快照随机缓存、realpathSync Permission Model 检查的上游修复缺失。严重程度和逐项提交见[运行时 DDE](.agents/notes/implemented/process/2026-10-25-latest-stable-dependency-upgrades.md)；不包含只影响 Node 26 的两项，也不声称每项都能经 CCB 当前入口利用。
- Brotli：GN 链接 Chromium dec；[Chromium 156 的固定版本](https://github.com/chromium/chromium/blob/156.0.8078.48/third_party/brotli/README.chromium) cfa184a 含 [0ed4268 修复祖先](https://github.com/google/brotli/compare/0ed4268a4401abcb4472096340477cf4af7d1a2b...cfa184a997ac19454d5a3ae97f6d600aac2445a6)，decoder 的永久格式错误分支已验证。保留 br。
- c-ares 1.34.8 命中抽查的 [高危取消查询内存问题](https://github.com/c-ares/c-ares/security/advisories/GHSA-wpr3-8q3r-4q8c)、[异源 DNS 应答问题](https://github.com/c-ares/c-ares/security/advisories/GHSA-fqh5-3x7m-wp44)范围；官方修复版 1.34.9。未进行内存破坏实验。
- Undici 7.29.1 的内置 bundle 与未修复参考源码一致，命中 [7.30.1 修复](https://github.com/nodejs/undici/releases/tag/v7.30.1)的四项高危公告范围。版本命中不是当前应用可利用性证明，未实测全部攻击条件。
- Electron 使用 Chromium BoringSSL，OpenSSL 0.0.0 不能按普通 OpenSSL 版本比较；发行补丁确有阻止特定证书公钥链的 C++ 回补，但不包含上述 JS 主机检查修复。

现有缓解保持：规范 URL、移除来路 Host、无代理 agent:false、逐请求代理 agent、鉴权前置及 MCP net.fetch。项目未发现显式使用受影响的 Resolver、自定义 Node 快照/SEA 或 Permission Model。upstream-http-client / managed-mode-lifetime 两文件 28 项定向回归通过。这只验证缓解实现；现有 release:preflight 不验证上述内嵌补丁。

本轮仅补证据和文档，未改应用代码、依赖、配置或用户数据，未重新打包、未发布。用户明确暂缓安装/覆盖升级/卸载，签名仍跳过；现有 1.5.0 安装不动。等待含修复的稳定 Electron，并逐项复核源码、实际候选、内置组件及完整应用/包回归后才能关闭该安全门禁；不采用预发布版或手换 Node/DLL 规避结论。

## 2026-10-25：资源真实路径复核与三批补修（本机功能验收完成）

对 80d2979 的复核确认此前样例回归遗漏了真实 junction 安装、旧高级表单和通用文件恢复。19 个反例失败；原生 Electron 另复现 5 个问题场景。下方“扩展已完成”的测试和包校验属于补修前历史证据，不能证明这些路径正确；旧包不含本次修复。

第一批已修：旧表单通过单次资源更新保留附件、未知权限字段和原路径；原生编辑/恢复检查读取版本；恢复先备份当前文件，并可绑定预览的备份摘要。新副本检查历史摘要/实际大小，旧副本明确无历史摘要；MCP 从历史定义按项恢复，不替换其他当前设置。Qoder 显式停用/审批策略保持；单份坏目录备份单独诊断。额外故障注入关闭了三条 MCP 写入口的备份快照不一致缺口。

第二批补齐按 kind 默认发现、坏项隔离、原生格式与只读共享引用，19 个原反例全部入库转绿。路径检查改为从根到叶，先拒绝不允许的链接目标再读取；总预算用尽即停止且禁止修改未完整扫描的集合。写后回读必须匹配计划，失败明确已写入、需核对；OpenCode 已知全局限制不能映射则阻止，变化中止。

第三批完成“工具”分类、准确作用域和旧表单提交/常驻错误反馈；真实交互又复现并修复原生多候选打开/创建错位及旧正文起始空行丢失。异步确认等待 Hook Modal 结果，失败不再产生未捕获 Promise；历史列表只声称记录摘要，预览与恢复才实际核验内容。

最终本机回归：57 files / 555 tests 全通过，无跳过（提供既有 rehearsal 配置及 web staging）。statements 50.25%、branches 54.37%、functions 48.91%、lines 50.50%，范围 main/proxy/shared；不表示全部路径已覆盖。类型零错误，lint 零错误/15 个既有非空断言 warning，lint:changed、root/proxy 构建、preflight 与双全依赖 audit（0 漏洞）通过。

Windows 真实 Electron 45 使用生产 out 和真实 preload/IPC，在隔离 HOME/AppData 下完成 19 组资源全流程，renderer 未捕获异常为零，正常退出，5 个用户配置文件摘要不变。九张原生截图覆盖四主题、1280 布局、默认/项目导入和整文件差异预览。可用 `npm.cmd run build` + `npm.cmd run test:electron` 复跑。本轮没有重跑 Semgrep，不发布。官方依据、限度及拒绝方案见[资源闭环记录](.agents/notes/implemented/bug-fix/2026-10-25-resource-management-closure.md)。

补修候选从干净源码 `37e020ee59432fa499bc7b0e6aa07acccb9abfdb` 构建（Node 24.22.1 / npm 12.2.1），旧 289a832 包不含补修。Portable、ZIP 解压版业务通过；ZIP/NSIS 程序与 ASAR 载荷匹配；52 个生产输出文件与 out 字节一致，无私钥/axios，两项 ASAR fuse 开启。篡改副本退出 2147483651，未创建 settings；两份 SBOM 与六项 SHA-256 通过，sourceDirty=false。真实 1.5.0 旧 profile、离线 worker/编辑器、运行时窗口安全和编译独立代理鉴权通过。NSIS 只解包核验，未安装/写注册表；签名按用户要求跳过。云 CI、目标机安装/覆盖/卸载、其他平台及厂商内嵌 Node 回补仍待分别确认。

| 补修产物 | 大小（bytes） | SHA-256 |
| --- | ---: | --- |
| CCB-Portable-1.5.1.exe | 105469047 | `6a5a5072311b0efd41baf383f1a37564618712168f2cf8a49961484cb7475572` |
| CCB-Setup-1.5.1.exe | 116493857 | `861dddc666af9e6ad6dc10483c25cabf9613b31de8c6a132f48c9dab7f5cf188` |
| CCB-1.5.1-win.zip | 145701419 | `f75b1c2eb7568a619bba1ebd873a8bbf2803779db889533a2a69b55a0cbfd735` |

## 2026-10-25：多 Agent、稳定依赖与安全边界

本次是未发布的 1.5.1 扩展，扩展前检查点 ed53f23，工具链批次 66355df。保留原路径、用户数据与正式签名门禁；最终未签名候选已从干净提交 289a832 重建并验收，详情见本节；下方 2026-10-24 为独立历史基线。

本轮执行依赖审计、自动回归与独立安全复核，未重新运行 Semgrep；下方 Semgrep 历史结果不代表新增代码已被该工具扫描。

| 检查 | 当前证据 |
| --- | --- |
| 源代码完整回归 | 52 files / 470 tests 全通过，无跳过，含本地 production-key rehearsal 和模板 staging |
| 覆盖率 | statements 47.43%、branches 51.75%、functions 46.73%、lines 47.56%；不含 renderer，不是功能覆盖率 |
| 工具链独立快照 | 类型、lint、生产构建通过；357 tests 通过，缺 web 发布物的 6 项 staging 条件跳过 |
| 依赖审计 | 重新 npm 12 严格 ci：根 747 包、proxy 121 包；根/代理生产与全量 audit 四项均为 0。官方 registry 最后核对 47 个不同直接包，无未说明的版本落后；例外仅 TS 6.0.3 与 Node 24 类型 |
| 源代码静态门禁 | 类型检查 0 error；全量 lint 0 error / 16 warning；root/proxy 双构建通过 |
| 真实 Electron 交互 | 12 项通过：四主题、四目标、脱敏导入、Monaco、失败保稿、保存再切换、附件恢复、1280 布局、退出拦截；四主题实际测得主按钮文字最低约5.13:1、次级文字约5.00:1、输入边界约3.17:1，Input/Select 双环焦点生效；离屏捕获，不是手工可访问性验收 |
| 独立恢复复核 | 2 files / 42 tests，通过真实瞬时外部修改反例；原件保留且无可见坏备份 |
| 包与云 CI | 最终三产物、SBOM/元数据/六项 hash、实际业务/编辑器/安全/旧 profile/三轮快照均通过；云端 CI 未运行，未发布 |

本轮复现并关闭：默认预览 argv/query 明文泄漏、旧 raw MCP 写入口绕过能力、JSONC 危险原型键、registry 合并恢复已撤销能力、旧 MCP 整文件重写损坏大整数、危险 scope 原型污染、解压转发残留 Content-Encoding、恢复前移除归档导致副本丢失、归档大整数损坏、瞬时外部编辑导致坏备份后仍覆盖原件。每项均有对应测试；没有把缺乏复现的猜测写成漏洞。

Electron 45.0.0 实际 Node 24.22.0 / Chromium 156.0.8078.48；构建和独立代理为 Node 24.22.1 / npm 12.2.1。Chromium Brotli 固定源码已包含修复，因此保留 br；三种压缩解码实际转发回归通过。Electron 非规范 TLS 主机直接探针仍未拒绝；生产 URL 规范化、过滤来路 Host、HTTP agent:false、鉴权前置和 net.fetch 取消正文降低可达面，但不代表厂商回补完成。未使用的 DNS Resolver 路径和有限随机探针结果不当作修复证明。

正式发布仍阻塞于内嵌 Node 相关厂商回补证据、有效签名与真实安装升级验收。两套 npm audit 为零不替代运行时证明。未关闭 TLS/sandbox/签名链，不以签名暂缓删除正式门禁。

编辑器共享格式化另有 4 个反例先失败后通过：原 JSON 往返会改变大整数/转义/重复键/换行，Markdown 空行重排会改变原文；现采用 token 空白编辑、单步撤销和只读保护，详见[无损格式化记录](.agents/notes/implemented/bug-fix/2026-10-25-lossless-editor-formatting.md)。格式化修复前 853fce7 三产物保留为基线；最终测试包已从干净提交 289a832 重建并通过下述验收。

决策与官方证据：[工具链](.agents/notes/implemented/process/2026-10-25-latest-stable-dependency-upgrades.md)、[导入与全局上下文](.agents/notes/implemented/feature/2026-10-25-agent-import-and-global-context.md)。实际 CLI/模型账号、企业 CA、macOS/Linux、屏幕阅读器、NSIS 安装/卸载尚未实机验收。


### 最终本地候选与性能证据（2026-10-25）

最终候选由干净源码 289a832d39252b05de41a30ae0d16d64a91127d2 构建，build-metadata.sourceDirty=false，Node v24.22.1 / Electron 45.0.0。三产物均为未签名本地测试包，未 tag、push、上传或发布。修复前 853fce7 包仅保留作历史基线。

本机证据目录为 ccb-151-implementation-20261025/，最终产物位于 packages-final-20261025/；验收汇总 acceptance-summary.json、52 项输出证明 asar-output-proof.json、三轮性能 performance-summary.json/md、原生交互 native-confirmation/qa-report.json 均保留。

| 产物 | 字节 | SHA-256 |
| --- | ---: | --- |
| CCB-Portable-1.5.1.exe | 105462268 | 17f5e7eab290673c86a88505cc4575518582822eabf0da63eb5e0df84fed6bab |
| CCB-Setup-1.5.1.exe | 116492995 | 6fc8221c7f1ae76231b955fe90aa8c2fdff605732bcc99a37f999fe9d9f32203 |
| CCB-1.5.1-win.zip | 145690971 | 27f8fed23fcb8cf25e9f019531ee482fb650917763e8d1233f3bc6dd1c698ec6 |

两份 CycloneDX SBOM、构建元数据和三产物组成 SHA256SUMS 的六项，均重新核对非零文件与 SHA-256。SBOM 记录 npm 图，不包含 Chromium/Node 内部组件清单，也不是 GitHub OIDC provenance。

| 分组 | 结果 |
| --- | --- |
| 目录 / ZIP / Portable | 各 17 项业务检查通过，均正常退出；包含 JSON/Markdown、备份原文恢复、配置切换、MCP、角色、Skill 二进制、Codex 配置集、托管启停/重启及失败反馈 |
| 包内编辑器 | 8 项通过；editor/json 两类离线 worker 从 ASAR 加载并返回消息，真实 JSON 诊断、Markdown、保值格式化、撤销及只读保护生效 |
| 窗口安全 | 6 项通过，renderer 无 Node，禁新窗口/跨 document 跳转，hash 导航保持 |
| 旧版 profile | 本地 1.5.0 副本新写标记和 light 设置，最终 1.5.1 使用同一隔离 profile；18 项通过。未替换原安装、快捷方式或注册表 |
| 完整性 | out 的 52 个文件与 ASAR 字节一致；ZIP/NSIS 内 exe 和 ASAR 与目录一致；完整性 fuse 与 onlyLoadAppFromAsar 为启用，结构合法但哈希被改的包拒绝启动，未创建应用设置 |
| 用户数据 | 所有业务使用隔离 HOME/USERPROFILE/APPDATA；各组抽查的五份真实配置 hash 未变，CLI 路径均经前置隔离断言 |
| 本地 CI 类似环境 | 不携带 .keys 与 web 发布物的干净 Git 索引副本：460 passed / 10 条件跳过；包含这些条件的完整工作区为 470 passed / 0 skip。云端 CI 未运行 |

三轮使用同一保留的隔离样本、三个新进程，每轮默认配置页空闲 60 秒，再隐藏到托盘 60 秒；每 10 秒采样，导出六份原生快照。采样时没有并行打包或全量测试，OS 文件缓存已热。

| 指标 | 第 1 轮 | 第 2 轮 | 第 3 轮 | 中位数 |
| --- | ---: | ---: | ---: | ---: |
| 主进程启动至页面加载，估算 ms | 1471.43 | 1286.66 | 1446.43 | 1446.43 |
| renderer 初始化阶段 ms | 94.20 | 67.60 | 72.80 | 72.80 |
| 空闲 60 秒总工作集 MiB | 534.60 | 528.53 | 523.60 | 528.53 |
| 托盘 60 秒总工作集 MiB | 529.34 | 524.09 | 519.43 | 524.09 |
| 空闲 CPU % | 0.0386 | 0.0091 | 0.0090 | 0.0091 |
| 托盘 CPU % | 0.0059 | 0.0069 | 0.0063 | 0.0063 |

工作集是多个进程报告值之和，可能重复统计共享页，不能当作独占物理内存。CPU 先取每阶段六个样本中位数，再取三轮中位数；内存取每阶段 60 秒值的跨轮中位数。页面加载时钟使用主进程 uptime 与日志估算，不含 Portable 解压等待。没有与旧版本做同条件对照，不宣称提速、容量提升或所有场景低占用。

监控拓扑各轮稳定：1 watcher、2 目录、22 目录项；配置扫描 13 项，中位 43 ms。

未验证十款真实客户端/账号加载、企业 CA、macOS/Linux、真实 NSIS 覆盖安装/卸载、云端 CI 与大目录容量。Electron 内嵌 Node 厂商回补仍是正式发布阻塞项；签名暂缓不改变其判定。

## 2026-10-24：1.5.1 收尾与本地候选验收

本轮沿用 A/B/C 修复和旧配置路径，补齐托管模式错误反馈、实际重启、连接关闭及配置目录监控。1.6 路线已写入 DDE proposed 提案，本版未实施这些新功能。签名按用户要求暂缓，继续不 tag、不上传、不发布；本地候选不等于生产上线或正式发布验收。

### 本轮新增修复

- 托管 settings 仅在 ENOENT 时从空对象创建；损坏 JSON、非对象和读取失败不再被空配置覆盖。备份目录不可读不被当成无备份。启用/重启写入失败、停止/禁用还原失败均向调用方返回错误，保留可核对的实际状态。
- UI 重启按钮实际调用并检查 IPC；切换服务商也检查结果，成功后只刷新状态。服务停止不再以 3 秒计时结束伪装成已关闭，而是在宽限后关闭剩余 HTTP 连接并等待 close；端口占用由 listen 判断，删除可能复用旧连接的健康预判。
- 真实采样发现 watcher ready 但监控目录/条目为零。隐藏项现在按监控根目录的相对路径过滤，允许 `.ccb` 等隐藏祖先，继续排除内部隐藏项；两个实现共用小 helper。保持各自事件契约，不因此增加 renderer 自动刷新。
- 复核新公告后固定 Electron 44.9.3，更新两包 body-parser 2.4.0、独立包 follow-redirects 1.16.1、root Vite 7.3.7、fast-uri 3.1.9，以及锁内 qs 6.16.1。没有升级 Tailwind 主版本或关闭 TLS。[Electron 官方版本](https://releases.electronjs.org/release/v44.9.3)、[中间证书缓解公告](https://github.com/advisories/GHSA-jr5w-w6x2-84p9)、[body-parser 修复](https://github.com/expressjs/body-parser/releases/tag/v2.4.0)。
- Electron 镜像归档与 GitHub 官方 SHASUMS256.txt 独立比对，win32-x64 ZIP 的 SHA-256 为 `41a1ffa0541cb0f2c9b9fe920dd2cef1793ad0ea2ada1a9582958880f4d1b23c`，匹配通过。

### 已验证结果

| 检查 | 当前结果与边界 |
| --- | --- |
| 完整回归 | 46 files / 351 tests，全通过，无跳过；包含本地 production-key rehearsal 与模板 staging |
| 类型 / lint / 构建 | type-check、全量 ESLint、root/proxy 双构建通过；未把 lint:changed 对未提交修改的跳过当成证据 |
| 最终文档与预检 | production preflight、DDE 5 篇笔记 verify/index/index --check、Git diff --check 全部通过 |
| 覆盖率 | statements 37.98%、branches 38.77%、functions 38.41%、lines 38.03%；仅 main/proxy/shared，不是全仓覆盖率 |
| 依赖审计 | root/proxy 生产均 0；proxy 全依赖 0；root 全依赖 3 moderate、0 high、0 critical，详见下述延期项 |
| 本地业务 | 实际生产构建验证 JSON/Markdown 编辑、备份/原文还原、配置切换、设置持久化、MCP、Agent、Skill 无效覆盖保护及二进制保留、Codex 配置集校验与激活、模板覆盖/回退 |
| 实际界面 | 重启后服务处于运行状态；损坏 JSON 重启显示错误且不新增成功提示，原文不变；后续切换、重启、禁用及设置准确恢复通过 |
| 旧版数据 | 本地 1.5.0 副本写出标记配置和 light 主题，1.5.1 使用同一隔离用户目录读取并完成业务回归；原安装与快捷方式未覆盖。这是数据兼容证明，不是真实 NSIS 覆盖升级证明 |
| 独立代理 | 编译入口实际启动；未鉴权 401 且上游零调用，合法请求 200、上游一次，原配置哈希不变；缺 token 退出 1 |
| 监控 | 两项真实文件系统测试在旧实现失败，修复后通过；最终候选同时断言 active watcher、目录和条目非零 |
| 构建内容 | 47 个 out/ 文件与 ASAR 内对应内容逐字节一致；应用版本 1.5.1、Electron 44.9.3 |
| 运行时安全 | 实际运行验证无 Node globals、带用户手势的新窗口被拒、跨 document 导航被拒、同 document hash 导航可用；ASAR 两项 fuse 为 enabled |
| 篡改拒绝 | 隔离复制最终应用，保持 ASAR 结构合法但修改 header integrity；native 明确报 integrity failure 并退出，未创建应用 settings |
| 用户配置 | 完成包级回归后核对原有 4 个关键配置文件 SHA-256，与本轮开始一致；不据此声称整台机器文件系统零写入 |

### 性能与交付记录

最终候选为 Windows x64、Electron 44.9.3。三次启动复用同一份保留数据的隔离 profile，每轮可见空闲 60 秒、托盘隐藏 60 秒，每 10 秒采样；没有并行打包或完整测试，没有打开 DevTools 前端，仅使用回环 CDP 驱动既有 IPC。隐藏样本直接采集，不含恢复窗口扰动。Windows 11 build 26200、平衡电源模式；OS 文件缓存未清空，不与 1.5.0 作性能对比。

| 指标 | 三轮中位数 |
| --- | ---: |
| 启动至 did-finish-load | 1226.985 ms |
| Renderer 初始化 | 457.900 ms |
| 可见空闲工作集 / 隐藏工作集 | 501.926 / 500.992 MiB |
| 可见空闲 CPU / 隐藏 CPU | 0.009613% / 0.005929% |
| Active watcher / 目录 / 条目 | 1 / 2 / 23，三轮及隐藏前后稳定 |
| 最近扫描 | 37 ms，14 files / 14 configs，三轮均成功 |

启动值由 main 的 did-finish-load 日志时间与 native snapshot 的 capturedAt/process.uptime 推算起点，受时钟与日志精度限制；renderer 初始化直接取白名单 measure。CPU 为每轮六个 native process CPU 总值的中位数，再取三轮中位数。原始异常值保留，未用包体或旧样本推断“更快”。

第 3 轮隐藏工作集为 638.375 MiB，高于前两轮的 497.223 / 500.992 MiB。进程列表显示该轮隐藏后多出一个约 145.445 MiB 的 GPU 进程，主进程工作集基本不变；额外 GPU 进程的触发原因未确定，保留原样作为目标显卡环境复核项，未删除样本或据此宣称内存泄漏。

maximum 配置的 Portable / NSIS / ZIP 已全部生成。ZIP 完整性与 NSIS 内嵌应用归档校验通过，两者的 CCB.exe 和 app.asar 均与已验收目录一致；ZIP 与 Portable 实际运行完整业务 smoke 并通过 app.quit 正常退出（exit 0）。ASAR 未包含私钥文件，已装入 body-parser 2.4.0。未签名状态按用户要求保留，正式校验器仍明确拒绝 NotSigned，未放宽 CI 门禁。

| 最终资产 | 字节数 | SHA-256 |
| --- | ---: | --- |
| CCB-Portable-1.5.1.exe | 104576871 | `692c12b8153a5d42dd054713b7c73fc4130ce5135dbb267d95d7020900e2906a` |
| CCB-Setup-1.5.1.exe | 104756013 | `a030e53eb59f9d5c54d40ba307e2cc3e70373e70b5556eb0daaadcb375eb1b64` |
| CCB-1.5.1-win.zip | 145713946 | `622be9e8929ab13426e91f5235981910f01ff64a92f3926176782e8180622123` |

同目录附两份 CycloneDX（root 构建依赖 956 个组件、proxy 生产依赖 107 个组件）、build-metadata.json 和 SHA256SUMS.txt，清单 6 项均重新计算匹配。构建元数据明确 sourceDirty=true，未把未提交源码冒充为 HEAD 的可复现正式发布；本地依赖图也不等同于云端来源证明或完整 Chromium 原生组件清单。

此前 Electron 44.9.0 或监控条目为零的样本只作诊断，不计入最终验收。原始日志、fixture、自检脚本和 JSON 位于本机 `C:\Users\nianl\.codex\visualizations\2026\10\19\01a1549d-3784-77f2-87a8-68255dc1aa1a\ccb-151-release-completion`，最终包在 `packages-release-20261024`，性能汇总为 performance-summary.json / .md，不推送生成产物。

### 保留的验证边界

root 剩余 3 项中危由同一 [PostCSS 选择器解析问题](https://github.com/advisories/GHSA-rj75-hqrm-r3gf)沿 postcss-selector-parser / postcss-nested / Tailwind 依赖链传播，位于构建链。当前构建输入为仓库受控 CSS，应用不在运行时使用该解析器处理用户配置；npm 建议的完整修复跨 Tailwind 4 主版本。为控制本次兼容风险暂缓，2026-11-03 复核；不运行 audit fix --force，不声称全依赖零告警。10 月 20 日的 21 项数字只代表当时公告与锁文件状态，不能作为本轮结论。

真实目标机安装/覆盖升级/卸载、企业 CA/系统代理、真实付费服务商和云端 workflow/provenance 尚无本轮证据；未重跑 Semgrep。本轮未提供可用的隔离 Windows 安装环境，本机已有 1.5.0，未为验收改动其安装注册和快捷方式。签名本轮已获用户明确暂缓，不作为本地候选交付的阻塞项；正式发布的既有校验保留。

---

## 2026-10-20：1.5.1 C 批修复与验证

继续在 `codex/safety-reliability-ab` 实施独立代理鉴权、协议兼容和 Skill 覆盖导入保护。1.5.1 仍未发布，沿用配置路径、IPC 参数和文件格式，没有新增依赖或大范围拆分。下节 A/B 的安装包和桌面证明只覆盖当时快照，不含 C 批。

### 修复与支持边界

- 独立代理读取原 `~/.ccb/managed-mode-config.json` 的 accessToken，缺失时拒绝启动；只监听回环，`/v1` 在解析正文前校验 Bearer/x-api-key，重复、冲突和错误凭据返回 401，不能触发上游。`/health` 仅公开状态、版本和时间。启动读取一次，切换服务商或轮换凭据须重启独立进程。
- 上游地址和凭据由配置中的 transformer 决定，不按域名猜测：Anthropic Messages 保留兼容网关与 beta 头；DeepSeek/OpenRouter 使用 Chat Completions、Bearer 和 system/函数工具转换；Gemini 使用原生 Content action 与 x-goog-api-key，不把密钥放进 URL。未知协议拒绝，不跟随重定向。上游地址仍由已有本地服务商配置者信任，HTTP 调用方不能替换地址。
- 每个原生流独立持有 SSE 帧状态，UTF-8 解码保留跨块字节，发出 Anthropic message/content block/delta/stop；并行工具参数收齐后按块输出。错误、非法 JSON、无效工具参数和截断流明确失败，不伪造完成。普通响应时限覆盖正文，成功 SSE 允许静默，下游断开取消上游，不自动重试。JSON 错误限长、保留状态并脱敏，HTML 等原文不透传，不记录请求正文或密钥。
- Gemini 原生工具/推理、所有原生转换的 cache_control、Chat Completions 的 top_k 及其他不能无损映射的高级字段明确拒绝。DeepSeek 显式关闭原生 thinking。保留有限历史模型别名，但不保证退役模型可用；Gemini 使用明确或已配置的原生模型 ID。完整接口和限制见 [PROTOCOL.md](src/proxy-server/PROTOCOL.md)。这些转换不属于主应用内置集成代理。
- Skill 目录/文件列表导入共用暂存、完整校验、原目录备份 rename 和替换；复制、写盘或安装失败保留/恢复原目录，恢复也失败则原内容保留在报告的备份路径。导入串行；只清理本次独占临时目录。拒绝 traversal、UNC、ADS、链接、Windows 保留名、重复路径、无效 Base64/UTF-8；限 2000 项（目录导入含子目录）、单文件 10 MiB、总计 50 MiB、深度 32。SKILL.md 与附带脚本作为数据保存，不执行。

### 本地验证结果

| 检查 | 结果 | 范围 |
| --- | --- | --- |
| 修复前复现 | 2 files / 8 failed / 1 passed | 无凭据可请求、错误上游地址、导入失败丢失旧文件等，全部使用 fixture 与临时目录 |
| 最终完整回归 | 45 files / 337 tests，全通过，无跳过 | 比 A/B 新增 48 项；启用本地 production-key rehearsal 与 web staging，未打印或提交私钥 |
| 类型 / lint | type-check、全量 ESLint 零错误 | lint:changed 也运行；当前修改未提交，该脚本只比较提交并显示跳过，以全量 lint 为本轮证据 |
| 双构建 | root / 独立 proxy 均通过 | main 317.85 kB / preload 13.58 kB / renderer entry 202.84 kB；main 比 A/B 增加 2.93 kB，体积不代表性能 |
| 独立入口实际启动 | 通过 | 运行编译后的 dist/index.js：缺认证 401 且零上游调用、合法请求 200、原配置 SHA-256 不变、缺 token 启动退出 1；隔离 USERPROFILE |
| 根 / proxy 生产审计 | 均 0 | 本轮实时 npm audit --omit=dev；锁文件未在 C 批变更 |
| proxy 全依赖审计 | 0 | 独立包单独查询 |
| 根全依赖审计 | 21：11 high / 10 moderate / 0 critical | 与 A/B 相同的已披露开发链风险，audit 返回非零，没有忽略或强制覆盖依赖 |
| 覆盖率 | statements 35.42%，branches 37.18%，lines 35.35% | 仅 main/proxy/shared，大量现有路径仍未覆盖，不视为完整安全证明 |
| 预检与文档 | production preflight、DDE verify / index / index --check、git diff --check 通过 | 三份活文档、双语 README、CHANGELOG、协议说明和决策记录同步；DEVELOPMENT.md 与 docs/ 依仓库规则仅本地维护 |
| 用户数据核对 | 4 个已有关键配置 SHA-256 均未改变 | 设置、Claude 配置和托管配置的前后快照；Skill 数据保护另以临时目录中的原文件/二进制故障注入证明 |

新增测试包括并行流隔离、晚到 usage、UTF-8 字节拆分、CRLF 多帧、上游错误/截断、无重定向、超时/断连/长静默，以及导入复制/写入/安装/恢复失败、同名并发、二进制保留、编码/数量/大小/路径/链接边界。没有调用真实付费提供商。

### 尚未验收

C 批只做源码回归和双构建，没有重打安装包、签名、上传或发布；现有 A/B 验证包不能用作包含 C 批的发行版。真实服务商/Claude Code 各高级能力、企业 CA/代理、目标 Windows 安装升级卸载和三轮性能仍需对应环境验收。Skill 双 rename 提供异常回滚与可定位备份，不承诺断电原子性或与外部 CLI 的跨进程事务。保留 D 批大清理和开发链 21 个告警，未重跑 Semgrep。

协议实现核对 [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[OpenRouter API](https://openrouter.ai/docs/api_reference/overview)、[Gemini Content API](https://ai.google.dev/api/generate-content) / [API keys](https://ai.google.dev/gemini-api/docs/api-key) 与 [Anthropic Streaming](https://platform.claude.com/docs/en/build-with-claude/streaming)。本地最终日志位于 `ccb-implementation-c`；它们证明 fixture 与故障边界，不替代生产验收。

## 2026-10-19～20：1.5.1 A、B 批修复与验证

当前是未发布的 1.5.1 候选，分支 `codex/safety-reliability-ab`，修复基线 `a6625f2`。下文较早审计中的“全依赖零漏洞”等数字只代表当时状态，不能作为当前结论。

### 修复范围

- 原子写改为独占随机临时文件、文件同步、同路径排队、rename 替换，失败不改原文件。Config/MCP/规则/配置集/设置及备份恢复复用此实现；系统设置备份失败即中止覆盖。
- 配置集保存及激活读取 `VALIDATE.valid`，全组校验通过后才逐文件写入；首次创建可补父目录并重新检查路径链。保持 LEGACY_COMPAT、现有目录与文件格式，不迁移用户数据。
- Settings IPC 共用服务队列，完整保存只写一次，成功后才提交内存；renderer 检查 success，错误可见，草稿保留。面板导入导出复用 store，导入后重新读文件；保存期间禁用表单，避免异步覆盖新输入。
- 普通代理响应使用覆盖正文的总时限；成功 SSE 保持长静默，下游断连取消上游；不自动重试 POST。版本读取限定固定 HTTPS URL，15 秒、64 KiB、拒绝重定向。
- Electron 固定 44.9.0，修复生产依赖，启用 ASAR integrity validation / onlyLoadAppFromAsar。Windows 使用原 PNG 生成的多尺寸 ICO，避开本机原生图标工具退出崩溃。
- CI 两套生产审计分开阻塞，加入正式预检、tag 版本核对、签名凭据检查、forceCodeSigning、Authenticode、ZIP 与目录中 exe/ASAR 一致性、依赖 SBOM、SHA-256 和 GitHub provenance。所有 Action 固定 commit。证书只从 secrets 提供。

### 自动化结果

| 检查 | 本轮结果 | 证据边界 |
| --- | --- | --- |
| 修复前复现 | 5 个测试文件出现 9 项失败 | 在隔离用户目录复现并发写、无效配置仍保存、缺失文件、错误反馈等，不操作真实配置 |
| 最终完整回归 | 42 files / 289 tests，全通过，无跳过 | 本地已启用 production-key rehearsal 和 web staging，密钥未进入源码或产物 |
| 类型与 lint | type-check / 全量 ESLint 零错误 | lint:changed 已运行；当前改动未提交，该脚本仅比较提交，因此显示跳过，全量 lint 才覆盖本次工作区 |
| 双构建 | root 与独立 proxy 通过 | main 314.92 kB / preload 13.58 kB / renderer entry 202.84 kB；体积不是性能指标 |
| 干净依赖安装 | 两套 npm ci --ignore-scripts 通过 | 在外部空目录验证两份锁文件，不破坏工作区已有运行时 |
| 发布预检 | production release:preflight 通过 | 候选/已发布条目、版本、应用身份、沙箱、ASAR 配置、生产 registry trust map、tracked 私钥检查 |
| 文档门禁 | DDE verify、index、index --check 通过 | 两条 implemented Note，与三份活文档、双语 README、CHANGELOG 同步 |
| 根生产依赖 | 0 漏洞 | npm audit --omit=dev 实时查询；不是全依赖或最终原生组件的无漏洞证明 |
| 独立代理依赖 | 生产与全依赖均 0 | 单独安装、构建、审计，没有顺带改其鉴权/协议 |
| 根全依赖 | 21 个告警：11 high / 10 moderate / 0 critical | 修复前本轮快照为 37 个；剩余见下节，未使用 audit fix --force |
| 覆盖率 | statements 31.36%，branches 31.11%，lines 31.43% | 聚焦 main/proxy/shared；未据此声称 UI 或全部行为已充分覆盖 |

### 桌面与供应链验证

Electron ZIP SHA-256：`88e08039d0ef359bab9f674e8051fa103bd8628ea7c5a5e1daaa610a8a0c6931`，实际下载文件、官方 SHASUMS256、镜像 SHASUMS256 与 npm 包内 checksums 一致。TLS 校验保持开启。

隔离用户目录启动了真实 Electron 44.9.0 / Chromium 152.0.7977.167 / Node 24.22.0。页面有实际 DOM，renderer 无 require，sandbox=true、contextIsolation=true、nodeIntegration=false；设置通过真实 IPC 保存后重新读取成功。打包应用也完成隔离启动，renderer 带 --enable-sandbox；本次检查的真实 .claude/settings.json、.claude.json 与 APPDATA/CCB/settings.json 校验和未改变。

从打包 EXE 读取到两个 ASAR fuse 均启用。另建完整隔离副本，仅改 ASAR header 中一个字节，应用立即拒绝启动，stderr 明确报告 header integrity check failed。未修改用于交付验证的原包。此验证证明完整性检查生效，不代替 Authenticode 身份验证。

最终源码的 Portable、NSIS、ZIP 三种本地验证包全部生成。此轮明确使用 `forceCodeSigning=false` 与 `compression=store`；正式配置仍为 `maximum`，此前高压缩验证未完成，不将其写成通过。打包 ASAR 内的 47 个构建文件与当前 out 逐文件 SHA-256 一致，未发现 .keys、.env、私钥或 PFX 文件。ZIP 内 EXE 与 ASAR 均与目录产物哈希一致。

最终 Portable 隔离启动 15 秒，存在带 --enable-sandbox 的 renderer，检查的三个真实用户关键文件均未改变。NSIS 仅验证构建，未进行真实安装/卸载。

两份实际 CycloneDX 1.5 SBOM 分别含 root 构建图 956 个组件、proxy 生产图 106 个组件；三种资产、两份 SBOM 和构建元数据共 6 项 SHA256SUMS 均独立复核。运行发布校验脚本时，未签名 Portable 被明确拒绝为 NotSigned；另以 forceCodeSigning=true 实际打包目录，因缺证书而失败，失败原因与预期一致。

正式证书正向路径和 GitHub workflow/provenance 尚未执行，不能把本地未签名包视为已签名正式发行版。候选目录、哈希和完整日志见本地审查交付目录 `ccb-implementation-ab`，没有上传或发布。

### 剩余告警与发布前置条件

根开发链剩余告警集中在三组：Tailwind 3 的 braces/chokidar 3/micromatch/fast-glob/PostCSS；typescript-eslint 7 的 globby 链；electron-builder 26 的 @electron/get 4/global-agent/roarr/sprintf-js 链。直接运行时 chokidar 已是 4.0.3。告警中的工具链版本与 renderer 构建依赖需要分别评估，生产依赖 audit 双零不能替代全图分析。

继续清零需要单独评估 lint 规则迁移、Tailwind 主版本或构建器传递依赖升级。此次保留现有 UI 构建体系，未做强制大版本覆盖；告警未隐藏，也未声称无风险。

仍需维护者配置受控 Windows 签名证书并执行云端 workflow、验证正式签名正向路径和 provenance，完成人工安装/卸载/旧数据升级、企业 CA/系统代理及三轮实机性能验收。跨文件激活仍逐文件写入，依赖既有备份恢复；单进程队列不合并外部 CLI 同时编辑。

A/B 当时未实施 C 批独立代理鉴权/协议与 Skill 覆盖导入；其后已按本报告最新 C 批一节实施。D 批模块大清理仍未实施。本轮未重跑 Semgrep，也未把历史扫描结果当作本轮证明。

### 对照的一手资料

- [Electron 44.9.0 官方发行记录](https://releases.electronjs.org/release/v44.9.0)：确认受支持运行时及 Chromium/Node 版本。
- [Electron 安全建议](https://www.electronjs.org/docs/latest/tutorial/security)：保持沙箱、隔离、受限能力与受支持版本。
- [electron-builder Windows 签名](https://www.electron.build/docs/features/code-signing/code-signing-win/)：正式发布要求真实签名，缺凭据时阻止发行。
- [GitHub 产物证明](https://docs.github.com/en/actions/concepts/security/artifact-attestations)：来源证明与文件 digest 绑定；不把证明当作测试通过的替代物。

---


## 审计记录

### 2026-07-12：首次基线审计与整改

#### 范围与工具

- 仓库：`ClaudeCodeButler`，分支 `main`
- 工具：根目录 `.venv` 中的 Semgrep CLI `1.169.0`
- 规则：`p/security-audit`、`p/owasp-top-ten`、`p/javascript`
- 范围：Git tracked application source、scripts、tests 与 GitHub Actions；基线 162 files，加入报告与版本锁定文件后终态 164 files
- 排除：`.venv`、`node_modules`、`out`、`release`、`coverage`、`backup`、`.git`
- 原始结果：本地 `.semgrep/security-audit.json` 与 `.semgrep/security-audit.sarif`，已通过 `.gitignore` 排除

#### 基线结果

首次扫描运行 372 条适用规则，得到 16 个 findings：

| 类别 | 数量 | 研判 | 处置 |
| --- | ---: | --- | --- |
| GitHub Actions mutable action tag | 9 | 真实供应链风险 | 已固定为官方 tag 在审计日对应的 40-character commit SHA |
| `privilege-manager` 动态 `exec` | 3 | 真实 command injection 风险，来自 2 个调用点 | 已改为 `execFile` argument array，并增加 executable allowlist 与跨平台 escaping |
| 受控 `child_process` 边界 | 4 | 规则无法识别既有控制措施 | 逐点复核后使用 rule-specific suppression，并在源码记录信任边界 |
| Express default CORS | 1 | 对应 registry rule 依赖 Pro engine；人工补偿检查确认真实 localhost cross-origin 风险 | 已移除 CORS middleware 与冗余 dependencies |

首次扫描曾有 1 条规则在大型 locale 文件上 timeout。复扫将单规则 timeout 提高到 60 秒后，162 个 targets 均完成解析，未再发生 timeout。

#### 已实施改进

1. GitHub Actions 中的 `checkout`、`setup-node`、`cache`、`upload-artifact`、`action-gh-release` 全部固定 commit SHA，并保留版本注释供 Dependabot 或人工更新。
2. 权限提升执行从 shell string 拼接改为 `execFile(command, args)`；允许的 executable 限制为 `powershell.exe`、`osascript`、`pkexec`、`sudo`。
3. Windows 使用 PowerShell single-quoted literal escaping；macOS 同时应用 POSIX argument quoting 与 AppleScript string escaping；Linux 保持 argument array，不构造 shell command string。
4. 同文件的静态权限探测命令一并从 `exec` 改为 `execFile`，防止后续维护重新引入字符串拼接。
5. 权限确认对话框异常时由默认允许改为默认拒绝，消除 fail-open 行为。
6. 新增跨平台提权规格回归测试，覆盖 quotes、spaces、command substitution 与 command separator 输入。
7. 新增 `requirements-security.txt` 锁定 Semgrep 版本；`.venv/` 与 `.semgrep/` 已加入 `.gitignore`。
8. 移除本地 proxy server 的 default-open CORS。合法调用方均为 Claude CLI 或 Electron IPC，不需要浏览器跨源访问；同时移除 root 与 proxy-server 的 `cors` dependencies。
9. 补充执行 npm dependency audit：将 Electron/Vite/Vitest 等 transitive packages 更新到现有 semver range 内的修复版本；升级 `node-cron` 4.6.0 与 `uuid` 14.0.1；覆盖 Monaco 固定的旧 DOMPurify 至 3.4.12，并覆盖 brace-expansion 至 2.0.3。
10. node-cron 4 不再支持 v3 的 `scheduled:false` 语义，`TaskScheduler` 已改用 `createTask`，保持 disabled rule 注册后不自动启动。
11. dependency 更新后 root audit 从 31 vulnerabilities（2 critical、17 high、10 moderate、2 low）降至 0；proxy-server audit 同样为 0。
12. production build 暴露出旧 CSS `@import` 顺序错误及两个此前未解析到的残缺 style fragments；已移动 imports、删除无 selector 的无效 declarations，build 不再产生 PostCSS warning。

#### 已接受的边界与依据

- `command-executor`：`parseCommand` 拒绝 shell metacharacters，执行固定为 `shell:false`，binary 与 args 保持独立。
- `project-management-service`：launch spec 仅由 class 内私有平台构造器产生，使用 argument array 且不启用 shell。
- `terminal-management-service`：MCP stdio server 启动探测需要加载用户本地 shell 环境。该能力仅消费用户明确保存的本地 MCP 配置；renderer IPC 使用独立 command allowlist，不提供任意 shell passthrough。

以上位置只抑制 `javascript.lang.security.detect-child-process.detect-child-process` 单条规则，没有全局关闭规则。若未来扩大调用来源或移除现有 allowlist/validation，必须删除 suppression 并重新建模该边界。

#### 验证结果

- Full Vitest：65 tests passed（10 test files）
- TypeScript：`npm run type-check` passed
- Targeted ESLint：passed
- Root production build：passed
- Proxy-server TypeScript build：passed
- Root `npm audit --audit-level=low`：0 vulnerabilities
- Proxy-server `npm audit --audit-level=low`：0 vulnerabilities
- 整改后 Semgrep：相同 rulesets 与 164 targets 完成扫描；3 条 Pro-only rules 由 OSS CLI 明确排除并人工补偿检查，最终 0 unsuppressed findings、0 scan errors、0 timeout

#### 后续建议

1. 在 CI 中使用锁定版本的 Semgrep，并将 SARIF 上传到 GitHub Code Scanning；PR 应只扫描 diff，定时任务执行 full scan。
2. 启用 Dependabot 更新 pinned action SHA，避免固定 SHA 后长期错过 action security patches。
3. Semgrep 是 pattern-based SAST，不能替代 dependency、secret 与 runtime audit；应并行保留 `npm audit`、secret scanning 和 Electron security checklist。
4. MCP 本地配置属于显式信任边界。若未来支持远程同步或共享配置，必须改为 executable allowlist 或用户逐次确认，不能沿用当前 suppression。
5. Browserslist build metadata 当前提示 `caniuse-lite` 已陈旧 9 个月；应在独立 dependency maintenance PR 中更新并执行 UI/browser compatibility regression，避免把兼容基线变化混入安全修复。

#### OSS CLI 规则兼容说明

Registry 中以下规则使用 `metavariable-name:module`，Semgrep OSS CLI `1.169.0` 无法执行，未登录 Pro engine 时会对每个 JS/TS target 重复产生 internal matching warning：

- `javascript.crypto-js.cryptojs-weak-algorithm.cryptojs-weak-algorithm`
- `javascript.koa.web.cors-default-config-koa.cors-default-config-koa`
- `javascript.express.web.cors-default-config-express.cors-default-config-express`

最终扫描通过 `--exclude-rule` 明确排除这 3 条规则。人工补偿检查确认项目未使用 CryptoJS 或 Koa；Express default CORS 问题已发现并移除。若 CI 后续启用 Semgrep Pro，应移除这些 exclusions 并恢复对应规则。

### 2026-07-12：v1.5.0 generic discovery 增量复审

#### 审计范围与结果

- 使用根目录 `.venv` 中锁定的 Semgrep CLI `1.169.0`，复用 `p/security-audit`、`p/owasp-top-ten`、`p/javascript` 与既有 3 条 OSS Pro-only exclusions。
- 扫描 179 个 Git tracked targets、执行 369 条规则，约 100% lines parsed；JSON 原始结果为 `0 findings / 0 errors`。
- Root 与 `src/proxy-server` 的 `npm audit --audit-level=low` 均为 `0 vulnerabilities`。
- Full Vitest 为 16 files / 104 tests，TypeScript、ESLint、root production build 与 proxy-server build 全部通过。

#### 本阶段安全改进

1. Registry path template 只允许 `HOME`、`APPDATA`、`LOCALAPPDATA`、`XDG_CONFIG_HOME`、`CCB_DATA` 根变量，并拒绝 traversal、UNC、glob、未知变量和嵌套变量。
2. `COMMAND_EXISTS` 使用 `execFile(locator, [command])`、`shell: false`、5 秒 timeout 与 executable-name allowlist，不接受参数或 shell metacharacters。
3. Artifact discovery/read 每次从 effective registry 重新推导路径 allowlist；renderer 提供的 path 只作为候选选择器，不能扩展 main process 文件权限。
4. Read-only artifact 限制为当前平台 registry 声明、具有 `READ` capability、最大 1 MiB 的普通文件，并拒绝最终文件及中间目录中的 symbolic link/junction。
5. Codex CLI adapter 首版只声明 `DISCOVER` / `READ`，TOML 以 raw UTF-8 text 返回；未验证的 edit semantics 不会伪装为通用能力。

#### 保留建议

- Semgrep 属于 pattern-based SAST，`0 findings` 不能替代 runtime authorization review、secret scanning 或手工 threat modeling。
- 当前路径校验适合本地可信用户模型；若未来引入多用户服务或不可信本地进程对抗，应进一步采用 OS-level file handles、identity checks 与更严格的 TOCTOU 防护。
- Remote registry 在 Ed25519 publisher signature 未实施前应维持 preview/beta，不能仅凭 HTTPS 与 SHA-256 宣称 publisher authenticity。

### 2026-07-12：v1.5.0 generic management 增量复审

#### 审计范围与结果

- Semgrep CLI `1.169.0` full scan 覆盖 181 个既有 Git tracked targets、执行 369 条规则，约 100% lines parsed，结果为 `0 findings / 0 errors`。
- Semgrep 默认 tracked-file 枚举不包含 staged-but-uncommitted new files，因此对 2 个新 services 与 2 个新 specs 额外执行显式路径扫描；4 targets、332 applicable rules 同样为 `0 findings / 0 errors`。
- Full Vitest 为 18 files / 113 tests；TypeScript、ESLint、root production build、proxy-server build 全部通过。
- Root 与独立 proxy package 的 `npm audit --audit-level=low` 均为 `0 vulnerabilities`。

#### 本阶段安全改进

1. Generic edit、validate、backup、restore 各自要求 effective registry 中对应 UPPERCASE capability，不能由 format 或 renderer 自行推导权限。
2. JSON/JSONC/YAML codecs 限制为内置实现，并加入 64-level / 50,000-node 结构预算；remote registry 不能下载 parser code。TOML 在可信 parser 接入前明确拒绝 validation/edit，不伪造支持。
3. Edit 使用目标目录内随机 exclusive temp file、flush 与 atomic rename；带 `BACKUP` capability 的 artifact 在更新前自动备份，invalid content 不修改原文件。
4. Backup 使用 UUID、exclusive copy、受控目录和 bounded metadata；restore 根据 metadata 重新校验 registry path 与 `RESTORE` capability，拒绝 symbolic link、超限内容、无效 UTF-8 和目标路径篡改。
5. Codex CLI adapter 继续仅声明 `DISCOVER` / `READ`，因此新管理 IPC 不会扩大其写权限。

### 2026-07-13：generic management UI 与 registry cache 增量复审

- Semgrep full scan 覆盖 183 targets、369 rules，结果为 `0 findings / 0 errors`；对 staged 新 UI TSX 显式补扫 1 target、332 applicable rules，同样为 `0 findings / 0 errors`。
- Full Vitest 为 18 files / 114 tests；TypeScript、ESLint、root/proxy builds 与两套 npm audit 全部通过。
- 新增 AI Tool Configuration lazy panel；renderer 只能调用既有 capability-aware IPC，不能提供额外 filesystem roots、handlers 或 executable code。
- UI 仅在 registry 声明对应 capability 时展示 validate/edit/backup 操作；main process 仍在每次调用时重新授权，因此 UI 隐藏不是安全边界。
- Effective registry snapshot 使用 single-flight cache，fingerprint 包含 installed/last-known-good 的 nanosecond `mtime`、`ctime` 与 size；storage 变化后重新读取并执行完整 validator。
- Codex CLI 在 UI 中保持 read-only；未实现可信 TOML codec 前不会显示 edit/validate 操作。
- Backup history listing 会先重新授权 `RESTORE` capability，再逐条校验 UUID、metadata/content 普通文件属性、大小和 originalPath；损坏记录 fail-closed 排除。
- Full Vitest 更新为 18 files / 116 tests；build 日志已确认无 Ant Design `destroyOnClose` deprecation warning。
- 本阶段 Semgrep full scan 继续覆盖 183 targets / 369 rules，结果为 `0 findings / 0 errors`。
- 通用 backup create/prune 使用单进程 mutation queue；retention 只删除经过 UUID、metadata/content 普通文件与路径一致性校验的 service-owned records。
- 本阶段 Semgrep full scan 覆盖 183 targets / 369 rules，结果保持 `0 findings / 0 errors`。

### 2026-07-13：Phase 5 performance lifecycle 增量复审

- Semgrep full scan 覆盖 184 个 Git tracked targets、执行 369 条规则，约 100% lines parsed，结果为 `0 findings / 0 errors`。
- 对本阶段 5 个 lifecycle/scheduler implementation 与 spec paths 显式补扫，执行 332 条适用规则，结果同为 `0 findings / 0 errors`。
- Root 与独立 proxy package 的 `npm audit --audit-level=low` 均为 `0 vulnerabilities`；full Vitest 为 20 files / 122 tests，TypeScript、ESLint、root/proxy builds 全部通过。
- Renderer background scheduler 只调度固定 store actions，不接收 renderer 字符串、路径或 executable；cancel 仅阻止尚未启动的 batch，不隐藏已发出 IPC 的真实状态。
- StatisticsService shutdown 使用幂等 Promise barrier，auto-save 串行化，并由 app-level single quit guard 等待 cleanup，降低退出阶段部分写入与并发写入风险。
- 本轮未启动应用，安全结论只覆盖静态分析、dependency audit、unit contract 与 production build；runtime Electron security checklist 仍应在 release 验收阶段执行。

### 2026-07-13：Ed25519 registry publisher identity 增量复审

- Remote manifest schema 新增必填 `signatureAlgorithm: ED25519`、stable `keyId` 与 64-byte standard Base64 detached signature；额外字段和其他算法 fail-closed。
- Bundle 使用 bounded `arraybuffer` 下载，先对 exact response bytes 验证 pinned Ed25519 public key signature，再校验 SHA-256/size，之后使用 fatal UTF-8 decoder 解析 schema。
- Signature 后继续绑定 manifest/bundle `registryVersion` 与 `minimumAppVersion`，并保留 app compatibility 和 downgrade protection，拒绝合法旧 bundle 被错误 manifest 重新包装。
- Unknown keyId 在 manifest check 阶段直接进入 `CHECK_FAILED`，不会向用户展示虚假的 `UPDATE_AVAILABLE`；production trust map 当前为空，正式 public key 注入前 remote registry 保持 fail-closed preview。
- Offline signing helper 已用一次性 Ed25519 keypair对内置 registry 的 exact `3458 bytes` 完成 rehearsal；独立核对 size、SHA-256 与 signature 后删除临时 private key。
- Full Vitest 为 20 files / 125 tests；TypeScript、ESLint、root/proxy builds 与两套 npm audit 全部通过。Main bundle 为 `277.85 KB`，preload/renderer 保持 `12.53 KB / 196.05 KB`。
- Semgrep full scan 覆盖 186 个 Git tracked targets、执行 369 条规则，结果为 `0 findings / 0 errors`；对签名链路 9 个 implementation/spec/script paths 显式补扫 332 条适用规则，结果同为 `0 findings / 0 errors`。

保留的 release blocker：维护者必须执行 offline key ceremony，将 private key 保存在 repository/CI/application package 之外，并只把对应 SPKI public key 注入 `REGISTRY_TRUSTED_PUBLIC_KEYS`。Verifier 完成不等于 publisher identity 已建立。

### 2026-07-13：Claude legacy workspace compatibility 增量复审

- 新增 `ClaudeWorkspacePathFacade`，集中声明 legacy `.ccb/claude-configs` 与 future `.ccb/workspaces/claude-code`；v1.5.0 active mode 固定为 `LEGACY_COMPAT`。
- 路径选择不访问 filesystem，不根据目录存在性隐式切换，不创建 future workspace，也不复制、删除或移动用户数据。
- Managed Mode provider sync 移除 legacy path 直接拼接，与 ConfigService、FileWatcher、菜单统一消费 main-process `pathManager.claudeConfigsDir` compatibility alias。
- `resolveActiveFile` 只允许直接子文件名，跨平台拒绝 `/`、`\\`、`.`、`..`、empty 与 NUL 输入；relative app data root 同样拒绝。
- Full Vitest 为 21 files / 129 tests；TypeScript、ESLint、root/proxy builds 与两套 npm audit 全部通过。Main bundle 为 `278.57 KB`，preload/renderer 保持 `12.53 KB / 196.05 KB`。
- Semgrep full scan 覆盖 188 个 Git tracked targets、执行 369 条规则，结果为 `0 findings / 0 errors`；对 facade/path manager/Managed Mode/spec 等 5 paths 显式补扫 332 条适用规则，结果同为 `0 findings / 0 errors`。

该 facade 不等同于物理 migration 完成。旧目录业务回归仍需用户后续启动应用验收；future workspace 只有在具备 backup、journal、idempotency 与 rollback rehearsal 后才能显式启用。

### 2026-07-13：v1.5.0 release hardening 终态自动化复审

#### 审计与构建证据

- Full Vitest：`30 files / 188 tests` 全部通过；TypeScript、ESLint、root production build 与 proxy-server build 全部通过。
- Semgrep full scan：`198 targets / 369 rules / 0 findings / 0 structured errors`。
- Semgrep explicit-path scan：`35 targets / 336 rules / 0 findings / 0 structured errors`，覆盖本次 staged implementation/spec/script paths。
- Root 与独立 proxy package 的 `npm audit --audit-level=low` 均为 `0 vulnerabilities`。
- 最终静态包体记录：main `288.87 KB`、preload `12.93 KB`、renderer entry `199.70 KB`、Settings JS/CSS `34.96 KB / 2.67 KB`。这些数字仅用于追踪静态成本，不替代 runtime memory/CPU/startup 验收。

#### Semgrep OSS coverage disclosure

Semgrep `1.169.0` 的 JSON `errors` 均为 0，但 `time.fixpoint_timeouts` 在 full/explicit scan 中分别记录 41/8 条 warning。它们主要来自 Koa/NestJS/Express 等跨 framework taint rules 对 Electron/React 或无关 service 的分析，并不等价于 finding；但对应单条 taint fixpoint 也不能视为完整证明。补偿措施包括：对全部 35 个 staged code paths 显式复扫、对 IPC/path/template/renderer payload 边界进行人工审查，以及 188 项回归测试、两套 dependency audit 和 Electron release preflight。最终结论应表述为“0 unsuppressed findings、0 structured errors，存在已披露的 OSS fixpoint coverage limitation”，不能宣称静态分析覆盖绝对完整。

#### 本阶段安全改进

1. Artifact-specific template 只允许内置 codec，限制单模板 `64 KiB`、拒绝 NUL，并以 `USER_OVERRIDE > REGISTRY > EMBEDDED` 决定生效来源；remote registry 仍不能注入 executable code。
2. Settings 中 legacy customized global template 只迁移到明确的 `claude-code/user-settings` override，内置旧默认不迁移；migration 完成后旧字段被归一化，避免删除 override 后复活。
3. Template mutation 使用串行 queue；registry update、removal 与 rollback 不得覆盖 user override，且 removal 始终保留 embedded fallback。
4. Electron `BrowserWindow` 启用 `sandbox: true`，`setWindowOpenHandler` 全部 deny，`will-navigate` 仅允许当前 document 的 hash navigation；相关配置由 unit contract 与 release preflight 同时锁定。
5. Release preflight 检查 package/package-lock/APP_INFO 版本绑定、双语 README/CHANGELOG、installer identity、artifact naming、tracked private-key markers、production registry trust map 与 Electron security contract。
6. `.keys/`、`*.private.pem`、`registry-private-key*.pem` 与 `secrets/` 已加入 ignore policy；private key 禁止进入 repository、CI 或 application package。
7. Performance snapshot 接收的 renderer timings 视为不可信 IPC 输入；main process 只接受 3 个固定 entry、最多 3 项、正确的 `MARK`/`MEASURE` 类型和有限非负数值，导出时丢弃额外字段。
8. `runtimeMetrics` 仅由 main process 现有 watcher/config scan 生命周期被动更新并在用户点击导出时读取；renderer 不能提交或篡改这些计数，不新增后台采样 timer、网络请求或 telemetry 上传。

#### 仍然 fail-closed 的发布边界

- `REGISTRY_TRUSTED_PUBLIC_KEYS` 当前为空。`npm.cmd run release:preflight:preview` 可用于开发检查并输出 warning；production `npm.cmd run release:preflight` 会按设计失败，直到维护者执行 offline Ed25519 key ceremony 并只注入对应 SPKI public key。
- 构建机若处于 TLS 拦截网络（如企业代理），electron-builder 下载 Electron distribution 可能报告 `unable to verify the first certificate`。这是证书信任链问题，不允许用 `NODE_TLS_REJECT_UNAUTHORIZED=0` 绕过；应通过 `NODE_EXTRA_CA_CERTS` 或 npm `cafile` 配置组织可信根 CA 后重新执行 `npm.cmd run pack:win:all`。
- 本轮未启动应用。Electron runtime navigation、新窗口策略、installer/portable/zip smoke test、registry release-candidate 对抗用例与业务兼容性必须在目标机按手动验收清单实机验收。
