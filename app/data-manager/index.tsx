import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from "react-native-reanimated";

// 下载状态类型
type DownloadStatus = "pending" | "downloading" | "paused" | "completed" | "failed";

// 下载项接口
interface DownloadItem {
  file_id: string;
  filename: string;
  total_size: number;
  downloaded_size: number;
  progress_percent: number;
  speed: number;
  speed_formatted: string;
  eta: number;
  eta_formatted: string;
  status: DownloadStatus;
  error_message?: string;
}

// 缓存文件接口
interface CachedFile {
  path: string;
  filename: string;
  size: number;
  size_formatted: string;
  added_at: string;
  metadata: Record<string, any>;
}

// 缓存信息接口
interface CacheInfo {
  total_files: number;
  total_size: number;
  total_size_formatted: string;
  files: CachedFile[];
}

// 模拟数据
const mockDownloads: DownloadItem[] = [
  {
    file_id: "dl001",
    filename: "S1A_IW_SLC__1SDV_20230206T034512.zip",
    total_size: 4500000000,
    downloaded_size: 2250000000,
    progress_percent: 50,
    speed: 5242880,
    speed_formatted: "5.0 MB/s",
    eta: 450,
    eta_formatted: "7m 30s",
    status: "downloading",
  },
  {
    file_id: "dl002",
    filename: "S1A_IW_SLC__1SDV_20230218T034512.zip",
    total_size: 4200000000,
    downloaded_size: 0,
    progress_percent: 0,
    speed: 0,
    speed_formatted: "0 B/s",
    eta: 0,
    eta_formatted: "--",
    status: "pending",
  },
];

const mockCacheInfo: CacheInfo = {
  total_files: 3,
  total_size: 12500000000,
  total_size_formatted: "11.64 GB",
  files: [
    {
      path: "/data/sentinel1/S1A_IW_SLC__1SDV_20230201T034512.zip",
      filename: "S1A_IW_SLC__1SDV_20230201T034512.zip",
      size: 4500000000,
      size_formatted: "4.19 GB",
      added_at: "2024-01-10T10:30:00Z",
      metadata: { platform: "Sentinel-1A", beam_mode: "IW" },
    },
    {
      path: "/data/sentinel1/S1A_IW_SLC__1SDV_20230213T034512.zip",
      filename: "S1A_IW_SLC__1SDV_20230213T034512.zip",
      size: 4200000000,
      size_formatted: "3.91 GB",
      added_at: "2024-01-10T14:20:00Z",
      metadata: { platform: "Sentinel-1A", beam_mode: "IW" },
    },
    {
      path: "/data/dem/srtm_turkey.tif",
      filename: "srtm_turkey.tif",
      size: 3800000000,
      size_formatted: "3.54 GB",
      added_at: "2024-01-09T09:15:00Z",
      metadata: { type: "DEM", source: "SRTM" },
    },
  ],
};

