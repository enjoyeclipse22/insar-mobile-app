import { ScrollView, Text, View, TouchableOpacity, Alert, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface ProcessStep {
  id: number;
  name: string;
  status: "pending" | "processing" | "completed" | "failed";
  duration?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

interface Project {
  id: number;
  name: string;
  description?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  satellite?: string;
  orbitDirection?: string;
  polarization?: string;
  status: string;
  progress: number;
  createdAt: string;
  bounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

const PROJECTS_STORAGE_KEY = "insar_projects";

// 默认处理步骤
const DEFAULT_STEPS: ProcessStep[] = [
  { id: 1, name: "数据下载", status: "pending" },
  { id: 2, name: "轨道下载", status: "pending" },
  { id: 3, name: "DEM 下载", status: "pending" },
  { id: 4, name: "配准", status: "pending" },
  { id: 5, name: "干涉图生成", status: "pending" },
  { id: 6, name: "去相干", status: "pending" },
  { id: 7, name: "相位解缠", status: "pending" },
  { id: 8, name: "形变反演", status: "pending" },
];

export default function ProjectDetailScreen() {
  const router = useRouter();
  const colors = useColors();
  const { id } = useLocalSearchParams();
  const projectId = id as string;
  
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isStartingProcessing, setIsStartingProcessing] = useState(false);
  const [steps, setSteps] = useState<ProcessStep[]>(DEFAULT_STEPS);

  // 从本地存储加载项目
  const loadProject = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(PROJECTS_STORAGE_KEY);
      if (stored) {
        const projects: Project[] = JSON.parse(stored);
        const found = projects.find(p => p.id.toString() === projectId);
        if (found) {
          setProject(found);
        }
      }
    } catch (error) {
      console.error("Failed to load project:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // 刷新数据
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadProject();
    setIsRefreshing(false);
  }, [loadProject]);

  const handleStartProcessing = () => {
    if (!project) return;
    
    Alert.alert(
      "启动处理",
      "确定要开始 InSAR 处理吗？这可能需要较长时间。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "开始",
          onPress: async () => {
            setIsStartingProcessing(true);
            // 模拟处理启动
            try {
              const stored = await AsyncStorage.getItem(PROJECTS_STORAGE_KEY);
              if (stored) {
                const projects: Project[] = JSON.parse(stored);
                const index = projects.findIndex(p => p.id.toString() === projectId);
                if (index !== -1) {
                  projects[index].status = "processing";
                  projects[index].progress = 0;
                  await AsyncStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
                  setProject(projects[index]);
                  
                  // 模拟处理步骤
                  const newSteps = [...DEFAULT_STEPS];
                  newSteps[0].status = "processing";
                  setSteps(newSteps);
                }
              }
              Alert.alert("成功", "处理任务已启动");
            } catch (error) {
              Alert.alert("错误", `启动处理失败: ${error}`);
            } finally {
              setIsStartingProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleCancelProcessing = () => {
    Alert.alert(
      "取消处理",
      "确定要取消当前处理任务吗？",
      [
        { text: "否", style: "cancel" },
        {
          text: "是",
          style: "destructive",
          onPress: async () => {
            try {
              const stored = await AsyncStorage.getItem(PROJECTS_STORAGE_KEY);
              if (stored) {
                const projects: Project[] = JSON.parse(stored);
                const index = projects.findIndex(p => p.id.toString() === projectId);
                if (index !== -1) {
                  projects[index].status = "created";
                  projects[index].progress = 0;
                  await AsyncStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
                  setProject(projects[index]);
                  setSteps(DEFAULT_STEPS);
                }
              }
              Alert.alert("成功", "处理已取消");
            } catch (error) {
              Alert.alert("错误", `取消处理失败: ${error}`);
            }
          },
        },
      ]
    );
  };

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

  const getStatusIcon = (status: string): "check-circle" | "schedule" | "radio-button-unchecked" | "error" | "help" => {
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
      case "created":
        return "待处理";
      default:
        return "未知";
    }
  };

  const getProjectStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return colors.success;
      case "processing":
        return colors.primary;
      case "created":
        return colors.muted;
      case "failed":
        return colors.error;
      default:
        return colors.muted;
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "未设置";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("zh-CN");
    } catch {
      return dateString;
    }
  };

  if (isLoading) {
    return (
      <ScreenContainer className="p-0">
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ marginTop: 16, color: colors.muted }}>加载中...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!project) {
    return (
      <ScreenContainer className="p-0">
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
          <MaterialIcons name="error-outline" size={48} color={colors.error} />
          <Text style={{ marginTop: 16, color: colors.foreground, fontSize: 18, fontWeight: "600" }}>
            项目不存在
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              marginTop: 24,
              paddingHorizontal: 24,
              paddingVertical: 12,
              backgroundColor: colors.primary,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "600" }}>返回</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const isProcessing = project.status === "processing";
  const canStartProcessing = project.status === "created" || project.status === "failed";

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
        <ScrollView 
          style={{ flex: 1, paddingHorizontal: 24, paddingVertical: 16 }}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          }
        >
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
              {project.name}
            </Text>
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, color: colors.muted }}>位置</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, flex: 1, textAlign: "right" }} numberOfLines={2}>
                  {project.location || "未设置"}
                </Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, color: colors.muted }}>创建时间</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                  {formatDate(project.createdAt)}
                </Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, color: colors.muted }}>状态</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: getProjectStatusColor(project.status),
                    }}
                  />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: getProjectStatusColor(project.status) }}>
                    {getStatusText(project.status)}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, color: colors.muted }}>总进度</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>
                  {project.progress}%
                </Text>
              </View>
            </View>
          </View>

          {/* Processing Steps */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
              处理流程
            </Text>
            <View style={{ gap: 8 }}>
              {steps.map((step, index) => (
                <TouchableOpacity
                  key={step.id}
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 8,
                    padding: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <MaterialIcons
                      name={getStatusIcon(step.status)}
                      size={20}
                      color={getStatusColor(step.status)}
                    />
                    <View>
                      <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>
                        {step.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.muted }}>
                        {getStatusText(step.status)}
                      </Text>
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Action Buttons */}
          <View style={{ gap: 12, marginBottom: 24 }}>
            {canStartProcessing && (
              <TouchableOpacity
                onPress={handleStartProcessing}
                disabled={isStartingProcessing}
                style={{
                  backgroundColor: colors.success,
                  borderRadius: 12,
                  padding: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  opacity: isStartingProcessing ? 0.7 : 1,
                }}
              >
                {isStartingProcessing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <MaterialIcons name="play-arrow" size={24} color="#FFFFFF" />
                )}
                <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>
                  {isStartingProcessing ? "启动中..." : "开始处理"}
                </Text>
              </TouchableOpacity>
            )}

            {isProcessing && (
              <TouchableOpacity
                onPress={handleCancelProcessing}
                style={{
                  backgroundColor: colors.error,
                  borderRadius: 12,
                  padding: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <MaterialIcons name="stop" size={24} color="#FFFFFF" />
                <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>
                  取消处理
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => router.push(`/processing-monitor?projectId=${projectId}`)}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 12,
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <MaterialIcons name="monitor" size={24} color="#FFFFFF" />
              <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>
                处理监控
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push({ pathname: "/results", params: { projectId } } as any)}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <MaterialIcons name="image" size={24} color={colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.primary }}>
                查看结果
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push({ pathname: "/compare", params: { projectId } } as any)}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <MaterialIcons name="compare" size={24} color={colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.primary }}>
                结果对比
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push({ pathname: "/map-view", params: { projectId } } as any)}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <MaterialIcons name="map" size={24} color={colors.primary} />
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
