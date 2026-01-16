/**
 * 真实 InSAR 处理 API 路由
 * 提供 WebSocket 实时日志流和处理控制接口
 * 使用 RealInSARProcessor 进行真实处理
 */

import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { RealInSARProcessor, ProcessingConfig, ProcessingLog, ProcessingResult } from "./real-insar-processor";
import {
  getDb,
  addProcessingLog,
  createProcessingStep,
  updateProcessingStep,
  createProcessingResult,
  updateProject,
  getProjectSteps,
  getProjectLogs,
  getProjectResults,
} from "./db";
import { processingSteps, processingLogs, processingResults } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// 处理任务存储
interface ProcessingTask {
  id: string;
  projectId: number;
  projectName: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  currentStep: string;
  logs: ProcessingLog[];
  startTime: Date;
  endTime?: Date;
  error?: string;
  processor?: RealInSARProcessor;
  result?: ProcessingResult;
}

const processingTasks = new Map<string, ProcessingTask>();

// 处理步骤名称映射
const STEP_NAMES = [
  "data_search",
  "data_download",
  "orbit_download",
  "dem_download",
  "coregistration",
  "interferogram",
  "phase_unwrapping",
  "deformation",
] as const;

const STEP_DISPLAY_NAMES: Record<string, string> = {
  data_search: "数据搜索",
  data_download: "数据下载",
  orbit_download: "轨道下载",
  dem_download: "DEM下载",
  coregistration: "配准",
  interferogram: "干涉图生成",
  phase_unwrapping: "相位解缠",
  deformation: "形变反演",
};

/**
 * 初始化项目的处理步骤到数据库
 */
async function initializeProcessingSteps(projectId: number): Promise<Map<string, number>> {
  const stepIdMap = new Map<string, number>();
  const db = await getDb();
  if (!db) return stepIdMap;

  try {
    // 先删除旧的处理步骤
    await db.delete(processingSteps).where(eq(processingSteps.projectId, projectId));

    // 创建新的处理步骤
    for (const stepName of STEP_NAMES) {
      const result = await db.insert(processingSteps).values({
        projectId,
        stepName: STEP_DISPLAY_NAMES[stepName] || stepName,
        status: "pending",
        progress: 0,
      });
      stepIdMap.set(stepName, result[0].insertId);
    }
  } catch (error) {
    console.error("[初始化处理步骤失败]", error);
  }

  return stepIdMap;
}

/**
 * 保存处理日志到数据库
 */
async function saveLogToDatabase(
  projectId: number,
  stepId: number | null,
  level: "debug" | "info" | "warning" | "error",
  message: string
): Promise<void> {
  try {
    await addProcessingLog({
      projectId,
      stepId,
      logLevel: level,
      message,
    });
  } catch (error) {
    console.error("[保存日志失败]", error);
  }
}

/**
 * 更新处理步骤状态
 */
async function updateStepStatus(
  stepId: number,
  status: "pending" | "processing" | "completed" | "failed",
  progress: number,
  startTime?: Date,
  endTime?: Date,
  errorMessage?: string
): Promise<void> {
  try {
    const updateData: any = { status, progress };
    if (startTime) updateData.startTime = startTime;
    if (endTime) {
      updateData.endTime = endTime;
      if (startTime) {
        updateData.duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
      }
    }
    if (errorMessage) updateData.errorMessage = errorMessage;

    await updateProcessingStep(stepId, updateData);
  } catch (error) {
    console.error("[更新步骤状态失败]", error);
  }
}

/**
 * 保存处理结果到数据库
 */
async function saveResultToDatabase(
  projectId: number,
  resultType: "interferogram" | "coherence" | "deformation" | "dem" | "unwrapped_phase" | "los_displacement",
  fileUrl: string,
  fileName: string,
  stats?: { min: number; max: number; mean: number }
): Promise<void> {
  try {
    await createProcessingResult({
      projectId,
      resultType,
      fileUrl,
      fileName,
      format: "GeoTIFF",
      minValue: stats?.min?.toFixed(4),
      maxValue: stats?.max?.toFixed(4),
      meanValue: stats?.mean?.toFixed(4),
    });
  } catch (error) {
    console.error("[保存结果失败]", error);
  }
}

