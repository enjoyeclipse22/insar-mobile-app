import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useState, useCallback } from "react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBaseUrl } from "@/constants/oauth";

interface Project {
  id: string;
  name: string;
  location: string;
  status: "created" | "processing" | "completed" | "failed";
  createdAt: string;
  progress: number;
  bounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

const PROJECTS_STORAGE_KEY = "insar_projects";

export default function ProjectsScreen() {
  const router = useRouter();
  const colors = useColors();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 从本地存储和数据库合并加载项目
  const loadProjects = useCallback(async () => {
    try {
      // 从本地存储获取项目
      const stored = await AsyncStorage.getItem(PROJECTS_STORAGE_KEY);
      let localProjects: Project[] = [];
      if (stored) {
        localProjects = JSON.parse(stored);
      }

      // 尝试从数据库获取项目
      let dbProjects: Project[] = [];
      try {
        const apiBase = getApiBaseUrl();
        const response = await fetch(
          `${apiBase}/api/trpc/insar.listProjects?input=${encodeURIComponent(JSON.stringify({ json: {} }))}`
        );
        const data = await response.json();
        
        if (data?.result?.data?.json && Array.isArray(data.result.data.json)) {
          dbProjects = data.result.data.json.map((p: any) => ({
            id: String(p.id),
            name: p.name,
            location: p.location || "",
            status: p.status || "created",
            createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
            progress: p.progress || 0,
          }));
        }
      } catch (err) {
        console.log("Failed to fetch from database, using local storage only");
      }

      // 合并数据库项目和本地项目
      const allProjects: Project[] = [];
      const seenIds = new Set<string>();

      // 首先添加数据库中的项目
      for (const p of dbProjects) {
        allProjects.push(p);
        seenIds.add(`db_${p.id}`);
      }

      // 添加本地项目（避免重复）
      for (const p of localProjects) {
        const localId = String(p.id);
        // 检查是否已经从数据库加载过（通过名称匹配）
        const existsInDb = allProjects.some(
          (dbP) => dbP.name === p.name || String(dbP.id) === localId
        );
        if (!existsInDb && !seenIds.has(localId)) {
          allProjects.push(p);
          seenIds.add(localId);
        }
      }

      // 按创建时间倒序排列
      allProjects.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
      setProjects(allProjects);
    } catch (error) {
      console.error("加载项目失败:", error);
      setProjects([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // 页面聚焦时重新加载项目
  useFocusEffect(
    useCallback(() => {
      loadProjects();
    }, [loadProjects])
  );

  // 下拉刷新
  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadProjects();
  }, [loadProjects]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return colors.success;
      case "processing":
        return colors.primary;
      case "failed":
        return colors.error;
      case "created":
        return colors.warning;
      default:
        return colors.muted;
    }
  };

  const getStatusIcon = (status: string): "check-circle" | "hourglass-empty" | "error" | "schedule" | "help" => {
    switch (status) {
      case "completed":
        return "check-circle";
      case "processing":
        return "hourglass-empty";
      case "failed":
        return "error";
      case "created":
        return "schedule";
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
      case "failed":
        return "失败";
      case "created":
        return "待处理";
      default:
        return "未知";
    }
  };

  // 格式化位置显示
  const formatLocation = (project: Project) => {
    if (project.location) {
      return project.location;
    }
    if (project.bounds) {
      return `${project.bounds.south.toFixed(2)}°N-${project.bounds.north.toFixed(2)}°N, ${project.bounds.west.toFixed(2)}°E-${project.bounds.east.toFixed(2)}°E`;
    }
    return "未指定位置";
  };

  // 格式化日期显示
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
    } catch {
      return dateStr;
    }
  };

  const renderProjectCard = (project: Project) => (
    <TouchableOpacity
      key={project.id}
      onPress={() => router.push(`../project/${project.id}`)}
      style={{
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: getStatusColor(project.status),
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginBottom: 4 }}>
            {project.name}
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 8 }}>
            📍 {formatLocation(project)}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <MaterialIcons name={getStatusIcon(project.status)} size={14} color={getStatusColor(project.status)} />
            <Text style={{ fontSize: 12, color: getStatusColor(project.status) }}>
              {getStatusText(project.status)}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>
            {formatDate(project.createdAt)}
          </Text>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary }}>
            {project.progress}%
          </Text>
        </View>
      </View>
      {project.status === "processing" && (
        <View style={{ marginTop: 12, height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: "hidden" }}>
          <View
            style={{
              height: "100%",
              width: `${project.progress}%`,
              backgroundColor: colors.primary,
              borderRadius: 2,
            }}
          />
        </View>
      )}
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 60 }}>
      <MaterialIcons name="folder-open" size={64} color={colors.muted} />
      <Text style={{ fontSize: 18, fontWeight: "600", color: colors.foreground, marginTop: 16 }}>
        暂无项目
      </Text>
      <Text style={{ fontSize: 14, color: colors.muted, marginTop: 8, textAlign: "center" }}>
        点击右上角的 + 按钮创建新项目
      </Text>
      <TouchableOpacity
        onPress={() => router.push("../create-project")}
        style={{
          marginTop: 24,
          backgroundColor: colors.primary,
          paddingHorizontal: 24,
          paddingVertical: 12,
          borderRadius: 8,
        }}
      >
        <Text style={{ color: "#FFFFFF", fontWeight: "600" }}>创建项目</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScreenContainer>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: colors.primary,
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "600", color: "#FFFFFF" }}>
          项目列表
        </Text>
        <TouchableOpacity onPress={() => router.push("../create-project")} style={{ padding: 8 }}>
          <MaterialIcons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ marginTop: 12, color: colors.muted }}>加载中...</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          refreshControl={
            <RefreshControl 
              refreshing={isRefreshing} 
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
              title="下拉刷新..."
              titleColor={colors.muted}
            />
          }
        >
          {projects.length === 0 ? (
            renderEmptyState()
          ) : (
            projects.map(renderProjectCard)
          )}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}
