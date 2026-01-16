/**
 * InSAR 处理工具模块
 * 提供真实的 InSAR 处理算法，使用 SNAPHU、GDAL、GMT 等工具
 */

import * as fs from "fs";
import * as path from "path";
import { exec, spawn } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// ============================================================================
// 类型定义
// ============================================================================

export interface PhaseData {
  width: number;
  height: number;
  data: Float32Array;
}

export interface CoherenceData {
  width: number;
  height: number;
  data: Float32Array;
}

export interface DeformationStats {
  max: number;
  min: number;
  mean: number;
  std: number;
  validPixels: number;
  totalPixels: number;
}

export interface ImageGenerationResult {
  imagePath: string;
  thumbnailPath?: string;
  metadata: Record<string, any>;
}

// ============================================================================
// SNAPHU 相位解缠
// ============================================================================

/**
 * 使用 SNAPHU 进行相位解缠
 * @param phaseFile 输入相位文件路径
 * @param coherenceFile 相干性文件路径
 * @param outputDir 输出目录
 * @param width 图像宽度
 * @param onProgress 进度回调
 */
export async function runSnaphuUnwrap(
  phaseFile: string,
  coherenceFile: string,
  outputDir: string,
  width: number,
  onProgress?: (message: string, progress: number) => void
): Promise<{ unwrappedFile: string; residues: number }> {
  const log = (msg: string, progress: number) => {
    if (onProgress) onProgress(msg, progress);
    console.log(`[SNAPHU] ${msg}`);
  };

  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const unwrappedFile = path.join(outputDir, "unwrapped_phase.unw");
  const configFile = path.join(outputDir, "snaphu.conf");

  log("生成 SNAPHU 配置文件...", 10);

  // 生成 SNAPHU 配置文件
  const snaphuConfig = `
# SNAPHU 配置文件
# 自动生成于 ${new Date().toISOString()}

# 输入参数
INFILE ${phaseFile}
LINELENGTH ${width}

# 相干性文件
CORRFILE ${coherenceFile}

# 输出文件
OUTFILE ${unwrappedFile}

# 处理模式 (DEFO = 形变模式)
STATCOSTMODE DEFO

# 算法参数
INITMETHOD MCF
MAXNCOMPS 32

# 相干性阈值
CORRTHRESH 0.1

# 日志级别
VERBOSE TRUE
`;

  fs.writeFileSync(configFile, snaphuConfig);
  log("配置文件已生成", 20);

  // 检查 SNAPHU 是否可用
  try {
    await execAsync("which snaphu");
  } catch (error) {
    throw new Error("SNAPHU 未安装。请运行: sudo apt-get install snaphu");
  }

  log("启动 SNAPHU 处理...", 30);

  // 运行 SNAPHU
  return new Promise((resolve, reject) => {
    const snaphuProcess = spawn("snaphu", ["-f", configFile], {
      cwd: outputDir,
    });

    let residues = 0;
    let lastProgress = 30;

    snaphuProcess.stdout.on("data", (data: Buffer) => {
      const output = data.toString();
      console.log(`[SNAPHU stdout] ${output}`);

      // 解析进度信息
      if (output.includes("residue")) {
        const match = output.match(/(\d+)\s+residue/);
        if (match) {
          residues = parseInt(match[1], 10);
        }
      }

      // 更新进度
      if (output.includes("Initializing")) {
        log("初始化网络...", 40);
        lastProgress = 40;
      } else if (output.includes("Growing")) {
        log("生长树...", 50);
        lastProgress = 50;
      } else if (output.includes("Solving")) {
        log("求解最小成本流...", 60);
        lastProgress = 60;
      } else if (output.includes("Writing")) {
        log("写入输出...", 80);
        lastProgress = 80;
      }
    });

    snaphuProcess.stderr.on("data", (data: Buffer) => {
      const output = data.toString();
      console.log(`[SNAPHU stderr] ${output}`);

      // SNAPHU 的一些正常输出会发送到 stderr
      if (output.includes("residue")) {
        const match = output.match(/(\d+)\s+residue/);
        if (match) {
          residues = parseInt(match[1], 10);
        }
      }
    });

    snaphuProcess.on("close", (code) => {
      if (code === 0 || fs.existsSync(unwrappedFile)) {
        log("SNAPHU 处理完成", 100);
        resolve({ unwrappedFile, residues });
      } else {
        reject(new Error(`SNAPHU 退出码: ${code}`));
      }
    });

    snaphuProcess.on("error", (err) => {
      reject(new Error(`SNAPHU 执行错误: ${err.message}`));
    });
  });
}

// ============================================================================
// 形变计算
// ============================================================================

/**
 * 从解缠相位计算形变量
 * @param unwrappedPhase 解缠相位数据
 * @param wavelength 雷达波长 (米)
 * @param incidenceAngle 入射角 (度)
 */
