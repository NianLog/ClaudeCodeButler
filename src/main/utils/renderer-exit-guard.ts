import type { WebContents } from 'electron'

const PREPARE_EXIT_SCRIPT = `(() => {
  if (window.__CCB_HAS_PENDING_CHANGES__ === true) {
    window.dispatchEvent(new Event('ccb:request-exit'));
    return false;
  }
  document.body.inert = true;
  return true;
})()`

export async function prepareRendererExit(contents: Pick<WebContents, 'isDestroyed' | 'executeJavaScript'> | undefined): Promise<boolean> {
  if (!contents || contents.isDestroyed()) return true
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      contents.executeJavaScript(PREPARE_EXIT_SCRIPT).then((result: unknown) => result === true),
      new Promise<boolean>((resolve) => { timeout = setTimeout(() => resolve(false), 1500) })
    ])
  } catch {
    return false
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