/**
 * 启动真实 InSAR 处理
 */
async function startRealProcessing(
  projectId: number,
  projectName: string,
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  },
  startDate: string,
  endDate: string,
  satellite: string,
  orbitDirection: string,
  polarization: string
): Promise<string> {
  const taskId = `task_${projectId}_${Date.now()}`;

  // 创建处理配置
  const config: ProcessingConfig = {
    projectId: taskId,
    projectName: projectName || `项目 ${projectId}`,
    bounds,
    startDate: startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    endDate: endDate || new Date().toISOString().split("T")[0],
    satellite: (satellite as "Sentinel-1A" | "Sentinel-1B" | "Sentinel-1") || "Sentinel-1",
    orbitDirection: (orbitDirection as "ascending" | "descending" | "both") || "both",
    polarization: (polarization as "VV" | "VH" | "VV+VH") || "VV+VH",
    resolution: 30,
    coherenceThreshold: 0.3,
  };

  // 创建处理器
  const processor = new RealInSARProcessor(config);

  const task: ProcessingTask = {
    id: taskId,
    projectId,
    projectName: config.projectName,
    status: "pending",
    progress: 0,
    currentStep: "初始化",
    logs: [],
    startTime: new Date(),
    processor,
  };

  processingTasks.set(taskId, task);

  // 初始化数据库中的处理步骤
  const stepIdMap = await initializeProcessingSteps(projectId);

  // 更新项目状态为处理中
  try {
    await updateProject(projectId, { status: "processing", progress: 0 });
  } catch (error) {
    console.error("[更新项目状态失败]", error);
  }

  // 记录当前步骤的开始时间
  const stepStartTimes = new Map<string, Date>();
  let currentStepName = "";

  // 监听日志事件
  processor.on("log", async (log: ProcessingLog) => {
    task.logs.push(log);
    task.currentStep = log.step;
    if (log.progress !== undefined) {
      task.progress = log.progress;
    }

    // 确定日志级别
    let logLevel: "debug" | "info" | "warning" | "error" = "info";
    if (log.level === "ERROR") logLevel = "error";
    else if (log.level === "WARNING") logLevel = "warning";
    else if (log.level === "DEBUG") logLevel = "debug";

    // 确定当前步骤
    let stepKey = "";
    const stepLower = log.step.toLowerCase();
    if (stepLower.includes("数据搜索") || stepLower.includes("search")) stepKey = "data_search";
    else if (stepLower.includes("数据下载") || stepLower.includes("data download") || stepLower.includes("slc")) stepKey = "data_download";
    else if (stepLower.includes("轨道") || stepLower.includes("orbit")) stepKey = "orbit_download";
    else if (stepLower.includes("dem")) stepKey = "dem_download";
    else if (stepLower.includes("配准") || stepLower.includes("coregistration") || stepLower.includes("registration")) stepKey = "coregistration";
    else if (stepLower.includes("干涉") || stepLower.includes("interferogram")) stepKey = "interferogram";
    else if (stepLower.includes("解缠") || stepLower.includes("unwrap")) stepKey = "phase_unwrapping";
    else if (stepLower.includes("形变") || stepLower.includes("deformation") || stepLower.includes("inversion")) stepKey = "deformation";

    // 如果步骤变化，更新上一个步骤为完成，当前步骤为处理中
    if (stepKey && stepKey !== currentStepName) {
      // 完成上一个步骤
      if (currentStepName && stepIdMap.has(currentStepName)) {
        const prevStepId = stepIdMap.get(currentStepName)!;
        const prevStartTime = stepStartTimes.get(currentStepName);
        await updateStepStatus(prevStepId, "completed", 100, prevStartTime, new Date());
      }

      // 开始新步骤
      currentStepName = stepKey;
      stepStartTimes.set(stepKey, new Date());
      if (stepIdMap.has(stepKey)) {
        const stepId = stepIdMap.get(stepKey)!;
        await updateStepStatus(stepId, "processing", 0, new Date());
      }
    }

    // 保存日志到数据库
    const stepId = stepKey ? stepIdMap.get(stepKey) || null : null;
    await saveLogToDatabase(projectId, stepId, logLevel, `[${log.step}] ${log.message}`);

    // 更新项目进度
    if (log.progress !== undefined) {
      try {
        await updateProject(projectId, { progress: log.progress });
      } catch (error) {
        // 忽略进度更新错误
      }
    }
  });

  // 异步执行处理
  (async () => {
    try {
      task.status = "processing";

      // 运行真实 InSAR 处理
      const result = await processor.process();

      // 更新任务状态
      task.status = result.success ? "completed" : "failed";
      task.progress = result.success ? 100 : task.progress;
      task.endTime = result.endTime;
      task.error = result.error;
      task.result = result;

      // 完成最后一个步骤
      if (currentStepName && stepIdMap.has(currentStepName)) {
        const lastStepId = stepIdMap.get(currentStepName)!;
        const lastStartTime = stepStartTimes.get(currentStepName);
        await updateStepStatus(
          lastStepId,
          result.success ? "completed" : "failed",
          result.success ? 100 : task.progress,
          lastStartTime,
          new Date(),
          result.error
        );
      }

      // 更新项目状态
      try {
        await updateProject(projectId, {
          status: result.success ? "completed" : "failed",
          progress: result.success ? 100 : task.progress,
          completedAt: result.success ? new Date() : null,
        });
      } catch (error) {
        console.error("[更新项目状态失败]", error);
      }

      // 保存处理结果到数据库
      if (result.success && result.outputs) {
        // 保存干涉图
        if (result.outputs.interferogramFile) {
          await saveResultToDatabase(
            projectId,
            "interferogram",
            result.outputs.interferogramFile,
            "interferogram.tif"
          );
        }

        // 保存相干图
        if (result.outputs.coherenceFile) {
          await saveResultToDatabase(
            projectId,
            "coherence",
            result.outputs.coherenceFile,
            "coherence.tif",
            result.statistics?.meanCoherence ? { min: 0, max: 1, mean: result.statistics.meanCoherence } : undefined
          );
        }

        // 保存解缠相位
        if (result.outputs.unwrappedPhaseFile) {
          await saveResultToDatabase(
            projectId,
            "unwrapped_phase",
            result.outputs.unwrappedPhaseFile,
            "unwrapped_phase.tif"
          );
        }

        // 保存形变图
        if (result.outputs.deformationFile) {
          await saveResultToDatabase(
            projectId,
            "deformation",
            result.outputs.deformationFile,
            "deformation.tif",
            result.statistics ? {
              min: result.statistics.minDeformation || 0,
              max: result.statistics.maxDeformation || 0,
              mean: result.statistics.meanDeformation || 0,
            } : undefined
          );
        }
      }

      // 保存最终日志
      await saveLogToDatabase(
        projectId,
        null,
        result.success ? "info" : "error",
        result.success ? "处理完成" : `处理失败: ${result.error}`
      );

    } catch (error) {
      task.status = "failed";
      task.error = error instanceof Error ? error.message : String(error);
      task.endTime = new Date();

      // 更新项目状态为失败
      try {
        await updateProject(projectId, { status: "failed" });
      } catch (e) {
        console.error("[更新项目状态失败]", e);
      }

      // 保存错误日志
      await saveLogToDatabase(projectId, null, "error", `处理异常: ${task.error}`);
    }
  })();

  return taskId;
}

