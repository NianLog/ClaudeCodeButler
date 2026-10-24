import { relative } from 'path'

/** 隐藏项只按监控根目录的相对路径判断，不能把 .ccb 等祖先目录排除。 */
export function isHiddenWatchPath(watchRoot: string, candidate: string): boolean {
  return relative(watchRoot, candidate).split(/[/\\]/)
    .some(segment => segment.startsWith('.') && segment !== '..')
}
