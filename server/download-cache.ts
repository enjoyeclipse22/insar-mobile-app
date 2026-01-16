/**
 * 下载缓存管理模块
 * 
 * 功能：
 * 1. 检查文件是否已下载（通过文件名和大小）
 * 2. 管理缓存目录
 * 3. 提供缓存清理功能
 * 4. 支持 SLC、DEM、轨道数据的缓存
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// 缓存根目录
const CACHE_ROOT = "/tmp/insar-cache";

// 缓存子目录
const CACHE_DIRS = {
  slc: path.join(CACHE_ROOT, "slc"),
  dem: path.join(CACHE_ROOT, "dem"),
  orbit: path.join(CACHE_ROOT, "orbit"),
  results: path.join(CACHE_ROOT, "results"),
};

// 缓存索引文件
const CACHE_INDEX_FILE = path.join(CACHE_ROOT, "cache-index.json");

// 缓存条目接口
interface CacheEntry {
  filename: string;
  filepath: string;
  size: number;
  hash?: string;
  downloadUrl?: string;
  createdAt: string;
  lastAccessedAt: string;
  type: "slc" | "dem" | "orbit" | "results";
  metadata?: Record<string, any>;
}

// 缓存索引接口
interface CacheIndex {
  version: string;
  entries: Record<string, CacheEntry>;
  totalSize: number;
  lastUpdated: string;
}

/**
 * 初始化缓存目录
 */