/**
 * 取消处理
 */
function cancelProcessing(taskId: string): boolean {
  const task = processingTasks.get(taskId);
  if (!task) {
    return false;
  }

  if (task.processor) {
    task.processor.cancel();
  }

  task.status = "cancelled";
  task.endTime = new Date();

  return true;
}

/**
 * 分析时间分布，推荐最佳时间范围
 */
function analyzeTimeDistribution(
  products: Array<{ date: string; orbit: string }>
): {
  recommendedRange: { start: string; end: string } | null;
  densestPeriod: { start: string; end: string; count: number } | null;
  monthlyDistribution: Array<{ month: string; count: number }>;
  averageInterval: number | null;
  recommendation: string;
} {
  if (products.length === 0) {
    return {
      recommendedRange: null,
      densestPeriod: null,
      monthlyDistribution: [],
      averageInterval: null,
      recommendation: "无可用数据，无法推荐时间范围",
    };
  }

  // 解析并排序日期
  const dates = products
    .map((p) => p.date)
    .filter((d) => d && d !== "unknown")
    .map((d) => new Date(d))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length === 0) {
    return {
      recommendedRange: null,
      densestPeriod: null,
      monthlyDistribution: [],
      averageInterval: null,
      recommendation: "日期解析失败，无法推荐时间范围",
    };
  }

  // 计算月度分布
  const monthCounts = new Map<string, number>();
  dates.forEach((date) => {
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    monthCounts.set(monthKey, (monthCounts.get(monthKey) || 0) + 1);
  });

  const monthlyDistribution = Array.from(monthCounts.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // 计算平均时间间隔（天）
  let totalInterval = 0;
  for (let i = 1; i < dates.length; i++) {
    totalInterval += (dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60 * 24);
  }
  const averageInterval = dates.length > 1 ? Math.round(totalInterval / (dates.length - 1)) : null;

  // 找出数据最密集的时间段（滑动窗口，窗口大小为 90 天）
  const windowSize = 90 * 24 * 60 * 60 * 1000; // 90 天
  let maxCount = 0;
  let densestStart: Date | null = null;
  let densestEnd: Date | null = null;

  for (let i = 0; i < dates.length; i++) {
    const windowStart = dates[i];
    const windowEnd = new Date(windowStart.getTime() + windowSize);
    const count = dates.filter((d) => d >= windowStart && d <= windowEnd).length;

    if (count > maxCount) {
      maxCount = count;
      densestStart = windowStart;
      densestEnd = windowEnd;
    }
  }

  const densestPeriod =
    densestStart && densestEnd
      ? {
          start: densestStart.toISOString().split("T")[0],
          end: densestEnd.toISOString().split("T")[0],
          count: maxCount,
        }
      : null;

  // 推荐时间范围：优先选择数据最密集的 90 天窗口
  // 如果密集窗口内数据少于 3 个，则推荐整个可用范围
  let recommendedRange: { start: string; end: string } | null = null;
  let recommendation: string;

  if (densestPeriod && densestPeriod.count >= 3) {
    recommendedRange = {
      start: densestPeriod.start,
      end: densestPeriod.end,
    };
    recommendation = `推荐时间范围：${densestPeriod.start} 至 ${densestPeriod.end}，该时段内有 ${densestPeriod.count} 个产品，数据密度最高`;
  } else if (dates.length >= 2) {
    // 推荐整个可用范围
    recommendedRange = {
      start: dates[0].toISOString().split("T")[0],
      end: dates[dates.length - 1].toISOString().split("T")[0],
    };
    recommendation = `推荐使用完整时间范围：${recommendedRange.start} 至 ${recommendedRange.end}，共 ${dates.length} 个产品`;
  } else {
    recommendation = "数据量不足，建议扩大搜索时间范围";
  }

  // 添加时间间隔建议
  if (averageInterval !== null) {
    if (averageInterval <= 12) {
      recommendation += `。平均采集间隔约 ${averageInterval} 天，时间分辨率优秀`;
    } else if (averageInterval <= 24) {
      recommendation += `。平均采集间隔约 ${averageInterval} 天，时间分辨率良好`;
    } else {
      recommendation += `。平均采集间隔约 ${averageInterval} 天，时间分辨率较低，建议扩大区域或时间范围`;
    }
  }

  return {
    recommendedRange,
    densestPeriod,
    monthlyDistribution,
    averageInterval,
    recommendation,
  };
}

