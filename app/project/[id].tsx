import { ScrollView, Text, View, TouchableOpacity, Alert, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { trpc } from "@/lib/trpc";
import { useState, useEffect, useCallback } from "react";

interface ProcessStep {
  id: number;
  name: string;
  status: "pending" | "processing" | "completed" | "failed";
  duration?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

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
  const projectId = parseInt(id as string, 10);
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isStartingProcessing, setIsStartingProcessing] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);

  // 获取项目详情
  const { data: project, isLoading: projectLoading, refetch: refetchProject } = trpc.insar.getProject.useQuery(
    { projectId },
    { enabled: !isNaN(projectId) }
  );

  // 获取处理步骤
  const { data: stepsData, refetch: refetchSteps } = trpc.insar.getSteps.useQuery(
    { projectId },
    { enabled: !isNaN(projectId) }
  );

  // 获取处理日志
  const { data: logsData, refetch: refetchLogs } = trpc.insar.getLogs.useQuery(
    { projectId, limit: 10 },
    { enabled: !isNaN(projectId) }
  );

  // 获取任务状态
  const { data: taskStatus } = trpc.insar.getTaskStatus.useQuery(
    { taskId: taskId || "" },
    { 
      enabled: !!taskId,
      refetchInterval: taskId ? 2000 : false, // 每2秒刷新一次
    }
  );

  // 启动处理
  const startProcessingMutation = trpc.insar.startProcessing.useMutation({
    onSuccess: (data) => {
      setIsStartingProcessing(false);
      setTaskId(data.taskId);
      Alert.alert("成功", "处理任务已启动");
      refetchProject();
      refetchSteps();
    },
    onError: (error) => {
      setIsStartingProcessing(false);
      Alert.alert("错误", `启动处理失败: ${error.message}`);
    },
  });

  // 取消处理
  const cancelProcessingMutation = trpc.insar.cancelProcessing.useMutation({
    onSuccess: () => {
      setTaskId(null);
      Alert.alert("成功", "处理已取消");
      refetchProject();
      refetchSteps();
    },
    onError: (error) => {
      Alert.alert("错误", `取消处理失败: ${error.message}`);
    },
  });

  // 合并数据库步骤和默认步骤
  const steps: ProcessStep[] = stepsData?.length 
    ? stepsData.map((s: any) => ({
        id: s.id,
        name: s.stepName,
        status: s.status,
        duration: s.duration ? `${Math.round(s.duration / 60)}m` : undefined,
        error: s.errorMessage,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
      }))
    : DEFAULT_STEPS;

  // 刷新数据
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([refetchProject(), refetchSteps(), refetchLogs()]);
    setIsRefreshing(false);
  }, [refetchProject, refetchSteps, refetchLogs]);

  // 监听任务状态变化
  useEffect(() => {
    if (taskStatus && !("error" in taskStatus)) {
      if (taskStatus.status === "completed" || taskStatus.status === "failed") {
        setTaskId(null);
        refetchProject();
        refetchSteps();
      }
    }
  }, [taskStatus, refetchProject, refetchSteps]);

  const handleStartProcessing = () => {
    if (!project) return;
    
    Alert.alert(
      "启动处理",
      "确定要开始 InSAR 处理吗？这可能需要较长时间。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "开始",
          onPress: () => {
            setIsStartingProcessing(true);
            startProcessingMutation.mutate({
              projectId,
              startDate: project.startDate || "2023-02-01",
              endDate: project.endDate || "2023-02-15",
              satellite: project.satellite || "S1A",
              orbitDirection: (project.orbitDirection as "ascending" | "descending") || "ascending",
              polarization: project.polarization || "VV",
              coherenceThreshold: 0.4,
              outputResolution: 30,
            });
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
          onPress: () => cancelProcessingMutation.mutate({ projectId }),
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

  if (projectLoading) {
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

  const isProcessing = project.status === "processing" || !!taskId;
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
                  {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : "未知"}
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
                      backgroundColor: getProjectStatusColor(project.status || "created"),
                    }}
                  />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: getProjectStatusColor(project.status || "created") }}>
                    {project.status === "completed" ? "已完成" : 
                     project.status === "processing" ? "处理中" : 
                     project.status === "failed" ? "失败" : "待处理"}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, color: colors.muted }}>总进度</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>
                  {project.progress || 0}%
                </Text>
              </View>
            </View>
            
            {/* 进度条 */}
            <View style={{ marginTop: 12 }}>
              <View
                style={{
                  height: 6,
                  backgroundColor: colors.border,
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    height: "100%",
                    width: `${project.progress || 0}%`,
                    backgroundColor: colors.primary,
                    borderRadius: 3,
                  }}
                />
              </View>
            </View>
          </View>

          {/* Processing Steps */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
              处理流程
            </Text>
            {steps.map((step, index) => (
              <View key={step.id || index}>
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
                    {step.status === "processing" ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <MaterialIcons
                        name={getStatusIcon(step.status)}
                        size={24}
                        color={getStatusColor(step.status)}
                      />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                        {step.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                        {getStatusText(step.status)}
                        {step.duration && ` • ${step.duration}`}
                      </Text>
                      {step.error && (
                        <Text style={{ fontSize: 11, color: colors.error, marginTop: 2 }}>
                          错误: {step.error}
                        </Text>
                      )}
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Recent Logs */}
          {logsData && logsData.length > 0 && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
                最近日志
              </Text>
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 12,
                  maxHeight: 150,
                }}
              >
                {logsData.slice(0, 5).map((log: any, index: number) => (
                  <View key={log.id || index} style={{ marginBottom: 8 }}>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </Text>
                    <Text 
                      style={{ 
                        fontSize: 12, 
                        color: log.logLevel === "error" ? colors.error : 
                               log.logLevel === "warning" ? colors.warning : colors.foreground 
                      }}
                    >
                      {log.message}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View style={{ gap: 12, marginBottom: 24 }}>
            {/* 启动/取消处理按钮 */}
            {canStartProcessing && (
              <TouchableOpacity
                onPress={handleStartProcessing}
                disabled={isStartingProcessing}
                style={{
                  backgroundColor: colors.success,
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                  opacity: isStartingProcessing ? 0.7 : 1,
                }}
              >
                {isStartingProcessing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <MaterialIcons name="play-arrow" size={20} color="#FFFFFF" />
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
                  paddingVertical: 12,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <MaterialIcons name="stop" size={20} color="#FFFFFF" />
                <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>
                  取消处理
                </Text>
              </TouchableOpacity>
            )}

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
              <MaterialIcons name="monitor" size={20} color="#FFFFFF" />
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
