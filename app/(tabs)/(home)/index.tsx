
import { useRouter } from "expo-router";
import { authenticatedPost } from "@/utils/api";
import { useTheme } from "@react-navigation/native";
import { colors, spacing, borderRadius, typography } from "@/styles/commonStyles";
import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconSymbol } from "@/components/IconSymbol";
import { BleManager, Device, State } from "react-native-ble-plx";
import { 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  ActivityIndicator,
  Platform,
  Modal,
  FlatList,
  Share,
  PermissionsAndroid,
  Alert as RNAlert,
  LogBox
} from "react-native";

// Suppress BLE warnings in development
LogBox.ignoreLogs(['new NativeEventEmitter']);

interface NearbyDevice {
  id: string;
  name: string;
  rssi: number;
}

const PREDEFINED_MESSAGE = "Do you accept to have lunch with me?";
const APP_SERVICE_UUID = "00001234-0000-1000-8000-00805f9b34fb";

export default function HomeScreen() {
  const { colors } = useTheme();
  const { user, authLoading } = useAuth();
  const router = useRouter();

  const [isScanning, setIsScanning] = useState(false);
  const [nearbyDevices, setNearbyDevices] = useState<NearbyDevice[]>([]);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [bleManager, setBleManager] = useState<BleManager | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [modalType, setModalType] = useState<"success" | "error">("success");

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      console.log("User not authenticated, redirecting to auth screen");
      router.replace("/auth");
    }
  }, [user, authLoading, router]);

  // Initialize BLE Manager
  useEffect(() => {
    const manager = new BleManager();
    setBleManager(manager);

    return () => {
      manager.destroy();
    };
  }, []);

  const showConfirmMessage = useCallback((title: string, message: string, type: "success" | "error") => {
    setModalTitle(title);
    setModalMessage(message);
    setModalType(type);
    setModalVisible(true);
  }, []);

  const requestBluetoothPermissions = useCallback(async () => {
    if (Platform.OS === "android") {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        const allGranted = Object.values(granted).every(
          (status) => status === PermissionsAndroid.RESULTS.GRANTED
        );

        if (!allGranted) {
          showConfirmMessage("Permissions Required", "Bluetooth and location permissions are required to find nearby devices", "error");
          return false;
        }
        return true;
      } catch (error) {
        console.error("Error requesting permissions:", error);
        return false;
      }
    }
    return true;
  }, [showConfirmMessage]);

  const handleAskButtonPress = useCallback(async () => {
    console.log("User tapped Ask button");
    // Show options: Scan for nearby devices or Share link
    RNAlert.alert(
      "Send Request",
      "How would you like to send your request?",
      [
        {
          text: "Nearby Devices",
          onPress: async () => {
            const hasPermissions = await requestBluetoothPermissions();
            if (hasPermissions) {
              startScanning();
            }
          },
        },
        {
          text: "Share Link",
          onPress: () => handleShareLink(),
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]
    );
  }, [requestBluetoothPermissions]);

  const startScanning = useCallback(async () => {
    if (!bleManager) {
      console.log("BLE Manager not initialized");
      showConfirmMessage("Error", "Bluetooth not available", "error");
      return;
    }

    console.log("Starting BLE scan for nearby devices");
    setIsScanning(true);
    setNearbyDevices([]);
    setShowDeviceModal(true);

    try {
      const state = await bleManager.state();
      if (state !== State.PoweredOn) {
        showConfirmMessage("Bluetooth Off", "Please enable Bluetooth to find nearby devices", "error");
        setIsScanning(false);
        setShowDeviceModal(false);
        return;
      }

      bleManager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          console.error("BLE scan error:", error);
          setIsScanning(false);
          return;
        }

        if (device && device.name) {
          setNearbyDevices((prev) => {
            const exists = prev.find((d) => d.id === device.id);
            if (!exists) {
              console.log("Found device:", device.name, "RSSI:", device.rssi);
              return [...prev, { id: device.id, name: device.name, rssi: device.rssi || -100 }];
            }
            return prev;
          });
        }
      });

      // Stop scanning after 10 seconds
      setTimeout(() => {
        console.log("Stopping BLE scan");
        bleManager.stopDeviceScan();
        setIsScanning(false);
      }, 10000);
    } catch (error) {
      console.error("Error starting BLE scan:", error);
      showConfirmMessage("Error", "Failed to start scanning", "error");
      setIsScanning(false);
      setShowDeviceModal(false);
    }
  }, [bleManager, showConfirmMessage]);

  const stopScanning = useCallback(() => {
    if (bleManager) {
      console.log("User stopped BLE scan");
      bleManager.stopDeviceScan();
      setIsScanning(false);
    }
  }, [bleManager]);

  const handleSelectNearbyDevice = useCallback(async (device: NearbyDevice) => {
    console.log("User selected device:", device.name);
    setShowDeviceModal(false);
    stopScanning();

    try {
      console.log("Creating proximity session for device:", device.id);
      const response = await authenticatedPost("/api/proximity/sessions", {
        recipientDeviceId: device.id,
        message: PREDEFINED_MESSAGE,
      });

      console.log("Proximity session created:", response);
      showConfirmMessage("Success", "Request sent to nearby device!", "success");
    } catch (error) {
      console.error("Error creating proximity session:", error);
      showConfirmMessage("Error", "Failed to send request to device", "error");
    }
  }, [stopScanning, showConfirmMessage]);

  const handleShareLink = useCallback(async () => {
    console.log("User tapped Share Link");
    try {
      console.log("Generating secure link for message");
      const response = await authenticatedPost("/api/messages/link", {
        message: PREDEFINED_MESSAGE,
      });

      const shareUrl = response.url;
      console.log("Secure link generated:", shareUrl);

      await Share.share({
        message: `${PREDEFINED_MESSAGE}\n\nRespond here: ${shareUrl}`,
        url: shareUrl,
      });

      console.log("Link shared successfully");
    } catch (error) {
      console.error("Error sharing link:", error);
      showConfirmMessage("Error", "Failed to generate share link", "error");
    }
  }, [showConfirmMessage]);

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
  }, []);

  if (authLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      {/* Main Ask Button */}
      <View style={styles.centerContent}>
        <TouchableOpacity
          style={[styles.askButton, { backgroundColor: colors.primary }]}
          onPress={handleAskButtonPress}
          activeOpacity={0.8}
        >
          <Text style={styles.askButtonText}>Ask</Text>
        </TouchableOpacity>
        <Text style={[styles.messagePreview, { color: colors.text }]}>
          {PREDEFINED_MESSAGE}
        </Text>
      </View>

      {/* Nearby Devices Modal */}
      <Modal
        visible={showDeviceModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          stopScanning();
          setShowDeviceModal(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Nearby Devices
              </Text>
              <TouchableOpacity
                onPress={() => {
                  stopScanning();
                  setShowDeviceModal(false);
                }}
              >
                <IconSymbol
                  ios_icon_name="xmark"
                  android_material_icon_name="close"
                  size={24}
                  color={colors.text}
                />
              </TouchableOpacity>
            </View>

            {isScanning && (
              <View style={styles.scanningIndicator}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.scanningText, { color: colors.text }]}>
                  Scanning for devices...
                </Text>
              </View>
            )}

            <FlatList
              data={nearbyDevices}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.deviceItem, { borderBottomColor: colors.border }]}
                  onPress={() => handleSelectNearbyDevice(item)}
                >
                  <View>
                    <Text style={[styles.deviceName, { color: colors.text }]}>
                      {item.name}
                    </Text>
                    <Text style={[styles.deviceRssi, { color: colors.text }]}>
                      Signal: {item.rssi} dBm
                    </Text>
                  </View>
                  <IconSymbol
                    ios_icon_name="chevron.right"
                    android_material_icon_name="arrow-forward"
                    size={20}
                    color={colors.text}
                  />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                !isScanning ? (
                  <Text style={[styles.emptyText, { color: colors.text }]}>
                    No devices found
                  </Text>
                ) : null
              }
            />

            {isScanning && (
              <TouchableOpacity
                style={[styles.stopButton, { backgroundColor: colors.primary }]}
                onPress={stopScanning}
              >
                <Text style={styles.stopButtonText}>Stop Scanning</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Confirmation Modal */}
      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.confirmModalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.confirmModalTitle, { color: colors.text }]}>
              {modalTitle}
            </Text>
            <Text style={[styles.confirmModalMessage, { color: colors.text }]}>
              {modalMessage}
            </Text>
            <TouchableOpacity
              style={[
                styles.confirmModalButton,
                { backgroundColor: modalType === "success" ? colors.primary : "#ef4444" },
              ]}
              onPress={handleCloseModal}
            >
              <Text style={styles.confirmModalButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  askButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  askButtonText: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#fff",
  },
  messagePreview: {
    marginTop: spacing.xl,
    fontSize: typography.sizes.lg,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "90%",
    maxHeight: "80%",
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: "bold",
  },
  scanningIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  scanningText: {
    marginLeft: spacing.sm,
    fontSize: typography.sizes.md,
  },
  deviceItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  deviceName: {
    fontSize: typography.sizes.md,
    fontWeight: "600",
  },
  deviceRssi: {
    fontSize: typography.sizes.sm,
    marginTop: 4,
  },
  emptyText: {
    textAlign: "center",
    fontSize: typography.sizes.md,
    marginTop: spacing.lg,
  },
  stopButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: "center",
  },
  stopButtonText: {
    color: "#fff",
    fontSize: typography.sizes.md,
    fontWeight: "600",
  },
  confirmModalContent: {
    width: "80%",
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: "center",
  },
  confirmModalTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: "bold",
    marginBottom: spacing.md,
  },
  confirmModalMessage: {
    fontSize: typography.sizes.md,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  confirmModalButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
  },
  confirmModalButtonText: {
    color: "#fff",
    fontSize: typography.sizes.md,
    fontWeight: "600",
  },
});