/**
 * 检查数据可用性（不下载，只查询）
 */
async function checkDataAvailability(
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  },
  startDate: string,
  endDate: string,
  satellite: string,
  orbitDirection: string
): Promise<{
  available: boolean;
  productCount: number;
  products: Array<{
    name: string;
    date: string;
    orbit: string;
    polarization: string;
  }>;
  dateRange: { earliest: string; latest: string } | null;
  orbitDirections: string[];
  message: string;
  recommendation: string;
  // 时间范围推荐
  timeRecommendation: {
    recommendedRange: { start: string; end: string } | null;
    densestPeriod: { start: string; end: string; count: number } | null;
    monthlyDistribution: Array<{ month: string; count: number }>;
    averageInterval: number | null;
    recommendation: string;
  };
}> {
  const ASF_API_TOKEN = process.env.ASF_API_TOKEN;
  if (!ASF_API_TOKEN) {
    return {
      available: false,
      productCount: 0,
      products: [],
      dateRange: null,
      orbitDirections: [],
      message: "ASF API Token 未配置",
      recommendation: "请在设置中配置 ASF API Token",
      timeRecommendation: {
        recommendedRange: null,
        densestPeriod: null,
        monthlyDistribution: [],
        averageInterval: null,
        recommendation: "无法推荐，请先配置 ASF API Token",
      },
    };
  }

  // 构建搜索参数
  // ASF API 需要使用完整的平台名称，如 "Sentinel-1A" 或 "Sentinel-1"
  // S1A -> Sentinel-1A, S1B -> Sentinel-1B, Sentinel-1 -> Sentinel-1
  let platformParam = satellite;
  if (satellite === "S1A") {
    platformParam = "Sentinel-1A";
  } else if (satellite === "S1B") {
    platformParam = "Sentinel-1B";
  } else if (satellite === "Sentinel-1" || satellite === "S1") {
    platformParam = "Sentinel-1"; // 搜索所有 Sentinel-1 数据
  }
  
  const searchParams = new URLSearchParams({
    platform: platformParam,
    processingLevel: "SLC",
    beamMode: "IW",
    bbox: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    start: startDate,
    end: endDate,
    maxResults: "50",
    output: "json",
  });

  const searchUrl = `https://api.daac.asf.alaska.edu/services/search/param?${searchParams.toString()}`;

  try {
    const response = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${ASF_API_TOKEN}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return {
        available: false,
        productCount: 0,
        products: [],
        dateRange: null,
        orbitDirections: [],
        message: `ASF API 请求失败: HTTP ${response.status}`,
        recommendation: "请检查网络连接或 API Token 是否有效",
        timeRecommendation: {
          recommendedRange: null,
          densestPeriod: null,
          monthlyDistribution: [],
          averageInterval: null,
          recommendation: "无法推荐，API 请求失败",
        },
      };
    }

    let results = await response.json();
    
    // 展平双层嵌套数组
    if (Array.isArray(results) && results.length > 0 && Array.isArray(results[0])) {
      results = results.flat(2);
    }

    if (!Array.isArray(results) || results.length === 0) {
      return {
        available: false,
        productCount: 0,
        products: [],
        dateRange: null,
        orbitDirections: [],
        message: "未找到符合条件的 Sentinel-1 数据",
        recommendation: "建议扩大时间范围或区域范围，或检查时间范围是否为过去日期",
        timeRecommendation: {
          recommendedRange: null,
          densestPeriod: null,
          monthlyDistribution: [],
          averageInterval: null,
          recommendation: "未找到数据，无法推荐时间范围",
        },
      };
    }

    // 解析产品信息
    const products = results.map((r: any) => ({
      name: r.granuleName || r.fileName || "unknown",
      date: r.startTime ? r.startTime.split("T")[0] : "unknown",
      orbit: r.flightDirection || "unknown",
      polarization: r.polarization || "VV",
    }));

    // 统计日期范围
    const dates = products
      .map((p: any) => p.date)
      .filter((d: string) => d !== "unknown")
      .sort();
    const dateRange = dates.length > 0 ? { earliest: dates[0], latest: dates[dates.length - 1] } : null;

    // 统计轨道方向
    const orbitDirections = [...new Set(products.map((p: any) => p.orbit).filter((o: string) => o !== "unknown"))];

    // 判断数据是否充足
    const productCount = results.length;
    const available = productCount >= 2;

    let message: string;
    let recommendation: string;

    if (productCount === 0) {
      message = "未找到任何 Sentinel-1 数据";
      recommendation = "请检查时间范围是否为过去日期，或扩大搜索区域";
    } else if (productCount === 1) {
      message = "只找到 1 个产品，无法进行干涉处理";
      recommendation = "干涉处理需要至少 2 个产品，请扩大时间范围";
    } else if (productCount < 5) {
      message = `找到 ${productCount} 个产品，可以进行基础干涉处理`;
      recommendation = "建议扩大时间范围以获取更多数据，提高处理质量";
    } else {
      message = `找到 ${productCount} 个产品，数据充足`;
      recommendation = "可以开始 InSAR 处理";
    }

    // 分析时间分布并生成推荐
    const timeRecommendation = analyzeTimeDistribution(products);

    return {
      available,
      productCount,
      products: products.slice(0, 10), // 只返回前 10 个
      dateRange,
      orbitDirections,
      message,
      recommendation,
      timeRecommendation,
    };
  } catch (error) {
    return {
      available: false,
      productCount: 0,
      products: [],
      dateRange: null,
      orbitDirections: [],
      message: `查询失败: ${error instanceof Error ? error.message : "未知错误"}`,
      recommendation: "请检查网络连接",
      timeRecommendation: {
        recommendedRange: null,
        densestPeriod: null,
        monthlyDistribution: [],
        averageInterval: null,
        recommendation: "查询失败，无法推荐时间范围",
      },
    };
  }
}

