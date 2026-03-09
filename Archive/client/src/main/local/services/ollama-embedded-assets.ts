import { app } from 'electron'
import path from 'node:path'
import * as fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

export type EmbeddedPlatform = {
  os: 'darwin' | 'linux' | 'windows'
  arch: 'arm64' | 'amd64'
  executableName: string
  binaryRelativePath: string
}

export const EMBEDDED_OLLAMA_VERSION = 'v0.9.0'
const BUNDLE_DIRECTORY_NAME = 'electron-ollama'
const execFileAsync = promisify(execFile)

function resolveAppRoot(): string {
  // APP_ROOT 在开发环境由主进程设置，打包后 fallback 到 app.getAppPath()
  const explicitRoot = process.env.APP_ROOT
  if (explicitRoot && explicitRoot.length > 0) {
    return explicitRoot
  }
  return app.getAppPath()
}

export function getResourcesRoot(): string {
  const appRoot = resolveAppRoot()
  // 在打包后的应用中，resources 被解包到 app.asar.unpacked
  // 因为二进制文件无法在 asar 中运行
  const resourcesPath = appRoot.replace('app.asar', 'app.asar.unpacked')
  return path.join(resourcesPath, 'resources', 'ollama')
}

export function getEmbeddedBasePath(): string {
  return path.join(app.getPath('userData'), 'ollama')
}

export function getEmbeddedDataPath(basePath: string): string {
  return path.join(basePath, 'data')
}

export function getEmbeddedBinaryRoot(basePath: string, platform: EmbeddedPlatform): string {
  return path.join(
    basePath,
    BUNDLE_DIRECTORY_NAME,
    EMBEDDED_OLLAMA_VERSION,
    platform.os,
    platform.arch
  )
}

export function getEmbeddedExecutablePath(basePath: string, platform: EmbeddedPlatform): string {
  return path.join(getEmbeddedBinaryRoot(basePath, platform), platform.binaryRelativePath)
}

