# 独立代理协议与使用说明（1.5.1 C 批候选）

主应用使用内置集成代理，此独立包保留单独启动方式。两者不能同时占用同一端口；本轮未发布。

## 启动与凭据

在仓库根目录执行：

```powershell
npm.cmd ci --ignore-scripts --prefix src/proxy-server
npm.cmd run build --prefix src/proxy-server
npm.cmd start --prefix src/proxy-server
```

继续读取 `~/.ccb/managed-mode-config.json`，不移动、重写配置或自动生成替代 token。请先由 CCB 生成并保存 accessToken，配置 enabled、port、currentProvider 和 providers。独立进程启动时读取一次；切换服务商或轮换 token 后须重启。仅监听 `127.0.0.1`。

调用 `/v1/messages` 时提供 `Authorization: Bearer <accessToken>` 或 `x-api-key: <accessToken>`。缺失、错误、重复或相互冲突的凭据返回 401，发生在正文解析和上游调用前；无 accessToken 拒绝启动。`/health` 无需凭据，只返回状态、版本与时间。accessToken 是本地代理凭据，provider.apiKey 是上游凭据，二者不互换。

## 协议支持范围

协议由 provider.transformer 决定；未设置时使用 provider.type，custom 使用 anthropic。未知名称拒绝，不按域名猜测协议。基础地址只允许 HTTP(S)，不允许嵌入凭据、query 或 fragment；上游只来自已有本地服务商配置，调用者不能在请求中替换地址。配置者负责信任服务商地址；请求不跟随重定向，TLS 校验保持开启。

| transformer | 基础地址示例与上游接口 | 上游认证 | 已实现的转换 |
| --- | --- | --- | --- |
| anthropic | `https://api.anthropic.com` → `/v1/messages`；已有 `/v1` 不重复拼接 | x-api-key；转发 anthropic-version/beta | JSON 与 SSE 直通；保持 Anthropic 兼容网关 |
| deepseek | `https://api.deepseek.com` 或 `/v1` → `/chat/completions` | Bearer provider.apiKey | system、文本、Base64 图片、函数工具定义/调用/文本结果、普通及 SSE 响应 |
| openrouter | `https://openrouter.ai/api/v1` → `/chat/completions` | Bearer provider.apiKey | 与上述 Chat Completions 转换相同；具体模型需支持请求内容 |
| gemini | `https://generativelanguage.googleapis.com/v1beta` → `/models/<model>:generateContent` 或 `:streamGenerateContent?alt=sse` | x-goog-api-key，密钥不进入 URL | systemInstruction、文本/Base64 图片输入、普通文本与 SSE 输出 |

原生转换是已实现的协议子集，不代表 Claude Code 所有能力均可用。DeepSeek/OpenRouter 的 top_k、原生 thinking/其他高级字段和不支持的消息块返回 400，不静默删除。所有原生转换拒绝 cache_control，避免缓存与计费语义丢失。DeepSeek 显式禁用原生 thinking，避免推理状态无法往返；函数工具参数保留 JSON 语义，并行 SSE 工具参数收齐后按块输出。Gemini 暂不支持工具与思考状态；请求须指定 `gemini-*` ID，或在 provider.models 中配置该 ID；不会回退到 gemini-1.5-pro。其他协议保留既有有限模型别名，不保证这些历史模型在供应商侧仍可用，建议明确使用服务商支持的模型 ID。

所有原生流均转换为 Anthropic `message_start`、content block、`message_delta` 和 `message_stop`；帧解析和 UTF-8 解码分别保存状态，每个请求独立。错误或截断流发送 error，不伪造成功结束；上游模型拒绝/无效工具参数也明确失败。

请求和普通响应上限 50 MiB，原生 SSE 单帧 1 MiB、工具参数合计 4 MiB，上游流总计 50 MiB。provider.timeout 的正值用于响应头/普通正文总时限，最高 600 秒，默认 300 秒；成功 SSE 不因静默触发该时限，下游断开取消上游。没有自动重试。HTTP 错误保留状态和限长 JSON message，屏蔽两类凭据；HTML/过大错误体不透传，日志不记录密钥或正文。

本地 HTTP fixtures 验证协议与故障边界，不调用付费账户，也不证明真实模型、企业代理或生产负载已验收。主应用内置集成代理未因此获得这些原生转换能力。

## 本轮核对的一手资料

- [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)：Chat Completions 参数、函数工具和 SSE。
- [OpenRouter API](https://openrouter.ai/docs/api_reference/overview)：接口、Bearer 认证和消息格式。
- [Gemini Content API](https://ai.google.dev/api/generate-content)、[API keys](https://ai.google.dev/gemini-api/docs/api-key)：内容接口、SSE 和密钥处理。
- [Anthropic Streaming](https://platform.claude.com/docs/en/build-with-claude/streaming)：目标 SSE 事件序列。
