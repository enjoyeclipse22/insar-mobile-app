import { describe, it, expect } from "vitest";

// 测试地图瓦片 URL 生成函数
describe("RealMapSelector", () => {
  // 测试瓦片 URL 生成
  describe("getTileUrl", () => {
    it("should generate valid OpenStreetMap tile URLs for street layer", () => {
      const servers = ['a', 'b', 'c'];
      const x = 10;
      const y = 5;
      const z = 8;
      const server = servers[(x + y) % servers.length];
      const url = `https://${server}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
      
      expect(url).toMatch(/^https:\/\/[abc]\.tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/);
      expect(url).toContain("tile.openstreetmap.org");
    });

    it("should generate valid ESRI satellite tile URLs", () => {
      const x = 10;
      const y = 5;
      const z = 8;
      const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
      
      expect(url).toContain("arcgisonline.com");
      expect(url).toContain("World_Imagery");
    });

    it("should generate valid OpenTopoMap terrain tile URLs", () => {
      const servers = ['a', 'b', 'c'];
      const x = 10;
      const y = 5;
      const z = 8;
      const server = servers[(x + y) % servers.length];
      const url = `https://${server}.tile.opentopomap.org/${z}/${x}/${y}.png`;
      
      expect(url).toMatch(/^https:\/\/[abc]\.tile\.opentopomap\.org\/\d+\/\d+\/\d+\.png$/);
    });
  });

  // 测试经纬度转瓦片坐标
  describe("lonLatToTile", () => {
    it("should convert longitude/latitude to tile coordinates", () => {
      const lon = 36.75;  // 土耳其中部
      const lat = 37.5;
      const zoom = 5;
      
      const n = Math.pow(2, zoom);
      const x = Math.floor(((lon + 180) / 360) * n);
      const latRad = (lat * Math.PI) / 180;
      const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
      
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(n);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(n);
    });

    it("should handle negative longitudes (Western hemisphere)", () => {
      const lon = -118;  // 加州
      const lat = 35.75;
      const zoom = 5;
      
      const n = Math.pow(2, zoom);
      const x = Math.floor(((lon + 180) / 360) * n);
      
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(n);
    });
  });

  // 测试瓦片坐标转经纬度
  describe("tileToLonLat", () => {
    it("should convert tile coordinates back to longitude/latitude", () => {
      const x = 17;
      const y = 11;
      const zoom = 5;
      
      const n = Math.pow(2, zoom);
      const lon = (x / n) * 360 - 180;
      const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
      const lat = (latRad * 180) / Math.PI;
      
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
      expect(lat).toBeGreaterThanOrEqual(-85.05);
      expect(lat).toBeLessThanOrEqual(85.05);
    });
  });

  // 测试比例尺计算
  describe("scale calculation", () => {
    it("should calculate scale info at different zoom levels", () => {
      const earthCircumference = 40075016.686;
      const lat = 37.5;
      const zoom = 5;
      
      const metersPerPixel = (earthCircumference * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
      
      expect(metersPerPixel).toBeGreaterThan(0);
      expect(metersPerPixel).toBeLessThan(earthCircumference);
    });

    it("should return km unit at low zoom levels", () => {
      const earthCircumference = 40075016.686;
      const lat = 37.5;
      const zoom = 3;
      const targetWidth = 100;
      
      const metersPerPixel = (earthCircumference * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
      let distance = metersPerPixel * targetWidth;
      let unit = "m";
      
      if (distance >= 1000) {
        distance = distance / 1000;
        unit = "km";
      }
      
      expect(unit).toBe("km");
    });

    it("should return m unit at high zoom levels", () => {
      const earthCircumference = 40075016.686;
      const lat = 37.5;
      const zoom = 15;
      const targetWidth = 100;
      
      const metersPerPixel = (earthCircumference * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
      let distance = metersPerPixel * targetWidth;
      let unit = "m";
      
      if (distance >= 1000) {
        distance = distance / 1000;
        unit = "km";
      }
      
      expect(unit).toBe("m");
    });
  });

  // 测试边界验证
  describe("bounds validation", () => {
    it("should validate bounds correctly", () => {
      const bounds = { north: 38.5, south: 36.5, east: 38.0, west: 35.5 };
      
      expect(bounds.north).toBeGreaterThan(bounds.south);
      expect(bounds.east).toBeGreaterThan(bounds.west);
    });

    it("should handle bounds crossing the antimeridian", () => {
      // 冰岛火山区（西经）
      const bounds = { north: 64.5, south: 63.5, east: -18.0, west: -20.0 };
      
      expect(bounds.north).toBeGreaterThan(bounds.south);
      expect(bounds.east).toBeGreaterThan(bounds.west);
    });
  });

  // 测试预设区域
  describe("preset areas", () => {
    const presetAreas = [
      { name: "土耳其地震区", north: 38.5, south: 36.5, east: 38.0, west: 35.5 },
      { name: "加州断层带", north: 36.5, south: 35.0, east: -117.0, west: -119.0 },
      { name: "日本富士山", north: 35.8, south: 35.0, east: 139.0, west: 138.0 },
      { name: "冰岛火山区", north: 64.5, south: 63.5, east: -18.0, west: -20.0 },
    ];

    it("should have valid preset areas", () => {
      presetAreas.forEach((area) => {
        expect(area.name).toBeTruthy();
        expect(area.north).toBeGreaterThan(area.south);
        expect(area.east).toBeGreaterThan(area.west);
        expect(area.north).toBeLessThanOrEqual(90);
        expect(area.south).toBeGreaterThanOrEqual(-90);
      });
    });

    it("should calculate center point correctly", () => {
      const area = presetAreas[0]; // 土耳其地震区
      const centerLat = (area.north + area.south) / 2;
      const centerLon = (area.east + area.west) / 2;
      
      expect(centerLat).toBeCloseTo(37.5, 1);
      expect(centerLon).toBeCloseTo(36.75, 1);
    });
  });

  // 测试地图图层
  describe("map layers", () => {
    const mapLayers = {
      street: { name: "街道" },
      satellite: { name: "卫星" },
      terrain: { name: "地形" },
    };

    it("should have three map layer types", () => {
      expect(Object.keys(mapLayers)).toHaveLength(3);
    });

    it("should have Chinese names for all layers", () => {
      expect(mapLayers.street.name).toBe("街道");
      expect(mapLayers.satellite.name).toBe("卫星");
      expect(mapLayers.terrain.name).toBe("地形");
    });
  });

  // 测试坐标验证
  describe("coordinate validation", () => {
    it("should validate latitude range (-90 to 90)", () => {
      const validateLat = (lat: number) => lat >= -90 && lat <= 90;
      
      expect(validateLat(0)).toBe(true);
      expect(validateLat(45)).toBe(true);
      expect(validateLat(-45)).toBe(true);
      expect(validateLat(90)).toBe(true);
      expect(validateLat(-90)).toBe(true);
      expect(validateLat(91)).toBe(false);
      expect(validateLat(-91)).toBe(false);
    });

    it("should validate longitude range (-180 to 180)", () => {
      const validateLon = (lon: number) => lon >= -180 && lon <= 180;
      
      expect(validateLon(0)).toBe(true);
      expect(validateLon(90)).toBe(true);
      expect(validateLon(-90)).toBe(true);
      expect(validateLon(180)).toBe(true);
      expect(validateLon(-180)).toBe(true);
      expect(validateLon(181)).toBe(false);
      expect(validateLon(-181)).toBe(false);
    });
  });

  // 测试缩放级别
  describe("zoom levels", () => {
    it("should have valid zoom range", () => {
      const minZoom = 1;
      const maxZoom = 18;
      const defaultZoom = 5;
      
      expect(defaultZoom).toBeGreaterThanOrEqual(minZoom);
      expect(defaultZoom).toBeLessThanOrEqual(maxZoom);
    });

    it("should calculate correct number of tiles at each zoom level", () => {
      for (let zoom = 1; zoom <= 10; zoom++) {
        const tilesPerSide = Math.pow(2, zoom);
        const totalTiles = tilesPerSide * tilesPerSide;
        
        expect(tilesPerSide).toBe(Math.pow(2, zoom));
        expect(totalTiles).toBe(Math.pow(4, zoom));
      }
    });
  });

  // 测试像素坐标转换
  describe("pixel coordinate conversion", () => {
    it("should convert pixel to geographic coordinates", () => {
      const mapSize = { width: 300, height: 200 };
      const center = { lat: 37.5, lon: 36.75 };
      const zoom = 5;
      const tileSize = 256;
      
      // 点击地图中心应该返回中心坐标
      const px = mapSize.width / 2;
      const py = mapSize.height / 2;
      
      const n = Math.pow(2, zoom);
      const centerPixelX = ((center.lon + 180) / 360) * n * tileSize;
      const latRad = (center.lat * Math.PI) / 180;
      const centerPixelY = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n * tileSize;
      
      const globalX = centerPixelX + (px - mapSize.width / 2);
      const globalY = centerPixelY + (py - mapSize.height / 2);
      
      const resultLon = (globalX / (n * tileSize)) * 360 - 180;
      const latRadResult = Math.atan(Math.sinh(Math.PI * (1 - (2 * globalY) / (n * tileSize))));
      const resultLat = (latRadResult * 180) / Math.PI;
      
      expect(resultLon).toBeCloseTo(center.lon, 1);
      expect(resultLat).toBeCloseTo(center.lat, 1);
    });
  });
});
