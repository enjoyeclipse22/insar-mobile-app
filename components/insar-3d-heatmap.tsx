/**
 * InSAR 3D 热力图组件
 * 
 * 使用 WebView + Plotly.js 实现类似土耳其地震干涉图的 3D 可视化效果
 * 支持：
 * - 3D 地形表面渲染
 * - 干涉图/形变图颜色叠加
 * - 交互式旋转和缩放
 * - 多种颜色映射（彩虹、jet、coolwarm 等）
 */

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Dimensions,
} from "react-native";
import { WebView } from "react-native-webview";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// 数据类型定义
export interface HeatmapData {
  // 经纬度范围
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  // 数据网格（二维数组）
  values: number[][];
  // 高程数据（可选，用于 3D 地形）
  elevation?: number[][];
  // 数据类型
  type: "interferogram" | "deformation" | "coherence" | "dem";
  // 统计信息
  statistics: {
    min: number;
    max: number;
    mean: number;
    unit: string;
  };
  // 项目名称
  projectName?: string;
}

// 颜色映射类型
export type ColorScale = "jet" | "rainbow" | "coolwarm" | "viridis" | "turbo" | "hsv";

// 组件属性
interface InSAR3DHeatmapProps {
  data: HeatmapData;
  colorScale?: ColorScale;
  showColorbar?: boolean;
  title?: string;
  height?: number;
  onPointClick?: (lon: number, lat: number, value: number) => void;
}

// 生成 Plotly HTML
function generatePlotlyHTML(
  data: HeatmapData,
  colorScale: ColorScale,
  showColorbar: boolean,
  title: string
): string {
  const { bounds, values, elevation, type, statistics } = data;
  
  // 生成经纬度网格
  const rows = values.length;
  const cols = values[0]?.length || 0;
  
  const lonStep = (bounds.east - bounds.west) / (cols - 1);
  const latStep = (bounds.north - bounds.south) / (rows - 1);
  
  // 生成 x, y 坐标数组
  const x = Array.from({ length: cols }, (_, i) => bounds.west + i * lonStep);
  const y = Array.from({ length: rows }, (_, i) => bounds.south + i * latStep);
  
  // 使用高程数据或值数据作为 z 轴
  const z = elevation || values;
  
  // 颜色数据
  const surfacecolor = values;
  
  // 颜色映射配置
  const colorscaleMap: Record<ColorScale, string | [number, string][]> = {
    jet: [
      [0, "rgb(0,0,131)"],
      [0.125, "rgb(0,60,170)"],
      [0.25, "rgb(5,255,255)"],
      [0.375, "rgb(255,255,0)"],
      [0.5, "rgb(250,190,0)"],
      [0.625, "rgb(255,95,0)"],
      [0.75, "rgb(255,0,0)"],
      [0.875, "rgb(170,0,0)"],
      [1, "rgb(128,0,0)"],
    ],
    rainbow: [
      [0, "rgb(150,0,90)"],
      [0.125, "rgb(0,0,200)"],
      [0.25, "rgb(0,25,255)"],
      [0.375, "rgb(0,152,255)"],
      [0.5, "rgb(44,255,150)"],
      [0.625, "rgb(151,255,0)"],
      [0.75, "rgb(255,234,0)"],
      [0.875, "rgb(255,111,0)"],
      [1, "rgb(255,0,0)"],
    ],
    coolwarm: [
      [0, "rgb(59,76,192)"],
      [0.25, "rgb(124,159,249)"],
      [0.5, "rgb(247,247,247)"],
      [0.75, "rgb(249,134,124)"],
      [1, "rgb(180,4,38)"],
    ],
    viridis: "Viridis",
    turbo: "Turbo",
    hsv: "HSV",
  };
  
  const plotlyColorscale = colorscaleMap[colorScale];
  
  // 生成 HTML
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { 
      width: 100%; 
      height: 100%; 
      overflow: hidden;
      background: #1a1a2e;
    }
    #plot { 
      width: 100%; 
      height: 100%;
    }
    .loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
  </style>
