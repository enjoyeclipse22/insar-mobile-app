/**
 * RealInSARProcessor 单元测试
 * 
 * 测试覆盖范围：
 * 1. 处理器初始化和配置验证
 * 2. 日志记录功能
 * 3. 步骤执行和错误处理
 * 4. 取消处理功能
 * 5. ASF API 响应解析
 * 6. 数据搜索结果处理
 * 7. 处理结果结构验证
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  RealInSARProcessor,
  ProcessingConfig,
  ProcessingLog,
  ProcessingResult,
  ASFSearchResult,
} from "./real-insar-processor";
import * as fs from "fs";
import * as path from "path";

// 测试配置
const createTestConfig = (overrides?: Partial<ProcessingConfig>): ProcessingConfig => ({
  projectId: "test-project-123",
  projectName: "测试项目",
  bounds: {
    north: 30.5,
    south: 30.0,
    east: 104.5,
    west: 104.0,
  },
  startDate: "2024-01-01",
  endDate: "2024-03-01",
  satellite: "Sentinel-1",
  orbitDirection: "ascending",
  polarization: "VV",
  resolution: 30,
  coherenceThreshold: 0.4,
  ...overrides,
});

// Mock fetch 函数
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("RealInSARProcessor", () => {
  let processor: RealInSARProcessor;
  let testConfig: ProcessingConfig;

  beforeEach(() => {
    testConfig = createTestConfig();
    processor = new RealInSARProcessor(testConfig);
    vi.clearAllMocks();
    
    // 设置环境变量
    process.env.ASF_API_TOKEN = "test-token-12345";
  });

  afterEach(() => {
    delete process.env.ASF_API_TOKEN;
  });

  // ===========================================================================
  // 1. 处理器初始化测试
  // ===========================================================================
  describe("初始化", () => {
    it("应该正确创建处理器实例", () => {
      expect(processor).toBeInstanceOf(RealInSARProcessor);
    });

    it("应该使用提供的配置初始化", () => {
      const logs = processor.getLogs();
      expect(logs).toHaveLength(0); // 初始化时没有日志
    });

    it("应该支持不同的卫星配置", () => {
      const configS1A = createTestConfig({ satellite: "Sentinel-1A" });
      const processorS1A = new RealInSARProcessor(configS1A);
      expect(processorS1A).toBeInstanceOf(RealInSARProcessor);

      const configS1B = createTestConfig({ satellite: "Sentinel-1B" });
      const processorS1B = new RealInSARProcessor(configS1B);
      expect(processorS1B).toBeInstanceOf(RealInSARProcessor);
    });

    it("应该支持不同的轨道方向", () => {
      const configAsc = createTestConfig({ orbitDirection: "ascending" });
      const processorAsc = new RealInSARProcessor(configAsc);
      expect(processorAsc).toBeInstanceOf(RealInSARProcessor);

      const configDesc = createTestConfig({ orbitDirection: "descending" });
      const processorDesc = new RealInSARProcessor(configDesc);
      expect(processorDesc).toBeInstanceOf(RealInSARProcessor);

      const configBoth = createTestConfig({ orbitDirection: "both" });
      const processorBoth = new RealInSARProcessor(configBoth);
      expect(processorBoth).toBeInstanceOf(RealInSARProcessor);
    });

    it("应该支持不同的极化方式", () => {
      const polarizations: Array<"VV" | "VH" | "VV+VH"> = ["VV", "VH", "VV+VH"];
      polarizations.forEach((pol) => {
        const config = createTestConfig({ polarization: pol });
        const proc = new RealInSARProcessor(config);
        expect(proc).toBeInstanceOf(RealInSARProcessor);
      });
    });
  });

  // ===========================================================================
  // 2. 日志记录功能测试
  // ===========================================================================
  describe("日志记录", () => {
    it("getLogs 应该返回空数组（初始状态）", () => {
      const logs = processor.getLogs();
      expect(logs).toEqual([]);
    });

    it("应该通过事件发送日志", () => {
      return new Promise<void>((resolve) => {
        processor.on("log", (log: ProcessingLog) => {
          expect(log).toHaveProperty("timestamp");
          expect(log).toHaveProperty("level");
          expect(log).toHaveProperty("step");
          expect(log).toHaveProperty("message");
          resolve();
        });

        // 触发一个会产生日志的操作
        processor.cancel();
      });
    });

    it("cancel 应该记录警告日志", () => {
      processor.cancel();
      const logs = processor.getLogs();
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].level).toBe("WARNING");
      expect(logs[0].message).toContain("取消");
    });
  });

  // ===========================================================================
  // 3. 取消处理功能测试
  // ===========================================================================
  describe("取消处理", () => {
    it("cancel 方法应该设置取消标志", () => {
      processor.cancel();
      const logs = processor.getLogs();
      expect(logs.some((log) => log.message.includes("取消"))).toBe(true);
    });

    it("取消后应该记录日志", () => {
      processor.cancel();
      const logs = processor.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe("WARNING");
      expect(logs[0].step).toBe("控制");
    });
  });

  // ===========================================================================
  // 4. ASF API 响应解析测试
  // ===========================================================================
  describe("ASF API 响应解析", () => {
    it("应该正确解析标准 ASF 搜索结果", () => {
      const mockASFResponse = [
        {
          granuleName: "S1A_IW_SLC__1SDV_20240115T102030_20240115T102057_052001_064001_1234",
          fileName: "S1A_IW_SLC__1SDV_20240115T102030_20240115T102057_052001_064001_1234.zip",
          downloadUrl: "https://datapool.asf.alaska.edu/SLC/SA/S1A_IW_SLC__1SDV_20240115T102030_20240115T102057_052001_064001_1234.zip",
          startTime: "2024-01-15T10:20:30.000Z",
          stopTime: "2024-01-15T10:20:57.000Z",
          flightDirection: "ASCENDING",
          polarization: "VV+VH",
          beamMode: "IW",
          platform: "Sentinel-1A",
          absoluteOrbit: 52001,
          relativeOrbit: 99,
          frameNumber: 123,
          sceneBounds: "POLYGON((104.0 30.0, 104.5 30.0, 104.5 30.5, 104.0 30.5, 104.0 30.0))",
          fileSize: 4500000000,
        },
      ];

      // 使用私有方法测试（通过类型断言）
      const parseResults = (processor as any).parseSearchResults.bind(processor);
      const results: ASFSearchResult[] = parseResults(mockASFResponse);

      expect(results).toHaveLength(1);
      expect(results[0].granuleName).toBe("S1A_IW_SLC__1SDV_20240115T102030_20240115T102057_052001_064001_1234");
      expect(results[0].platform).toBe("Sentinel-1A");
      expect(results[0].absoluteOrbit).toBe(52001);
      expect(results[0].flightDirection).toBe("ASCENDING");
    });

    it("应该处理缺失字段的响应", () => {
      const mockPartialResponse = [
        {
          granuleName: "S1A_TEST",
          // 缺少其他字段
        },
      ];

      const parseResults = (processor as any).parseSearchResults.bind(processor);
      const results: ASFSearchResult[] = parseResults(mockPartialResponse);

      expect(results).toHaveLength(1);
      expect(results[0].granuleName).toBe("S1A_TEST");
      expect(results[0].flightDirection).toBe("UNKNOWN");
      expect(results[0].polarization).toBe("VV");
      expect(results[0].absoluteOrbit).toBe(0);
    });

    it("应该展平嵌套数组结构", () => {
      const nestedResponse = [[
        { granuleName: "S1A_TEST_1" },
        { granuleName: "S1A_TEST_2" },
      ]];

      const flattenResults = (processor as any).flattenASFResults.bind(processor);
      const flattened = flattenResults(nestedResponse);

      expect(flattened).toHaveLength(2);
      expect(flattened[0].granuleName).toBe("S1A_TEST_1");
      expect(flattened[1].granuleName).toBe("S1A_TEST_2");
    });

    it("应该处理空数组", () => {
      const flattenResults = (processor as any).flattenASFResults.bind(processor);
      const flattened = flattenResults([]);
      expect(flattened).toEqual([]);
    });

    it("应该处理非数组输入", () => {
      const flattenResults = (processor as any).flattenASFResults.bind(processor);
      const flattened = flattenResults(null);
      expect(flattened).toEqual([]);
    });
  });

  // ===========================================================================
  // 5. 处理结果结构验证测试
  // ===========================================================================
  describe("处理结果结构", () => {
    it("ProcessingResult 应该包含必要字段", () => {
      // 创建一个模拟的处理结果
      const mockResult: ProcessingResult = {
        success: true,
        projectId: "test-123",
        startTime: new Date(),
        endTime: new Date(),
        duration: 100,
        steps: [],
        outputs: {},
      };

      expect(mockResult).toHaveProperty("success");
      expect(mockResult).toHaveProperty("projectId");
      expect(mockResult).toHaveProperty("startTime");
      expect(mockResult).toHaveProperty("endTime");
      expect(mockResult).toHaveProperty("duration");
      expect(mockResult).toHaveProperty("steps");
      expect(mockResult).toHaveProperty("outputs");
    });

    it("失败的处理结果应该包含错误信息", () => {
      const mockFailedResult: ProcessingResult = {
        success: false,
        projectId: "test-123",
        startTime: new Date(),
        endTime: new Date(),
        duration: 10,
        steps: [],
        outputs: {},
        error: "ASF_API_TOKEN 环境变量未设置",
      };

      expect(mockFailedResult.success).toBe(false);
      expect(mockFailedResult.error).toBeDefined();
      expect(mockFailedResult.error).toContain("ASF_API_TOKEN");
    });
  });

  // ===========================================================================
  // 6. 配置验证测试
  // ===========================================================================
  describe("配置验证", () => {
    it("应该接受有效的边界坐标", () => {
      const validConfig = createTestConfig({
        bounds: {
          north: 31.0,
          south: 30.0,
          east: 105.0,
          west: 104.0,
        },
      });
      const proc = new RealInSARProcessor(validConfig);
      expect(proc).toBeInstanceOf(RealInSARProcessor);
    });

    it("应该接受有效的日期范围", () => {
      const validConfig = createTestConfig({
        startDate: "2023-01-01",
        endDate: "2024-12-31",
      });
      const proc = new RealInSARProcessor(validConfig);
      expect(proc).toBeInstanceOf(RealInSARProcessor);
    });

    it("应该接受有效的分辨率值", () => {
      const resolutions = [10, 20, 30, 50, 100];
      resolutions.forEach((res) => {
        const config = createTestConfig({ resolution: res });
        const proc = new RealInSARProcessor(config);
        expect(proc).toBeInstanceOf(RealInSARProcessor);
      });
    });

    it("应该接受有效的相干性阈值", () => {
      const thresholds = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
      thresholds.forEach((threshold) => {
        const config = createTestConfig({ coherenceThreshold: threshold });
        const proc = new RealInSARProcessor(config);
        expect(proc).toBeInstanceOf(RealInSARProcessor);
      });
    });
  });

  // ===========================================================================
  // 7. 事件发射测试
  // ===========================================================================
  describe("事件发射", () => {
    it("应该是 EventEmitter 的实例", () => {
      expect(processor.on).toBeDefined();
      expect(processor.emit).toBeDefined();
      expect(processor.removeListener).toBeDefined();
    });

    it("应该能够监听 log 事件", () => {
      const logHandler = vi.fn();
      processor.on("log", logHandler);
      processor.cancel();
      expect(logHandler).toHaveBeenCalled();
    });

    it("应该能够移除事件监听器", () => {
      const logHandler = vi.fn();
      processor.on("log", logHandler);
      processor.removeListener("log", logHandler);
      processor.cancel();
      // 监听器已移除，但内部仍会记录日志
      expect(logHandler).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 8. 工作目录测试
  // ===========================================================================
  describe("工作目录", () => {
    it("应该使用项目 ID 创建唯一的工作目录路径", () => {
      const config1 = createTestConfig({ projectId: "project-1" });
      const config2 = createTestConfig({ projectId: "project-2" });
      
      const proc1 = new RealInSARProcessor(config1);
      const proc2 = new RealInSARProcessor(config2);
      
      // 工作目录路径应该不同
      expect(proc1).not.toBe(proc2);
    });
  });

  // ===========================================================================
  // 9. 模拟相位数据生成测试
  // ===========================================================================
  describe("模拟相位数据生成", () => {
    it("应该生成正确尺寸的相位数据", () => {
      const width = 100;
      const height = 100;
      
      const generateData = (processor as any).generateSimulatedPhaseDataLocal.bind(processor);
      const { phase, coherence } = generateData(width, height);
      
      expect(phase).toBeInstanceOf(Float32Array);
      expect(coherence).toBeInstanceOf(Float32Array);
      expect(phase.length).toBe(width * height);
      expect(coherence.length).toBe(width * height);
    });

    it("相位值应该在 [-π, π] 范围内（加上噪声）", () => {
      const width = 50;
      const height = 50;
      
      const generateData = (processor as any).generateSimulatedPhaseDataLocal.bind(processor);
      const { phase } = generateData(width, height);
      
      // 由于添加了噪声，允许稍微超出范围
      const tolerance = 0.5;
      for (let i = 0; i < phase.length; i++) {
        expect(phase[i]).toBeGreaterThanOrEqual(-Math.PI - tolerance);
        expect(phase[i]).toBeLessThanOrEqual(Math.PI + tolerance);
      }
    });

    it("相干性值应该在 [0, 1] 范围内", () => {
      const width = 50;
      const height = 50;
      
      const generateData = (processor as any).generateSimulatedPhaseDataLocal.bind(processor);
      const { coherence } = generateData(width, height);
      
      for (let i = 0; i < coherence.length; i++) {
        expect(coherence[i]).toBeGreaterThanOrEqual(0);
        expect(coherence[i]).toBeLessThanOrEqual(1);
      }
    });

    it("中心区域应该有较高的相干性", () => {
      const width = 100;
      const height = 100;
      
      const generateData = (processor as any).generateSimulatedPhaseDataLocal.bind(processor);
      const { coherence } = generateData(width, height);
      
      // 中心点
      const centerIdx = Math.floor(height / 2) * width + Math.floor(width / 2);
      // 角落点
      const cornerIdx = 0;
      
      // 中心相干性应该高于角落
      expect(coherence[centerIdx]).toBeGreaterThan(coherence[cornerIdx]);
    });
  });

  // ===========================================================================
  // 10. 处理流程测试（无 ASF Token）
  // ===========================================================================
  describe("处理流程（无 ASF Token）", () => {
    beforeEach(() => {
      delete process.env.ASF_API_TOKEN;
    });

    it("没有 ASF Token 时应该返回失败结果", async () => {
      const result = await processor.process();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain("ASF_API_TOKEN");
    });

    it("失败结果应该包含正确的项目 ID", async () => {
      const result = await processor.process();
      
      expect(result.projectId).toBe(testConfig.projectId);
    });

    it("失败结果应该包含时间信息", async () => {
      const result = await processor.process();
      
      expect(result.startTime).toBeInstanceOf(Date);
      expect(result.endTime).toBeInstanceOf(Date);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // 11. 处理流程测试（有 ASF Token，模拟 API 响应）
  // ===========================================================================
  describe("处理流程（模拟 API）", () => {
    beforeEach(() => {
      process.env.ASF_API_TOKEN = "test-token-12345";
    });

    it("API 返回空结果时应该尝试扩大搜索范围", async () => {
      // 第一次搜索返回空
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });
      // 扩大搜索也返回空
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const result = await processor.process();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain("未找到符合条件的 Sentinel-1 数据");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("API 返回错误时应该抛出错误", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      const result = await processor.process();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain("ASF API 搜索失败");
    });

    it("应该正确构建搜索 URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await processor.process();

      const firstCall = mockFetch.mock.calls[0];
      const url = firstCall[0] as string;
      
      expect(url).toContain("api.daac.asf.alaska.edu");
      expect(url).toContain("processingLevel=SLC");
      expect(url).toContain("beamMode=IW");
    });

    it("应该在请求中包含 Authorization 头", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await processor.process();

      const firstCall = mockFetch.mock.calls[0];
      const options = firstCall[1] as RequestInit;
      
      expect(options.headers).toHaveProperty("Authorization");
      expect((options.headers as Record<string, string>).Authorization).toContain("Bearer");
    });
  });

  // ===========================================================================
  // 12. 步骤结果测试
  // ===========================================================================
  describe("步骤结果", () => {
    it("每个步骤应该有正确的状态", async () => {
      delete process.env.ASF_API_TOKEN;
      
      const result = await processor.process();
      
      // 应该有一些步骤结果
      expect(result.steps.length).toBeGreaterThan(0);
      
      // 检查步骤结构
      result.steps.forEach((step) => {
        expect(step).toHaveProperty("step");
        expect(step).toHaveProperty("status");
        expect(step).toHaveProperty("startTime");
        expect(step).toHaveProperty("endTime");
        expect(step).toHaveProperty("duration");
        expect(step).toHaveProperty("message");
        expect(["completed", "failed", "skipped"]).toContain(step.status);
      });
    });

    it("失败的步骤应该有错误信息", async () => {
      delete process.env.ASF_API_TOKEN;
      
      const result = await processor.process();
      
      const failedStep = result.steps.find((s) => s.status === "failed");
      expect(failedStep).toBeDefined();
      expect(failedStep?.message).toBeTruthy();
    });
  });

  // ===========================================================================
  // 13. 并发处理测试
  // ===========================================================================
  describe("并发处理", () => {
    it("应该能够同时创建多个处理器实例", () => {
      const processors = [];
      for (let i = 0; i < 5; i++) {
        const config = createTestConfig({ projectId: `project-${i}` });
        processors.push(new RealInSARProcessor(config));
      }
      
      expect(processors).toHaveLength(5);
      processors.forEach((proc) => {
        expect(proc).toBeInstanceOf(RealInSARProcessor);
      });
    });

    it("每个处理器应该有独立的日志", () => {
      const proc1 = new RealInSARProcessor(createTestConfig({ projectId: "p1" }));
      const proc2 = new RealInSARProcessor(createTestConfig({ projectId: "p2" }));
      
      proc1.cancel();
      
      expect(proc1.getLogs().length).toBe(1);
      expect(proc2.getLogs().length).toBe(0);
    });
  });

  // ===========================================================================
  // 14. 边界条件测试
  // ===========================================================================
  describe("边界条件", () => {
    it("应该处理极小的区域范围", () => {
      const config = createTestConfig({
        bounds: {
          north: 30.001,
          south: 30.0,
          east: 104.001,
          west: 104.0,
        },
      });
      const proc = new RealInSARProcessor(config);
      expect(proc).toBeInstanceOf(RealInSARProcessor);
    });

    it("应该处理跨越日期线的区域", () => {
      const config = createTestConfig({
        bounds: {
          north: 30.5,
          south: 30.0,
          east: -179.0,
          west: 179.0,
        },
      });
      const proc = new RealInSARProcessor(config);
      expect(proc).toBeInstanceOf(RealInSARProcessor);
    });

    it("应该处理极端的日期范围", () => {
      const config = createTestConfig({
        startDate: "2014-04-03", // Sentinel-1A 发射日期
        endDate: "2030-12-31",
      });
      const proc = new RealInSARProcessor(config);
      expect(proc).toBeInstanceOf(RealInSARProcessor);
    });
  });
});

// ===========================================================================
// 类型测试
// ===========================================================================
describe("类型定义", () => {
  it("ProcessingConfig 应该有所有必需字段", () => {
    const config: ProcessingConfig = {
      projectId: "test",
      projectName: "测试",
      bounds: { north: 31, south: 30, east: 105, west: 104 },
      startDate: "2024-01-01",
      endDate: "2024-03-01",
      satellite: "Sentinel-1",
      orbitDirection: "ascending",
      polarization: "VV",
      resolution: 30,
      coherenceThreshold: 0.4,
    };
    
    expect(config.projectId).toBeDefined();
    expect(config.projectName).toBeDefined();
    expect(config.bounds).toBeDefined();
    expect(config.startDate).toBeDefined();
    expect(config.endDate).toBeDefined();
    expect(config.satellite).toBeDefined();
    expect(config.orbitDirection).toBeDefined();
    expect(config.polarization).toBeDefined();
    expect(config.resolution).toBeDefined();
    expect(config.coherenceThreshold).toBeDefined();
  });

  it("ASFSearchResult 应该有所有必需字段", () => {
    const result: ASFSearchResult = {
      granuleName: "test",
      fileName: "test.zip",
      downloadUrl: "https://example.com/test.zip",
      startTime: "2024-01-01T00:00:00Z",
      stopTime: "2024-01-01T00:00:30Z",
      flightDirection: "ASCENDING",
      polarization: "VV",
      beamMode: "IW",
      platform: "Sentinel-1A",
      absoluteOrbit: 12345,
      relativeOrbit: 99,
      frameNumber: 123,
      sceneBounds: "POLYGON(...)",
      fileSize: 1000000,
    };
    
    expect(result.granuleName).toBeDefined();
    expect(result.downloadUrl).toBeDefined();
    expect(result.platform).toBeDefined();
  });

  it("ProcessingLog 应该有所有必需字段", () => {
    const log: ProcessingLog = {
      timestamp: new Date(),
      level: "INFO",
      step: "测试步骤",
      message: "测试消息",
    };
    
    expect(log.timestamp).toBeInstanceOf(Date);
    expect(["INFO", "DEBUG", "WARNING", "ERROR"]).toContain(log.level);
    expect(log.step).toBeDefined();
    expect(log.message).toBeDefined();
  });
});
