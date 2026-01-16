import {
  ScrollView,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trpc } from "@/lib/trpc";
import { getApiBaseUrl } from "@/constants/oauth";

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

const SATELLITES = [
  { value: "Sentinel-1", label: "Sentinel-1" },
  { value: "Sentinel-1A", label: "Sentinel-1A" },
  { value: "Sentinel-1B", label: "Sentinel-1B" },
];

const ORBIT_DIRECTIONS = [
  { value: "ascending", label: "升轨" },
  { value: "descending", label: "降轨" },
  { value: "both", label: "全部" },
];

const POLARIZATIONS = [
  { value: "VV", label: "VV" },
  { value: "VH", label: "VH" },
  { value: "VV+VH", label: "VV+VH" },
];

export default function EditProjectScreen() {
  const router = useRouter();
  const colors = useColors();
  const { id } = useLocalSearchParams();
  const projectId = id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [project, setProject] = useState<Project | null>(null);

  // 表单状态
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [satellite, setSatellite] = useState("Sentinel-1");
  const [orbitDirection, setOrbitDirection] = useState("ascending");
  const [polarization, setPolarization] = useState("VV+VH");

  // 加载项目数据
  const loadProject = useCallback(async () => {
    try {
      // 先尝试从数据库加载
      const apiBase = getApiBaseUrl();
      const numericId = parseInt(projectId, 10);
      
      if (!isNaN(numericId)) {
        try {
          const response = await fetch(
            `${apiBase}/api/trpc/insar.getProject?input=${encodeURIComponent(JSON.stringify({ json: { projectId: numericId } }))}`
          );
          const data = await response.json();
          
          if (data?.result?.data?.json) {
            const dbProject = data.result.data.json;
            setProject(dbProject);
            setName(dbProject.name || "");
            setDescription(dbProject.description || "");
            setStartDate(dbProject.startDate || "");
            setEndDate(dbProject.endDate || "");
            setSatellite(dbProject.satellite || "Sentinel-1");
            setOrbitDirection(dbProject.orbitDirection || "ascending");
            setPolarization(dbProject.polarization || "VV+VH");
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.log("Failed to load from database, trying local storage");
        }
      }

      // 从本地存储加载
      const stored = await AsyncStorage.getItem(PROJECTS_STORAGE_KEY);
      if (stored) {
        const projects: Project[] = JSON.parse(stored);
        const found = projects.find((p) => p.id.toString() === projectId);
        if (found) {
          setProject(found);
          setName(found.name || "");
          setDescription(found.description || "");
          setStartDate(found.startDate || "");
          setEndDate(found.endDate || "");
          setSatellite(found.satellite || "Sentinel-1");
          setOrbitDirection(found.orbitDirection || "ascending");
          setPolarization(found.polarization || "VV+VH");
        }
      }
    } catch (error) {
      console.error("Failed to load project:", error);
      Alert.alert("错误", "加载项目失败");
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // 保存项目
  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("错误", "项目名称不能为空");
      return;
    }

    setIsSaving(true);

    try {
      const numericId = parseInt(projectId, 10);
      const apiBase = getApiBaseUrl();

      // 更新数据库
      if (!isNaN(numericId)) {
        try {
          const updateData = {
            projectId: numericId,
            name: name.trim(),
            description: description.trim() || undefined,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            satellite: satellite,
            orbitDirection: orbitDirection as "ascending" | "descending",
            polarization: polarization,
          };

          const response = await fetch(`${apiBase}/api/trpc/insar.updateProject`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ json: updateData }),
          });

          if (!response.ok) {
            console.log("Database update failed, updating local storage only");
          }
        } catch (err) {
          console.log("Database update error:", err);
        }
      }

      // 更新本地存储
      const stored = await AsyncStorage.getItem(PROJECTS_STORAGE_KEY);
      if (stored) {
        const projects: Project[] = JSON.parse(stored);
        const index = projects.findIndex((p) => p.id.toString() === projectId);
        if (index !== -1) {
          projects[index] = {
            ...projects[index],
            name: name.trim(),
            description: description.trim(),
            startDate,
            endDate,
            satellite,
            orbitDirection,
            polarization,
          };
          await AsyncStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
        }
      }

      Alert.alert("成功", "项目已更新", [
        {
          text: "确定",
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      console.error("Failed to save project:", error);
      Alert.alert("错误", "保存失败，请重试");
    } finally {
      setIsSaving(false);
    }
  };

  // 选择器组件
  const renderSelector = (
    label: string,
    options: { value: string; label: string }[],
    selectedValue: string,
    onSelect: (value: string) => void
  ) => (
    <View className="mb-4">
      <Text className="text-foreground font-medium mb-2">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => (
          <TouchableOpacity
            key={option.value}
            onPress={() => onSelect(option.value)}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 8,
              backgroundColor:
                selectedValue === option.value ? colors.primary : colors.surface,
              borderWidth: 1,
              borderColor:
                selectedValue === option.value ? colors.primary : colors.border,
            }}
          >
            <Text
              style={{
                color:
                  selectedValue === option.value ? "#FFFFFF" : colors.foreground,
                fontWeight: selectedValue === option.value ? "600" : "400",
              }}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-muted mt-4">加载中...</Text>
      </ScreenContainer>
    );
  }

  if (!project) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center p-6">
        <MaterialIcons name="error-outline" size={64} color={colors.muted} />
        <Text className="text-foreground text-xl font-semibold mt-4">项目不存在</Text>
        <TouchableOpacity
          className="mt-6 px-6 py-3 rounded-xl"
          style={{ backgroundColor: colors.primary }}
          onPress={() => router.back()}
        >
          <Text className="text-white font-semibold">返回</Text>
        </TouchableOpacity>
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
        <TouchableOpacity onPress={() => router.back()} className="p-2">
          <MaterialIcons name="close" size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-semibold">编辑项目</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={isSaving}
          className="p-2"
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <MaterialIcons name="check" size={24} color="white" />
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView className="flex-1 p-4">
          {/* 项目名称 */}
          <View className="mb-4">
            <Text className="text-foreground font-medium mb-2">项目名称 *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="输入项目名称"
              placeholderTextColor={colors.muted}
              className="p-4 rounded-xl border"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.foreground,
              }}
            />
          </View>

          {/* 项目描述 */}
          <View className="mb-4">
            <Text className="text-foreground font-medium mb-2">项目描述</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="输入项目描述（可选）"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              className="p-4 rounded-xl border"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.foreground,
                minHeight: 80,
                textAlignVertical: "top",
              }}
            />
          </View>

          {/* 时间范围 */}
          <View className="mb-4">
            <Text className="text-foreground font-medium mb-2">时间范围</Text>
            <View className="flex-row gap-4">
              <View className="flex-1">
                <Text className="text-muted text-sm mb-1">开始日期</Text>
                <TextInput
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.muted}
                  className="p-3 rounded-lg border"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    color: colors.foreground,
                  }}
                />
              </View>
              <View className="flex-1">
                <Text className="text-muted text-sm mb-1">结束日期</Text>
                <TextInput
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.muted}
                  className="p-3 rounded-lg border"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    color: colors.foreground,
                  }}
                />
              </View>
            </View>
          </View>

          {/* 卫星选择 */}
          {renderSelector("卫星", SATELLITES, satellite, setSatellite)}

          {/* 轨道方向 */}
          {renderSelector("轨道方向", ORBIT_DIRECTIONS, orbitDirection, setOrbitDirection)}

          {/* 极化方式 */}
          {renderSelector("极化方式", POLARIZATIONS, polarization, setPolarization)}

          {/* 保存按钮 */}
          <TouchableOpacity
            onPress={handleSave}
            disabled={isSaving}
            className="mt-6 mb-8 py-4 rounded-xl items-center"
            style={{
              backgroundColor: colors.primary,
              opacity: isSaving ? 0.7 : 1,
            }}
          >
            {isSaving ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold text-lg">保存更改</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
