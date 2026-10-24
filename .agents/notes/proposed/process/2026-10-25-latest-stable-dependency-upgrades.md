# Agent Note: 1.5.1 全量稳定依赖升级与运行时安全验证

Status: proposed
Scope: package.json, package-lock.json, src/proxy-server/package.json, src/proxy-server/package-lock.json, .github/workflows/release.yml, electron.vite.config.ts, .eslintrc.js, tailwind.config.js, src/main/**, src/preload/**, src/renderer/src/**, src/proxy-server/src/**, scripts/**, tests/unit/**, README.md, README_CN.md, CHANGELOG.md
Last-verified: 2026-10-25

## Problem

用户要求升级项目内所有可以升级的模块到最新稳定版，并与 1.5.1 的导入和 UX 工作一起完成。现有安全修复已保存为本地 Git 检查点 ed53f23；本提案不代表依赖已安装或运行代码已升级。

2026-10-25 00:45（Asia/Shanghai）再次读取 npm 官方 registry：两套清单共 47 个不同的直接包，根项目 43 项、独立代理 8 项；根项目 34 项、代理 5 项有更新。根项目有 26 项、代理有 3 项跨主版本。复核与首次采集之间没有稳定版本变化。

原锁文件的根生产审计为 0；根全量审计有 3 个 moderate 记录，来自同一 PostCSS selector parser 公告在 Tailwind 3 依赖链中的传播；代理全量为 0。候选组合的严格 peer 解析和全量审计均通过，但只在隔离目录生成锁文件，没有安装到 CCB，没有运行安装脚本，没有完成新版本程序回归。

### 既有记录审计

| 命中 | 分类与处理 |
| --- | --- |
| [受支持运行时与正式门禁](../../implemented/process/2026-10-19-supported-runtime-and-release-gates.md) | 部分重叠；保留 44.9.3 候选和原验收事实，本提案记录新增升级范围，互链 |
| [持久化与代理失败边界](../../implemented/bug-fix/2026-10-19-persistence-and-proxy-safety.md) | 部分重叠；复用失败传播、原子写与无盲重试约束，互链 |
| [配置可靠性路线](../feature/2026-10-20-configuration-reliability-roadmap.md) | 部分重叠；用户已把部分功能提前到 1.5.1，其余路线继续保留，互链 |
| [导入与全局管理对象](../feature/2026-10-25-agent-import-and-global-context.md) | 同批协作提案；框架迁移先稳定，再接全局上下文与导入，互链 |
| 隐藏工作区监控修复 | 无关，保留既有结论；不借升级扩展后台扫描 |

## Proposal

### D0：先区分依赖审计与内嵌运行时安全

推荐目标是 Node 24.22.1 LTS 与 npm 12.2.1 的项目构建工具链，以及 Electron 45.0.0 稳定版候选。使用项目隔离工具链或 CI，不修改用户全局 Node/npm 安装。

[Node 24.22.1 官方公告](https://nodejs.org/en/blog/release/v24.22.1)是安全更新，包含 TLS、DNS、Brotli 等高危修复；[Electron 45 发布说明](https://www.electronjs.org/blog/electron-45-0)与[固定 tag 的 DEPS](https://github.com/electron/electron/blob/v45.0.0/DEPS)仍声明 Node 24.22.0。不能仅据版本号认定 Electron 已受影响，也不能把 npm audit 0 当作已回补的证明。

进一步读取了 v45.0.0 的 [Node 补丁列表](https://github.com/electron/electron/blob/v45.0.0/patches/node/.patches)，尚未找到能证明上述修复已覆盖的记录。仍须核对实际实现及 Chromium 共享库；补丁名中没有出现 CVE 或 Brotli 也不能独立证明存在漏洞。

当前存在需要核验的调用路径：

- main 的 ManagedModeService.startIntegratedProxy 动态导入 Express，express.default.json 在鉴权中间件之前注册。请求体解码可能先于鉴权发生。
- MCPManagementService.validateRemoteServerAvailability 使用 Node 全局 fetch；对方响应的解码属于 Node 路径。
- 独立代理使用 Express JSON 与 Axios；其安全性还依赖实际启动它的 Node，而非 CCB 内嵌版本。
- main 上游普通与流式请求使用 Node http/https，须分别核对 TLS/DNS 修复适用性。

实施前核对 Electron 的独立回补、相关依赖源码和可达性。未核实的高危运行时问题保留为正式发布阻塞项，不删除记录，不以签名暂缓替代安全验证，不选 alpha/nightly 冒充稳定修复。

推荐的有限收紧：如无法证明安全修复已覆盖，在 Node 解码前拒绝 br，保留 gzip/deflate 并明确返回不支持的编码；MCP 简单网络探测改走既定 Electron net.fetch 出口，控制读取与取消。托管入口把鉴权放在请求体解析前；独立代理要求受支持的安全 Node。此项是兼容性取舍，等待用户随本提案审批。不要在收到已解压的 Axios 响应后才检查 Content-Encoding。

Electron 45 移除了 sandboxed preload 中的部分 Node shims 与 Buffer/immediate globals。检查源代码和构建后的 preload；使用等价 Web API，保持 sandbox/contextIsolation，不通过关闭 sandbox 解决。

### D1：采用最新稳定的兼容组合

- 根与代理分别维护 package-lock；保留应用版本 1.5.1、应用身份、数据目录、Claude workspace LEGACY_COMPAT 与代理现有鉴权配置。
- React 19、AntD 6、Zustand 5、react-window 2、Recharts 3 与主题工作衔接；修复 API 和类型调用，不重写应用架构。
- Vite 8、electron-vite 6、Vitest 5 与 coverage-v8 同步；保留打包文件路径、Monaco 离线 worker、CSP 和 preload 单文件约束。
- ESLint 10 改为 flat config，保留既有规则等级。eslint-plugin-import 没有实际启用，删除它即可消除其不支持 ESLint 10 的 peer 冲突；不能使用 legacy-peer-deps 或 force。
- Tailwind 4 使用同版 @tailwindcss/postcss，迁移指令、样式层与主题变量后再移除 autoprefixer，避免 AntD 控件样式回退。
- JS-YAML 5 自带类型，react-window 2 自带类型；迁移对应 API 后移除旧 @types。
- cross-env 与 vite-plugin-monaco-editor 在清单以外没有调用，移除。
- @ant-design/icons 已被源码直接使用，改为显式依赖；jsonc-parser 用于保留 JSONC 注释和未选字段的精确修改，避免重写整个用户文件，不用于引入通用插件框架。

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

隔离预解析已经使用上述 jsonc-parser，并在添加后重跑 root 全量审计，结果为 0。该目录只有解析实验，不代表 CCB 运行时已升级。生产依赖、新原生绑定和安装脚本在实际安装前仍须审查。

### 明确例外

1. TypeScript 最新为 7.0.2，最新版 typescript-eslint 8.72.0 的 peer 范围为 >=4.8.4 <6.1.0。推荐根与代理统一 6.0.3，保留完整 lint 门禁；2026-11-01 或解析器正式支持 7 时复查。不能用忽略 peer 的方式声称完成 7 的支持。
2. @types/node 使用 24 分支最新 24.19.2，与 Electron 的 Node 主版本对齐。26.6.5 不代表更适合当前 runtime；当内嵌 Node 切主版本时再调整。
3. 不把每个传递依赖强行跳到不同主版本。先升级直接依赖，检查解析图和现有 overrides；补丁锁定要有具体公告与调用兼容证据。
4. Electron 内嵌 Node/Chromium 随官方发行维护，不手工替换 DLL 或修改版本字符串。

### D2：发布链

未认证 API 限流、Git HTTPS 取 refs 失败后，改用本机已认证 GitHub CLI 只读核对 release、tag/annotated tag 与 action.yml。稳定 tag、40 位 SHA 和运行时已对应验证，未按搜索缓存猜测。

| Action | 稳定版 | 确切 commit | action 运行时 |
| --- | --- | --- | --- |
| actions/checkout | 7.0.1 | 3d3c42e5aac5ba805825da76410c181273ba90b1 | node24 |
| actions/setup-node | 7.1.0 | 949feb2413d6458794dcd2491c4babbbce0c15c1 | node24 |
| actions/cache | 6.1.0 | 55cc8345863c7cc4c66a329aec7e433d2d1c52a9 | node24 |
| actions/upload-artifact | 7.0.2 | cf430e030ddbb5b0abf93d22962f4752f3646cd9 | node24 |
| actions/attest | 4.2.2 | 1e69f48acb82d1966a394da916b4c1698aa569d6 | node24 |
| softprops/action-gh-release | 3.0.3 | efb35369e0ad2afab669f228072c1b0d510eae64 | node24 |

实际改 workflow 时核对 runner 最低要求、输入输出与 action 依赖，不只修改版本注释，不扩大 permissions，不改变 draft/手动发布流程。attest 当前已是相同 SHA，无需无意义改动。CI 尚未运行这些新版本。

构建过程先禁用安装脚本；审查必须执行的脚本和原生二进制后单独运行。Electron 下载继续使用可信 TLS、镜像与官方 SHASUMS 独立比对。更新两套 SBOM、包 hash、来源元数据和双语文档；不把本地打包当作 CI attestation。

## Alternatives considered

- 只补原主版本：工作量小，但不满足本次全量稳定升级要求，也不能消除 Tailwind 3 的旧解析链。
- 无条件 latest + force：会越过 TypeScript 和 lint 的支持范围，拒绝。
- 为 TypeScript 7 替换整套 lint/构建器：改动超出当前所需，拒绝；先使用受支持的 6.0.3。
- 跟随 AstrLink 换成 Tauri/Bun/Rsbuild：用户要求学习交互，未要求迁移技术栈，拒绝。
- 因内嵌 Node 差异改用 Electron 46 alpha：不符合稳定版本要求，拒绝。
- 修改全局 Node/npm 或自动升级用户安装的 AI CLI：不属于项目依赖升级，拒绝。

## Acceptance criteria

1. 在保留 1.5.1 旧候选的前提下，各批独立可回退；根、代理清单与锁文件同步，干净锁定安装成功，安装脚本仅执行审查通过的必要项。
2. 所有仍保留的直接包达到本表目标或有新的官方兼容证据；TypeScript 与 Node 类型例外保持显式。安装前重新核对安全公告，不在每次构建时自动追 latest。
3. type-check、全量 lint、lint:changed、Vitest 与覆盖率、root/proxy 双构建、双生产 audit、全量依赖 audit、正式 preflight 和 DDE 校验全部报告真实结果。旧基线 46 files / 351 tests 不是新版本的通过数。
4. 虚拟锁文件的 audit 0 只证明该依赖图的公告匹配结果；必须核实 Electron 内嵌运行时、Node HTTP/Brotli/TLS 路径，不能遗漏。
5. Windows 实际包覆盖 preload 桥、Monaco worker、四主题、托管启停/重启、错误反馈、流式协议、退出与旧 profile。真实用户配置路径和数据保持；测试使用隔离 HOME/APPDATA。
6. 最终从干净源码与锁文件构建候选，核验 Portable/NSIS/ZIP、非零大小、内部文件一致性、hash、SBOM 与实际运行版本。三轮实机性能只报告实测，不从依赖数量推断变快。
7. 正式 forceCodeSigning/Authenticode、registry 验证链和 TLS 校验保持。暂不 tag、不 publish；云端 CI、实机和本地结论分开。

## Risks

主版本更新可能改变 selector、列表高度、图表和控件样式，严格解析与 audit 成功不能替代应用回归。Node 安全修复的 Electron 回补仍未核实，不能宣称运行时安全已经完成。br 暂停支持属于需要确认的协议收紧；如果用户必须保留 br，则先等待或核实受支持稳定 runtime，不做静默降级。Actions 已核实完整 SHA，其真实 workflow 执行仍待实施后验证。

现有未签名包只保留为扩展前基线；它不包含本提案的依赖和功能。签名与正式发布继续暂缓。