export function initCacheDirectories(): void {
  // 创建所有缓存目录
  Object.values(CACHE_DIRS).forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // 初始化缓存索引
  if (!fs.existsSync(CACHE_INDEX_FILE)) {
    const initialIndex: CacheIndex = {
      version: "1.0",
      entries: {},
      totalSize: 0,
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(CACHE_INDEX_FILE, JSON.stringify(initialIndex, null, 2));
  }
}

/**
 * 读取缓存索引
 */
function readCacheIndex(): CacheIndex {
  initCacheDirectories();
  try {
    const content = fs.readFileSync(CACHE_INDEX_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      version: "1.0",
      entries: {},
      totalSize: 0,
      lastUpdated: new Date().toISOString(),
    };
  }
}

/**
 * 保存缓存索引
 */
function saveCacheIndex(index: CacheIndex): void {
  index.lastUpdated = new Date().toISOString();
  fs.writeFileSync(CACHE_INDEX_FILE, JSON.stringify(index, null, 2));
}

/**
 * 生成缓存键
 * 基于文件名和下载 URL 生成唯一键
 */
function generateCacheKey(filename: string, downloadUrl?: string): string {
  const input = downloadUrl || filename;
  return crypto.createHash("md5").update(input).digest("hex");
}

/**
 * 检查文件是否已缓存
 * @param filename 文件名
 * @param downloadUrl 下载 URL（可选，用于更精确匹配）
 * @param type 缓存类型
 * @returns 缓存文件路径，如果不存在则返回 null
 */
export function checkCache(
  filename: string,
  downloadUrl?: string,
  type: "slc" | "dem" | "orbit" | "results" = "slc"
): string | null {
  const index = readCacheIndex();
  const cacheKey = generateCacheKey(filename, downloadUrl);

  const entry = index.entries[cacheKey];
  if (entry && fs.existsSync(entry.filepath)) {
    // 更新最后访问时间
    entry.lastAccessedAt = new Date().toISOString();
    saveCacheIndex(index);
    return entry.filepath;
  }

  // 也检查文件名匹配
  for (const key in index.entries) {
    const e = index.entries[key];
    if (e.filename === filename && fs.existsSync(e.filepath)) {
      e.lastAccessedAt = new Date().toISOString();
      saveCacheIndex(index);
      return e.filepath;
    }
  }

  // 直接检查缓存目录中是否存在文件
  const cacheDir = CACHE_DIRS[type];
  const directPath = path.join(cacheDir, filename);
  if (fs.existsSync(directPath)) {
    // 添加到索引
    const stats = fs.statSync(directPath);
    addToCache(filename, directPath, type, downloadUrl, { size: stats.size });
    return directPath;
  }

  return null;
}

/**
 * 获取缓存文件路径（用于新下载）
 * @param filename 文件名
 * @param type 缓存类型
 * @returns 缓存文件路径
 */
export function getCachePath(
  filename: string,
  type: "slc" | "dem" | "orbit" | "results" = "slc"
): string {
  initCacheDirectories();
  return path.join(CACHE_DIRS[type], filename);
}

/**
 * 添加文件到缓存
 * @param filename 文件名
 * @param filepath 文件路径
 * @param type 缓存类型
 * @param downloadUrl 下载 URL
 * @param metadata 额外元数据
 */
export function addToCache(
  filename: string,
  filepath: string,
  type: "slc" | "dem" | "orbit" | "results",
  downloadUrl?: string,
  metadata?: Record<string, any>
): void {
  const index = readCacheIndex();
  const cacheKey = generateCacheKey(filename, downloadUrl);

  let size = 0;
  if (fs.existsSync(filepath)) {
    const stats = fs.statSync(filepath);
    size = stats.size;
  }

  const entry: CacheEntry = {
    filename,
    filepath,
    size,
    downloadUrl,
    createdAt: new Date().toISOString(),
    lastAccessedAt: new Date().toISOString(),
    type,
    metadata,
  };

  index.entries[cacheKey] = entry;
  index.totalSize = Object.values(index.entries).reduce((sum, e) => sum + e.size, 0);
  saveCacheIndex(index);
}

/**
 * 从缓存中移除文件
 * @param filename 文件名
 * @param downloadUrl 下载 URL
 * @param deleteFile 是否删除实际文件
 */
export function removeFromCache(
  filename: string,
  downloadUrl?: string,
  deleteFile: boolean = true
): void {
  const index = readCacheIndex();
  const cacheKey = generateCacheKey(filename, downloadUrl);

  const entry = index.entries[cacheKey];
  if (entry) {
    if (deleteFile && fs.existsSync(entry.filepath)) {
      fs.unlinkSync(entry.filepath);
    }
    delete index.entries[cacheKey];
    index.totalSize = Object.values(index.entries).reduce((sum, e) => sum + e.size, 0);
    saveCacheIndex(index);
  }
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats(): {
  totalSize: number;
  totalFiles: number;
  byType: Record<string, { count: number; size: number }>;
  lastUpdated: string;
} {
  const index = readCacheIndex();
  const byType: Record<string, { count: number; size: number }> = {
    slc: { count: 0, size: 0 },
    dem: { count: 0, size: 0 },
    orbit: { count: 0, size: 0 },
    results: { count: 0, size: 0 },
  };

  for (const entry of Object.values(index.entries)) {
    if (byType[entry.type]) {
      byType[entry.type].count++;
      byType[entry.type].size += entry.size;
    }
  }

  return {
    totalSize: index.totalSize,
    totalFiles: Object.keys(index.entries).length,
    byType,
    lastUpdated: index.lastUpdated,
  };
}

/**
 * 清理缓存
 * @param type 要清理的类型，不指定则清理所有
 * @param maxAge 最大保留时间（毫秒），不指定则清理所有
 */
export function clearCache(type?: "slc" | "dem" | "orbit" | "results", maxAge?: number): {
  deletedFiles: number;
  freedSpace: number;
} {
  const index = readCacheIndex();
  let deletedFiles = 0;
  let freedSpace = 0;
  const now = Date.now();

  const keysToDelete: string[] = [];

  for (const [key, entry] of Object.entries(index.entries)) {
    // 检查类型
    if (type && entry.type !== type) {
      continue;
    }

    // 检查年龄
    if (maxAge) {
      const age = now - new Date(entry.lastAccessedAt).getTime();
      if (age < maxAge) {
        continue;
      }
    }

    // 删除文件
    if (fs.existsSync(entry.filepath)) {
      try {
        fs.unlinkSync(entry.filepath);
        freedSpace += entry.size;
        deletedFiles++;
      } catch (error) {
        console.error(`Failed to delete cache file: ${entry.filepath}`, error);
      }
    }

    keysToDelete.push(key);
  }

  // 更新索引
  for (const key of keysToDelete) {
    delete index.entries[key];
  }
  index.totalSize = Object.values(index.entries).reduce((sum, e) => sum + e.size, 0);
  saveCacheIndex(index);

  return { deletedFiles, freedSpace };
}

/**
 * 列出所有缓存文件
 */
export function listCacheFiles(type?: "slc" | "dem" | "orbit" | "results"): CacheEntry[] {
  const index = readCacheIndex();
  const entries = Object.values(index.entries);

  if (type) {
    return entries.filter((e) => e.type === type);
  }

  return entries;
}

/**
 * 复制缓存文件到目标目录
 * @param filename 文件名
 * @param destPath 目标路径
 * @param type 缓存类型
 * @returns 是否成功
 */
export function copyCacheFile(
  filename: string,
  destPath: string,
  type: "slc" | "dem" | "orbit" | "results" = "slc"
): boolean {
  const cachedPath = checkCache(filename, undefined, type);
  if (cachedPath) {
    try {
      // 确保目标目录存在
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      // 如果目标路径与缓存路径相同，直接返回
      if (cachedPath === destPath) {
        return true;
      }

      // 创建硬链接或复制文件
      try {
        fs.linkSync(cachedPath, destPath);
      } catch {
        // 如果硬链接失败（跨文件系统），则复制文件
        fs.copyFileSync(cachedPath, destPath);
      }

      return true;
    } catch (error) {
      console.error(`Failed to copy cache file: ${error}`);
      return false;
    }
  }
  return false;
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
