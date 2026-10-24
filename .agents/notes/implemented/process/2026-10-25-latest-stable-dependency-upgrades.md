# Agent Note: 1.5.1 全量稳定依赖升级与运行时安全验证

Status: implemented
Scope: package.json, package-lock.json, .npmrc, src/proxy-server/package.json, src/proxy-server/package-lock.json, src/proxy-server/.npmrc, src/proxy-server/tsconfig.json, .github/workflows/release.yml, electron.vite.config.mts, eslint.config.cjs, vitest.config.mts, postcss.config.js, tsconfig.json, src/main/**, src/renderer/src/**, src/proxy-server/src/**, tests/unit/**, ARCHITECTURE.md, CAPABILITIES.md, SECURITY_AUDIT_REPORT.md, README.md, README_CN.md, CHANGELOG.md
Last-verified: 2026-10-25

## Problem

用户要求把项目依赖升级到最新稳定兼容组合，并明确允许必要的 br 限制；同时保留 1.5.1 应用身份、用户数据和旧配置路径。2026-10-25 已批准方案。扩展前源码已存档 ed53f23，不修改全局 Node/npm，不自动升级用户的 AI CLI。

既有结论分别见[受支持运行时与正式门禁](2026-10-19-supported-runtime-and-release-gates.md)、[持久化与代理失败边界](../bug-fix/2026-10-19-persistence-and-proxy-safety.md)。当前功能扩展见[导入与全局对象](../../proposed/feature/2026-10-25-agent-import-and-global-context.md)。保留历史验收事实；本记录取代当前工具链版本的描述。

## Decision

### D0：按实际路径核验运行时

构建和独立代理使用隔离 Node 24.22.1 LTS / npm 12.2.1；Electron 固定 45.0.0，实际内嵌 Node 24.22.0 / Chromium 156.0.8078.48。npm audit 不覆盖运行时漏洞，不能据审计为零关闭厂商修复验证。

- 集成代理先鉴权，再交给 Express 解码 JSON；未认证的畸形或压缩正文不会进入解码器。保留 50 MiB 正文上限与已鉴权健康检查。
- MCP 地址探测改用 Electron net.fetch，判断状态后取消正文，超时和结束都中止请求，不持续下载 SSE。
- 独立代理启动要求 Node ^24.22.1。Node 上游请求临时使用 agent:false，避免默认空闲连接复用；代价是额外握手。已有逐请求代理 agent 保留。
- 官方源码证明 Electron 使用 Chromium 的 Brotli：Chromium README 固定 cfa184a997ac19454d5a3ae97f6d600aac2445a6，包含修复 0ed4268a4401abcb4472096340477cf4af7d1a2b。因此保留 br，并对 gzip/deflate/br 做真实解码转发回归。
- Express 已解压的请求不再向上游转发原 Content-Encoding；否则实际服务商会尝试二次解码并返回 400。
- Electron 45 的直接 checkServerIdentity 非规范主机探针仍未拒绝；生产调用使用规范 URL，转发前去掉来路 Host，受控 Host 探针通过。DNS Resolver.setLocalAddress 路径未在生产代码中使用。三次新进程随机探针未复现重复，只是有限观察，不能作为补丁证明。

[Node 安全版本](https://nodejs.org/en/blog/release/v24.22.1)、[Electron 45](https://www.electronjs.org/blog/electron-45-0)、[固定 DEPS](https://github.com/electron/electron/blob/v45.0.0/DEPS)、[Electron Node 构建补丁](https://github.com/electron/electron/blob/v45.0.0/patches/node/build_add_gn_build_files.patch)为核验依据。正式发布仍等待内嵌 Node 相关厂商回补证据，未改 TLS、sandbox 或校验链。

### D1：采用稳定兼容组合

### 稳定版本明细

下面的“根/代理”是安装边界，不是是否进入 Electron 最终包的判断。声明为 devDependency 的前端库仍会打入 renderer。

| 边界 | 包 | 当前锁定 | 推荐目标 | 说明 |
| --- | --- | --- | --- | --- |
| 根 | chokidar | 4.0.3 | 6.0.0 | 主版本迁移 |
| 根 | express | 5.1.0 | 5.3.0 | 兼容更新 |
| 根 | https-proxy-agent | 7.0.6 | 9.1.0 | 主版本迁移 |
| 根 | js-yaml | 4.3.2 | 5.5.0 | 主版本迁移 |
| 根 | node-cron | 4.6.0 | 4.6.0 | 已为最新 |
| 根 | smol-toml | 1.9.1 | 1.9.1 | 已为最新 |
| 根 | @monaco-editor/react | 4.7.0 | 4.7.0 | 已为最新 |
| 根 | @types/express | 5.0.6 | 5.0.6 | 已为最新 |
| 根 | @types/js-yaml | 4.0.9 | 移除 | 已无调用、由新版内置或功能被替代 |
| 根 | @types/node | 20.19.23 | 24.19.2 | 与内嵌 Node 24 对齐；npm latest 为 26.6.5 |
| 根 | @types/react | 18.3.26 | 19.3.0 | 主版本迁移 |
| 根 | @types/react-dom | 18.3.7 | 19.3.0 | 主版本迁移 |
| 根 | @types/react-syntax-highlighter | 15.5.13 | 15.5.13 | 已为最新 |
| 根 | @types/react-window | 1.8.8 | 移除 | 已无调用、由新版内置或功能被替代 |
| 根 | @typescript-eslint/eslint-plugin | 7.18.0 | 8.72.0 | 主版本迁移 |
| 根 | @typescript-eslint/parser | 7.18.0 | 8.72.0 | 主版本迁移 |
| 根 | @vitejs/plugin-react | 4.7.0 | 6.1.2 | 主版本迁移 |
| 根 | @vitest/coverage-v8 | 4.1.12 | 5.0.5 | 主版本迁移 |
| 根 | antd | 5.27.6 | 6.6.7 | 主版本迁移 |
| 根 | autoprefixer | 10.4.21 | 移除 | 已无调用、由新版内置或功能被替代 |
| 根 | baseline-browser-mapping | 2.11.21 | 2.11.32 | 兼容更新 |
| 根 | cross-env | 7.0.3 | 移除 | 已无调用、由新版内置或功能被替代 |
| 根 | dayjs | 1.11.18 | 1.11.23 | 兼容更新 |
| 根 | electron | 44.9.3 | 45.0.0 | 主版本迁移 |
| 根 | electron-builder | 26.17.0 | 26.18.0 | 兼容更新 |
| 根 | electron-vite | 5.0.0 | 6.0.0 | 主版本迁移 |
| 根 | eslint | 8.57.1 | 10.13.0 | 主版本迁移 |
| 根 | eslint-plugin-import | 2.32.0 | 移除 | 已无调用、由新版内置或功能被替代 |
| 根 | monaco-editor | 0.55.1 | 0.57.0 | 兼容更新 |
| 根 | postcss | 8.5.28 | 8.5.31 | 兼容更新 |
| 根 | react | 18.3.1 | 19.3.1 | 主版本迁移 |
| 根 | react-dom | 18.3.1 | 19.3.1 | 主版本迁移 |
| 根 | react-markdown | 9.1.0 | 10.1.0 | 主版本迁移 |
| 根 | react-syntax-highlighter | 16.1.0 | 16.1.2 | 兼容更新 |
| 根 | react-window | 1.8.10 | 2.5.0 | 主版本迁移 |
| 根 | recharts | 2.15.4 | 3.10.1 | 主版本迁移 |
| 根 | remark-gfm | 4.0.1 | 4.0.1 | 已为最新 |
| 根 | tailwindcss | 3.4.19 | 4.3.3 | 主版本迁移 |
| 根 | typescript | 5.9.3 | 6.0.3 | npm latest 为 7.0.2；解析器仅支持 <6.1.0 |
| 根 | vite | 7.3.7 | 8.3.5 | 主版本迁移 |
| 根 | vite-plugin-monaco-editor | 1.1.0 | 移除 | 已无调用、由新版内置或功能被替代 |
| 根 | vitest | 4.1.12 | 5.0.5 | 主版本迁移 |
| 根 | zustand | 4.5.7 | 5.0.16 | 主版本迁移 |
| 代理 | express | 5.2.1 | 5.3.0 | 兼容更新 |
| 代理 | axios | 1.20.0 | 1.20.0 | 已为最新 |
| 代理 | winston | 3.19.0 | 3.19.0 | 已为最新 |
| 代理 | dotenv | 16.6.1 | 18.0.9 | 主版本迁移 |
| 代理 | @types/express | 5.0.6 | 5.0.6 | 已为最新 |
| 代理 | @types/node | 20.19.43 | 24.19.2 | 与内嵌 Node 24 对齐；npm latest 为 26.6.5 |
| 代理 | tsx | 4.22.4 | 4.23.15 | 兼容更新 |
| 代理 | typescript | 5.9.3 | 6.0.3 | npm latest 为 7.0.2；解析器仅支持 <6.1.0 |

新增或显式声明：

| 包 | 目标 | 用途 |
| --- | --- | --- |
| @eslint/js | 10.0.1 | flat config 的标准规则 |
| globals | 17.13.0 | 明确 main、renderer、preload 的环境 |
| @tailwindcss/postcss | 4.3.3 | Tailwind 4 的 PostCSS 入口 |
| @ant-design/icons | 6.3.4 | 补齐已有源码的直接依赖 |
| jsonc-parser | 3.3.1 | Microsoft 维护的 JSONC 解析与局部编辑，保留未改内容 |

补充显式 devDependency use-sync-external-store 1.7.0，保留已有 Zustand traditional selector API；两个对象 selector 改用 useShallow。TypeScript 采用 6.0.3，原因是 typescript-eslint 8.72.0 的 peer 范围低于 6.1.0，不能用 force 安装 7.0.2。Node 类型为 24 分支最新 24.19.2，匹配内嵌主版本。2026-11-01 或解析器正式支持 TS 7 时复查。

Vite/Vitest 配置改为 .mts，main/preload 输出仍为 CJS。ESLint 迁 flat config，保留原规则等级；不引入新版默认 catch 规则来修改无关业务。Tailwind 4 使用同版 PostCSS 插件，保留现有手写样式，不新增全站 reset。Monaco 使用新 exports 的 editor/JSON/Markdown 入口和两种离线 worker。React 19、AntD 6、react-window 2、Recharts 3 的调用与类型同步，日志列表使用内置动态行高。

未使用的 cross-env、vite-plugin-monaco-editor、eslint-plugin-import、autoprefixer 和冗余类型包移除。根/代理各自锁定依赖，strict peer 安装，不用 legacy-peer-deps、force 或 allow-remote=all。两个 .npmrc 默认禁 lifecycle、Git 和任意 remote 包；仅审查后手动运行 Electron 安装器。npm 12 的 package-lock-only/WASI 远程限制冲突用隔离 npm 11.19.1 生成初始锁，再由 npm 12 严格 ci 验证；正常 install 的锁同步也由 npm 12 完成。

现有 overrides 逐项复核：@electron/rebuild 实际 4.2.1；brace-expansion 两维护分支为 1.1.21 / 2.1.7，dompurify 3.4.17。没有把传递依赖强行跨主版本替换。

Electron Windows ZIP 镜像下载与官方 SHASUMS 独立比对：ae53887a23bb640369c93dbd38c408a2af5c0deb86f2fa76c6c244cb444b7f47。Node 24.22.1 Windows ZIP：d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5。未关闭 TLS 校验。

### D2：发布链

| Action | 稳定版 | 确切 commit | action 运行时 |
| --- | --- | --- | --- |
| actions/checkout | 7.0.1 | 3d3c42e5aac5ba805825da76410c181273ba90b1 | node24 |
| actions/setup-node | 7.1.0 | 949feb2413d6458794dcd2491c4babbbce0c15c1 | node24 |
| actions/cache | 6.1.0 | 55cc8345863c7cc4c66a329aec7e433d2d1c52a9 | node24 |
| actions/upload-artifact | 7.0.2 | cf430e030ddbb5b0abf93d22962f4752f3646cd9 | node24 |
| actions/attest | 4.2.2 | 1e69f48acb82d1966a394da916b4c1698aa569d6 | node24 |
| softprops/action-gh-release | 3.0.3 | efb35369e0ad2afab669f228072c1b0d510eae64 | node24 |

Action release/tag/40 位 SHA 与 action.yml 已用只读认证 GitHub CLI 对应验证。workflow 使用 Node 24.22.1 / npm 12.2.1，质量门禁同时审计生产和开发依赖；permissions、签名、draft 和手动发布流程不变。云端 workflow 尚未运行，不把本地检查称为 CI 通过。

## Alternatives considered

- 无条件 latest + force：会越过 TS 解析器支持范围，拒绝。
- 换 Tauri、Bun 或整套构建架构：用户需要交互改进与稳定升级，无须换栈。
- Electron alpha 或手工替换内嵌 Node/DLL：不属于稳定兼容发行，拒绝。
- 先禁 br 再猜回补：源码已证明 Chromium Brotli 包含修复，保留协议并回归。
- 全局升级 Node/npm 或执行依赖全部 lifecycle：越过项目范围且扩大供应链执行面，拒绝。

## Consequences

兼容代码已更新；版本与 lockfile 固定，后续构建不自动追 latest。内嵌 Node 正式回补、安全签名、其他平台与云 CI 分别跟踪。agent:false 可能增加上游握手成本；收到厂商修复证明并完成连接复用回归后再恢复。旧 unsigned 候选只作历史基线，不代表此次扩展。

## Testing

- 全批扩展工作区：52 files / 464 tests 通过，无跳过，含本地 production-key rehearsal 与模板 staging；覆盖率 statements 47.43%、branches 51.75%、functions 46.73%、lines 47.56%，renderer 不计入分母。
- 工具链提交的独立索引快照：357 tests 通过；缺少本地 web/ 发布物的 6 项 staging 条件跳过，未修改跳过条件。快照类型检查、lint 和生产构建通过。
- 根类型检查、全量 lint（0 error，16 warning）及 root/proxy 生产构建通过。根/代理完整 npm audit 各 0，生产子集另行复核并记录最终报告。
- npm 12 clean ci 两安装边界成功（lifecycle 关闭）；正式 preflight、DDE、Windows 候选及原生界面最终结果统一补入 SECURITY_AUDIT_REPORT.md，不使用扩展前 46/351 作为新结果。
