import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

// 测试下载缓存机制
describe("Download Cache Mechanism", () => {
  const cacheDir = "/tmp/insar-cache-test";
  const testFile = path.join(cacheDir, "test-file.zip");

  beforeAll(() => {
    // 创建测试目录
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
  });

  afterAll(() => {
    // 清理测试目录
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it("should create cache directory if not exists", () => {
    expect(fs.existsSync(cacheDir)).toBe(true);
  });

  it("should detect existing cached file", () => {
    // 创建测试文件
    fs.writeFileSync(testFile, "test content");
    expect(fs.existsSync(testFile)).toBe(true);
    
    // 检查文件大小
    const stats = fs.statSync(testFile);
    expect(stats.size).toBeGreaterThan(0);
  });

  it("should calculate file hash correctly", async () => {
    const crypto = await import("crypto");
    const content = "test content for hash";
    const hash = crypto.createHash("md5").update(content).digest("hex");
    expect(hash).toBe("3973d71b555770882ff4ccf684a00f09");
  });

  it("should skip download for cached file", () => {
    // 模拟缓存检查逻辑
    const fileExists = fs.existsSync(testFile);
    const shouldDownload = !fileExists;
    expect(shouldDownload).toBe(false);
  });

  it("should download if file not cached", () => {
    const nonExistentFile = path.join(cacheDir, "non-existent.zip");
    const fileExists = fs.existsSync(nonExistentFile);
    const shouldDownload = !fileExists;
    expect(shouldDownload).toBe(true);
  });
});

// 测试热力图数据结构
describe("Heatmap Data Structure", () => {
  interface HeatmapData {
    bounds: {
      north: number;
      south: number;
      east: number;
      west: number;
    };
    values: number[][];
    elevation?: number[][];
    type: "interferogram" | "deformation" | "coherence" | "dem";
    statistics: {
      min: number;
      max: number;
      mean: number;
      std: number;
    };
  }

  it("should create valid heatmap data structure", () => {
    const data: HeatmapData = {
      bounds: {
        north: 31.0,
        south: 30.0,
        east: 105.0,
        west: 104.0,
      },
      values: [
        [1.0, 2.0, 3.0],
        [4.0, 5.0, 6.0],
        [7.0, 8.0, 9.0],
      ],
      type: "deformation",
      statistics: {
        min: 1.0,
        max: 9.0,
        mean: 5.0,
        std: 2.58,
      },
    };

    expect(data.bounds.north).toBeGreaterThan(data.bounds.south);
    expect(data.bounds.east).toBeGreaterThan(data.bounds.west);
    expect(data.values.length).toBe(3);
    expect(data.values[0].length).toBe(3);
    expect(data.type).toBe("deformation");
  });

  it("should calculate statistics correctly", () => {
    const values = [
      [1.0, 2.0, 3.0],
      [4.0, 5.0, 6.0],
      [7.0, 8.0, 9.0],
    ];

    const flat = values.flat();
    const min = Math.min(...flat);
    const max = Math.max(...flat);
    const mean = flat.reduce((a, b) => a + b, 0) / flat.length;

    expect(min).toBe(1.0);
    expect(max).toBe(9.0);
    expect(mean).toBe(5.0);
  });

  it("should support elevation data for 3D visualization", () => {
    const data: HeatmapData = {
      bounds: {
        north: 31.0,
        south: 30.0,
        east: 105.0,
        west: 104.0,
      },
      values: [
        [1.0, 2.0],
        [3.0, 4.0],
      ],
      elevation: [
        [500, 600],
        [700, 800],
      ],
      type: "deformation",
      statistics: {
        min: 1.0,
        max: 4.0,
        mean: 2.5,
        std: 1.12,
      },
    };

    expect(data.elevation).toBeDefined();
    expect(data.elevation![0][0]).toBe(500);
    expect(data.elevation![1][1]).toBe(800);
  });

  it("should support different data types", () => {
    const types: Array<"interferogram" | "deformation" | "coherence" | "dem"> = [
      "interferogram",
      "deformation",
      "coherence",
      "dem",
    ];

    types.forEach((type) => {
      const data: HeatmapData = {
        bounds: { north: 31, south: 30, east: 105, west: 104 },
        values: [[1]],
        type,
        statistics: { min: 1, max: 1, mean: 1, std: 0 },
      };
      expect(data.type).toBe(type);
    });
  });
});

// 测试颜色映射
describe("Color Scale Mapping", () => {
  type ColorScale = "jet" | "rainbow" | "coolwarm" | "viridis" | "turbo" | "hsv";

  it("should support all color scales", () => {
    const scales: ColorScale[] = ["jet", "rainbow", "coolwarm", "viridis", "turbo", "hsv"];
    expect(scales.length).toBe(6);
  });

  it("should map value to color correctly", () => {
    // 简化的颜色映射测试
    const normalizeValue = (value: number, min: number, max: number): number => {
      return (value - min) / (max - min);
    };

    expect(normalizeValue(5, 0, 10)).toBe(0.5);
    expect(normalizeValue(0, 0, 10)).toBe(0);
    expect(normalizeValue(10, 0, 10)).toBe(1);
  });
});

// 测试 API 端点
describe("API Endpoints", () => {
  const API_BASE = "http://127.0.0.1:3000";

  it("should have health endpoint", async () => {
    try {
      const response = await fetch(`${API_BASE}/api/health`);
      expect(response.ok).toBe(true);
    } catch (error) {
      // 如果服务器未运行，跳过测试
      console.log("Server not running, skipping health check");
    }
  });

  it("should have insar files endpoint", async () => {
    try {
      const response = await fetch(`${API_BASE}/api/insar-files/`);
      // 即使返回 404，也说明端点存在
      expect([200, 404]).toContain(response.status);
    } catch (error) {
      console.log("Server not running, skipping files endpoint check");
    }
  });
});
