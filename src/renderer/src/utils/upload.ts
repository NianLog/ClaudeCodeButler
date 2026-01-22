/**
 * 上传文件处理工具
 */

export const getUploadOriginFile = (file: any): File | null => {
  if (!file) return null
  if (file instanceof File) return file
  if (file.originFileObj instanceof File) return file.originFileObj
  if (file.file instanceof File) return file.file
  return null
}

export const getUploadFilePath = (file: any): string | undefined => {
  if (!file) return undefined
  return file.path || file?.originFileObj?.path || file?.file?.path
}

export const getUploadRelativePath = (file: any): string | undefined => {
  if (!file) return undefined
  return file.webkitRelativePath
    || file?.originFileObj?.webkitRelativePath
    || file?.file?.webkitRelativePath
}

export const readUploadFileText = async (file: any): Promise<string> => {
  const origin = getUploadOriginFile(file)
  if (origin?.text) {
    return origin.text()
  }

  if (file?.text) {
    return file.text()
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    const target = origin || file?.originFileObj || file
    if (!target) {
      reject(new Error('无法读取上传文件'))
      return
    }
    reader.onerror = () => reject(new Error('读取上传文件失败'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsText(target)
  })
}

export const readUploadFileBase64 = async (file: any): Promise<string> => {
  const origin = getUploadOriginFile(file)
  const target = origin || file?.originFileObj || file

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