</head>
<body>
  <div id="plot"></div>
  <div class="loading" id="loading">加载中...</div>
  <script>
    // 数据
    const x = ${JSON.stringify(x)};
    const y = ${JSON.stringify(y)};
    const z = ${JSON.stringify(z)};
    const surfacecolor = ${JSON.stringify(surfacecolor)};
    
    // 3D 表面图配置
    const data = [{
      type: 'surface',
      x: x,
      y: y,
      z: z,
      surfacecolor: surfacecolor,
      colorscale: ${JSON.stringify(plotlyColorscale)},
      showscale: ${showColorbar},
      colorbar: {
        title: {
          text: '${statistics.unit}',
          font: { color: 'white', size: 12 }
        },
        tickfont: { color: 'white', size: 10 },
        len: 0.6,
        thickness: 15,
        x: 1.02,
      },
      contours: {
        z: {
          show: true,
          usecolormap: true,
          highlightcolor: "#42f462",
          project: { z: false }
        }
      },
      lighting: {
        ambient: 0.6,
        diffuse: 0.8,
        specular: 0.3,
        roughness: 0.5,
        fresnel: 0.2
      },
      lightposition: {
        x: 1000,
        y: 1000,
        z: 1000
      },
      hovertemplate: 
        '经度: %{x:.4f}°<br>' +
        '纬度: %{y:.4f}°<br>' +
        '值: %{surfacecolor:.2f} ${statistics.unit}<extra></extra>'
    }];
    
    // 布局配置
    const layout = {
      title: {
        text: '${title}',
        font: { color: 'white', size: 16 },
        y: 0.95
      },
      paper_bgcolor: '#1a1a2e',
      plot_bgcolor: '#1a1a2e',
      scene: {
        xaxis: {
          title: { text: '经度 (°)', font: { color: 'white', size: 11 } },
          tickfont: { color: 'white', size: 9 },
          gridcolor: 'rgba(255,255,255,0.1)',
          zerolinecolor: 'rgba(255,255,255,0.2)',
          showbackground: true,
          backgroundcolor: '#16213e'
        },
        yaxis: {
          title: { text: '纬度 (°)', font: { color: 'white', size: 11 } },
          tickfont: { color: 'white', size: 9 },
          gridcolor: 'rgba(255,255,255,0.1)',
          zerolinecolor: 'rgba(255,255,255,0.2)',
          showbackground: true,
          backgroundcolor: '#16213e'
        },
        zaxis: {
          title: { text: '${type === "dem" ? "高程 (m)" : statistics.unit}', font: { color: 'white', size: 11 } },
          tickfont: { color: 'white', size: 9 },
          gridcolor: 'rgba(255,255,255,0.1)',
          zerolinecolor: 'rgba(255,255,255,0.2)',
          showbackground: true,
          backgroundcolor: '#16213e'
        },
        camera: {
          eye: { x: 1.5, y: 1.5, z: 1.2 },
          center: { x: 0, y: 0, z: -0.1 }
        },
        aspectratio: { x: 1.2, y: 1, z: 0.5 }
      },
      margin: { l: 0, r: 0, t: 40, b: 0 },
      autosize: true
    };
    
    // 配置选项
    const config = {
      responsive: true,
      displayModeBar: true,
      modeBarButtonsToRemove: ['toImage', 'sendDataToCloud'],
      displaylogo: false,
      scrollZoom: true
    };
    
    // 渲染图表
    Plotly.newPlot('plot', data, layout, config).then(() => {
      document.getElementById('loading').style.display = 'none';
      
      // 点击事件
      document.getElementById('plot').on('plotly_click', function(data) {
        if (data.points && data.points.length > 0) {
          const point = data.points[0];
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'click',
            lon: point.x,
            lat: point.y,
            value: point.surfacecolor
          }));
        }
      });
    });
    
    // 窗口大小变化时重新布局
    window.addEventListener('resize', () => {
      Plotly.Plots.resize('plot');
    });
  </script>
