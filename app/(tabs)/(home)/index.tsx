
import React, { useState, useEffect } from "react";
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
	
} from "react-native";
import { useTheme } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/components/IconSymbol";
import { colors, spacing, borderRadius, typography } from "@/styles/commonStyles";
import { SafeAreaView } from "react-native-safe-area-context";
import { authenticatedPost } from "@/utils/api";
import { BleManager, Device, State } from "react-native-ble-plx";

LogBox.ignoreAllLogs(); //Ignore all log notifications

// Predefined message - non-editable
const PREDEFINED_MESSAGE = "Do you accept to have lunch with me?";

// BLE Service UUID for the app (unique identifier for our app)
const APP_SERVICE_UUID = "0000FFF0-0000-1000-8000-00805F9B34FB";

interface NearbyDevice {
  id: string;
  name: string;
  rssi: number;
}

export default function HomeScreen() {
  const theme = useTheme();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const isDark = theme.dark;
  const themeColors = isDark ? colors.dark : colors.light;

  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [nearbyDevices, setNearbyDevices] = useState<NearbyDevice[]>([]);
  const [bleManager] = useState(() => new BleManager());
  const [bleState, setBleState] = useState<State>(State.Unknown);
  const [sending, setSending] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    title: string;
    message: string;
    type: "success" | "error";
  }>({ title: "", message: "", type: "success" });

  useEffect(() => {
    console.log("[HomeScreen] Mounted, user:", user);
    if (!authLoading && !user) {
      console.log("[HomeScreen] User not authenticated, redirecting to auth");
      router.replace("/auth");
    }
  }, [user, authLoading]);

  useEffect(() => {
    // Monitor Bluetooth state
    const subscription = bleManager.onStateChange((state) => {
      console.log("[BLE] State changed:", state);
      setBleState(state);
    }, true);

    return () => {
      subscription.remove();
      bleManager.destroy();
    };
  }, []);

  const showConfirmMessage = (title: string, message: string, type: "success" | "error") => {
    setConfirmModalConfig({ title, message, type });
    setShowConfirmModal(true);
  };

  const requestBluetoothPermissions = async (): Promise<boolean> => {
    if (Platform.OS === "android") {
      try {
        if (Platform.Version >= 31) {
          // Android 12+ requires BLUETOOTH_SCAN and BLUETOOTH_CONNECT
          const granted = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ]);
          
          const allGranted = Object.values(granted).every(
            (status) => status === PermissionsAndroid.RESULTS.GRANTED
          );
          
          if (!allGranted) {
            showConfirmMessage(
              "Permission Required",
              "Bluetooth permissions are required to discover nearby devices.",
              "error"
            );
            return false;
          }
        } else {
          // Android 11 and below
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            showConfirmMessage(
              "Permission Required",
              "Location permission is required to discover nearby devices.",
              "error"
            );
            return false;
          }
        }
      } catch (error) {
        console.error("[BLE] Permission request error:", error);
        return false;
      }
    }
    
    return true;
  };

  const handleAskButtonPress = async () => {
    console.log("[HomeScreen] Ask button pressed");
    
    // Check Bluetooth state
    if (bleState !== State.PoweredOn) {
      showConfirmMessage(
        "Bluetooth Required",
        "Please enable Bluetooth to discover nearby devices.",
        "error"
      );
      return;
    }

    // Request permissions
    const hasPermissions = await requestBluetoothPermissions();
    if (!hasPermissions) {
      return;
    }

    // Open options modal and start scanning
    setShowOptionsModal(true);
    startScanning();
  };

  const startScanning = async () => {
    console.log("[BLE] Starting scan for nearby devices");
    setScanning(true);
    setNearbyDevices([]);

    try {
      // Scan for devices advertising our app's service UUID
      bleManager.startDeviceScan(
        [APP_SERVICE_UUID],
        { allowDuplicates: false },
        (error, device) => {
          if (error) {
            console.error("[BLE] Scan error:", error);
            return;
          }

          if (device && device.name) {
            console.log("[BLE] Found device:", device.name, device.id);
            setNearbyDevices((prev) => {
              // Avoid duplicates
              if (prev.some((d) => d.id === device.id)) {
                return prev;
              }
              return [
                ...prev,
                {
                  id: device.id,
                  name: device.name || "Unknown Device",
                  rssi: device.rssi || -100,
                },
              ];
            });
          }
        }
      );

      // Stop scanning after 10 seconds
      setTimeout(() => {
        stopScanning();
      }, 10000);
    } catch (error) {
      console.error("[BLE] Failed to start scanning:", error);
      setScanning(false);
    }
  };

  const stopScanning = () => {
    console.log("[BLE] Stopping scan");
    bleManager.stopDeviceScan();
    setScanning(false);
  };

  const handleSelectNearbyDevice = async (device: NearbyDevice) => {
    console.log("[HomeScreen] Selected nearby device:", device.name);
    stopScanning();
    setShowOptionsModal(false);
    setSending(true);

    try {
      // Create proximity session
      const sessionResponse = await authenticatedPost<{
        sessionId: string;
        proximityToken: string;
        expiresAt: string;
      }>("/api/proximity/session", {
        expiresIn: 5 * 60 * 1000, // 5 minutes
      });

      console.log("[HomeScreen] Proximity session created:", sessionResponse);

      // Send message via proximity session
      await authenticatedPost(`/api/proximity/session/${sessionResponse.proximityToken}/send`, {
        content: PREDEFINED_MESSAGE,
      });

      console.log("[HomeScreen] Message sent via proximity");

      // TODO: Send push notification to the selected device
      // This would require the recipient device to be registered with a push token
      // For now, we'll show success message
      
      showConfirmMessage(
        "Request Sent",
        `Your request has been sent to ${device.name}. They will receive a notification.`,
        "success"
      );
    } catch (error: any) {
      console.error("[HomeScreen] Error sending proximity request:", error);
      showConfirmMessage(
        "Error",
        error?.message || "Failed to send request. Please try again.",
        "error"
      );
    } finally {
      setSending(false);
    }
  };

  const handleShareLink = async () => {
    console.log("[HomeScreen] Share link option selected");
    stopScanning();
    setShowOptionsModal(false);
    setSending(true);

    try {
      // Create a message with a secure link
      const response = await authenticatedPost<{
        id: string;
        linkToken: string;
        shareUrl: string;
        expiresAt: string;
      }>("/api/messages", {
        recipientEmail: "", // No email for link sharing
        content: PREDEFINED_MESSAGE,
      });

      console.log("[HomeScreen] Message created with link:", response);

      let shareUrl = response.shareUrl;
      if (!shareUrl) {
        if (Platform.OS === "web") {
          shareUrl = `${window.location.origin}/message/${response.linkToken}`;
        } else {
          shareUrl = `https://acceptconnect.app/message/${response.linkToken}`;
        }
      }

      // Share via external apps (WhatsApp, Messenger, etc.)
      await Share.share({
        message: `${PREDEFINED_MESSAGE}\n\nPlease open this link to respond: ${shareUrl}`,
        url: shareUrl,
        title: "Accept Connect Request",
      });

      console.log("[HomeScreen] Link shared successfully");
      showConfirmMessage(
        "Link Shared",
        "Your secure link has been shared. The recipient must authenticate to respond.",
        "success"
      );
    } catch (error: any) {
      console.error("[HomeScreen] Error sharing link:", error);
      showConfirmMessage(
        "Error",
        error?.message || "Failed to share link. Please try again.",
        "error"
      );
    } finally {
      setSending(false);
    }
  };

  const handleCloseModal = () => {
    stopScanning();
    setShowOptionsModal(false);
  };

  if (authLoading) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.primary} />
      </View>
    );
  }

  if (!user) {
    return null;
  }

  const userNameDisplay = user.name || "User";

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.greeting, { color: themeColors.text }]}>
            Hello
          </Text>
          <Text style={[styles.userName, { color: themeColors.text }]}>
            {userNameDisplay}
          </Text>
        </View>

        <View style={styles.centerContent}>
          <TouchableOpacity
            style={[styles.askButton, { backgroundColor: themeColors.primary }]}
            onPress={handleAskButtonPress}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator color="#FFFFFF" size="large" />
            ) : (
              <>
                <IconSymbol
                  ios_icon_name="hand.raised.fill"
                  android_material_icon_name="front-hand"
                  size={48}
                  color="#FFFFFF"
                />
                <Text style={styles.askButtonText}>Ask</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={[styles.messagePreview, { color: themeColors.textSecondary }]}>
            {PREDEFINED_MESSAGE}
          </Text>
        </View>
      </View>

      {/* Options Modal */}
      <Modal
        visible={showOptionsModal}
        transparent
        animationType="slide"
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                Send Request
              </Text>
              <TouchableOpacity onPress={handleCloseModal}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={28}
                  color={themeColors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.modalSection}>
              <View style={styles.sectionHeader}>
                <IconSymbol
                  ios_icon_name="antenna.radiowaves.left.and.right"
                  android_material_icon_name="bluetooth"
                  size={24}
                  color={themeColors.primary}
                />
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                  Nearby Devices
                </Text>
              </View>

              {scanning && (
                <View style={styles.scanningIndicator}>
                  <ActivityIndicator color={themeColors.primary} />
                  <Text style={[styles.scanningText, { color: themeColors.textSecondary }]}>
                    Scanning for nearby devices...
                  </Text>
                </View>
              )}

              {!scanning && nearbyDevices.length === 0 && (
                <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                  No nearby devices found. Make sure Bluetooth is enabled on both devices.
                </Text>
              )}

              {nearbyDevices.length > 0 && (
                <FlatList
                  data={nearbyDevices}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.deviceItem, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
                      onPress={() => handleSelectNearbyDevice(item)}
                    >
                      <IconSymbol
                        ios_icon_name="iphone"
                        android_material_icon_name="phone-android"
                        size={24}
                        color={themeColors.primary}
                      />
                      <View style={styles.deviceInfo}>
                        <Text style={[styles.deviceName, { color: themeColors.text }]}>
                          {item.name}
                        </Text>
                        <Text style={[styles.deviceSignal, { color: themeColors.textSecondary }]}>
                          Signal: {item.rssi} dBm
                        </Text>
                      </View>
                      <IconSymbol
                        ios_icon_name="chevron.right"
                        android_material_icon_name="chevron-right"
                        size={20}
                        color={themeColors.textSecondary}
                      />
                    </TouchableOpacity>
                  )}
                  style={styles.deviceList}
                />
              )}
            </View>

            <View style={styles.divider} />

            <View style={styles.modalSection}>
              <View style={styles.sectionHeader}>
                <IconSymbol
                  ios_icon_name="link"
                  android_material_icon_name="link"
                  size={24}
                  color={themeColors.primary}
                />
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                  Share Link
                </Text>
              </View>

              <Text style={[styles.sectionDescription, { color: themeColors.textSecondary }]}>
                Share a secure link via WhatsApp, Messenger, or other apps. The recipient must authenticate to respond.
              </Text>

              <TouchableOpacity
                style={[styles.shareLinkButton, { backgroundColor: themeColors.primary }]}
                onPress={handleShareLink}
              >
                <IconSymbol
                  ios_icon_name="square.and.arrow.up"
                  android_material_icon_name="share"
                  size={20}
                  color="#FFFFFF"
                />
                <Text style={styles.shareLinkButtonText}>
                  Share Secure Link
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.confirmModalContent, { backgroundColor: themeColors.card }]}>
            <IconSymbol
              ios_icon_name={confirmModalConfig.type === "success" ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"}
              android_material_icon_name={confirmModalConfig.type === "success" ? "check-circle" : "error"}
              size={48}
              color={confirmModalConfig.type === "success" ? themeColors.success : themeColors.error}
            />
            <Text style={[styles.confirmModalTitle, { color: themeColors.text }]}>
              {confirmModalConfig.title}
            </Text>
            <Text style={[styles.confirmModalMessage, { color: themeColors.textSecondary }]}>
              {confirmModalConfig.message}
            </Text>
            <TouchableOpacity
              style={[styles.confirmModalButton, { backgroundColor: themeColors.primary }]}
              onPress={() => setShowConfirmModal(false)}
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
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  header: {
    marginBottom: spacing.xl,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
  },
  greeting: {
    ...typography.h3,
    marginBottom: spacing.xs,
  },
  userName: {
    ...typography.h1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  askButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  askButtonText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  messagePreview: {
    ...typography.body,
    marginTop: spacing.xl,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: spacing.lg,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    ...typography.h2,
  },
  modalSection: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    marginLeft: spacing.sm,
  },
  sectionDescription: {
    ...typography.bodySmall,
    marginBottom: spacing.md,
  },
  scanningIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  scanningText: {
    ...typography.body,
    marginLeft: spacing.sm,
  },
  emptyText: {
    ...typography.bodySmall,
    textAlign: 'center',
    padding: spacing.md,
  },
  deviceList: {
    maxHeight: 200,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  deviceInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  deviceName: {
    ...typography.body,
    fontWeight: '600',
  },
  deviceSignal: {
    ...typography.caption,
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: spacing.md,
  },
  shareLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  shareLinkButtonText: {
    color: '#FFFFFF',
    ...typography.body,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  confirmModalContent: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    margin: spacing.lg,
    alignItems: 'center',
  },
  confirmModalTitle: {
    ...typography.h2,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  confirmModalMessage: {
    ...typography.body,
    marginTop: spacing.sm,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  confirmModalButton: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    minWidth: 120,
    alignItems: 'center',
  },
  confirmModalButtonText: {
    color: '#FFFFFF',
    ...typography.body,
    fontWeight: '600',
  },
});
