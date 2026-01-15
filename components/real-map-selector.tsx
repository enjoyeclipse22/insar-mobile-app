import { useState, useCallback, useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput, Platform, Dimensions } from "react-native";
import { Image } from "expo-image";
import { useColors } from "@/hooks/use-colors";

interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface RealMapSelectorProps {
  bounds: Bounds;
  onBoundsChange: (bounds: Bounds) => void;
}

// 预设区域
const presetAreas = [
  { name: "土耳其地震区", north: 38.5, south: 36.5, east: 38.0, west: 35.5 },
  { name: "加州断层带", north: 36.5, south: 35.0, east: -117.0, west: -119.0 },
  { name: "日本富士山", north: 35.8, south: 35.0, east: 139.0, west: 138.0 },
  { name: "冰岛火山区", north: 64.5, south: 63.5, east: -18.0, west: -20.0 },
];

// 计算地图瓦片 URL - 使用多个瓦片服务器提高加载速度
function getTileUrl(x: number, y: number, z: number): string {
  // 使用 OpenStreetMap 瓦片服务器
  const servers = ['a', 'b', 'c'];
  const server = servers[(x + y) % servers.length];
  return `https://${server}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

// 经纬度转瓦片坐标
function lonLatToTile(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

// 瓦片坐标转经纬度
function tileToLonLat(x: number, y: number, zoom: number): { lon: number; lat: number } {
  const n = Math.pow(2, zoom);
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lon, lat };
}

export function RealMapSelector({ bounds, onBoundsChange }: RealMapSelectorProps) {
  const colors = useColors();
  const [zoom, setZoom] = useState(5);
  const [center, setCenter] = useState({
    lat: (bounds.north + bounds.south) / 2,
    lon: (bounds.east + bounds.west) / 2,
  });
  const [mapSize, setMapSize] = useState({ width: 300, height: 200 });
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);

  // 更新中心点当边界变化时
  useEffect(() => {
    setCenter({
      lat: (bounds.north + bounds.south) / 2,
      lon: (bounds.east + bounds.west) / 2,
    });
  }, [bounds]);

  // 计算需要显示的瓦片
  const getTiles = useCallback(() => {
    const tiles: Array<{ x: number; y: number; url: string; left: number; top: number }> = [];
    const tileSize = 256;
    
    // 计算中心瓦片
    const centerTile = lonLatToTile(center.lon, center.lat, zoom);
    
    // 计算需要多少瓦片来覆盖地图区域
    const tilesX = Math.ceil(mapSize.width / tileSize) + 2;
    const tilesY = Math.ceil(mapSize.height / tileSize) + 2;
    
    const startX = centerTile.x - Math.floor(tilesX / 2);
    const startY = centerTile.y - Math.floor(tilesY / 2);
    
    // 计算中心瓦片在屏幕上的位置偏移
    const n = Math.pow(2, zoom);
    const centerPixelX = ((center.lon + 180) / 360) * n * tileSize;
    const latRad = (center.lat * Math.PI) / 180;
    const centerPixelY = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n * tileSize;
    
    const offsetX = mapSize.width / 2 - (centerPixelX - startX * tileSize);
    const offsetY = mapSize.height / 2 - (centerPixelY - startY * tileSize);
    
    for (let dy = 0; dy < tilesY; dy++) {
      for (let dx = 0; dx < tilesX; dx++) {
        const tileX = startX + dx;
        const tileY = startY + dy;
        
        // 确保瓦片坐标在有效范围内
        if (tileX >= 0 && tileX < n && tileY >= 0 && tileY < n) {
          tiles.push({
            x: tileX,
            y: tileY,
            url: getTileUrl(tileX, tileY, zoom),
            left: offsetX + dx * tileSize,
            top: offsetY + dy * tileSize,
          });
        }
      }
    }
    
    return tiles;
  }, [center, zoom, mapSize]);

  // 像素坐标转经纬度
  const pixelToLonLat = useCallback((px: number, py: number): { lon: number; lat: number } => {
    const tileSize = 256;
    const n = Math.pow(2, zoom);
    
    // 计算中心点的像素坐标
    const centerPixelX = ((center.lon + 180) / 360) * n * tileSize;
    const latRad = (center.lat * Math.PI) / 180;
    const centerPixelY = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n * tileSize;
    
    // 计算点击位置的全局像素坐标
    const globalX = centerPixelX + (px - mapSize.width / 2);
    const globalY = centerPixelY + (py - mapSize.height / 2);
    
    // 转换为经纬度
    const lon = (globalX / (n * tileSize)) * 360 - 180;
    const latRadResult = Math.atan(Math.sinh(Math.PI * (1 - (2 * globalY) / (n * tileSize))));
    const lat = (latRadResult * 180) / Math.PI;
    
    return { lon, lat };
  }, [center, zoom, mapSize]);

  // 经纬度转像素坐标
  const lonLatToPixel = useCallback((lon: number, lat: number): { x: number; y: number } => {
    const tileSize = 256;
    const n = Math.pow(2, zoom);
    
    // 计算中心点的像素坐标
    const centerPixelX = ((center.lon + 180) / 360) * n * tileSize;
    const latRad = (center.lat * Math.PI) / 180;
    const centerPixelY = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n * tileSize;
    
    // 计算目标点的全局像素坐标
    const targetPixelX = ((lon + 180) / 360) * n * tileSize;
    const targetLatRad = (lat * Math.PI) / 180;
    const targetPixelY = (1 - Math.log(Math.tan(targetLatRad) + 1 / Math.cos(targetLatRad)) / Math.PI) / 2 * n * tileSize;
    
    // 转换为相对于地图容器的坐标
    const x = mapSize.width / 2 + (targetPixelX - centerPixelX);
    const y = mapSize.height / 2 + (targetPixelY - centerPixelY);
    
    return { x, y };
  }, [center, zoom, mapSize]);

  // 计算选中区域的屏幕坐标
  const getSelectionRect = useCallback(() => {
    const nw = lonLatToPixel(bounds.west, bounds.north);
    const se = lonLatToPixel(bounds.east, bounds.south);
    
    return {
      left: Math.min(nw.x, se.x),
      top: Math.min(nw.y, se.y),
      width: Math.abs(se.x - nw.x),
      height: Math.abs(se.y - nw.y),
    };
  }, [bounds, lonLatToPixel]);

  // 处理触摸开始
  const handleTouchStart = useCallback((event: any) => {
    const { locationX, locationY } = event.nativeEvent;
    setIsSelecting(true);
    setSelectionStart({ x: locationX, y: locationY });
    setSelectionEnd({ x: locationX, y: locationY });
  }, []);

  // 处理触摸移动
  const handleTouchMove = useCallback((event: any) => {
    if (!isSelecting) return;
    const { locationX, locationY } = event.nativeEvent;
    setSelectionEnd({ x: locationX, y: locationY });
  }, [isSelecting]);

  // 处理触摸结束
  const handleTouchEnd = useCallback(() => {
    if (!isSelecting || !selectionStart || !selectionEnd) {
      setIsSelecting(false);
      return;
    }

    // 计算选中区域的经纬度
    const start = pixelToLonLat(selectionStart.x, selectionStart.y);
    const end = pixelToLonLat(selectionEnd.x, selectionEnd.y);

    const newBounds = {
      north: Math.max(start.lat, end.lat),
      south: Math.min(start.lat, end.lat),
      east: Math.max(start.lon, end.lon),
      west: Math.min(start.lon, end.lon),
    };

    // 只有当选择区域足够大时才更新
    if (Math.abs(newBounds.north - newBounds.south) > 0.1 && 
        Math.abs(newBounds.east - newBounds.west) > 0.1) {
      onBoundsChange(newBounds);
    }

    setIsSelecting(false);
    setSelectionStart(null);
    setSelectionEnd(null);
  }, [isSelecting, selectionStart, selectionEnd, pixelToLonLat, onBoundsChange]);

  // 缩放控制
  const handleZoomIn = () => setZoom((z) => Math.min(18, z + 1));
  const handleZoomOut = () => setZoom((z) => Math.max(1, z - 1));

  const tiles = getTiles();
  const selectionRect = getSelectionRect();

  // 计算正在绘制的选择框
  const drawingRect = isSelecting && selectionStart && selectionEnd ? {
    left: Math.min(selectionStart.x, selectionEnd.x),
    top: Math.min(selectionStart.y, selectionEnd.y),
    width: Math.abs(selectionEnd.x - selectionStart.x),
    height: Math.abs(selectionEnd.y - selectionStart.y),
  } : null;

  return (
    <View>
      {/* 预设区域快速选择 */}
      <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>
        快速选择预设区域：
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {presetAreas.map((area) => (
            <TouchableOpacity
              key={area.name}
              onPress={() => {
                onBoundsChange(area);
                setCenter({ lat: (area.north + area.south) / 2, lon: (area.east + area.west) / 2 });
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 12, color: colors.foreground }}>{area.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* 真实地图 */}
      <View
        style={{
          height: 250,
          borderRadius: 12,
          overflow: "hidden",
          position: "relative",
          backgroundColor: "#e5e5e5",
        }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setMapSize({ width, height });
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 地图瓦片 */}
        {tiles.map((tile) => (
          <Image
            key={`${tile.x}-${tile.y}-${zoom}`}
            source={{ uri: tile.url }}
            style={{
              position: "absolute",
              left: tile.left,
              top: tile.top,
              width: 256,
              height: 256,
            }}
            contentFit="cover"
          />
        ))}

        {/* 已选中区域 */}
        <View
          style={{
            position: "absolute",
            left: selectionRect.left,
            top: selectionRect.top,
            width: selectionRect.width,
            height: selectionRect.height,
            borderWidth: 2,
            borderColor: colors.primary,
            backgroundColor: "rgba(10, 126, 164, 0.3)",
            borderRadius: 4,
          }}
        />

        {/* 正在绘制的选择框 */}
        {drawingRect && (
          <View
            style={{
              position: "absolute",
              left: drawingRect.left,
              top: drawingRect.top,
              width: drawingRect.width,
              height: drawingRect.height,
              borderWidth: 2,
              borderColor: "#FF6B6B",
              backgroundColor: "rgba(255, 107, 107, 0.2)",
              borderStyle: "dashed",
              borderRadius: 4,
            }}
          />
        )}

        {/* 缩放控制 */}
        <View
          style={{
            position: "absolute",
            right: 8,
            top: 8,
            backgroundColor: "rgba(255,255,255,0.9)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <TouchableOpacity
            onPress={handleZoomIn}
            style={{ padding: 8, borderBottomWidth: 1, borderBottomColor: "#ddd" }}
          >
            <Text style={{ fontSize: 18, fontWeight: "bold", textAlign: "center" }}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleZoomOut} style={{ padding: 8 }}>
            <Text style={{ fontSize: 18, fontWeight: "bold", textAlign: "center" }}>−</Text>
          </TouchableOpacity>
        </View>

        {/* 缩放级别显示 */}
        <View
          style={{
            position: "absolute",
            left: 8,
            top: 8,
            backgroundColor: "rgba(255,255,255,0.9)",
            borderRadius: 4,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          <Text style={{ fontSize: 10, color: "#333" }}>缩放: {zoom}</Text>
        </View>

        {/* 操作提示 */}
        <View
          style={{
            position: "absolute",
            bottom: 8,
            left: 8,
            right: 8,
            backgroundColor: "rgba(0,0,0,0.6)",
            borderRadius: 4,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          <Text style={{ fontSize: 10, color: "#fff", textAlign: "center" }}>
            拖动绘制选择区域 | 当前: {bounds.west.toFixed(2)}°E ~ {bounds.east.toFixed(2)}°E, {bounds.south.toFixed(2)}°N ~ {bounds.north.toFixed(2)}°N
          </Text>
        </View>
      </View>

      {/* 手动输入边界坐标 */}
      <View style={{ marginTop: 12 }}>
        <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>
          或手动输入边界坐标：
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <View style={{ flex: 1, minWidth: 140 }}>
            <Text style={{ fontSize: 10, color: colors.muted, marginBottom: 4 }}>北纬</Text>
            <TextInput
              value={bounds.north.toString()}
              onChangeText={(v) => onBoundsChange({ ...bounds, north: parseFloat(v) || 0 })}
              keyboardType="numeric"
              style={{
                backgroundColor: colors.surface,
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 6,
                fontSize: 12,
                color: colors.foreground,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
          </View>
          <View style={{ flex: 1, minWidth: 140 }}>
            <Text style={{ fontSize: 10, color: colors.muted, marginBottom: 4 }}>南纬</Text>
            <TextInput
              value={bounds.south.toString()}
              onChangeText={(v) => onBoundsChange({ ...bounds, south: parseFloat(v) || 0 })}
              keyboardType="numeric"
              style={{
                backgroundColor: colors.surface,
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 6,
                fontSize: 12,
                color: colors.foreground,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
          </View>
          <View style={{ flex: 1, minWidth: 140 }}>
            <Text style={{ fontSize: 10, color: colors.muted, marginBottom: 4 }}>东经</Text>
            <TextInput
              value={bounds.east.toString()}
              onChangeText={(v) => onBoundsChange({ ...bounds, east: parseFloat(v) || 0 })}
              keyboardType="numeric"
              style={{
                backgroundColor: colors.surface,
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 6,
                fontSize: 12,
                color: colors.foreground,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
          </View>
          <View style={{ flex: 1, minWidth: 140 }}>
            <Text style={{ fontSize: 10, color: colors.muted, marginBottom: 4 }}>西经</Text>
            <TextInput
              value={bounds.west.toString()}
              onChangeText={(v) => onBoundsChange({ ...bounds, west: parseFloat(v) || 0 })}
              keyboardType="numeric"
              style={{
                backgroundColor: colors.surface,
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 6,
                fontSize: 12,
                color: colors.foreground,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
