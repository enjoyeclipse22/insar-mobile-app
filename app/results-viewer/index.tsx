import { ScrollView, Text, View, TouchableOpacity, FlatList, Dimensions } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";

interface ProcessingResult {
  id: number;
  resultType: "interferogram" | "coherence" | "deformation" | "dem" | "unwrapped_phase" | "los_displacement";
  fileName: string;
  fileSize: number;
  format: string;
  minValue?: string;
  maxValue?: string;
  meanValue?: string;
  createdAt: string;
}

export default function ResultsViewerScreen() {
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams();
  const projectId = params.projectId as string;

  const [selectedResult, setSelectedResult] = useState<ProcessingResult | null>(null);
  const [colorScale, setColorScale] = useState<"viridis" | "jet" | "gray">("viridis");

  const results: ProcessingResult[] = [
    {
      id: 1,
      resultType: "interferogram",
      fileName: "interferogram.tif",
      fileSize: 45000000,
      format: "GeoTIFF",
      minValue: "-π",
      maxValue: "π",
      createdAt: "2024-01-13 10:30:00",
    },
    {
      id: 2,
      resultType: "coherence",
      fileName: "coherence.tif",
      fileSize: 22500000,
      format: "GeoTIFF",
      minValue: "0.0",
      maxValue: "1.0",
      createdAt: "2024-01-13 10:35:00",
    },
    {
      id: 3,
      resultType: "unwrapped_phase",
      fileName: "unwrapped_phase.tif",
      fileSize: 45000000,
      format: "GeoTIFF",
      minValue: "-150",
      maxValue: "150",
      createdAt: "2024-01-13 10:40:00",
    },
    {
      id: 4,
      resultType: "los_displacement",
      fileName: "los_displacement.tif",
      fileSize: 45000000,
      format: "GeoTIFF",
      minValue: "-45.2 mm",
      maxValue: "38.7 mm",
      meanValue: "-2.1 mm",
      createdAt: "2024-01-13 10:45:00",
    },
  ];

  const getResultLabel = (type: string) => {
    const labels: Record<string, string> = {
      interferogram: "干涉图",
      coherence: "相干图",
      deformation: "形变图",
      dem: "DEM",
      unwrapped_phase: "解缠相位",
      los_displacement: "LOS 位移",
    };
    return labels[type] || type;
  };

  const getResultIcon = (type: string) => {
    switch (type) {
      case "interferogram":
        return "image";
      case "coherence":
        return "blur-on";
      case "deformation":
        return "trending-up";
      case "dem":
        return "terrain";
      case "unwrapped_phase":
        return "waves";
      case "los_displacement":
        return "arrow-forward";
      default:
        return "image";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const renderResult = (result: ProcessingResult) => (
    <TouchableOpacity
      key={result.id}
      onPress={() => setSelectedResult(result)}
      style={{
        marginBottom: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: selectedResult?.id === result.id ? colors.primary : colors.surface,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: selectedResult?.id === result.id ? colors.primary : colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <MaterialIcons
          name={getResultIcon(result.resultType)}
          size={20}
          color={selectedResult?.id === result.id ? "#FFFFFF" : colors.primary}
        />
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: selectedResult?.id === result.id ? "#FFFFFF" : colors.foreground,
            marginLeft: 8,
            flex: 1,
          }}
        >
          {getResultLabel(result.resultType)}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: selectedResult?.id === result.id ? "#FFFFFF" : colors.muted,
          }}
        >
          {formatFileSize(result.fileSize)}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 12,
          color: selectedResult?.id === result.id ? "#FFFFFF" : colors.muted,
        }}
      >
        {result.fileName} • {result.format}
      </Text>
    </TouchableOpacity>
  );

  return (
    <ScreenContainer className="p-0">
      <View style={{ backgroundColor: colors.background, flex: 1 }}>
        {/* Header */}
        <View
          style={{
            backgroundColor: colors.primary,
            paddingHorizontal: 24,
            paddingVertical: 16,
            paddingTop: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: "700", color: "#FFFFFF" }}>
            结果展示
          </Text>
          <TouchableOpacity>
            <MaterialIcons name="download" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }}>
          {/* Visualization Area */}
          {selectedResult ? (
            <View style={{ paddingHorizontal: 24, paddingVertical: 16 }}>
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  overflow: "hidden",
                  height: 300,
                  marginBottom: 16,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                {/* Placeholder for image rendering */}
                <View
                  style={{
                    width: "100%",
                    height: "100%",
                    backgroundColor: colors.border,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <MaterialIcons name={getResultIcon(selectedResult.resultType)} size={64} color={colors.muted} />
                  <Text style={{ fontSize: 14, color: colors.muted, marginTop: 12 }}>
                    {getResultLabel(selectedResult.resultType)} 预览
                  </Text>
                </View>
              </View>

              {/* Result Details */}
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  marginBottom: 16,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 12 }}>
                  结果信息
                </Text>

                <View style={{ marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, color: colors.muted }}>文件名</Text>
                  <Text style={{ fontSize: 13, color: colors.foreground, marginTop: 2 }}>
                    {selectedResult.fileName}
                  </Text>
                </View>

                <View style={{ marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, color: colors.muted }}>格式</Text>
                  <Text style={{ fontSize: 13, color: colors.foreground, marginTop: 2 }}>
                    {selectedResult.format}
                  </Text>
                </View>

                <View style={{ marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, color: colors.muted }}>文件大小</Text>
                  <Text style={{ fontSize: 13, color: colors.foreground, marginTop: 2 }}>
                    {formatFileSize(selectedResult.fileSize)}
                  </Text>
                </View>

                {selectedResult.minValue && (
                  <View style={{ marginBottom: 8 }}>
                    <Text style={{ fontSize: 12, color: colors.muted }}>最小值</Text>
                    <Text style={{ fontSize: 13, color: colors.foreground, marginTop: 2 }}>
                      {selectedResult.minValue}
                    </Text>
                  </View>
                )}

                {selectedResult.maxValue && (
                  <View style={{ marginBottom: 8 }}>
                    <Text style={{ fontSize: 12, color: colors.muted }}>最大值</Text>
                    <Text style={{ fontSize: 13, color: colors.foreground, marginTop: 2 }}>
                      {selectedResult.maxValue}
                    </Text>
                  </View>
                )}

                {selectedResult.meanValue && (
                  <View>
                    <Text style={{ fontSize: 12, color: colors.muted }}>平均值</Text>
                    <Text style={{ fontSize: 13, color: colors.foreground, marginTop: 2 }}>
                      {selectedResult.meanValue}
                    </Text>
                  </View>
                )}
              </View>

              {/* Color Scale Selection */}
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  marginBottom: 16,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 12 }}>
                  颜色方案
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(["viridis", "jet", "gray"] as const).map((scale) => (
                    <TouchableOpacity
                      key={scale}
                      onPress={() => setColorScale(scale)}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        backgroundColor: colorScale === scale ? colors.primary : colors.border,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: colorScale === scale ? "#FFFFFF" : colors.foreground,
                          textTransform: "capitalize",
                        }}
                      >
                        {scale}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Download Button */}
              <TouchableOpacity
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: "center",
                  marginBottom: 24,
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <MaterialIcons name="download" size={20} color="#FFFFFF" />
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#FFFFFF" }}>
                  下载结果
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 24, paddingVertical: 16 }}>
              <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center" }}>
                请选择一个结果进行查看
              </Text>
            </View>
          )}

          {/* Results List */}
          <View style={{ paddingHorizontal: 24, paddingVertical: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 12 }}>
              处理结果
            </Text>
            {results.map(renderResult)}
          </View>
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}