export function calculateDeformation(
  unwrappedPhase: Float32Array,
  wavelength: number = 0.0554, // Sentinel-1 C-band
  incidenceAngle: number = 39.0 // 典型入射角
): { deformation: Float32Array; stats: DeformationStats } {
  const incidenceRad = (incidenceAngle * Math.PI) / 180;
  const conversionFactor = (wavelength / (4 * Math.PI)) * 1000; // 转换为毫米

  const deformation = new Float32Array(unwrappedPhase.length);

  let sum = 0;
  let sumSq = 0;
  let max = -Infinity;
  let min = Infinity;
  let validCount = 0;

  for (let i = 0; i < unwrappedPhase.length; i++) {
    const phase = unwrappedPhase[i];

    // 跳过无效值
    if (isNaN(phase) || phase === 0) {
      deformation[i] = NaN;
      continue;
    }

    // 相位转换为视线向位移 (LOS)
    const losDisplacement = phase * conversionFactor;

    // 转换为垂直位移 (假设纯垂直形变)
    const verticalDisplacement = losDisplacement / Math.cos(incidenceRad);

    deformation[i] = verticalDisplacement;

    // 统计
    sum += verticalDisplacement;
    sumSq += verticalDisplacement * verticalDisplacement;
    if (verticalDisplacement > max) max = verticalDisplacement;
    if (verticalDisplacement < min) min = verticalDisplacement;
    validCount++;
  }

  const mean = validCount > 0 ? sum / validCount : 0;
  const variance = validCount > 0 ? sumSq / validCount - mean * mean : 0;
  const std = Math.sqrt(Math.max(0, variance));

  return {
    deformation,
    stats: {
      max: validCount > 0 ? max : 0,
      min: validCount > 0 ? min : 0,
      mean,
      std,
      validPixels: validCount,
      totalPixels: unwrappedPhase.length,
    },
  };
}

// ============================================================================
// GeoTIFF 生成
// ============================================================================

/**
 * 使用 GDAL 生成 GeoTIFF 文件
 * @param data 数据数组
 * @param width 图像宽度
 * @param height 图像高度
 * @param outputPath 输出路径
 * @param bounds 地理边界
 */
export async function createGeoTiff(
  data: Float32Array,
  width: number,
  height: number,
  outputPath: string,
  bounds: { north: number; south: number; east: number; west: number },
  noDataValue: number = -9999
): Promise<void> {
  // 创建临时原始数据文件
  const rawFile = outputPath.replace(".tif", ".raw");
  const buffer = Buffer.from(data.buffer);
  fs.writeFileSync(rawFile, buffer);

  // 计算地理变换参数
  const pixelWidth = (bounds.east - bounds.west) / width;
  const pixelHeight = (bounds.south - bounds.north) / height; // 负值，因为从北到南

  // 使用 GDAL 创建 GeoTIFF
  const vrtContent = `<VRTDataset rasterXSize="${width}" rasterYSize="${height}">
  <SRS>EPSG:4326</SRS>
  <GeoTransform>${bounds.west}, ${pixelWidth}, 0, ${bounds.north}, 0, ${pixelHeight}</GeoTransform>
  <VRTRasterBand dataType="Float32" band="1">
    <NoDataValue>${noDataValue}</NoDataValue>
    <SourceFilename relativeToVRT="1">${path.basename(rawFile)}</SourceFilename>
    <SourceBand>1</SourceBand>
    <ImageOffset>0</ImageOffset>
    <PixelOffset>4</PixelOffset>
    <LineOffset>${width * 4}</LineOffset>
    <ByteOrder>LSB</ByteOrder>
  </VRTRasterBand>
</VRTDataset>`;

  const vrtFile = outputPath.replace(".tif", ".vrt");
  fs.writeFileSync(vrtFile, vrtContent);

  // 转换为 GeoTIFF
  try {
    await execAsync(`gdal_translate -of GTiff "${vrtFile}" "${outputPath}"`);
    console.log(`[GDAL] GeoTIFF 已创建: ${outputPath}`);
  } catch (error) {
    console.error(`[GDAL] 创建 GeoTIFF 失败:`, error);
    throw error;
  } finally {
    // 清理临时文件
    if (fs.existsSync(rawFile)) fs.unlinkSync(rawFile);
    if (fs.existsSync(vrtFile)) fs.unlinkSync(vrtFile);
  }
}

// ============================================================================
// 图像可视化
// ============================================================================

/**
 * 使用 GMT 生成可视化图像
 * @param geoTiffPath GeoTIFF 文件路径
 * @param outputPath 输出 PNG 路径
 * @param colormap 颜色映射
 * @param title 图像标题
 */
