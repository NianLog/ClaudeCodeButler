/**
 * CCB托管模式代理服务 - HTTP服务器
 * @description 基于Express的HTTP代理服务器
 */

import express from 'express'
import cors from 'cors'
import axios from 'axios'
import type { Request, Response, NextFunction } from 'express'
import type { ProxyServerConfig, ClaudeRequest, ApiProvider } from './types.js'
import { getLogger } from './logger.js'
import { getTransformer } from './transformers/index.js'

/**
 * 创建代理服务器
 * @param config 代理服务器配置
 * @returns Express应用实例
 */
export function createProxyServer(config: ProxyServerConfig): express.Application {
  const app = express()
  const logger = getLogger()

  // 中间件配置
  app.use(cors())
  app.use(express.json({ limit: '50mb' }))

  // 请求日志中间件
  app.use((req: Request, res: Response, next: NextFunction) => {
    logger.info(`${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('user-agent')
    })
    next()
  })

  // 健康检查端点
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      version: '1.1.0',
      timestamp: new Date().toISOString()
    })
  })

  // Claude API代理端点
  app.post('/v1/messages', async (req: Request, res: Response) => {
    try {
      const claudeRequest = req.body as ClaudeRequest

      // 获取当前使用的服务商
      const currentProviderId = config.managedMode.currentProvider
      const provider = config.managedMode.providers.find(p => p.id === currentProviderId)

      if (!provider) {
        logger.error('当前服务商未配置', { currentProviderId })
        return res.status(500).json({
          error: {
            type: 'server_error',
            message: '当前API服务商未配置,请在CCB中配置服务商'
          }
        })
      }

      if (!provider.enabled) {
        logger.error('当前服务商已禁用', { provider: provider.name })
        return res.status(500).json({
          error: {
            type: 'server_error',
            message: `当前API服务商(${provider.name})已禁用`
          }
        })
      }

      logger.info('处理API请求', {
        provider: provider.name,
        model: claudeRequest.model,
        stream: claudeRequest.stream
      })

      // 获取转换器
      const transformer = getTransformer(provider.transformer)

      // 转换请求
      const transformedRequest = await transformer.transformRequest(claudeRequest, provider)

      // 构建上游API请求
      const upstreamUrl = `${provider.apiBaseUrl}/v1/messages`
      const axiosConfig = {
        method: 'POST',
        url: upstreamUrl,
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': req.get('anthropic-version') || '2023-06-01',
          'x-api-key': provider.apiKey
        },
        data: transformedRequest,
        responseType: claudeRequest.stream ? 'stream' : 'json',
        timeout: 300000 // 5分钟超时
      } as any

      // 发送请求到上游API
      const upstreamResponse = await axios(axiosConfig)

      // 处理流式响应
      if (claudeRequest.stream) {
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')

        upstreamResponse.data.on('data', (chunk: Buffer) => {
          const chunkStr = chunk.toString()
          const transformed = transformer.transformStreamChunk
            ? transformer.transformStreamChunk(chunkStr, provider)
            : chunkStr

          if (transformed) {
            res.write(transformed)
          }
        })

        upstreamResponse.data.on('end', () => {
          res.end()
          logger.info('流式响应完成', { provider: provider.name })
        })

        upstreamResponse.data.on('error', (error: any) => {
          logger.error('流式响应错误', { error: error.message })
          res.end()
        })
      } else {
        // 处理普通响应
        const transformedResponse = await transformer.transformResponse(
          upstreamResponse.data,
          provider
        )
        res.json(transformedResponse)
        logger.info('请求完成', { provider: provider.name })
      }
    } catch (error: any) {
      logger.error('请求处理失败', {
        error: error.message,
        stack: error.stack
      })

      // 返回错误响应
      if (axios.isAxiosError(error) && error.response) {
        res.status(error.response.status).json(error.response.data)
      } else {
        res.status(500).json({
          error: {
            type: 'server_error',
            message: error.message || '内部服务器错误'
          }
        })
      }
    }
  })

  // 404处理
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: {
        type: 'not_found',
        message: '端点不存在'
      }
    })
  })

  // 错误处理中间件
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('未捕获的错误', {
      error: err.message,
      stack: err.stack
    })
    res.status(500).json({
      error: {
        type: 'server_error',
        message: '内部服务器错误'
      }
    })
  })

  return app
}

/**
 * 启动代理服务器
 * @param config 代理服务器配置
 * @returns 服务器实例的Promise
 */
export async function startProxyServer(config: ProxyServerConfig): Promise<void> {
  const logger = getLogger()
  const app = createProxyServer(config)

  return new Promise((resolve, reject) => {
    try {
      const server = app.listen(config.port, config.host, () => {
        logger.info('CCB托管模式代理服务已启动', {
          host: config.host,
          port: config.port,
          currentProvider: config.managedMode.currentProvider
        })
        resolve()
      })

      server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`端口 ${config.port} 已被占用`)
          reject(new Error(`端口 ${config.port} 已被占用`))
        } else {
          logger.error('服务器启动失败', { error: error.message })
          reject(error)
        }
      })
    } catch (error) {
      reject(error)
    }
  })
}
