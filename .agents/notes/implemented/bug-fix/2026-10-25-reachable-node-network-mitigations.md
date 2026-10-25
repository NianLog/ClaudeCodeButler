# Agent Note: Node 可达网络风险缓解与下载 HEAD 临时例外

Status: implemented
Scope: src/main/utils/upstream-http-client.ts, src/main/ipc-handlers.ts, eslint.config.cjs, tests/unit/**, tests/e2e/**, ARCHITECTURE.md, CAPABILITIES.md, SECURITY_AUDIT_REPORT.md
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

[依赖与内嵌运行时记录](../process/2026-10-25-latest-stable-dependency-upgrades.md)中的七项未回补事实继续保留。应用风险按入口、触发条件、缓解及复核日期验收；未识别入口不写成组件已修复。B 批的入口约束和完整/真实 Electron 验收尚未完成前，不宣布本轮整体通过；签名、安装生命周期、云 CI 与跨平台也不自动记为通过。不发布。

当前排除条件：不使用 Node Resolver 查询；lookup 走 uv/OS；Node c-ares 绑定关闭查询缓存，部分公告 API 未暴露；桌面普通请求走 Chromium，无 Node Undici 网络入口；独立代理实际选择 Axios HTTP adapter，启动已有 Node 24.22.1 / major 24 检查。没有用户 Node snapshot/SEA 构建，也不以 Node Permission Model 替代路径授权。B 批将把这些边界加入现有 lint 与回归，不重复实现运行时检查。

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

## Consequences

多次握手有开销，换取当前已知边界的安全和兼容性。当前版本仍包含未修复的底层代码；新增原生 fetch/Resolver、快照、权限模型或传递依赖网络出口时必须重新分级。不能用 lint 或这些有限探针证明所有调用均不可利用。B 批与最终验收结果将原地补充，本记录不授权发布。
