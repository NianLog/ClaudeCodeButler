# Semgrep 安全审计与改进报告

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


## 2026-10-25：D0/D1 稳定兼容升级

Node 24.22.1 / npm 12.2.1 隔离安装，Electron 45.0.0 内嵌 Node 24.22.0。两套生产及全量依赖审计结果、版本矩阵和运行时可达性见 [.agents 工具链记录](.agents/notes/implemented/process/2026-10-25-latest-stable-dependency-upgrades.md)。Brotli 修复已通过 Electron→Chromium→固定源码证明，保留 br；其他内嵌 Node 厂商回补保留为正式发布阻塞，不以 audit 0 关闭。先鉴权后解码、net.fetch 取消正文、agent:false 及解压转发头均有回归。暂不发布。
