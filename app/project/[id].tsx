import { ScrollView, Text, View, TouchableOpacity, Alert, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trpc } from "@/lib/trpc";
import { getApiBaseUrl } from "@/constants/oauth";
import { DataAvailabilityCheck } from "@/components/data-availability-check";

interface ProcessStep {
  id: number;
  name: string;
  status: "pending" | "processing" | "completed" | "failed";
  duration?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  progress?: number;
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

// 默认处理步骤 - 与后端 RealInSARProcessor 步骤对应
const DEFAULT_STEPS: ProcessStep[] = [
  { id: 1, name: "数据搜索", status: "pending", progress: 0 },
  { id: 2, name: "数据下载", status: "pending", progress: 0 },
  { id: 3, name: "轨道下载", status: "pending", progress: 0 },
  { id: 4, name: "DEM下载", status: "pending", progress: 0 },
  { id: 5, name: "配准", status: "pending", progress: 0 },
  { id: 6, name: "干涉图生成", status: "pending", progress: 0 },
  { id: 7, name: "相位解缠", status: "pending", progress: 0 },
  { id: 8, name: "形变反演", status: "pending", progress: 0 },
];

// 步骤名称映射 - 后端日志步骤名到前端显示名
const STEP_NAME_MAP: Record<string, number> = {
  "创建工作目录": 0,
  "数据搜索": 1,
  "数据下载": 2,
  "轨道下载": 3,
  "DEM下载": 4,
  "配准": 5,
  "干涉图生成": 6,
  "相位解缠": 7,
  "形变反演": 8,
  "完成": 8,
};

export default function ProjectDetailScreen() {
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams();
  const projectId = params.id as string;
  
  // 调试信息
  console.log("[ProjectDetailScreen] ====== COMPONENT MOUNT ======");
  console.log("[ProjectDetailScreen] Params:", JSON.stringify(params));
  console.log("[ProjectDetailScreen] projectId:", projectId, "type:", typeof projectId);
  
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isStartingProcessing, setIsStartingProcessing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [dataAvailable, setDataAvailable] = useState<boolean | null>(null);
  const [steps, setSteps] = useState<ProcessStep[]>(DEFAULT_STEPS);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [processingLogs, setProcessingLogs] = useState<string[]>([]);
  const [recommendedTimeApplied, setRecommendedTimeApplied] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // tRPC mutations for real InSAR processing
  const startRealProcessingMutation = trpc.realInsar.startProcessing.useMutation();
  const cancelRealProcessingMutation = trpc.realInsar.cancelProcessing.useMutation();

  // 从数据库加载处理步骤和日志
  const loadDatabaseData = useCallback(async () => {
    console.log("[loadDatabaseData] Starting, projectId:", projectId);
    const numericId = parseInt(projectId, 10);
    if (isNaN(numericId)) {
      console.log("[loadDatabaseData] Invalid projectId, returning");
      return;
    }

    try {
      const apiBase = getApiBaseUrl();
      
      // 加载处理步骤
      const stepsResponse = await fetch(
        `${apiBase}/api/trpc/realInsar.getProjectSteps?input=${encodeURIComponent(JSON.stringify({ json: { projectId: numericId } }))}`
      );
      const stepsData = await stepsResponse.json();
      
      if (stepsData?.result?.data?.json?.success && stepsData.result.data.json.steps.length > 0) {
        const dbSteps = stepsData.result.data.json.steps;
        setSteps(dbSteps.map((s: any, idx: number) => ({
          id: s.id,
          name: s.stepName,
          status: s.status,
          progress: s.progress,
          duration: s.duration ? `${s.duration}秒` : undefined,
          error: s.errorMessage,
          startedAt: s.startTime,
          completedAt: s.endTime,
        })));
      }
      
      // 加载处理日志
      const logsResponse = await fetch(
        `${apiBase}/api/trpc/realInsar.getProjectLogs?input=${encodeURIComponent(JSON.stringify({ json: { projectId: numericId, limit: 50 } }))}`
      );
      const logsData = await logsResponse.json();
      
      if (logsData?.result?.data?.json?.success && logsData.result.data.json.logs.length > 0) {
        const dbLogs = logsData.result.data.json.logs;
        // 日志按时间倒序排列，取最新的
        const formattedLogs = dbLogs
          .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 20)
          .reverse()
          .map((log: any) => `[${log.logLevel.toUpperCase()}] ${log.message}`);
        setProcessingLogs(formattedLogs);
      }
    } catch (error) {
      console.error("Failed to load database data:", error);
    }
  }, [projectId]);

