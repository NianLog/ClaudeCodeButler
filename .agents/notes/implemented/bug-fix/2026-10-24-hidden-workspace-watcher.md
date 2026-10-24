# Agent Note: 隐藏祖先目录不应禁用配置监控

Status: implemented
Scope: src/main/file-watcher.ts, src/main/optimized-file-watcher.ts, src/main/utils/watch-path-filter.ts, tests/unit/main/file-watcher.spec.ts
Last-verified: 2026-10-24

## Problem

1.5.1 生产构建三轮采样中 activeWatcherCount 为 1，但监控目录和条目均为 0。两个 watcher 的隐藏项规则按绝对路径匹配，祖先路径中的 `.ccb`、`.codex` 等目录使整个监控根目录被排除。原有 mock topology 测试没有发现这个真实文件系统问题；不能把监控实例 ready 当作配置已被监控。

## Decision

两种 watcher 共用 `isHiddenWatchPath(watchRoot, candidate)`，只按相对监控根目录的路径片段判断隐藏项。根目录和它的隐藏祖先允许监控，根目录内的隐藏项继续忽略。其他忽略规则、路径、深度、事件名和批量处理保持原样。helper 只处理过滤，不承担路径授权或文件读写。

## Verification

新增两项不 mock chokidar 的真实文件系统测试，先在旧代码复现根目录未被监控，再验证 `.ccb/claude-configs` 下 JSON 修改会发出原有事件，且内部 `.ignored` 目录仍不被监控。正式候选的性能采样必须同时检查 watcher 目录和条目非零，不能沿用此前零条目的样本作为完成验收的证据。

## Alternatives considered

- 删除全部隐藏项过滤最短，但会改变原本排除隐藏子目录的行为；保留相对路径过滤。
- 仅给 `.ccb` 加例外可以修复默认路径，但测试目录或用户主目录也可能包含隐藏祖先；以监控根目录为边界，无额外路径白名单。
- 分别复制两套过滤函数省去模块，但原缺陷已经在两个实现中重复；使用一个小 helper，不新增依赖或通用监控框架。

## Consequences

恢复原监听范围的实际注册和事件，不移动或改写配置，不增加 renderer 自动刷新行为。FileWatcher 与 OptimizedFileWatcher 保持各自既有事件契约；未使用实现的精简留在 D 批，不能用本次修复宣称已完成。

新建前检索活跃 DDE 笔记，未发现同主题决定；[发布验收记录](../../implemented/process/2026-10-19-supported-runtime-and-release-gates.md)与本篇部分重叠，仅记录验收证据并互链，不取代其签名与供应链决定。