</body>
</html>
`;
}

// 生成模拟数据（用于演示）
export function generateSampleHeatmapData(
  bounds: HeatmapData["bounds"],
  type: HeatmapData["type"] = "interferogram",
  resolution: number = 50
): HeatmapData {
  const rows = resolution;
  const cols = resolution;
  
  const values: number[][] = [];
  const elevation: number[][] = [];
  
  const centerLon = (bounds.east + bounds.west) / 2;
  const centerLat = (bounds.north + bounds.south) / 2;
  
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  
  for (let i = 0; i < rows; i++) {
    const rowValues: number[] = [];
    const rowElevation: number[] = [];
    
    const lat = bounds.south + (i / (rows - 1)) * (bounds.north - bounds.south);
    
    for (let j = 0; j < cols; j++) {
      const lon = bounds.west + (j / (cols - 1)) * (bounds.east - bounds.west);
      
      // 计算到中心的距离
      const dx = lon - centerLon;
      const dy = lat - centerLat;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      let value: number;
      let elev: number;
      
      if (type === "interferogram") {
        // 模拟干涉条纹（同心圆）
        value = Math.sin(dist * 50) * Math.PI;
        // 添加一些噪声
        value += (Math.random() - 0.5) * 0.5;
      } else if (type === "deformation") {
        // 模拟形变（高斯分布）
        value = 30 * Math.exp(-dist * dist * 100);
        // 添加一些负值区域
        if (dx > 0.02) {
          value -= 10 * Math.exp(-(dist - 0.03) * (dist - 0.03) * 200);
        }
      } else if (type === "coherence") {
        // 模拟相干性（中心高，边缘低）
        value = 0.9 * Math.exp(-dist * dist * 50) + 0.1;
        value = Math.min(1, Math.max(0, value + (Math.random() - 0.5) * 0.1));
      } else {
        // DEM
        value = 500 + 1000 * Math.exp(-dist * dist * 30);
      }
      
      // 模拟高程（用于 3D 效果）
      elev = 500 + 1500 * Math.exp(-dist * dist * 20);
      // 添加一些地形变化
      elev += 200 * Math.sin(lon * 30) * Math.cos(lat * 30);
      
      rowValues.push(value);
      rowElevation.push(elev);
      
      min = Math.min(min, value);
      max = Math.max(max, value);
      sum += value;
    }
    
    values.push(rowValues);
    elevation.push(rowElevation);
  }
  
  const mean = sum / (rows * cols);
  
  // 根据类型设置单位
  const units: Record<HeatmapData["type"], string> = {
    interferogram: "rad",
    deformation: "mm",
    coherence: "",
    dem: "m",
  };
  
  return {
    bounds,
    values,
    elevation,
    type,
    statistics: {
      min,
      max,
      mean,
      unit: units[type],
    },
  };
}

// 主组件
export function InSAR3DHeatmap({
  data,
  colorScale = "jet",
  showColorbar = true,
  title = "InSAR 3D 可视化",
  height = 400,
  onPointClick,
}: InSAR3DHeatmapProps) {
  const colors = useColors();
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentColorScale, setCurrentColorScale] = useState<ColorScale>(colorScale);
  
  // 生成 HTML
  const html = generatePlotlyHTML(data, currentColorScale, showColorbar, title);
  
  // 处理 WebView 消息
  const handleMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === "click" && onPointClick) {
        onPointClick(message.lon, message.lat, message.value);
      }
    } catch (e) {
      console.error("Failed to parse WebView message:", e);
    }
  };
  
  // 颜色映射选项
  const colorScaleOptions: { value: ColorScale; label: string }[] = [
    { value: "jet", label: "Jet" },
    { value: "rainbow", label: "彩虹" },
    { value: "coolwarm", label: "冷暖" },
    { value: "viridis", label: "Viridis" },
    { value: "turbo", label: "Turbo" },
  ];
  
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 12, overflow: "hidden" }}>
      {/* 标题栏 */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <MaterialIcons name="3d-rotation" size={20} color={colors.primary} />
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
            3D 热力图
          </Text>
        </View>
        
        {/* 颜色映射选择器 */}
        <View style={{ flexDirection: "row", gap: 4 }}>
          {colorScaleOptions.slice(0, 3).map((option) => (
            <TouchableOpacity
              key={option.value}
              onPress={() => setCurrentColorScale(option.value)}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 4,
                backgroundColor:
                  currentColorScale === option.value ? colors.primary : colors.background,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  color: currentColorScale === option.value ? "#FFF" : colors.muted,
                }}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      
      {/* WebView 容器 */}
      <View style={{ height, backgroundColor: "#1a1a2e" }}>
        {Platform.OS === "web" ? (
          // Web 平台使用 iframe
          <iframe
            srcDoc={html}
            style={{ width: "100%", height: "100%", border: "none" }}
            title="InSAR 3D Heatmap"
          />
        ) : (
          // 移动端使用 WebView
          <WebView
            ref={webViewRef}
            source={{ html }}
            style={{ flex: 1, backgroundColor: "transparent" }}
            onLoad={() => setIsLoading(false)}
            onError={(e: { nativeEvent: { description: string } }) => setError(e.nativeEvent.description)}
            onMessage={handleMessage}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            bounces={false}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          />
        )}
        
        {/* 加载指示器 */}
        {isLoading && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#1a1a2e",
            }}
          >
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.muted, marginTop: 8, fontSize: 12 }}>
              加载 3D 可视化...
            </Text>
          </View>
        )}
        
        {/* 错误提示 */}
        {error && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#1a1a2e",
              padding: 20,
            }}
          >
            <MaterialIcons name="error-outline" size={40} color={colors.error} />
            <Text style={{ color: colors.error, marginTop: 8, textAlign: "center" }}>
              加载失败: {error}
            </Text>
          </View>
        )}
      </View>
      
      {/* 统计信息 */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-around",
          padding: 12,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 10, color: colors.muted }}>最小值</Text>
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.foreground }}>
            {data.statistics.min.toFixed(2)} {data.statistics.unit}
          </Text>
        </View>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 10, color: colors.muted }}>平均值</Text>
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.foreground }}>
            {data.statistics.mean.toFixed(2)} {data.statistics.unit}
          </Text>
        </View>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 10, color: colors.muted }}>最大值</Text>
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.foreground }}>
            {data.statistics.max.toFixed(2)} {data.statistics.unit}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default InSAR3DHeatmap;
