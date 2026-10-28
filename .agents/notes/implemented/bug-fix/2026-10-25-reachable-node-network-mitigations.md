# Agent Note: Node 可达网络风险缓解与下载 HEAD 临时例外

Status: implemented
Scope: src/main/utils/upstream-http-client.ts, src/main/ipc-handlers.ts, src/main/services/managed-mode-service.ts, eslint.config.cjs, tests/unit/**, tests/e2e/**, ARCHITECTURE.md, CAPABILITIES.md, SECURITY_AUDIT_REPORT.md
Last-verified: 2026-10-25

## Problem

用户批准先按 CCB 实际可达性处理 7 项 Node、11 项 c-ares 和 8 项 Undici 公告，不等待所有 Electron 回补。HTTP CONNECT 连接 IP 上游时，代理库移除 host 后，TLS 可能用 localhost 或代理域名验证目标证书；此问题在 Node 24.22.1 对照也存在。下载 HEAD 使用默认 agent，且未消费/销毁响应，存在连接占用和未来响应处理变化后恢复复用的风险。

证据更正：此前默认 agent 的预先响应 PoC 会消费响应，它证明底层连接复用条件，不是原始下载 IPC 已完整复现。原始 HEAD 的受控对照显示响应未结束、连接仍占用，未返回空闲池。本轮明确区分这两条证据，不据 PoC 声称下载文件遭篡改。禁复用和响应清理均属已批准修复。

## Decision

### A：在现有客户端修正边界

postUpstream 保持签名和原始流协议。HTTPS 证书检查显式使用 URL 规范化后的 hostname，IPv6 去除 URL 方括号；忽略代理推断的主机和来路 Host。仍由 Node 先验证证书链，保留原生 DNS/IP SAN 校验，不设置 rejectUnauthorized:false，不全局替换 TLS 方法，不禁用 IP 或 HTTP 配置。

下载 IPC 把 HEAD 委托同一 HTTP 工具模块的 probeDownloadUrl，继续接受 2xx/3xx、拒绝其他状态，不跟随重定向。每次使用 agent:false，响应头后销毁响应；错误与五秒总时限均收尾，不自动重试。IPC 返回结构、实际 Chromium 下载流程、配置路径与用户数据不变。

### 用户批准的 Node HEAD 例外

简单网络请求通常走 Electron net.fetch；这一处暂留 Node HEAD。Electron 45 实测 net.fetch 的 manual 模式对 302 返回 Redirect was cancelled；follow 模式增加跳转请求，default session 的凭据行为也不同。两行替换会改变兼容性，因此用户明确批准先以禁复用与资源清理处理。下次网络出口改动或 2026-11-01 复核，以先到为准；不加全局开关。

### 应用验收与厂商修复分开

[依赖与内嵌运行时记录](../process/2026-10-25-latest-stable-dependency-upgrades.md)保留 45.0.0 七项未回补的历史取证；2026-10-28 已实测 45.1.0 包含对应修复。应用缓解继续保留，HEAD 例外仍用于兼容已验证的重定向行为，连接池复用另行验证。最新发布授权与单版本签名例外见[发布记录](../process/2026-10-28-v151-release-authorization.md)，安装生命周期与跨平台不记为通过。

当前排除条件：不使用 Node Resolver 查询；lookup 走 uv/OS；Node c-ares 绑定关闭查询缓存，部分公告 API 未暴露；桌面普通请求走 Chromium，无 Node Undici 网络入口；独立代理实际选择 Axios HTTP adapter，启动已有 Node 24.22.1 / major 24 检查。没有用户 Node snapshot/SEA 构建，也不以 Node Permission Model 替代路径授权。B 批已把这些边界加入现有 lint 与回归，不重复实现运行时检查。

### B：限制新增 Node 网络与快照入口

现有 ESLint 对 main 和独立代理源码禁止原生 fetch、Node WebSocket/EventSource、Undici 和 c-ares Resolver 入口；保留命名 OS lookup/lookupService、Electron net.fetch 与 renderer 的 Chromium API。静态导入、导入/解构别名、require、dynamic import 和 getBuiltinModule 均有反例。V8 startupSnapshot 禁止未复核接入，普通堆统计保留；受支持构建配置不得新增 Node 用户快照、SEA 或 Permission Model 启动参数。preload 保持现有 sandbox 合同，不把浏览器 API 误判为 Node 网络入口。

规则先得到 46 fail / 15 pass，补齐后 62 tests 通过；只给 TypeScript parser 冷初始化设置单独预算，规则用例与应用五秒网络时限不放宽。这些规则防止已知写法误接入，不是对刻意混淆代码或传递依赖的完备证明；锁文件、网络调用或启动方式变化时仍须人工复核。

### 剩余风险的跟踪边界

验收补充修复：快速连续切换服务商时，重启前健康请求的迟到失败曾关闭新服务，迟到成功也会重新调度检查。两条回归先复现失败；现有检查捕获当时的服务实例，成功/失败回调在实例已变更时均返回，不修改新实例、计数或调度。只增加实例身份判断，不扩展服务架构或健康策略。

真实验收夹具保留原生 BrowserWindow 构造器，避免 Electron 按 constructor.name 枚举时漏掉派生窗口；下载写入独立 Downloads，打开文件夹仅记录动作。Host 干扰使用原生 HTTP 发送并核对 X-Forwarded-Host，不能用会重写 Host 的 fetch 代替。此处只修测试忠实性，不改生产窗口、安全属性或用户路径。

复核日期为下次依赖/入口变更或 2026-11-01，以先到为准。七项 Node 的上游源码缺失继续保留：DNS NUL 无 Resolver 入口；TLS 三项由统一 URL 规范化及目标绑定处理；Agent 在两个客户端均禁复用；用户快照及 Permission Model 未启用。此处是应用缓解，不是厂商补丁。

以下 19 项当前均未识别触发路径，按低应用风险跟踪；官方高危等级不被改写，版本命中仍记录。独立代理受 Node 24.22.1 / major 24 的现有启动检查约束，实际使用 HTTP adapter；不重复加检查，不替换内嵌 c-ares/Undici。

| 公告 | 内置组件 | 必要条件 | 当前排除依据 |
| --- | --- | --- | --- |
| [GHSA-wpr3-8q3r-4q8c](https://github.com/c-ares/c-ares/security/advisories/GHSA-wpr3-8q3r-4q8c) | c-ares 1.34.8 | 失败查询回调中重入 ares_cancel | 无 c-ares 查询/取消入口；HTTP 与 SSRF lookup 走 OS |
| [GHSA-fqh5-3x7m-wp44](https://github.com/c-ares/c-ares/security/advisories/GHSA-fqh5-3x7m-wp44) | c-ares 1.34.8 | c-ares 接收非原查询服务器的 DNS 回复 | 当前没有发出该类查询的应用入口 |
| [GHSA-97vq-4mxv-7vhm](https://github.com/c-ares/c-ares/security/advisories/GHSA-97vq-4mxv-7vhm) | c-ares 1.34.8 | 并发查询发送失败时在回调取消 | 无 Resolver 查询与回调取消 |
| [GHSA-rf6g-ww74-97qh](https://github.com/c-ares/c-ares/security/advisories/GHSA-rf6g-ww74-97qh) | c-ares 1.34.8 | cancel/destroy 回调中再查询或改服务器 | 无取消/销毁回调重入 |
| [GHSA-mw23-pfg6-2x9r](https://github.com/c-ares/c-ares/security/advisories/GHSA-mw23-pfg6-2x9r) | c-ares 1.34.8 | socket-state 回调中取消/改服务器 | CCB 无查询入口；Node 的该原生回调管理 uv poll，不向应用暴露此类重入 |
| [GHSA-v33j-65h4-4ch8](https://github.com/c-ares/c-ares/security/advisories/GHSA-v33j-65h4-4ch8) | c-ares 1.34.8 | server-state 回调中取消/改服务器 | 该回调未在当前 Node 绑定注册 |
| [GHSA-pj7p-v3cw-hq66](https://github.com/c-ares/c-ares/security/advisories/GHSA-pj7p-v3cw-hq66) | c-ares 1.34.8 | 查询回调中更改 DNS 服务器 | 无该回调或 setServers 入口 |
| [GHSA-grv7-fq5q-9vfc](https://github.com/c-ares/c-ares/security/advisories/GHSA-grv7-fq5q-9vfc) | c-ares 1.34.8 | 查询缓存命中后重入并继续读原答案 | Node ChannelWrap 固定 qcache_max_ttl=0 |
| [GHSA-ph6c-3cvx-mq6v](https://github.com/c-ares/c-ares/security/advisories/GHSA-ph6c-3cvx-mq6v) | c-ares 1.34.8 | 跨线程 dup/save_options 与配置变更并发 | Node 绑定不使用/暴露 dup 或 save_options，CCB 无该并发模型 |
| [GHSA-cfcv-8v2j-qj6r](https://github.com/c-ares/c-ares/security/advisories/GHSA-cfcv-8v2j-qj6r) | c-ares 1.34.8 | 向 c-ares 名称解析 API 传 IPv6/prefix | 当前 lookup 使用 uv_getaddrinfo，不走公告所指名称 API；URL hostname 不含路径前缀 |
| [GHSA-wrgc-prmw-27xh](https://github.com/c-ares/c-ares/security/advisories/GHSA-wrgc-prmw-27xh) | c-ares 1.34.8 | 同一通道发送 EDNS 参数不同的原始查询并命中缓存 | Node 查询缓存关闭，CCB 无原始 EDNS 调用 |
| [GHSA-qrxm-fqhp-jwvm](https://github.com/nodejs/undici/security/advisories/GHSA-qrxm-fqhp-jwvm) | Undici 7.29.1 | Undici 连接收到 TLS1.2 换证重协商 | 桌面请求不进入 Undici 网络引擎 |
| [GHSA-2m5v-pch6-74hx](https://github.com/nodejs/undici/security/advisories/GHSA-2m5v-pch6-74hx) | Undici 7.29.1 | Undici Agent 自定义证书校验回调丢失 | 未配置 Undici Agent；独立代理实际选择 Axios HTTP adapter |
| [GHSA-4w7w-5xrc-9h26](https://github.com/nodejs/undici/security/advisories/GHSA-4w7w-5xrc-9h26) | Undici 7.29.1 | 共享 Agent 组合 redirect/cache 拦截器 | 未配置该共享缓存/拦截器，不能把普通重定向等同此条件 |
| [GHSA-xjj6-f33q-929c](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c) | Undici 7.29.1 | Undici fetch 处理超长编码链且对端提前关闭 | MCP/更新等使用 Chromium net.fetch，转发使用 Node http/https 原始流 |
| [GHSA-55wc-3pg8-jfw6](https://github.com/nodejs/undici/security/advisories/GHSA-55wc-3pg8-jfw6) | Undici 7.29.1 | 组合 decompress 与会抛错的下游处理器 | 没有 Undici decompress/dump 拦截器调用 |
| [GHSA-f72v-6w45-q472](https://github.com/nodejs/undici/security/advisories/GHSA-f72v-6w45-q472) | Undici 7.29.1 | Undici fetch 使用大写/混合大小写 SRI token | 没有该调用；registry 使用独立签名与 SHA-256，不依赖 net.fetch.integrity |
| [GHSA-4qv8-2p9j-2685](https://github.com/nodejs/undici/security/advisories/GHSA-4qv8-2p9j-2685) | Undici 7.29.1 | 保持 Node/Undici EventSource 连接 | MCP 探测取得响应后取消正文；未使用 Node EventSource |
| [GHSA-9fm3-97px-rjf6](https://github.com/nodejs/undici/security/advisories/GHSA-9fm3-97px-rjf6) | Undici 7.29.1 | Node/Undici WebSocket 处理 PING/PONG 洪泛 | 没有 Node WebSocket 客户端；renderer 的浏览器实现另属 Chromium |

Node 原生绑定关闭查询缓存并让 lookup 进入 uv_getaddrinfo，参见 [固定源码](https://github.com/nodejs/node/blob/v24.22.0/src/cares_wrap.cc)。普通请求走 [Chromium net.fetch](https://www.electronjs.org/docs/latest/api/net)，其 Request/Response 对象不证明请求进入 Undici 网络状态机。registry 继续独立校验签名/SHA-256，不依赖被 net.fetch 忽略的 integrity 选项。

## Historical decision review

- [持久化与代理失败边界](2026-10-19-persistence-and-proxy-safety.md)：部分重叠，保留断连、SSE、超时和不重试约束。
- [稳定依赖与厂商回补](../process/2026-10-25-latest-stable-dependency-upgrades.md)：部分重叠，保留版本/源码事实；应用风险验收与 Node HEAD 例外以本记录为准。
- [资源闭环](2026-10-25-resource-management-closure.md)：部分重叠，仅更新后续网络验收状态，不改资源数据协议。
- [运行时与发布门禁](../process/2026-10-19-supported-runtime-and-release-gates.md)：部分重叠，正式签名与发布流程保留。配置可靠性路线与导入/主题决定不承担本轮网络策略，无需合并。

## Alternatives considered

- 等待 Electron 可减少自有边界，但代理身份错配在已修复 Node 也出现；先修应用入口，继续跟踪厂商回补。
- 全局 TLS 猴子补丁或替换 Node/DLL 可覆盖更多入口，但扩大影响、破坏发行证明；拒绝。
- 直接换 net.fetch 或删除 HEAD 可统一出口/减少代码，但改变 3xx、凭据或失败反馈；保留已批准的临时例外。
- 禁 IP、禁代理或换随机数方案会改变已有功能，且不能对应目前全部必要条件；拒绝。

## Verification

A 批新增测试先得到 16 fail / 6 pass；最小修复后相关 4 files / 51 tests 通过，含五秒总时限和失败状态的连接回收，类型检查通过。Node 24.22.1 与 Electron 45 实际内嵌 Node 24.22.0 对照均拒绝错误目标证书、接受正确 IP SAN；真实 helper 的 HEAD 保留 200/302、拒绝 405、四次请求四条独立连接全部关闭。夹具仅用回环和进程私有 CA，不读写真实配置，不降低 TLS 验证。

60 files / 642 tests 全通过，无跳过；类型零错误，lint 零错误/15 个既有 warning，lint:changed、root/proxy 双构建、正式 preflight 和双全依赖 audit（0 漏洞）通过。覆盖率 statements 50.45%、branches 54.52%、functions 49.26%、lines 50.71%，范围 main/proxy/shared。真实 Electron 45 的 22 组流程通过，含 14 组 TLS/代理/Host 网络案例、3 次正确字节下载、405 拒绝与五秒超时；四主题/九张截图、零 renderer 未捕获异常、正常退出，5 个用户文件摘要不变。62 项入口正反例及 20 项生命周期测试已包含于全量；所有新增安全分支先有失败反例。

干净源码 2086a94 的未签名 Portable/NSIS/ZIP 完成载荷、52 个 out 文件与 ASAR 一致性、双 SBOM 和六项 SHA-256 核验，sourceDirty=false；Portable/ZIP/解包目录各 17 项业务验收通过，篡改 ASAR 被拒且未创建 settings。NSIS 仅解包，未执行安装。候选来源为 2086a942f39ede3cdd5dc613455616bec961efb3，验收文档另提；main 比前候选增 146 bytes，无新运行依赖。外部旧冒烟驱动补传 revision，并使用损坏 YAML 验证失败，保留合法无前言 Skill。证据目录为本机 Codex visualizations 下的 network-mitigation-ab-20261025，完整结论和摘要见根 SECURITY_AUDIT_REPORT.md。

## Consequences

多次握手有开销，换取当前已知边界的安全和兼容性。当前版本仍包含未修复的底层代码；新增原生 fetch/Resolver、快照、权限模型或传递依赖网络出口时必须重新分级。不能用 lint 或这些有限探针证明所有调用均不可利用。B 批入口约束、完整回归与真实 Electron/新包本机验收已完成；原路径和用户数据保持。签名与安装生命周期暂缓，云 CI/其他平台未验；本记录不授权发布。
