
import { useTheme } from "@react-navigation/native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { colors, spacing, borderRadius, typography } from "@/styles/commonStyles";
import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { SafeAreaView } from "react-native-safe-area-context";
import { authenticatedGet, authenticatedPost } from "@/utils/api";
import { IconSymbol } from "@/components/IconSymbol";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from "react-native";

interface Message {
  id: string;
  content: string;
  senderId: string;
  senderUsername: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
}

export default function MessageViewScreen() {
  const { colors } = useTheme();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { token } = useLocalSearchParams();

  const [message, setMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [modalType, setModalType] = useState<"success" | "error">("success");

  const showModalMessage = useCallback((title: string, message: string, type: "success" | "error") => {
    setModalTitle(title);
    setModalMessage(message);
    setModalType(type);
    setModalVisible(true);
  }, []);

  const loadMessage = useCallback(async () => {
    if (!token) return;

    try {
      console.log("Loading message with token:", token);
      const response = await authenticatedGet(`/api/messages/link/${token}`);
      setMessage(response);
      console.log("Message loaded:", response);
    } catch (error) {
      console.error("Error loading message:", error);
      showModalMessage("Error", "Failed to load message", "error");
    } finally {
      setLoading(false);
    }
  }, [token, showModalMessage]);

  const handleRespond = useCallback(async (action: "accept" | "reject") => {
    if (!message) return;

    setResponding(true);
    try {
      console.log(`User ${action}ed message:`, message.id);
      await authenticatedPost(`/api/messages/${message.id}/${action}`, {});

      const actionText = action === "accept" ? "accepted" : "rejected";
      showModalMessage(
        "Response Sent",
        `You have ${actionText} the request`,
        action === "accept" ? "success" : "error"
      );

      // Update local state
      setMessage({ ...message, status: action === "accept" ? "accepted" : "rejected" });

      // Navigate back after a delay
      setTimeout(() => {
        router.replace("/(tabs)/(home)");
      }, 2000);
    } catch (error) {
      console.error(`Error ${action}ing message:`, error);
      showModalMessage("Error", `Failed to ${action} the request`, "error");
    } finally {
      setResponding(false);
    }
  }, [message, router, showModalMessage]);

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      console.log("User not authenticated, redirecting to auth screen");
      router.replace("/auth");
    } else if (user) {
      loadMessage();
    }
  }, [user, authLoading, loadMessage, router]);

  if (authLoading || loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!message) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
        <Stack.Screen
          options={{
            headerShown: true,
            title: "Message",
            headerBackTitle: "Back",
          }}
        />
        <View style={styles.centerContent}>
          <IconSymbol
            ios_icon_name="exclamationmark.triangle"
            android_material_icon_name="warning"
            size={64}
            color={colors.text}
          />
          <Text style={[styles.errorText, { color: colors.text }]}>
            Message not found or expired
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const alreadyResponded = message.status !== "pending";

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Message Request",
          headerBackTitle: "Back",
        }}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.messageCard, { backgroundColor: colors.card }]}>
          <View style={styles.senderInfo}>
            <IconSymbol
              ios_icon_name="person.circle.fill"
              android_material_icon_name="account-circle"
              size={64}
              color={colors.primary}
            />
            <View style={styles.senderDetails}>
              <Text style={[styles.label, { color: colors.text }]}>From</Text>
              <Text style={[styles.senderName, { color: colors.text }]}>
                {message.senderUsername}
              </Text>
            </View>
          </View>

          <View style={styles.messageContent}>
            <Text style={[styles.label, { color: colors.text }]}>Message</Text>
            <Text style={[styles.messageText, { color: colors.text }]}>
              {message.content}
            </Text>
          </View>

          {alreadyResponded ? (
            <View style={[styles.statusBadge, { backgroundColor: message.status === "accepted" ? "#10b981" : "#ef4444" }]}>
              <Text style={styles.statusText}>
                {message.status === "accepted" ? "✓ Accepted" : "✗ Rejected"}
              </Text>
            </View>
          ) : (
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.rejectButton, { backgroundColor: "#ef4444" }]}
                onPress={() => handleRespond("reject")}
                disabled={responding}
              >
                {responding ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <IconSymbol
                      ios_icon_name="xmark"
                      android_material_icon_name="close"
                      size={24}
                      color="#fff"
                    />
                    <Text style={styles.buttonText}>Reject</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.acceptButton, { backgroundColor: "#10b981" }]}
                onPress={() => handleRespond("accept")}
                disabled={responding}
              >
                {responding ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <IconSymbol
                      ios_icon_name="checkmark"
                      android_material_icon_name="check"
                      size={24}
                      color="#fff"
                    />
                    <Text style={styles.buttonText}>Accept</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Confirmation Modal */}
      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {modalTitle}
            </Text>
            <Text style={[styles.modalMessage, { color: colors.text }]}>
              {modalMessage}
            </Text>
            <TouchableOpacity
              style={[
                styles.modalButton,
                { backgroundColor: modalType === "success" ? colors.primary : "#ef4444" },
              ]}
              onPress={handleCloseModal}
            >
              <Text style={styles.modalButtonText}>OK</Text>
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
  scrollContent: {
    flexGrow: 1,
    padding: spacing.lg,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  errorText: {
    fontSize: typography.sizes.lg,
    marginTop: spacing.lg,
    textAlign: "center",
  },
  messageCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginTop: spacing.xl,
  },
  senderInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  senderDetails: {
    marginLeft: spacing.md,
    flex: 1,
  },
  label: {
    fontSize: typography.sizes.sm,
    opacity: 0.7,
    marginBottom: 4,
  },
  senderName: {
    fontSize: typography.sizes.xl,
    fontWeight: "bold",
  },
  messageContent: {
    marginBottom: spacing.xl,
  },
  messageText: {
    fontSize: typography.sizes.lg,
    lineHeight: 28,
  },
  actionButtons: {
    flexDirection: "row",
    gap: spacing.md,
  },
  rejectButton: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  acceptButton: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  buttonText: {
    color: "#fff",
    fontSize: typography.sizes.md,
    fontWeight: "600",
  },
  statusBadge: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: "center",
  },
  statusText: {
    color: "#fff",
    fontSize: typography.sizes.md,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "80%",
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: "bold",
    marginBottom: spacing.md,
  },
  modalMessage: {
    fontSize: typography.sizes.md,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  modalButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
  },
  modalButtonText: {
    color: "#fff",
    fontSize: typography.sizes.md,
    fontWeight: "600",
  },
});