// 进度条组件
function ProgressBar({
  progress,
  status,
  colors,
}: {
  progress: number;
  status: DownloadStatus;
  colors: ReturnType<typeof useColors>;
}) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(progress, { duration: 300 });
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  const getProgressColor = () => {
    switch (status) {
      case "completed":
        return colors.success;
      case "failed":
        return colors.error;
      case "paused":
        return colors.warning;
      default:
        return colors.primary;
    }
  };

  return (
    <View
      style={{
        height: 6,
        backgroundColor: colors.border,
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={[
          {
            height: "100%",
            backgroundColor: getProgressColor(),
            borderRadius: 3,
          },
          animatedStyle,
        ]}
      />
    </View>
  );
}

// 下载项组件
function DownloadItemCard({
  item,
  onPause,
  onResume,
  onCancel,
  colors,
}: {
  item: DownloadItem;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const getStatusIcon = () => {
    switch (item.status) {
      case "completed":
        return "check-circle";
      case "failed":
        return "error";
      case "paused":
        return "pause-circle-filled";
      case "downloading":
        return "downloading";
      default:
        return "schedule";
    }
  };

  const getStatusColor = () => {
    switch (item.status) {
      case "completed":
        return colors.success;
      case "failed":
        return colors.error;
      case "paused":
        return colors.warning;
      default:
        return colors.primary;
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } else {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
  };

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <MaterialIcons
          name={getStatusIcon() as any}
          size={24}
          color={getStatusColor()}
        />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: colors.foreground,
            }}
            numberOfLines={1}
          >
            {item.filename}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
            {formatSize(item.downloaded_size)} / {formatSize(item.total_size)}
          </Text>
        </View>
      </View>

      {/* Progress */}
      <ProgressBar
        progress={item.progress_percent}
        status={item.status}
        colors={colors}
      />

      {/* Stats */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 8,
        }}
      >
        <Text style={{ fontSize: 12, color: colors.muted }}>
          {item.progress_percent.toFixed(1)}%
        </Text>
        {item.status === "downloading" && (
          <>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              {item.speed_formatted}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              剩余 {item.eta_formatted}
            </Text>
          </>
        )}
        {item.status === "failed" && (
          <Text style={{ fontSize: 12, color: colors.error }}>
            {item.error_message || "下载失败"}
          </Text>
        )}
      </View>

      {/* Actions */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          marginTop: 12,
          gap: 8,
        }}
      >
        {item.status === "downloading" && (
          <TouchableOpacity
            onPress={onPause}
            style={{
              backgroundColor: colors.warning,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 6,
            }}
          >
            <Text style={{ fontSize: 12, color: "#FFFFFF", fontWeight: "600" }}>
              暂停
            </Text>
          </TouchableOpacity>
        )}
        {item.status === "paused" && (
          <TouchableOpacity
            onPress={onResume}
            style={{
              backgroundColor: colors.primary,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 6,
            }}
          >
            <Text style={{ fontSize: 12, color: "#FFFFFF", fontWeight: "600" }}>
              继续
            </Text>
          </TouchableOpacity>
        )}
        {(item.status === "downloading" || item.status === "paused" || item.status === "pending") && (
          <TouchableOpacity
            onPress={onCancel}
            style={{
              backgroundColor: colors.error,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 6,
            }}
          >
            <Text style={{ fontSize: 12, color: "#FFFFFF", fontWeight: "600" }}>
              取消
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// 缓存文件卡片组件
function CachedFileCard({
  file,
  onDelete,
  colors,
}: {
  file: CachedFile;
  onDelete: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getFileIcon = () => {
    if (file.filename.endsWith(".zip")) return "folder-zip";
    if (file.filename.endsWith(".tif") || file.filename.endsWith(".tiff"))
      return "image";
    return "insert-drive-file";
  };

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 8,
          backgroundColor: colors.primary + "20",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialIcons
          name={getFileIcon() as any}
          size={24}
          color={colors.primary}
        />
      </View>

      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: colors.foreground,
          }}
          numberOfLines={1}
        >
          {file.filename}
        </Text>
        <View style={{ flexDirection: "row", marginTop: 4, gap: 12 }}>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {file.size_formatted}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {formatDate(file.added_at)}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={onDelete}
        style={{
          padding: 8,
        }}
      >
        <MaterialIcons name="delete" size={20} color={colors.error} />
      </TouchableOpacity>
    </View>
  );
}

