/**
 * 发布产物清理脚本
 * @description 在正式打包前清理 release 目录，避免旧版本产物累计导致体积误判。
 */

const fs = require('fs')
const path = require('path')

/**
 * 删除旧的 release 目录
 */
function cleanReleaseDirectory() {
  const releaseDir = path.resolve(__dirname, '..', 'release')

  if (!fs.existsSync(releaseDir)) {
    return
  }

  fs.rmSync(releaseDir, {
    recursive: true,
    force: true
  })
}

cleanReleaseDirectory()
