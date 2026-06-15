/**
 * Vitest 测试统一配置
 * @description 配置单元测试运行环境、路径别名（@shared）与覆盖率收集策略。
 *              覆盖率统计范围聚焦后端逻辑（main / proxy-server / shared），
 *              暂不纳入 renderer 组件层（其测试 ROI 较低，后续按需补充）。
 */

import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.test.ts'],
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      // 聚焦后端核心逻辑的覆盖率统计
      include: [
        'src/main/**/*.ts',
        'src/proxy-server/src/**/*.ts',
        'src/shared/**/*.ts'
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/proxy-server/dist/**',
        '**/*.spec.ts',
        '**/*.test.ts',
        // 进程入口与纯类型文件，无独立可测逻辑
        'src/main/index.ts'
      ]
      // NOTE: 覆盖率阈值（thresholds）暂不设硬门禁。
      // 当前阶段优先建立覆盖率基线的可见性（CI 上传 coverage 报告 artifact），
      // 待核心服务（transformers / managed-mode / config / rule-engine）覆盖率
      // 提升至 40%+ 后，再在下方 thresholds 中渐进式加严，避免一次性卡死 CI。
    }
  }
})
