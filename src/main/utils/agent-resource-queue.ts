let pending: Promise<void> = Promise.resolve()

/** 同一管理对象的旧 IPC 与资源导入共用队列；外部工具写入另由 revision 检查发现。 */
export function withAgentResourceMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation)
  const settled = result.then(() => undefined, () => undefined)
  pending = settled
  return result
}

export function flushAgentResourceMutations(): Promise<void> { return pending }
