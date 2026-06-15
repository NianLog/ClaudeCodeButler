/**
 * 上传文件处理工具
 */

import type { UploadFile } from 'antd/es/upload/interface'

/**
 * 兼容 antd Upload 包装结构与原生 File 的文件类型。
 * antd Upload 的 file 对象可能直接是 File，也可能包含 originFileObj / file 字段。
 */
export type UploadFileLike = UploadFile & {
  originFileObj?: UploadFile | File
  file?: UploadFile | File
  path?: string
  webkitRelativePath?: string
}

const getNestedFile = (file: UploadFileLike | File | undefined): File | null => {
  if (!file) return null
  if (file instanceof File) return file
  const wrapped = file as UploadFileLike
  if (wrapped.originFileObj instanceof File) return wrapped.originFileObj
  if (wrapped.file instanceof File) return wrapped.file
  return null
}

export const getUploadOriginFile = (file: UploadFileLike | File | undefined): File | null => {
  return getNestedFile(file)
}

export const getUploadFilePath = (file: UploadFileLike | File | undefined): string | undefined => {
  if (!file) return undefined
  if (file instanceof File) return (file as File & { path?: string }).path
  return file.path
    || (file.originFileObj as (UploadFile & { path?: string }) | undefined)?.path
    || (file.file as (UploadFile & { path?: string }) | undefined)?.path
}

export const getUploadRelativePath = (file: UploadFileLike | File | undefined): string | undefined => {
  if (!file) return undefined
  if (file instanceof File) return (file as File & { webkitRelativePath?: string }).webkitRelativePath
  return file.webkitRelativePath
    || (file.originFileObj as (UploadFile & { webkitRelativePath?: string }) | undefined)?.webkitRelativePath
    || (file.file as (UploadFile & { webkitRelativePath?: string }) | undefined)?.webkitRelativePath
}

export const readUploadFileText = async (file: UploadFileLike | File | undefined): Promise<string> => {
  const origin = getUploadOriginFile(file)
  if (origin?.text) {
    return origin.text()
  }

  const wrapped = file as (UploadFileLike & { text?: () => Promise<string> }) | undefined
  if (wrapped?.text) {
    return wrapped.text()
  }

  const target: File | null = origin
    || (wrapped?.originFileObj instanceof File ? wrapped.originFileObj : null)
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    if (!target) {
      reject(new Error('无法读取上传文件'))
      return
    }
    reader.onerror = () => reject(new Error('读取上传文件失败'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsText(target)
  })
}

export const readUploadFileBase64 = async (file: UploadFileLike | File | undefined): Promise<string> => {
  const origin = getUploadOriginFile(file)
  const wrapped = file as UploadFileLike | undefined
  const target: File | null = origin
    || (wrapped?.originFileObj instanceof File ? wrapped.originFileObj : null)

  if (!target) {
    throw new Error('无法读取上传文件')
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取上传文件失败'))
    reader.onload = () => {
      const result = String(reader.result || '')
      const base64 = result.includes(',') ? result.split(',')[1] : result
      resolve(base64)
    }
    reader.readAsDataURL(target)
  })
}