  // 从 location 字符串解析 bounds
  const parseBoundsFromLocation = (location: string | undefined): Project["bounds"] | undefined => {
    if (!location) return undefined;
    // 匹配格式: "xxx (28.16°N-32.20°N, 105.29°E-110.19°E)"
    const match = location.match(/\((\d+\.?\d*)°N-(\d+\.?\d*)°N,\s*(\d+\.?\d*)°E-(\d+\.?\d*)°E\)/);
    if (match) {
      return {
        south: parseFloat(match[1]),
        north: parseFloat(match[2]),
        west: parseFloat(match[3]),
        east: parseFloat(match[4]),
      };
    }
    return undefined;
  };

  // 从本地存储和数据库加载项目
  const loadProject = useCallback(async () => {
    console.log("[loadProject] ====== STARTING ======");
    console.log("[loadProject] projectId:", projectId, "type:", typeof projectId);
    
    // 如果 projectId 为空，直接返回
    if (!projectId) {
      console.log("[loadProject] No projectId, returning early");
      setIsLoading(false);
      return;
    }
    
    try {
      let foundProject: Project | null = null;
      
      // 直接从数据库加载
      console.log("[loadProject] Loading from database...");
      const apiBase = getApiBaseUrl();
      console.log("[loadProject] API base:", apiBase);
      
      if (!apiBase) {
        console.log("[loadProject] ERROR: No API base URL!");
        setIsLoading(false);
        return;
      }
      
      const numericId = parseInt(projectId, 10);
      console.log("[loadProject] Numeric ID:", numericId);
      
      if (!isNaN(numericId)) {
        const url = `${apiBase}/api/trpc/insar.getProject?input=${encodeURIComponent(JSON.stringify({ json: { projectId: numericId } }))}`;
        console.log("[loadProject] Fetching from:", url);
        
        const response = await fetch(url);
        console.log("[loadProject] Response status:", response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log("[loadProject] Response data:", JSON.stringify(data).substring(0, 200));
          const dbProject = data?.result?.data?.json;
          
          if (dbProject) {
            // 将数据库项目转换为前端格式
            foundProject = {
              id: dbProject.id,
              name: dbProject.name,
              description: dbProject.description,
              location: dbProject.location,
              startDate: dbProject.startDate,
              endDate: dbProject.endDate,
              satellite: dbProject.satellite,
              orbitDirection: dbProject.orbitDirection,
              polarization: dbProject.polarization,
              status: dbProject.status || "created",
              progress: dbProject.progress || 0,
              createdAt: dbProject.createdAt || new Date().toISOString(),
              bounds: parseBoundsFromLocation(dbProject.location),
            };
            console.log("[loadProject] Parsed project:", foundProject.name);
          }
        } else {
          console.log("[loadProject] Response not ok:", response.status, response.statusText);
        }
      }
      
      if (foundProject) {
        console.log("[loadProject] Found project:", foundProject.name, "status:", foundProject.status);
        setProject(foundProject);
        
        // 如果项目正在处理中，恢复轮询
        if (foundProject.status === "processing") {
          const savedTaskId = await AsyncStorage.getItem(`task_${projectId}`);
          console.log("[loadProject] Project is processing, savedTaskId:", savedTaskId);
          if (savedTaskId) {
            setTaskId(savedTaskId);
            startPolling(savedTaskId);
          }
        }
      } else {
        console.log("[loadProject] Project not found for id:", projectId);
      }
    } catch (error) {
      console.error("[loadProject] Failed to load project:", error);
    } finally {
      console.log("[loadProject] Setting isLoading to false");
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    console.log("[useEffect] Running with projectId:", projectId);
    
    // 立即开始加载，不等待
    const loadProjectData = async (retryCount = 0) => {
      if (!projectId) {
        console.log("[useEffect] No projectId");
        setIsLoading(false);
        return;
      }
      
      const numericId = parseInt(projectId, 10);
      if (isNaN(numericId)) {
        console.log("[useEffect] Invalid numeric ID");
        setIsLoading(false);
        return;
      }
      
      console.log("[useEffect] Loading project ID:", numericId, "retry:", retryCount);
      
      try {
        // 直接使用 getApiBaseUrl，它会在内部处理 window 检查
        const apiBase = getApiBaseUrl();
        
        // 如果没有 API base，尝试从当前页面推断
        let finalApiBase = apiBase;
        if (!finalApiBase && typeof window !== "undefined" && window.location) {
          const { protocol, hostname } = window.location;
          const apiHostname = hostname.replace(/^8081-/, "3000-");
          if (apiHostname !== hostname) {
            finalApiBase = `${protocol}//${apiHostname}`;
          }
        }
        
        if (!finalApiBase) {
          console.log("[useEffect] No API base URL available");
          setIsLoading(false);
          return;
        }
        
        console.log("[useEffect] Using API base:", finalApiBase);
        
        const url = `${finalApiBase}/api/trpc/insar.getProject?input=${encodeURIComponent(JSON.stringify({ json: { projectId: numericId } }))}`;
        
        const response = await fetch(url);
        
        if (response.ok) {
          const data = await response.json();
          const dbProject = data?.result?.data?.json;
          
          if (dbProject) {
            const foundProject: Project = {
              id: dbProject.id,
              name: dbProject.name,
              description: dbProject.description,
              location: dbProject.location,
              startDate: dbProject.startDate,
              endDate: dbProject.endDate,
              satellite: dbProject.satellite,
              orbitDirection: dbProject.orbitDirection,
              polarization: dbProject.polarization,
              status: dbProject.status || "created",
              progress: dbProject.progress || 0,
              createdAt: dbProject.createdAt || new Date().toISOString(),
              bounds: parseBoundsFromLocation(dbProject.location),
            };
            console.log("[useEffect] Loaded project:", foundProject.name);
            setProject(foundProject);
            setIsLoading(false);
            return;
          } else if (retryCount < 3) {
            // 项目未找到，可能数据库写入延迟，重试
            console.log("[useEffect] Project not found, retrying in 500ms...");
            setTimeout(() => loadProjectData(retryCount + 1), 500);
            return;
          }
        } else {
          console.log("[useEffect] API error:", response.status);
          if (retryCount < 3) {
            console.log("[useEffect] Retrying in 500ms...");
            setTimeout(() => loadProjectData(retryCount + 1), 500);
            return;
          }
        }
      } catch (error) {
        console.error("[useEffect] Error:", error);
        if (retryCount < 3) {
          console.log("[useEffect] Retrying in 500ms...");
          setTimeout(() => loadProjectData(retryCount + 1), 500);
          return;
        }
      }
      setIsLoading(false);
    };
    
    loadProjectData(0);
    loadDatabaseData();
    
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // 更新本地存储中的项目状态
  const updateProjectInStorage = async (updates: Partial<Project>) => {
    try {
      const stored = await AsyncStorage.getItem(PROJECTS_STORAGE_KEY);
      if (stored) {
        const projects: Project[] = JSON.parse(stored);
        const index = projects.findIndex(p => p.id.toString() === projectId);
        if (index !== -1) {
          projects[index] = { ...projects[index], ...updates };
          await AsyncStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
          setProject(projects[index]);
        }
      }
    } catch (error) {
      console.error("Failed to update project:", error);
    }
  };

  // 轮询处理状态
  const startPolling = (newTaskId: string) => {
    console.log("[startPolling] Starting polling for taskId:", newTaskId);
    
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    const pollStatus = async () => {
      console.log("[pollStatus] Polling...");
      try {
        // 获取处理状态 - 使用正确的 tRPC 格式
        let apiBase = getApiBaseUrl();
        
        // 如果没有 API base，尝试从当前页面推断
        if (!apiBase && typeof window !== "undefined" && window.location) {
          const { protocol, hostname } = window.location;
          const apiHostname = hostname.replace(/^8081-/, "3000-");
          if (apiHostname !== hostname) {
            apiBase = `${protocol}//${apiHostname}`;
          }
        }
        
        console.log("[pollStatus] API base:", apiBase);
        
        if (!apiBase) {
          console.error("[pollStatus] No API base URL!");
          return;
        }
        
        const statusUrl = `${apiBase}/api/trpc/realInsar.getStatus?input=${encodeURIComponent(JSON.stringify({ json: { taskId: newTaskId } }))}`;
        console.log("[pollStatus] Fetching status from:", statusUrl);
        
        const status = await fetch(statusUrl);
        const statusData = await status.json();
        console.log("[pollStatus] Status response:", JSON.stringify(statusData).substring(0, 200));
        
        if (statusData?.result?.data?.json) {
          const taskStatus = statusData.result.data.json;
          console.log("[pollStatus] Task status:", taskStatus.status, "progress:", taskStatus.progress, "step:", taskStatus.currentStep);
          
          // 更新进度
          await updateProjectInStorage({ progress: taskStatus.progress || 0 });
          setCurrentStep(taskStatus.currentStep || "");
          
          // 更新步骤状态
          const stepIndex = STEP_NAME_MAP[taskStatus.currentStep] || 0;
          setSteps(prev => prev.map((s, idx) => ({
            ...s,
            status: idx < stepIndex ? "completed" : idx === stepIndex ? "processing" : "pending",
            progress: idx < stepIndex ? 100 : idx === stepIndex ? 50 : 0,
          })));
          
          // 检查是否完成或失败
          if (taskStatus.status === "completed") {
            await updateProjectInStorage({ status: "completed", progress: 100 });
            setSteps(prev => prev.map(s => ({ ...s, status: "completed", progress: 100 })));
            await AsyncStorage.removeItem(`task_${projectId}`);
            setTaskId(null);
            setCurrentStep("");
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
            }
            Alert.alert("处理完成", "InSAR 处理已成功完成！您可以查看处理结果。");
          } else if (taskStatus.status === "failed") {
            await updateProjectInStorage({ status: "failed" });
            await AsyncStorage.removeItem(`task_${projectId}`);
            setTaskId(null);
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
            }
            Alert.alert("处理失败", taskStatus.error || "处理过程中发生错误");
          }
        }

        // 获取日志
        const logsUrl = `${apiBase}/api/trpc/realInsar.getLogs?input=${encodeURIComponent(JSON.stringify({ json: { taskId: newTaskId, offset: 0, limit: 50 } }))}`;
        console.log("[pollStatus] Fetching logs from:", logsUrl);
        
        const logs = await fetch(logsUrl);
        const logsData = await logs.json();
        console.log("[pollStatus] Logs response:", JSON.stringify(logsData).substring(0, 200));
        
        if (logsData?.result?.data?.json?.logs) {
          const newLogs = logsData.result.data.json.logs.map((log: any) => 
            `[${log.level}] ${log.step}: ${log.message}`
          );
          console.log("[pollStatus] Setting", newLogs.length, "logs");
          setProcessingLogs(newLogs);
        } else {
          console.log("[pollStatus] No logs in response");
        }
      } catch (error) {
        console.error("[pollStatus] Error:", error);
      }
    };

    // 立即执行一次
    console.log("[startPolling] Executing first poll...");
    pollStatus();
    
    // 每 2 秒轮询一次
    console.log("[startPolling] Setting up interval...");
    pollingRef.current = setInterval(pollStatus, 2000);
  };

  // 刷新数据
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadProject();
    await loadDatabaseData(); // 也刷新数据库数据
    setIsRefreshing(false);
  }, [loadProject, loadDatabaseData]);

  const handleStartProcessing = async () => {
    if (!project) return;
    
    // 解析边界坐标
    let bounds = project.bounds;
    if (!bounds && project.location) {
      // 从 location 字符串解析坐标
      // 格式: "name (N°-N°, E°-E°)"
      const match = project.location.match(/\((\d+\.?\d*)°N-(\d+\.?\d*)°N,\s*(\d+\.?\d*)°E-(\d+\.?\d*)°E\)/);
      if (match) {
        bounds = {
          south: parseFloat(match[1]),
          north: parseFloat(match[2]),
          west: parseFloat(match[3]),
          east: parseFloat(match[4]),
        };
      }
    }
    
    // 默认使用重庆区域
    if (!bounds) {
      bounds = {
        north: 32.20,
        south: 28.16,
        east: 110.19,
        west: 105.29,
      };
    }
    
    Alert.alert(
      "启动真实处理",
      `确定要开始处理项目 "${project.name}" 吗？\n\n` +
      `处理区域: N${bounds.south}°-${bounds.north}°, E${bounds.west}°-${bounds.east}°\n` +
      `时间范围: ${project.startDate || "最近3个月"} 至 ${project.endDate || "今天"}\n` +
      `卫星: ${project.satellite || "Sentinel-1"}\n\n` +
      `注意：这将调用真实的 ASF API 搜索和下载 Sentinel-1 数据。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "开始处理",
          onPress: async () => {
            setIsStartingProcessing(true);
            console.log("[handleStartProcessing] Starting processing for project:", project.name);
            try {
              // 调用真实的后端 API
              console.log("[handleStartProcessing] Calling startRealProcessingMutation with:", {
                projectId: parseInt(projectId),
                projectName: project.name,
                bounds: bounds!,
              });
              
              const result = await startRealProcessingMutation.mutateAsync({
                projectId: parseInt(projectId),
                projectName: project.name,
                bounds: bounds!,
                startDate: project.startDate,
                endDate: project.endDate,
                satellite: project.satellite || "Sentinel-1",
                orbitDirection: project.orbitDirection || "both",
                polarization: project.polarization || "VV+VH",
              });
              
              console.log("[handleStartProcessing] API response:", result);
              
              if (!result || !result.taskId) {
                throw new Error("后端未返回任务 ID");
              }
              
              const newTaskId = result.taskId;
              console.log("[handleStartProcessing] Got taskId:", newTaskId);
              setTaskId(newTaskId);
              
              // 保存任务 ID
              await AsyncStorage.setItem(`task_${projectId}`, newTaskId);
              console.log("[handleStartProcessing] Saved taskId to AsyncStorage");
              
              // 更新项目状态
              await updateProjectInStorage({ status: "processing", progress: 0 });
              console.log("[handleStartProcessing] Updated project status to processing");
              
              // 重置步骤状态
              setSteps(DEFAULT_STEPS.map(s => ({ ...s, status: "pending", progress: 0 })));
              setProcessingLogs([]);
              
              // 显示成功提示
              Alert.alert("处理已启动", `任务 ID: ${newTaskId}\n\n您可以在此页面查看处理进度。`);
              
              // 开始轮询状态
              startPolling(newTaskId);
              
            } catch (error: any) {
              console.error("[handleStartProcessing] Error:", error);
              const errorMessage = error?.message || error?.toString() || "未知错误";
              Alert.alert("启动处理失败", `错误详情: ${errorMessage}\n\n请检查网络连接并重试。`);
              await updateProjectInStorage({ status: "created", progress: 0 });
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
      "中止处理",
      "确定要中止当前处理任务吗？已完成的步骤数据将被保留。",
      [
        { text: "否", style: "cancel" },
        {
          text: "是，中止",
          style: "destructive",
          onPress: async () => {
            setIsCancelling(true);
            try {
              // 调用后端取消 API
              if (taskId) {
                await cancelRealProcessingMutation.mutateAsync({ taskId });
              }
              
              // 清理轮询
              if (pollingRef.current) {
                clearInterval(pollingRef.current);
              }
              
              // 清除任务 ID
              await AsyncStorage.removeItem(`task_${projectId}`);
              setTaskId(null);
              
              // 更新项目状态
              await updateProjectInStorage({ status: "created", progress: 0 });
              
              // 重置步骤状态
              setSteps(DEFAULT_STEPS);
              setCurrentStep("");
              setProcessingLogs([]);
              
              Alert.alert("已中止", "处理任务已中止，您可以重新开始处理。");
            } catch (error) {
              Alert.alert("错误", `中止处理失败: ${error}`);
            } finally {
              setIsCancelling(false);
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
      case "failed":
        return colors.error;
      default:
        return colors.muted;
    }
  };

  console.log("[Render] isLoading:", isLoading, "project:", project?.name, "projectId:", projectId);
  
  if (isLoading) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-muted mt-4">加载中... (ID: {projectId || "undefined"})</Text>
      </ScreenContainer>
    );
  }

  if (!project) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center p-6">
        <MaterialIcons name="error-outline" size={64} color={colors.muted} />
        <Text className="text-foreground text-xl font-semibold mt-4">项目不存在</Text>
        <Text className="text-muted text-center mt-2">无法找到指定的项目 (ID: {projectId})</Text>
        <View className="flex-row gap-4 mt-6">
          <TouchableOpacity
            className="px-6 py-3 rounded-xl"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            onPress={() => {
              setIsLoading(true);
              loadProject();
            }}
          >
            <Text className="text-foreground font-semibold">重试</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="px-6 py-3 rounded-xl"
            style={{ backgroundColor: colors.primary }}
            onPress={() => router.back()}
          >
            <Text className="text-white font-semibold">返回</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* Header */}
      <View 
        className="flex-row items-center justify-between px-4 py-3"
        style={{ backgroundColor: colors.primary }}
      >
        <TouchableOpacity 
          onPress={() => router.back()}
          className="p-2"
        >
          <MaterialIcons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-semibold flex-1 text-center" numberOfLines={1}>
          {project.name}
        </Text>
        <TouchableOpacity 
          className="p-2"
          onPress={() => {
            Alert.alert(
              "项目选项",
              "",
              [
                { 
                  text: "编辑项目", 
                  onPress: () => router.push(`/project/edit/${projectId}`) 
                },
                { 
                  text: "查看日志", 
                  onPress: () => router.push(`/processing-monitor?projectId=${projectId}&taskId=${taskId || ""}`) 
                },
                { 
                  text: "查看结果", 
                  onPress: () => router.push(`/results-viewer?projectId=${projectId}`) 
                },
                { 
                  text: "删除项目", 
                  style: "destructive",
                  onPress: () => {
                    Alert.alert(
                      "确认删除",
                      "确定要删除这个项目吗？此操作不可撤销。",
                      [
                        { text: "取消", style: "cancel" },
                        { 
                          text: "删除", 
                          style: "destructive",
                          onPress: async () => {
                            try {
                              // 从数据库删除
                              const numericId = parseInt(projectId, 10);
                              if (!isNaN(numericId)) {
                                const apiBase = getApiBaseUrl();
                                await fetch(`${apiBase}/api/trpc/insar.deleteProject`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ json: { projectId: numericId } }),
                                });
                              }
                              // 从本地存储删除
                              const stored = await AsyncStorage.getItem(PROJECTS_STORAGE_KEY);
                              if (stored) {
                                const projects = JSON.parse(stored);
                                const filtered = projects.filter((p: any) => p.id.toString() !== projectId);
                                await AsyncStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(filtered));
                              }
                              Alert.alert("已删除", "项目已成功删除");
                              router.back();
                            } catch (error) {
                              Alert.alert("错误", "删除失败，请重试");
                            }
                          }
                        },
                      ]
                    );
                  }
                },
                { text: "取消", style: "cancel" },
              ]
            );
          }}
        >
          <MaterialIcons name="more-vert" size={24} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
      >
        {/* Project Info Card */}
        <View className="m-4 p-4 rounded-xl bg-surface border border-border">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-foreground text-lg font-semibold">项目信息</Text>
            <View 
              className="px-3 py-1 rounded-full"
              style={{ backgroundColor: getProjectStatusColor(project.status) + "20" }}
            >
              <Text style={{ color: getProjectStatusColor(project.status) }} className="text-sm font-medium">
                {getStatusText(project.status)}
              </Text>
            </View>
          </View>
          
          {/* Progress Bar */}
          {project.status === "processing" && (
            <View className="mb-4">
              <View className="flex-row justify-between mb-1">
                <Text className="text-muted text-sm">总体进度</Text>
                <Text className="text-primary text-sm font-medium">{project.progress}%</Text>
              </View>
              <View className="h-2 bg-border rounded-full overflow-hidden">
                <View 
                  className="h-full rounded-full"
                  style={{ 
                    width: `${project.progress}%`,
                    backgroundColor: colors.primary,
                  }}
                />
              </View>
              {currentStep && (
                <Text className="text-muted text-xs mt-1">当前步骤: {currentStep}</Text>
              )}
            </View>
          )}
          
          <View className="space-y-2">
            <View className="flex-row">
              <Text className="text-muted w-20">区域:</Text>
              <Text className="text-foreground flex-1">{project.location || "未设置"}</Text>
            </View>
            <View className="flex-row mt-2">
              <Text className="text-muted w-20">时间:</Text>
              <Text className="text-foreground flex-1">
                {project.startDate && project.endDate 
                  ? `${project.startDate} 至 ${project.endDate}`
                  : "未设置"}
              </Text>
            </View>
            <View className="flex-row mt-2">
              <Text className="text-muted w-20">卫星:</Text>
              <Text className="text-foreground flex-1">{project.satellite || "Sentinel-1"}</Text>
            </View>
            <View className="flex-row mt-2">
              <Text className="text-muted w-20">轨道:</Text>
              <Text className="text-foreground flex-1">
                {project.orbitDirection === "ascending" ? "升轨" : 
                 project.orbitDirection === "descending" ? "降轨" : "全部"}
              </Text>
            </View>
          </View>
        </View>

        {/* Data Availability Check */}
        {project.status !== "processing" && project.status !== "completed" && project.bounds && (
          <View className="mx-4 mb-4">
            <Text className="text-foreground text-lg font-semibold mb-3">数据可用性检查</Text>
            <DataAvailabilityCheck
              bounds={project.bounds}
              startDate={project.startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}
              endDate={project.endDate || new Date().toISOString().split("T")[0]}
              satellite={project.satellite || "Sentinel-1"}
              orbitDirection={project.orbitDirection || "both"}
              onResult={(result) => setDataAvailable(result.available)}
              onApplyRecommendedRange={async (start, end) => {
                // 应用推荐的时间范围
                await updateProjectInStorage({
                  startDate: start,
                  endDate: end,
                });
                setRecommendedTimeApplied(true);
                Alert.alert(
                  "已应用推荐时间范围",
                  `时间范围已更新为:\n${start} 至 ${end}`,
                  [{ text: "确定" }]
                );
              }}
              autoCheck={true}
            />
            {recommendedTimeApplied && (
              <View className="mt-2 p-3 rounded-lg bg-success/10 border border-success/20">
                <View className="flex-row items-center gap-2">
                  <MaterialIcons name="check-circle" size={16} color={colors.success} />
                  <Text className="text-success text-sm font-medium">已应用推荐时间范围</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Processing Steps */}
        <View className="mx-4 mb-4">
          <Text className="text-foreground text-lg font-semibold mb-3">处理流程</Text>
          
          {steps.map((step, index) => (
            <TouchableOpacity
              key={step.id}
              className="flex-row items-center p-4 mb-2 rounded-xl bg-surface border border-border"
              onPress={() => {
                if (step.status === "completed" || step.status === "processing") {
                  router.push(`/processing-monitor?projectId=${projectId}&taskId=${taskId || ""}&step=${step.name}`);
                }
              }}
            >
              <MaterialIcons 
                name={getStatusIcon(step.status)} 
                size={24} 
                color={getStatusColor(step.status)} 
              />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">{step.name}</Text>
                <Text className="text-muted text-sm">{getStatusText(step.status)}</Text>
              </View>
              {step.status === "processing" && (
                <ActivityIndicator size="small" color={colors.primary} />
              )}
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Logs */}
        {processingLogs.length > 0 && (
          <View className="mx-4 mb-4">
            <Text className="text-foreground text-lg font-semibold mb-3">最近日志</Text>
            <View className="p-3 rounded-xl bg-surface border border-border">
              {processingLogs.slice(-5).map((log, index) => (
                <Text key={index} className="text-muted text-xs mb-1" numberOfLines={2}>
                  {log}
                </Text>
              ))}
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <View className="mx-4 mb-6 space-y-3">
          {project.status !== "processing" && (
            <TouchableOpacity
              className="py-4 rounded-xl items-center"
              style={{ 
                backgroundColor: dataAvailable === false ? colors.warning : colors.primary,
                opacity: isStartingProcessing ? 0.7 : 1
              }}
              onPress={handleStartProcessing}
              disabled={isStartingProcessing}
            >
              {isStartingProcessing ? (
                <ActivityIndicator color="white" />
              ) : (
                <View className="flex-row items-center">
                  <MaterialIcons 
                    name={dataAvailable === false ? "warning" : "play-arrow"} 
                    size={24} 
                    color="white" 
                  />
                  <Text className="text-white font-semibold ml-2">
                    {dataAvailable === false ? "数据不足，仍可尝试" : "开始处理"}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            className="py-4 rounded-xl items-center"
            style={{ backgroundColor: colors.success }}
            onPress={() => router.push(`/processing-monitor?projectId=${projectId}&taskId=${taskId || ""}`)}
          >
            <View className="flex-row items-center">
              <MaterialIcons name="terminal" size={24} color="white" />
              <Text className="text-white font-semibold ml-2">处理监控</Text>
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity
            className="py-4 rounded-xl items-center border-2"
            style={{ borderColor: colors.primary }}
            onPress={() => router.push(`/results-viewer?projectId=${projectId}`)}
          >
            <View className="flex-row items-center">
              <MaterialIcons name="map" size={24} color={colors.primary} />
              <Text style={{ color: colors.primary }} className="font-semibold ml-2">地图查看</Text>
            </View>
          </TouchableOpacity>
          
          {project.status === "processing" && (
            <TouchableOpacity
              className="py-4 rounded-xl items-center mt-3"
              style={{ backgroundColor: colors.error }}
              onPress={handleCancelProcessing}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <ActivityIndicator color="white" />
              ) : (
                <View className="flex-row items-center">
                  <MaterialIcons name="stop" size={24} color="white" />
                  <Text className="text-white font-semibold ml-2">中止处理</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