// 存储统计组件
function StorageStats({
  cacheInfo,
  colors,
}: {
  cacheInfo: CacheInfo;
  colors: ReturnType<typeof useColors>;
}) {
  // 假设总存储空间为 50GB
  const totalStorage = 50 * 1024 * 1024 * 1024;
  const usedPercent = (cacheInfo.total_size / totalStorage) * 100;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>
          存储空间
        </Text>
        <Text style={{ fontSize: 14, color: colors.muted }}>
          {cacheInfo.total_size_formatted} / 50 GB
        </Text>
      </View>

      <View
        style={{
          height: 8,
          backgroundColor: colors.border,
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${Math.min(usedPercent, 100)}%`,
            height: "100%",
            backgroundColor:
              usedPercent > 80
                ? colors.error
                : usedPercent > 60
                ? colors.warning
                : colors.primary,
            borderRadius: 4,
          }}
        />
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 12,
        }}
      >
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 24, fontWeight: "700", color: colors.foreground }}>
            {cacheInfo.total_files}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>文件数</Text>
        </View>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 24, fontWeight: "700", color: colors.foreground }}>
            {cacheInfo.total_size_formatted}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>已使用</Text>
        </View>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 24, fontWeight: "700", color: colors.foreground }}>
            {usedPercent.toFixed(1)}%
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>使用率</Text>
        </View>
      </View>
    </View>
  );
}

export default function DataManagerScreen() {
  const router = useRouter();
  const colors = useColors();

  const [activeTab, setActiveTab] = useState<"downloads" | "cache">("downloads");
  const [downloads, setDownloads] = useState<DownloadItem[]>(mockDownloads);
  const [cacheInfo, setCacheInfo] = useState<CacheInfo>(mockCacheInfo);
  const [refreshing, setRefreshing] = useState(false);

  // 模拟下载进度更新
  useEffect(() => {
    const interval = setInterval(() => {
      setDownloads((prev) =>
        prev.map((item) => {
          if (item.status === "downloading") {
            const newDownloaded = Math.min(
              item.downloaded_size + 5242880, // 5MB/s
              item.total_size
            );
            const newProgress = (newDownloaded / item.total_size) * 100;
            const remaining = item.total_size - newDownloaded;
            const eta = Math.ceil(remaining / 5242880);

            return {
              ...item,
              downloaded_size: newDownloaded,
              progress_percent: newProgress,
              eta,
              eta_formatted:
                eta < 60
                  ? `${eta}s`
                  : eta < 3600
                  ? `${Math.floor(eta / 60)}m ${eta % 60}s`
                  : `${Math.floor(eta / 3600)}h ${Math.floor((eta % 3600) / 60)}m`,
              status: newProgress >= 100 ? "completed" : "downloading",
            };
          }
          return item;
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // 模拟刷新
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);

  const handlePause = (fileId: string) => {
    setDownloads((prev) =>
      prev.map((item) =>
        item.file_id === fileId ? { ...item, status: "paused" } : item
      )
    );
  };

  const handleResume = (fileId: string) => {
    setDownloads((prev) =>
      prev.map((item) =>
        item.file_id === fileId ? { ...item, status: "downloading" } : item
      )
    );
  };

  const handleCancel = (fileId: string) => {
    Alert.alert("取消下载", "确定要取消此下载吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "确定",
        style: "destructive",
        onPress: () => {
          setDownloads((prev) => prev.filter((item) => item.file_id !== fileId));
        },
      },
    ]);
  };

  const handleDeleteFile = (filename: string) => {
    Alert.alert("删除文件", `确定要删除 ${filename} 吗？`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => {
          setCacheInfo((prev) => ({
            ...prev,
            total_files: prev.total_files - 1,
            files: prev.files.filter((f) => f.filename !== filename),
            total_size:
              prev.total_size -
              (prev.files.find((f) => f.filename === filename)?.size || 0),
            total_size_formatted: "更新中...",
          }));
        },
      },
    ]);
  };

  const handleClearCache = () => {
    Alert.alert("清空缓存", "确定要删除所有缓存文件吗？此操作不可撤销。", [
      { text: "取消", style: "cancel" },
      {
        text: "清空",
        style: "destructive",
        onPress: () => {
          setCacheInfo({
            total_files: 0,
            total_size: 0,
            total_size_formatted: "0 B",
            files: [],
          });
        },
      },
    ]);
  };

  return (
    <ScreenContainer className="p-0">
      <View style={{ backgroundColor: colors.background, flex: 1 }}>
        {/* Header */}
        <View
          style={{
            backgroundColor: colors.primary,
            paddingHorizontal: 16,
            paddingVertical: 12,
            paddingTop: 8,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#FFFFFF" }}>
            数据管理
          </Text>
          <TouchableOpacity onPress={handleClearCache}>
            <MaterialIcons name="delete-sweep" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View
          style={{
            flexDirection: "row",
            backgroundColor: colors.surface,
            padding: 4,
            margin: 16,
            borderRadius: 12,
          }}
        >
          <TouchableOpacity
            onPress={() => setActiveTab("downloads")}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 8,
              backgroundColor:
                activeTab === "downloads" ? colors.primary : "transparent",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: activeTab === "downloads" ? "#FFFFFF" : colors.muted,
              }}
            >
              下载中
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("cache")}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 8,
              backgroundColor:
                activeTab === "cache" ? colors.primary : "transparent",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: activeTab === "cache" ? "#FFFFFF" : colors.muted,
              }}
            >
              已缓存
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView
          style={{ flex: 1, paddingHorizontal: 16 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {activeTab === "downloads" ? (
            <>
              {downloads.length === 0 ? (
                <View
                  style={{
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 60,
                  }}
                >
                  <MaterialIcons
                    name="cloud-download"
                    size={64}
                    color={colors.muted}
                  />
                  <Text
                    style={{
                      fontSize: 16,
                      color: colors.muted,
                      marginTop: 16,
                    }}
                  >
                    暂无下载任务
                  </Text>
                </View>
              ) : (
                downloads.map((item) => (
                  <DownloadItemCard
                    key={item.file_id}
                    item={item}
                    onPause={() => handlePause(item.file_id)}
                    onResume={() => handleResume(item.file_id)}
                    onCancel={() => handleCancel(item.file_id)}
                    colors={colors}
                  />
                ))
              )}
            </>
          ) : (
            <>
              <StorageStats cacheInfo={cacheInfo} colors={colors} />

              {cacheInfo.files.length === 0 ? (
                <View
                  style={{
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 60,
                  }}
                >
                  <MaterialIcons
                    name="folder-open"
                    size={64}
                    color={colors.muted}
                  />
                  <Text
                    style={{
                      fontSize: 16,
                      color: colors.muted,
                      marginTop: 16,
                    }}
                  >
                    暂无缓存文件
                  </Text>
                </View>
              ) : (
                cacheInfo.files.map((file, index) => (
                  <CachedFileCard
                    key={index}
                    file={file}
                    onDelete={() => handleDeleteFile(file.filename)}
                    colors={colors}
                  />
                ))
              )}
            </>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}
