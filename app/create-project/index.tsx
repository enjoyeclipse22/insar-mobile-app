import { ScrollView, Text, View, TouchableOpacity, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useState } from "react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export default function CreateProjectScreen() {
  const router = useRouter();
  const colors = useColors();
  const [step, setStep] = useState(1);
  const [projectName, setProjectName] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [satellite, setSatellite] = useState("S1A");
  const [orbit, setOrbit] = useState("ascending");
  const [polarization, setPolarization] = useState("VV");

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      router.back();
    }
  };

  const handleCreate = () => {
    // TODO: Create project with parameters
    router.back();
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 16 }}>
              基本信息
            </Text>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
                项目名称
              </Text>
              <TextInput
                placeholder="例如：Turkey Earthquake 2023"
                placeholderTextColor={colors.muted}
                value={projectName}
                onChangeText={setProjectName}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  fontSize: 14,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>
            <View>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
                处理区域
              </Text>
              <TextInput
                placeholder="例如：Central Turkey"
                placeholderTextColor={colors.muted}
                value={location}
                onChangeText={setLocation}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  fontSize: 14,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>
          </View>
        );

      case 2:
        return (
          <View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 16 }}>
              数据参数
            </Text>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
                开始日期
              </Text>
              <TextInput
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
                value={startDate}
                onChangeText={setStartDate}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  fontSize: 14,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
                结束日期
              </Text>
              <TextInput
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
                value={endDate}
                onChangeText={setEndDate}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  fontSize: 14,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>
            <View>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
                卫星选择
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {["S1A", "S1B"].map((sat) => (
                  <TouchableOpacity
                    key={sat}
                    onPress={() => setSatellite(sat)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 8,
                      backgroundColor: satellite === sat ? colors.primary : colors.surface,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: satellite === sat ? colors.primary : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: satellite === sat ? "#FFFFFF" : colors.foreground,
                      }}
                    >
                      {sat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        );

      case 3:
        return (
          <View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 16 }}>
              处理参数
            </Text>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
                轨道方向
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {["ascending", "descending"].map((orb) => (
                  <TouchableOpacity
                    key={orb}
                    onPress={() => setOrbit(orb)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 8,
                      backgroundColor: orbit === orb ? colors.primary : colors.surface,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: orbit === orb ? colors.primary : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: orbit === orb ? "#FFFFFF" : colors.foreground,
                      }}
                    >
                      {orb === "ascending" ? "升轨" : "降轨"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
                极化方式
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {["VV", "VH"].map((pol) => (
                  <TouchableOpacity
                    key={pol}
                    onPress={() => setPolarization(pol)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 8,
                      backgroundColor: polarization === pol ? colors.primary : colors.surface,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: polarization === pol ? colors.primary : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: polarization === pol ? "#FFFFFF" : colors.foreground,
                      }}
                    >
                      {pol}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        );

      case 4:
        return (
          <View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 16 }}>
              确认参数
            </Text>
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 16,
                gap: 12,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 14, color: colors.muted }}>项目名称</Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                  {projectName}
                </Text>
              </View>
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 14, color: colors.muted }}>处理区域</Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                  {location}
                </Text>
              </View>
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 14, color: colors.muted }}>时间范围</Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                  {startDate} 至 {endDate}
                </Text>
              </View>
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 14, color: colors.muted }}>卫星</Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                  {satellite}
                </Text>
              </View>
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 14, color: colors.muted }}>轨道方向</Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                  {orbit === "ascending" ? "升轨" : "降轨"}
                </Text>
              </View>
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 14, color: colors.muted }}>极化方式</Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                  {polarization}
                </Text>
              </View>
            </View>
          </View>
        );

      default:
        return null;
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
          }}
        >
          <Text style={{ fontSize: 20, fontWeight: "700", color: "#FFFFFF", marginBottom: 12 }}>
            新建项目
          </Text>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            {[1, 2, 3, 4].map((s) => (
              <View
                key={s}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: s <= step ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)",
                }}
              />
            ))}
          </View>
          <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 8 }}>
            第 {step} 步，共 4 步
          </Text>
        </View>

        {/* Content */}
        <ScrollView style={{ flex: 1, paddingHorizontal: 24, paddingVertical: 24 }}>
          {renderStep()}
        </ScrollView>

        {/* Footer */}
        <View
          style={{
            paddingHorizontal: 24,
            paddingVertical: 16,
            flexDirection: "row",
            gap: 12,
            backgroundColor: colors.background,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <TouchableOpacity
            onPress={handleBack}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 8,
              backgroundColor: colors.surface,
              alignItems: "center",
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>
              {step === 1 ? "取消" : "上一步"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={step === 4 ? handleCreate : handleNext}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 8,
              backgroundColor: colors.primary,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>
              {step === 4 ? "创建项目" : "下一步"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenContainer>
  );
}
