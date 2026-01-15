import { ScrollView, Text, View, TouchableOpacity } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

interface ProcessStep {
  name: string;
  status: "completed" | "processing" | "pending" | "failed";
  duration?: string;
  error?: string;
}

export default function ProjectDetailScreen() {
  const router = useRouter();
  const colors = useColors();
  const { id } = useLocalSearchParams();

  const steps: ProcessStep[] = [
    { name: "数据下载", status: "completed", duration: "2h 15m" },
    { name: "轨道下载", status: "completed", duration: "5m" },
    { name: "DEM 下载", status: "completed", duration: "10m" },
    { name: "配准", status: "completed", duration: "1h 30m" },
    { name: "干涉图生成", status: "processing", duration: "45m" },
    { name: "去相干", status: "pending" },
    { name: "相位解缠", status: "pending" },
    { name: "形变反演", status: "pending" },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return colors.success;
      case "processing":
        return colors.primary;
      case "pending":
        return colors.muted;
      case "failed":
        return colors.error;
      default:
        return colors.muted;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return "check-circle";
      case "processing":
        return "schedule";
      case "pending":
        return "radio-button-unchecked";
      case "failed":
        return "error";
      default:
        return "help";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "completed":
        return "已完成";
      case "processing":
        return "处理中";
      case "pending":
        return "等待中";
      case "failed":
        return "失败";
      default:
        return "未知";
    }
  };

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
            项目详情
          </Text>
          <TouchableOpacity>
            <MaterialIcons name="more-vert" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView style={{ flex: 1, paddingHorizontal: 24, paddingVertical: 16 }}>
          {/* Project Info */}
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 16,
              marginBottom: 24,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
              Turkey Earthquake 2023
            </Text>
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, color: colors.muted }}>位置</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                  Central Turkey
                </Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, color: colors.muted }}>创建时间</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                  2024-01-10
                </Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, color: colors.muted }}>总进度</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>
                  62.5%
                </Text>
              </View>
            </View>
          </View>

          {/* Processing Steps */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
              处理流程
            </Text>
            {steps.map((step, index) => (
              <View key={index}>
                <TouchableOpacity
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                    <MaterialIcons
                      name={getStatusIcon(step.status)}
                      size={24}
                      color={getStatusColor(step.status)}
                    />
                    <View>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                        {step.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                        {getStatusText(step.status)}
                        {step.duration && ` • ${step.duration}`}
                      </Text>
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Action Buttons */}
          <View style={{ gap: 12, marginBottom: 24 }}>
            <TouchableOpacity
              onPress={() => router.push(`../processing-monitor?projectId=${id}`)}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <MaterialIcons name="play-circle" size={20} color="#FFFFFF" />
              <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>
                处理监控
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push(`../results-viewer?projectId=${id}`)}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <MaterialIcons name="image" size={20} color={colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.primary }}>
                查看结果
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push(`../comparison-view?projectId=${id}`)}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <MaterialIcons name="compare" size={20} color={colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.primary }}>
                结果对比
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push(`../map-viewer?projectId=${id}`)}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <MaterialIcons name="map" size={20} color={colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.primary }}>
                地图查看
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}