export function detectPlatform(): EmbeddedPlatform {
  const platform = process.platform
  const arch = process.arch

  let os: EmbeddedPlatform['os']
  if (platform === 'darwin') {
    os = 'darwin'
  } else if (platform === 'linux') {
    os = 'linux'
  } else if (platform === 'win32') {
    os = 'windows'
  } else {
    throw new Error(`Unsupported platform for embedded Ollama: ${platform}`)
  }

  let mappedArch: EmbeddedPlatform['arch']
  if (arch === 'arm64') {
    mappedArch = 'arm64'
  } else if (arch === 'x64') {
    mappedArch = 'amd64'
  } else {
    throw new Error(`Unsupported architecture for embedded Ollama: ${arch}`)
  }

  const executableName = os === 'windows' ? 'ollama.exe' : 'ollama'
  const binaryRelativePath = os === 'linux' ? path.join('bin', executableName) : executableName

  return {
    os,
    arch: mappedArch,
    executableName,
    binaryRelativePath,
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

async function ensureDirectory(directory: string): Promise<void> {
  await fs.mkdir(directory, { recursive: true })
}

async function removeMacOSQuarantine(
  targetPath: string,
  log: (message: string) => void
): Promise<void> {
  if (process.platform !== 'darwin') {
    return
  }

  try {
    await execFileAsync('xattr', ['-r', '-d', 'com.apple.quarantine', targetPath])
    log('[EmbeddedOllama] Cleared macOS quarantine attribute')
  } catch (error) {
    const stderr = (error as { stderr?: string | Buffer }).stderr
    const errorMessage =
      typeof stderr === 'string'
        ? stderr
        : Buffer.isBuffer(stderr)
          ? stderr.toString('utf8')
          : error instanceof Error
            ? error.message
            : String(error)

    if (/No such (xattr|attribute)/i.test(errorMessage)) {
      log('[EmbeddedOllama] No quarantine attribute found on embedded binary, skipping')
      return
    }

    log(`[EmbeddedOllama] Failed to clear macOS quarantine attribute: ${errorMessage}`)
  }
}

export async function ensureEmbeddedBinary(
  basePath: string,
  platform: EmbeddedPlatform,
  log: (message: string) => void
): Promise<string> {
  const resourcesRoot = getResourcesRoot()
  const sourceDir = path.join(
    resourcesRoot,
    'binaries',
    EMBEDDED_OLLAMA_VERSION,
    platform.os,
    platform.arch
  )
  const targetDir = getEmbeddedBinaryRoot(basePath, platform)
  const targetExecutable = getEmbeddedExecutablePath(basePath, platform)

  log(`[EmbeddedOllama] Preparing binary for ${platform.os}-${platform.arch}`)
  log(`[EmbeddedOllama] Source directory: ${sourceDir}`)
  log(`[EmbeddedOllama] Target directory: ${targetDir}`)

  if (!(await pathExists(sourceDir))) {
    throw new Error(
      `Missing embedded Ollama binary at ${sourceDir}. ` +
        'Please ensure the offline bundle is included in client/resources/ollama.'
    )
  }

  if (!(await pathExists(targetExecutable))) {
    await ensureDirectory(targetDir)
    await fs.cp(sourceDir, targetDir, { recursive: true })
    if (platform.os !== 'windows') {
      await fs.chmod(targetExecutable, 0o755)
    }
    log('[EmbeddedOllama] Binary copied to userData')
  } else {
    log('[EmbeddedOllama] Binary already prepared in userData, skipping copy')
  }

  await removeMacOSQuarantine(targetExecutable, log)

  return targetExecutable
}

export async function ensureEmbeddedModels(
  basePath: string,
  models: string[],
  log: (message: string) => void
): Promise<void> {
  const resourcesRoot = getResourcesRoot()
  const dataPath = getEmbeddedDataPath(basePath)
  const modelsRoot = path.join(dataPath, 'models')

  await ensureDirectory(modelsRoot)
  await ensureDirectory(path.join(dataPath, 'tmp'))

  for (const model of models) {
    const sourceDir = path.join(resourcesRoot, 'models', model)

    log(`[EmbeddedOllama] Preparing model "${model}"`)
    log(`[EmbeddedOllama] Model source: ${sourceDir}`)
    log(`[EmbeddedOllama] Model target: ${modelsRoot}`)

    if (!(await pathExists(sourceDir))) {
      throw new Error(
        `Missing embedded model data for ${model} at ${sourceDir}. ` +
          'Please include the exported model in the offline bundle.'
      )
    }

    // Ollama 期望 models/ 目录下直接包含 blobs/ 和 manifests/
    // 而不是 models/model-name/blobs/
    // 所以我们需要合并目录内容，而不是复制整个目录
    const sourceBlobsDir = path.join(sourceDir, 'blobs')
    const sourceManifestsDir = path.join(sourceDir, 'manifests')
    const targetBlobsDir = path.join(modelsRoot, 'blobs')
    const targetManifestsDir = path.join(modelsRoot, 'manifests')

    // 检查模型是否已安装（通过检查 manifest 是否存在）
    // Ollama manifest 路径: manifests/registry.ollama.ai/library/{model}/latest
    const manifestCheckPath = path.join(targetManifestsDir, 'registry.ollama.ai', 'library', model, 'latest')
    if (await pathExists(manifestCheckPath)) {
      log(`[EmbeddedOllama] Model "${model}" already present, skipping copy`)
      continue
    }

    // 复制 blobs
    if (await pathExists(sourceBlobsDir)) {
      await ensureDirectory(targetBlobsDir)
      const blobs = await fs.readdir(sourceBlobsDir)
      for (const blob of blobs) {
        const sourceBlob = path.join(sourceBlobsDir, blob)
        const targetBlob = path.join(targetBlobsDir, blob)
        if (!(await pathExists(targetBlob))) {
          await fs.copyFile(sourceBlob, targetBlob)
        }
      }
      log(`[EmbeddedOllama] Copied ${blobs.length} blobs for model "${model}"`)
    }

    // 复制 manifests
    if (await pathExists(sourceManifestsDir)) {
      await ensureDirectory(targetManifestsDir)
      await fs.cp(sourceManifestsDir, targetManifestsDir, { recursive: true, force: false })
      log(`[EmbeddedOllama] Copied manifests for model "${model}"`)
    }

    log(`[EmbeddedOllama] Model "${model}" installed successfully`)
  }
}

export async function ensureModelFromBundle(
  basePath: string,
  model: string,
  log: (message: string) => void
): Promise<boolean> {
  try {
    await ensureEmbeddedModels(basePath, [model], log)
    return true
  } catch (error) {
    log(`[EmbeddedOllama] Failed to provision model "${model}" from bundle: ${error}`)
    return false
  }
}
