# Agent Note: 从 1.5.1 基线探索 Tauri 2 与 Rust 后端

Status: proposed
Scope: src/preload/index.ts, src/shared/**, src/main/**, src/renderer/src/**
Last-verified: 2026-10-28

## Problem

用户批准先发布 1.5.1，再建立独立分支探索更轻的架构。目标是减少分发体积和常驻资源，同时保住配置、权限、格式及恢复行为。Electron 45.1.0 的已知 Node 回补现已验证，架构探索不再承担绕过这次安全门禁的任务。

当前静态盘点：src/main 中有 179 处 ipcMain.handle 调用（不是全部协议的精确计数），main/preload 有 21 个直接 import Electron 的文件，renderer 有 39 个引用 window.electronAPI 的文件。当前没有 Cargo.toml 或 tauri.conf。保留 React 可复用大量界面，但不能把迁移估算为只换窗口壳。

本记录是探索方案，尚未实施 Tauri 程序、Rust 业务后端或性能对比。不要把分支建立和方案记录记为新架构已交付。

## Proposal

采用 Tauri 2 + Rust 后端，保留 React、AntD、Zustand、Monaco 与主题。先在 experiments/tauri 下做隔离原型，不改生产入口、已有用户目录、app identity 或发布 workflow。所有实验只能使用程序创建的临时夹具根，不提供任意路径输入，不扫描实际 HOME。

| 边界 | 沿用内容 | 需要验证的变化 |
| --- | --- | --- |
| 前端 | 主题、编辑器、资源页、i18n 与用户操作语义 | 先对一个配置流程实现与现有调用形状兼容的桥，避免一开始移动全部接口 |
| 配置 | 四管理目标、六导入来源、registry 声明、旧配置与备份格式 | Rust 持有路径白名单和文件访问；JSONC 注释、TOML 未选字段、大整数、YAML 权限字段及 Skill 附件须逐字节/语义核验 |
| 写入恢复 | revision 冲突检查、备份、原子替换、失败保护 | 不能把 Rust 类型安全当作事务；必须测试并发外部编辑、磁盘/rename 失败、Windows reparse point 和权限保留 |
| 网络 | TLS URL 目标身份、鉴权、SSE、HEAD/下载兼容行为 | 系统代理、PAC、企业 CA、CONNECT、DNS/IP SAN、重定向、取消和背压都要实测；Rust HTTP 默认配置不等同 Electron net.fetch |
| 桌面壳 | 托盘、退出收尾、目录选择、单实例与更新提示 | WebView2 分发、子进程清理、Windows 事件循环和跨平台差异分别验证 |
| 发布 | SBOM、审计、来源证明和可核验资产 | Cargo.lock 与 Rust 依赖审计加入；WebView2 运行时仍需维护，代码签名问题不会因换 Rust 消失 |

### 第一阶段：一个完整的隔离流程

1. Tauri 加载现有前端技术栈的一页原型；只开放固定夹具资源的读取、校验、保存、备份和恢复命令，不开放通用 fs/shell/任意命令。
2. 以现有 JSONC MCP 配置为样本，完成“读取 → 展示差异 → 校验 revision → 备份 → 原子写入 → 重新读取 → 恢复”。保留注释、大整数、权限字段及无关字段；无法证明无损时拒绝修改。
3. 将原 19 个反例映射到 Rust 边界，其中写入、越界、权限和恢复用例作为先行门禁；四管理目标、六导入来源全部保留在最终兼容矩阵，不把一个样本通过记为全量迁移。
4. 在同一台 Windows、相同前端页面和夹具、关闭调试器的条件下做三轮实机中位数比较：冷/热启动、全进程树空闲内存、配置扫描、编辑器加载、实际安装载荷。单独报告已有 WebView2 与需要新装 WebView2 的成本。

### 第二阶段：代理与桌面集成

只有第一阶段的数据保护和实际资源收益通过评估，才验证集成代理的真实 TLS/系统代理/流式取消矩阵及桌面生命周期。独立 npm 代理包单独决策，不能宣称桌面换 Rust 后它已不再依赖 Node。

## Acceptance criteria

- 不移动、不覆盖真实用户配置；原型命令无法传入实际用户目录或任意绝对路径。
- 对支持的原型样本，读写恢复字节正确、旧 revision 拒绝，失败保留原件；非法路径和链接拒绝。原有 Electron 的数据安全用例持续通过。
- 不放宽 TLS、CSP 或 capability 边界来使原型运行；不把 Node sidecar 装回最终包后仍声称已经去除 Node。
- 性能收益必须来自上述三轮相同任务测量，不能拿空白 Tauri 窗口对比完整 CCB。没有明显收益时停止扩大迁移。
- 切换生产架构前，四管理目标/六导入来源、全部 647 既有测试所覆盖的行为、实际桌面验收和安装生命周期必须有明确对应证据。签名暂缓不是未来版本永久例外。

## Alternatives considered

- 继续 Electron：迁移风险最小，仍是可回退的稳定线；在性能收益不足时保留此方案。
- Electron + Rust helper：可先验证文件/网络核心，但仍分发 Chromium/Node，不能解决安装包主要体积，且增加第二条构建链；仅在需要分阶段接入时再评估。
- Rust 原生 UI 全量重写：会丢掉 React/AntD/Monaco 和现有交互投入，本轮不采用。
- 一次替换全部后端：路径、格式、代理和生命周期风险叠加，不采用。

## Risks

系统 WebView2 及不同平台 WebView 的版本差异会影响样式、Monaco 和更新策略；Rust 网络库未必直接支持现有系统代理/PAC 行为。重写配置编解码、原子替换与进程生命周期可能重新引入已修复的数据丢失和权限问题。以上验证不通过，或同任务实测收益不足时，停止扩大迁移并保留 Electron 稳定线。

## Related decisions

- [1.5.1 发布授权](../../implemented/process/2026-10-28-v151-release-authorization.md)：部分重叠，作为稳定基线与发布证据，不替代本探索。
- [网络缓解](../../implemented/bug-fix/2026-10-25-reachable-node-network-mitigations.md)：部分重叠，TLS/HEAD/迟到回调的反例需跨实现复用。
- [配置可靠性产品路线](../feature/2026-10-20-configuration-reliability-roadmap.md)：部分重叠，产品问题继续跟进，不因选 Rust 自动扩大功能范围或宣称路线已实现。

参考：[Tauri 架构](https://v2.tauri.app/concept/architecture/)、[Capabilities](https://v2.tauri.app/security/capabilities/)、[Windows 分发](https://v2.tauri.app/distribute/windows-installer/)。这些机制不构成 CCB 的迁移验收结果。
