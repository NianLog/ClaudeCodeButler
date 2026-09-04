/**
 * Renderer 启动任务调度工具。
 * 负责清理初始化超时计时器，并在浏览器空闲阶段分批执行非关键任务。
 */

/** 启动阶段可异步执行的任务。 */
export type StartupTask = () => Promise<void>

/** 可取消的后台启动任务调度句柄。 */
export interface StartupSchedule {
  cancel: () => void
}

/**
 * 为 Promise 添加超时限制，并在原任务先完成时立即释放 timeout timer。
 */
export const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, name: string): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(`${name} 初始化超时 (${timeoutMs}ms)`))
    }, timeoutMs)

    promise.then(resolve, reject).finally(() => {
      window.clearTimeout(timeout)
    })
  })
}

/**
 * 在 idle callback 中依次调度任务批次，避免非关键 I/O 与首屏关键初始化竞争资源。
 */
export const scheduleStartupBatches = (
  batches: ReadonlyArray<ReadonlyArray<StartupTask>>,
  idleTimeoutMs: number = 1000
): StartupSchedule => {
  let cancelled = false
  let batchIndex = 0
  let pendingHandle: number | null = null
  const supportsIdleCallback = typeof window.requestIdleCallback === 'function'

  const schedule = (callback: () => void): number => {
    if (supportsIdleCallback) {
      return window.requestIdleCallback(callback, { timeout: idleTimeoutMs })
    }

    return window.setTimeout(callback, 50)
  }

  const cancelPending = (handle: number): void => {
    if (supportsIdleCallback) {
      window.cancelIdleCallback(handle)
      return
    }

    window.clearTimeout(handle)
  }

  const scheduleNext = (): void => {
    if (cancelled || batchIndex >= batches.length) {
      return
    }

    pendingHandle = schedule(() => {
      pendingHandle = null
      if (cancelled) {
        return
      }

      const batch = batches[batchIndex]
      void Promise.allSettled(batch.map((task) => Promise.resolve().then(task))).then(() => {
        if (cancelled) {
          return
        }

        batchIndex += 1
        scheduleNext()
      })
    })
  }

  scheduleNext()

  return {
    cancel: () => {
      cancelled = true
      if (pendingHandle !== null) {
        cancelPending(pendingHandle)
        pendingHandle = null
      }
    }
  }
}