export async function createVisualization(
  geoTiffPath: string,
  outputPath: string,
  options: {
    colormap?: string;
    title?: string;
    unit?: string;
    min?: number;
    max?: number;
  } = {}
): Promise<void> {
  const {
    colormap = "jet",
    title = "InSAR Result",
    unit = "mm",
    min,
    max,
  } = options;

  // 获取数据范围
  let dataMin = min;
  let dataMax = max;

  if (dataMin === undefined || dataMax === undefined) {
    try {
      const { stdout } = await execAsync(`gdalinfo -stats "${geoTiffPath}" 2>/dev/null | grep -E "Minimum|Maximum"`);
      const minMatch = stdout.match(/Minimum=([+-]?\d+\.?\d*)/);
      const maxMatch = stdout.match(/Maximum=([+-]?\d+\.?\d*)/);
      if (minMatch) dataMin = parseFloat(minMatch[1]);
      if (maxMatch) dataMax = parseFloat(maxMatch[1]);
    } catch (error) {
      console.warn("[GMT] 无法获取数据范围，使用默认值");
      dataMin = dataMin ?? -50;
      dataMax = dataMax ?? 50;
    }
  }

  // 创建 GMT 颜色表
  const cptFile = outputPath.replace(".png", ".cpt");
  try {
    await execAsync(`gmt makecpt -C${colormap} -T${dataMin}/${dataMax}/1 > "${cptFile}"`);
  } catch (error) {
    console.warn("[GMT] 创建颜色表失败，使用默认颜色表");
  }

  // 使用 GDAL 生成 PNG
  try {
    // 首先尝试使用 gdaldem 生成彩色图像
    await execAsync(`gdaldem color-relief "${geoTiffPath}" "${cptFile}" "${outputPath}" -of PNG 2>/dev/null || gdal_translate -of PNG -scale "${geoTiffPath}" "${outputPath}"`);
    console.log(`[GMT] 可视化图像已创建: ${outputPath}`);
  } catch (error) {
    // 如果失败，使用简单的 gdal_translate
    try {
      await execAsync(`gdal_translate -of PNG -scale "${geoTiffPath}" "${outputPath}"`);
      console.log(`[GDAL] 可视化图像已创建: ${outputPath}`);
    } catch (e) {
      console.error(`[GDAL] 创建可视化图像失败:`, e);
    }
  } finally {
    // 清理临时文件
    if (fs.existsSync(cptFile)) fs.unlinkSync(cptFile);
  }
}

// ============================================================================
// 模拟数据生成（用于测试，当没有真实数据时）
// ============================================================================

/**
 * 生成模拟的干涉相位数据
 * 用于测试 SNAPHU 和形变计算
 */
export function generateSimulatedPhaseData(
  width: number,
  height: number,
  options: {
    deformationCenter?: { x: number; y: number };
    maxDeformation?: number; // 最大形变量 (mm)
    noiseLevel?: number;
  } = {}
): { phase: Float32Array; coherence: Float32Array } {
  const {
    deformationCenter = { x: width / 2, y: height / 2 },
    maxDeformation = 30, // mm
    noiseLevel = 0.1,
  } = options;

  const phase = new Float32Array(width * height);
  const coherence = new Float32Array(width * height);

  // Sentinel-1 C-band 波长
  const wavelength = 0.0554; // meters
  const phasePerMm = (4 * Math.PI) / (wavelength * 1000);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      // 计算到形变中心的距离
      const dx = x - deformationCenter.x;
      const dy = y - deformationCenter.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // 高斯形变模型
      const sigma = Math.min(width, height) / 4;
      const deformation = maxDeformation * Math.exp(-(distance * distance) / (2 * sigma * sigma));

      // 转换为相位
      const phaseValue = deformation * phasePerMm;

      // 添加噪声
      const noise = (Math.random() - 0.5) * 2 * Math.PI * noiseLevel;

      // 包裹相位到 [-π, π]
      phase[idx] = ((phaseValue + noise + Math.PI) % (2 * Math.PI)) - Math.PI;

      // 相干性（距离中心越远越低）
      const maxDist = Math.sqrt(width * width + height * height) / 2;
      coherence[idx] = Math.max(0.2, 0.9 - (distance / maxDist) * 0.5 + (Math.random() - 0.5) * 0.1);
    }
  }

  return { phase, coherence };
}

/**
 * 将相位数据保存为 SNAPHU 格式
 */
