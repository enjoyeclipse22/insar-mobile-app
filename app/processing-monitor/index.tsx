import { ScrollView, Text, View, TouchableOpacity, FlatList, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState, useEffect } from "react";

interface ProcessingStep {
  id: number;
  stepName: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  duration?: number;
  errorMessage?: string;
}

interface ProcessingLog {
  id: number;
  logLevel: "debug" | "info" | "warning" | "error";
  message: string;
  timestamp: string;
}

export default function ProcessingMonitorScreen() {
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams();
  const projectId = params.projectId as string;

  const [isProcessing, setIsProcessing] = useState(true);
  const [progress, setProgress] = useState(0);
  const [steps, setSteps] = useState<ProcessingStep[]>([
    { id: 1, stepName: "data_download", status: "completed", progress: 100, duration: 45 },
    { id: 2, stepName: "coregistration", status: "completed", progress: 100, duration: 67 },
    { id: 3, stepName: "interferogram_generation", status: "processing", progress: 65 },
    { id: 4, stepName: "phase_unwrapping", status: "pending", progress: 0 },
    { id: 5, stepName: "deformation_inversion", status: "pending", progress: 0 },
  ]);

  const [logs, setLogs] = useState<ProcessingLog[]>([
    {
      id: 1,
      logLevel: "info",
      message: "Starting data_download...",
      timestamp: "2024-01-13 10:00:00",
    },
    {
      id: 2,
      logLevel: "info",
      message: "Downloaded 2 Sentinel-1 SLC products",
      timestamp: "2024-01-13 10:00:45",
    },
    {
      id: 3,
      logLevel: "info",
      message: "Downloaded SRTM DEM (30m resolution)",
      timestamp: "2024-01-13 10:00:50",
    },
    {
      id: 4,
      logLevel: "info",
      message: "data_download completed in 45s",
      timestamp: "2024-01-13 10:00:55",
    },
    {
      id: 5,
      logLevel: "info",
      message: "Starting coregistration...",
      timestamp: "2024-01-13 10:01:00",
    },
    {
      id: 6,
      logLevel: "debug",
      message: "Computed coregistration offsets",
      timestamp: "2024-01-13 10:01:30",
    },
    {
      id: 7,
      logLevel: "info",
      message: "Coregistration completed with RMS error: 0.05 pixels",
      timestamp: "2024-01-13 10:02:07",
    },
    {
      id: 8,
      logLevel: "info",
      message: "Starting interferogram_generation...",
      timestamp: "2024-01-13 10:02:10",
    },
    {
      id: 9,
      logLevel: "debug",
      message: "Computing complex interferogram",
      timestamp: "2024-01-13 10:02:45",
    },
  ]);

  useEffect(() => {
    // Simulate progress updates
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 65) return prev;
        return prev + Math.random() * 5;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const getStepIcon = (status: string) => {
    switch (status) {
      case "completed":
        return "check-circle";
      case "processing":
        return "hourglass-empty";
      case "failed":
        return "error";
      default:
        return "radio-button-unchecked";
    }
  };

  const getStepColor = (status: string) => {
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

  const getLogColor = (level: string) => {
    switch (level) {
      case "error":
        return colors.error;
      case "warning":
        return colors.warning;
      case "debug":
        return colors.muted;
      default:
        return colors.foreground;
    }
  };

  const getStepLabel = (stepName: string) => {
    const labels: Record<string, string> = {
      data_download: "数据下载",
      coregistration: "配准",
      interferogram_generation: "干涉图生成",
      phase_unwrapping: "相位解缠",
      deformation_inversion: "形变反演",
    };
    return labels[stepName] || stepName;
  };

  const renderStep = (step: ProcessingStep) => (
    <View
      key={step.id}
      style={{
        marginBottom: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: colors.surface,
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: getStepColor(step.status),
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <MaterialIcons name={getStepIcon(step.status)} size={20} color={getStepColor(step.status)} />
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginLeft: 8, flex: 1 }}>
          {getStepLabel(step.stepName)}
        </Text>
        {step.duration && (
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {step.duration}s
          </Text>
        )}
      </View>

      {step.status === "processing" && (
        <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: "hidden" }}>
          <View
            style={{
              height: "100%",
              width: `${step.progress}%`,
              backgroundColor: colors.primary,
              borderRadius: 2,
            }}
          />
        </View>
      )}

      {step.errorMessage && (
        <Text style={{ fontSize: 12, color: colors.error, marginTop: 8 }}>
          ❌ {step.errorMessage}
        </Text>
      )}
    </View>
  );

  const renderLog = (log: ProcessingLog) => (
    <View
      key={log.id}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        flexDirection: "row",
      }}
    >
      <Text style={{ fontSize: 11, color: colors.muted, width: 120 }}>
        {log.timestamp}
      </Text>
      <Text
        style={{
          fontSize: 11,
          color: getLogColor(log.logLevel),
          fontWeight: "500",
          width: 50,
          marginHorizontal: 8,
        }}
      >
        [{log.logLevel.toUpperCase()}]
      </Text>
      <Text style={{ fontSize: 11, color: colors.foreground, flex: 1 }}>
        {log.message}
      </Text>
    </View>
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
            处理监控
          </Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Overall Progress */}
        <View style={{ paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>
              总体进度
            </Text>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.primary }}>
              {Math.round(progress)}%
            </Text>
          </View>
          <View style={{ height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden" }}>
            <View
              style={{
                height: "100%",
                width: `${progress}%`,
                backgroundColor: colors.primary,
                borderRadius: 4,
              }}
            />
          </View>
        </View>

        <ScrollView style={{ flex: 1 }}>
          {/* Processing Steps */}
          <View style={{ paddingHorizontal: 12, paddingVertical: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 12, marginLeft: 4 }}>
              处理步骤
            </Text>
            {steps.map(renderStep)}
          </View>

          {/* Processing Logs */}
          <View style={{ paddingVertical: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 12, marginLeft: 24 }}>
              实时日志
            </Text>
            <View
              style={{
                backgroundColor: colors.surface,
                marginHorizontal: 12,
                borderRadius: 12,
                overflow: "hidden",
                maxHeight: 300,
              }}
            >
              {logs.map(renderLog)}
            </View>
          </View>
        </ScrollView>

        {/* Action Buttons */}
        <View
          style={{
            paddingHorizontal: 24,
            paddingVertical: 16,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            flexDirection: "row",
            gap: 12,
          }}
        >
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: colors.surface,
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: "center",
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary }}>
              暂停
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: colors.error,
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#FFFFFF" }}>
              取消
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenContainer>
  );
}
