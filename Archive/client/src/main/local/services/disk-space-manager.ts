/**
 * 磁盘空间管理器
 *
 * 用于检测 Ollama 模型存储目录的磁盘空间信息
 *
 * 特性：
 * - 使用 Node.js 原生 statfs() API (v19.6+)
 * - 返回格式化的磁盘空间信息
 * - 支持多平台（macOS, Linux, Windows）
 */

import { statfsSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join, dirname } from 'path'

/**
 * 磁盘空间信息
 */
export interface DiskSpaceInfo {
  /** 总空间（字节） */
  totalBytes: number

  /** 可用空间（字节，考虑权限） */
  availableBytes: number

  /** 空闲空间（字节） */
  freeBytes: number

  /** 已用空间（字节） */
  usedBytes: number

  /** 使用百分比（0-100） */
  percentUsed: number

  /** 格式化的总空间（如 "500 GB"） */
  totalFormatted: string

  /** 格式化的可用空间 */
  availableFormatted: string

  /** 格式化的空闲空间 */
  freeFormatted: string

  /** 格式化的已用空间 */
  usedFormatted: string
}

/**
 * 格式化字节大小为可读字符串
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

/**
 * 获取 Ollama 模型目录所在磁盘的空间信息
 *
 * @returns 磁盘空间信息
 */
export function getOllamaDiskSpace(): DiskSpaceInfo {
  try {
    const envModelPath = process.env.OLLAMA_MODELS || process.env.KLEE_EMBEDDED_OLLAMA_MODELS
    const envHomePath =
      process.env.KLEE_EMBEDDED_OLLAMA_HOME
        ? join(process.env.KLEE_EMBEDDED_OLLAMA_HOME, 'models')
        : undefined
    const defaultPath = join(homedir(), '.ollama', 'models')

    const candidates = [envModelPath, envHomePath, defaultPath].filter(
      (candidate): candidate is string => Boolean(candidate)
    )

    let targetPath = candidates.find((candidate) => existsSync(candidate)) ?? candidates[0] ?? defaultPath

    if (!existsSync(targetPath)) {
      const parentDir = dirname(targetPath)
      targetPath = existsSync(parentDir) ? parentDir : homedir()
    }

    const stats = statfsSync(targetPath)

    const totalBytes = Number(stats.blocks) * Number(stats.bsize)
    const freeBytes = Number(stats.bfree) * Number(stats.bsize)
    const availableBytes = Number(stats.bavail) * Number(stats.bsize)
    const usedBytes = totalBytes - freeBytes
    const percentUsed = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0

    return {
      totalBytes,
      availableBytes,
      freeBytes,
      usedBytes,
      percentUsed,
      totalFormatted: formatBytes(totalBytes),
      availableFormatted: formatBytes(availableBytes),
      freeFormatted: formatBytes(freeBytes),
      usedFormatted: formatBytes(usedBytes),
    }
  } catch (error) {
    console.error('[DiskSpaceManager] Failed to get disk space:', error)

    // 返回默认值（无法检测）
    return {
      totalBytes: 0,
      availableBytes: 0,
      freeBytes: 0,
      usedBytes: 0,
      percentUsed: 0,
      totalFormatted: 'Unknown',
      availableFormatted: 'Unknown',
      freeFormatted: 'Unknown',
      usedFormatted: 'Unknown',
    }
  }
}