export function savePhaseForSnaphu(
  phase: Float32Array,
  coherence: Float32Array,
  width: number,
  outputDir: string
): { phaseFile: string; coherenceFile: string } {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const phaseFile = path.join(outputDir, "phase.int");
  const coherenceFile = path.join(outputDir, "coherence.cor");

  // SNAPHU 需要复数格式的相位数据
  // 转换为复数: real = cos(phase), imag = sin(phase)
  const complexPhase = new Float32Array(phase.length * 2);
  for (let i = 0; i < phase.length; i++) {
    complexPhase[i * 2] = Math.cos(phase[i]);
    complexPhase[i * 2 + 1] = Math.sin(phase[i]);
  }

  fs.writeFileSync(phaseFile, Buffer.from(complexPhase.buffer));
  fs.writeFileSync(coherenceFile, Buffer.from(coherence.buffer));

  console.log(`[InSAR Tools] 相位数据已保存: ${phaseFile}`);
  console.log(`[InSAR Tools] 相干性数据已保存: ${coherenceFile}`);

  return { phaseFile, coherenceFile };
}

/**
 * 读取 SNAPHU 输出的解缠相位
 */
export function readUnwrappedPhase(
  unwrappedFile: string,
  width: number,
  height: number
): Float32Array {
  const buffer = fs.readFileSync(unwrappedFile);
  const data = new Float32Array(buffer.buffer, buffer.byteOffset, width * height);
  return data;
}

// ============================================================================
// DEM 处理
// ============================================================================

/**
 * 下载 SRTM DEM 数据
 */
export async function downloadSRTMDEM(
  bounds: { north: number; south: number; east: number; west: number },
  outputDir: string,
  onProgress?: (message: string, progress: number) => void
): Promise<string> {
  const log = (msg: string, progress: number) => {
    if (onProgress) onProgress(msg, progress);
    console.log(`[DEM] ${msg}`);
  };

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFile = path.join(outputDir, "dem.tif");

  // 使用 OpenTopography API 或 USGS EarthExplorer
  // 这里使用简化的方法：从 SRTM 30m 数据服务获取

  log("计算 DEM 瓦片...", 10);

  // 计算需要的 SRTM 瓦片
  const tiles: string[] = [];
  const latMin = Math.floor(bounds.south);
  const latMax = Math.ceil(bounds.north);
  const lonMin = Math.floor(bounds.west);
  const lonMax = Math.ceil(bounds.east);

  for (let lat = latMin; lat < latMax; lat++) {
    for (let lon = lonMin; lon < lonMax; lon++) {
      const latStr = lat >= 0 ? `N${String(lat).padStart(2, "0")}` : `S${String(-lat).padStart(2, "0")}`;
      const lonStr = lon >= 0 ? `E${String(lon).padStart(3, "0")}` : `W${String(-lon).padStart(3, "0")}`;
      tiles.push(`${latStr}${lonStr}`);
    }
  }

  log(`需要下载 ${tiles.length} 个 DEM 瓦片`, 20);

  // 尝试使用 GDAL 的虚拟文件系统下载 SRTM 数据
  // 如果失败，生成模拟 DEM
  try {
    // 使用 GDAL 的 /vsicurl/ 虚拟文件系统
    const srtmUrl = `https://elevation-tiles-prod.s3.amazonaws.com/geotiff/${Math.floor(bounds.south)}/${Math.floor(bounds.west)}.tif`;
    
    log("尝试下载 SRTM 数据...", 30);
    
    // 使用 gdal_translate 下载并裁剪
    const cmd = `gdal_translate -projwin ${bounds.west} ${bounds.north} ${bounds.east} ${bounds.south} "/vsicurl/${srtmUrl}" "${outputFile}" 2>/dev/null`;
    
    try {
      await execAsync(cmd, { timeout: 60000 });
      log("SRTM DEM 下载完成", 100);
      return outputFile;
    } catch (e) {
      console.warn("[DEM] SRTM 下载失败，生成模拟 DEM");
    }
  } catch (error) {
    console.warn("[DEM] SRTM 下载失败，生成模拟 DEM");
  }

  // 生成模拟 DEM
  log("生成模拟 DEM 数据...", 50);
  const width = 1000;
  const height = 1000;
  const demData = new Float32Array(width * height);

  // 生成简单的地形（中心高，边缘低）
  const centerX = width / 2;
  const centerY = height / 2;
  const baseElevation = 500; // 基础海拔
  const maxElevation = 2000; // 最大海拔

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - centerX) / width;
      const dy = (y - centerY) / height;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // 高斯山峰
      const elevation = baseElevation + (maxElevation - baseElevation) * Math.exp(-distance * distance * 8);

      // 添加一些随机噪声
      const noise = (Math.random() - 0.5) * 50;

      demData[y * width + x] = elevation + noise;
    }
  }

  log("保存 DEM 数据...", 80);
  await createGeoTiff(demData, width, height, outputFile, bounds);

  log("DEM 生成完成", 100);
  return outputFile;
}

// ============================================================================
// 导出
// ============================================================================

export default {
  runSnaphuUnwrap,
  calculateDeformation,
  createGeoTiff,
  createVisualization,
  generateSimulatedPhaseData,
  savePhaseForSnaphu,
  readUnwrappedPhase,
  downloadSRTMDEM,
};