/**
 * 真实 InSAR 处理路由
 */
export const realInsarRouter = router({
  // 数据可用性检查（预检）
  checkDataAvailability: publicProcedure
    .input(
      z.object({
        bounds: z.object({
          north: z.number(),
          south: z.number(),
          east: z.number(),
          west: z.number(),
        }),
        startDate: z.string(),
        endDate: z.string(),
        satellite: z.string().optional().default("Sentinel-1"),
        orbitDirection: z.string().optional().default("both"),
      })
    )
    .query(async ({ input }) => {
      return await checkDataAvailability(
        input.bounds,
        input.startDate,
        input.endDate,
        input.satellite,
        input.orbitDirection
      );
    }),

  // 启动处理
  startProcessing: publicProcedure
    .input(
      z.object({
        projectId: z.number(),
        projectName: z.string().optional(),
        bounds: z.object({
          north: z.number(),
          south: z.number(),
          east: z.number(),
          west: z.number(),
        }),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        satellite: z.string().optional(),
        orbitDirection: z.string().optional(),
        polarization: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const taskId = await startRealProcessing(
        input.projectId,
        input.projectName || `项目 ${input.projectId}`,
        input.bounds,
        input.startDate || "",
        input.endDate || "",
        input.satellite || "Sentinel-1",
        input.orbitDirection || "both",
        input.polarization || "VV+VH"
      );
      return { taskId, message: "处理已启动" };
    }),

  // 获取处理状态
  getStatus: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .query(({ input }) => {
      const task = processingTasks.get(input.taskId);
      if (!task) {
        return null;
      }

      return {
        id: task.id,
        projectId: task.projectId,
        projectName: task.projectName,
        status: task.status,
        progress: task.progress,
        currentStep: task.currentStep,
        startTime: task.startTime,
        endTime: task.endTime,
        error: task.error,
        logCount: task.logs.length,
      };
    }),

  // 获取处理日志
  getLogs: publicProcedure
    .input(
      z.object({
        taskId: z.string(),
        offset: z.number().optional().default(0),
        limit: z.number().optional().default(100),
      })
    )
    .query(({ input }) => {
      const task = processingTasks.get(input.taskId);
      if (!task) {
        return { logs: [], total: 0 };
      }

      const logs = task.logs.slice(input.offset, input.offset + input.limit);
      return {
        logs,
        total: task.logs.length,
      };
    }),

  // 取消处理
  cancelProcessing: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(({ input }) => {
      const success = cancelProcessing(input.taskId);
      return { success, message: success ? "处理已取消" : "任务不存在" };
    }),

  // 获取处理结果
  getResult: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .query(({ input }) => {
      const task = processingTasks.get(input.taskId);
      if (!task || !task.result) {
        return null;
      }

      return task.result;
    }),

  // 列出所有任务
  listTasks: publicProcedure.query(() => {
    const tasks: Array<{
      id: string;
      projectId: number;
      projectName: string;
      status: string;
      progress: number;
      currentStep: string;
      startTime: Date;
      endTime?: Date;
    }> = [];

    processingTasks.forEach((task) => {
      tasks.push({
        id: task.id,
        projectId: task.projectId,
        projectName: task.projectName,
        status: task.status,
        progress: task.progress,
        currentStep: task.currentStep,
        startTime: task.startTime,
        endTime: task.endTime,
      });
    });

    return tasks.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }),

  // 运行重庆测试
  runChongqingTest: publicProcedure.mutation(async () => {
    const { runChongqingTest } = await import("./real-insar-processor");
    const result = await runChongqingTest();
    return result;
  }),

  // 从数据库获取项目的处理步骤
  getProjectSteps: publicProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      try {
        const steps = await getProjectSteps(input.projectId);
        return {
          success: true,
          steps: steps.map((step) => ({
            id: step.id,
            stepName: step.stepName,
            status: step.status,
            progress: step.progress,
            startTime: step.startTime,
            endTime: step.endTime,
            duration: step.duration,
            errorMessage: step.errorMessage,
          })),
        };
      } catch (error) {
        return {
          success: false,
          steps: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),

  // 从数据库获取项目的处理日志
  getProjectLogs: publicProcedure
    .input(
      z.object({
        projectId: z.number(),
        limit: z.number().optional().default(100),
      })
    )
    .query(async ({ input }) => {
      try {
        const logs = await getProjectLogs(input.projectId, input.limit);
        return {
          success: true,
          logs: logs.map((log) => ({
            id: log.id,
            stepId: log.stepId,
            logLevel: log.logLevel,
            message: log.message,
            timestamp: log.timestamp,
          })),
          total: logs.length,
        };
      } catch (error) {
        return {
          success: false,
          logs: [],
          total: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),

  // 从数据库获取项目的处理结果
  getProjectResults: publicProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      try {
        const results = await getProjectResults(input.projectId);
        return {
          success: true,
          results: results.map((result) => ({
            id: result.id,
            resultType: result.resultType,
            fileUrl: result.fileUrl,
            fileName: result.fileName,
            fileSize: result.fileSize,
            format: result.format,
            minValue: result.minValue,
            maxValue: result.maxValue,
            meanValue: result.meanValue,
            metadata: result.metadata,
            createdAt: result.createdAt,
          })),
        };
      } catch (error) {
        return {
          success: false,
          results: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),

  // 清除项目的处理数据（日志、步骤、结果）
  clearProjectProcessingData: publicProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) {
          return { success: false, error: "数据库不可用" };
        }

        // 删除日志
        await db.delete(processingLogs).where(eq(processingLogs.projectId, input.projectId));
        // 删除步骤
        await db.delete(processingSteps).where(eq(processingSteps.projectId, input.projectId));
        // 删除结果
        await db.delete(processingResults).where(eq(processingResults.projectId, input.projectId));

        return { success: true, message: "处理数据已清除" };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
});
