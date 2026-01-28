
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { IconSymbol } from "@/components/IconSymbol";
import { colors, spacing, borderRadius, typography } from "@/styles/commonStyles";
import { SafeAreaView } from "react-native-safe-area-context";
import { authenticatedGet, authenticatedPost } from "@/utils/api";

export default function MessageViewScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const theme = useTheme();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const isDark = theme.dark;
  const themeColors = isDark ? colors.dark : colors.light;

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<any>(null);
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    title: string;
    message: string;
    type: "success" | "error";
    onClose?: () => void;
  }>({ title: "", message: "", type: "success" });

  useEffect(() => {
    console.log("MessageViewScreen mounted, token:", token);
    if (!authLoading && !user) {
      console.log("User not authenticated, redirecting to auth");
      router.replace("/auth");
    } else if (user && token) {
      console.log("User authenticated, loading message");
      loadMessage();
    }
  }, [user, authLoading, token]);

  const loadMessage = async () => {
    console.log("[MessageView] Loading message with token:", token);
    setLoading(true);
    setError(null);

    try {
      // GET /api/messages/link/:token to view message by link token
      const response = await authenticatedGet<{
        id: string;
        content: string;
        senderName: string;
        status: string;
        createdAt: string;
        viewedAt: string | null;
      }>(`/api/messages/link/${token}`);
      
      console.log("[MessageView] Message loaded:", response);
      setMessage(response);
    } catch (err: any) {
      console.error("[MessageView] Error loading message:", err);
      const errorMessage = err?.message || "Failed to load message. The link may be invalid or expired.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const showModalMessage = (
    title: string,
    message: string,
    type: "success" | "error",
    onClose?: () => void
  ) => {
    setModalConfig({ title, message, type, onClose });
    setShowModal(true);
  };

  const handleRespond = async (action: "accept" | "reject") => {
    console.log("[MessageView] User responding to message:", action);
    
    if (!message) {
      console.error("[MessageView] No message to respond to");
      return;
    }

    setResponding(true);

    try {
      // POST /api/messages/:id/accept or /api/messages/:id/reject
      const endpoint = `/api/messages/${message.id}/${action}`;
      const response = await authenticatedPost<{
        id: string;
        status: string;
        respondedAt: string;
      }>(endpoint, {});
      
      console.log("[MessageView] Message response successful:", response);
      
      const actionText = action === "accept" ? "accepted" : "rejected";
      showModalMessage(
        "Success",
        `You have ${actionText} this message.`,
        "success",
        () => router.replace("/(tabs)/(home)/")
      );
      
      // Update local message state
      setMessage({ ...message, status: response.status });
    } catch (err: any) {
      console.error("[MessageView] Error responding to message:", err);
      const errorMessage = err?.message || "Failed to respond to message. Please try again.";
      showModalMessage("Error", errorMessage, "error");
    } finally {
      setResponding(false);
    }
  };

  if (authLoading || loading) {
    return (
      <>
        <Stack.Screen options={{ title: "Loading..." }} />
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['bottom']}>
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={themeColors.primary} />
            <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>
              Loading message...
            </Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  if (error || !message) {
    const errorMessage = error || "Message not found";
    
    return (
      <>
        <Stack.Screen options={{ title: "Error" }} />
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['bottom']}>
          <View style={styles.centerContent}>
            <IconSymbol
              ios_icon_name="exclamationmark.triangle.fill"
              android_material_icon_name="error"
              size={64}
              color={themeColors.error}
            />
            <Text style={[styles.errorTitle, { color: themeColors.text }]}>
              Unable to Load Message
            </Text>
            <Text style={[styles.errorMessage, { color: themeColors.textSecondary }]}>
              {errorMessage}
            </Text>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: themeColors.primary }]}
              onPress={() => router.replace("/(tabs)/(home)/")}
            >
              <Text style={styles.buttonText}>
                Go to Home
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </>
    );
  }

  const isAlreadyResponded = message.status !== "pending";
  const statusText = message.status === "accepted" ? "Accepted" : message.status === "rejected" ? "Rejected" : "Pending";
  const statusColor = message.status === "accepted" ? themeColors.success : message.status === "rejected" ? themeColors.error : themeColors.warning;

  return (
    <>
      <Stack.Screen options={{ title: "Message from " + message.senderName }} />
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['bottom']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Sender Info */}
          <View style={[styles.senderCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <View style={[styles.senderAvatar, { backgroundColor: themeColors.primary }]}>
              <Text style={styles.senderAvatarText}>
                {message.senderName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.senderInfo}>
              <Text style={[styles.senderLabel, { color: themeColors.textSecondary }]}>
                From
              </Text>
              <Text style={[styles.senderName, { color: themeColors.text }]}>
                {message.senderName}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {statusText}
              </Text>
            </View>
          </View>

          {/* Message Content */}
          <View style={[styles.messageCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Text style={[styles.messageLabel, { color: themeColors.textSecondary }]}>
              Message
            </Text>
            <Text style={[styles.messageContent, { color: themeColors.text }]}>
              {message.content}
            </Text>
          </View>

          {/* Info Card */}
          {!isAlreadyResponded && (
            <View style={[styles.infoCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <IconSymbol
                ios_icon_name="info.circle.fill"
                android_material_icon_name="info"
                size={20}
                color={themeColors.primary}
              />
              <Text style={[styles.infoText, { color: themeColors.textSecondary }]}>
                Please review the message and choose to accept or reject it. This action cannot be undone.
              </Text>
            </View>
          )}

          {/* Action Buttons */}
          {!isAlreadyResponded ? (
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.actionButton, styles.rejectButton, { backgroundColor: themeColors.error }]}
                onPress={() => handleRespond("reject")}
                disabled={responding}
              >
                {responding ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <IconSymbol
                      ios_icon_name="xmark.circle.fill"
                      android_material_icon_name="cancel"
                      size={20}
                      color="#FFFFFF"
                    />
                    <Text style={styles.actionButtonText}>
                      Reject
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.acceptButton, { backgroundColor: themeColors.success }]}
                onPress={() => handleRespond("accept")}
                disabled={responding}
              >
                {responding ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <IconSymbol
                      ios_icon_name="checkmark.circle.fill"
                      android_material_icon_name="check-circle"
                      size={20}
                      color="#FFFFFF"
                    />
                    <Text style={styles.actionButtonText}>
                      Accept
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.respondedCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <IconSymbol
                ios_icon_name={message.status === "accepted" ? "checkmark.circle.fill" : "xmark.circle.fill"}
                android_material_icon_name={message.status === "accepted" ? "check-circle" : "cancel"}
                size={48}
                color={statusColor}
              />
              <Text style={[styles.respondedTitle, { color: themeColors.text }]}>
                {message.status === "accepted" ? "Message Accepted" : "Message Rejected"}
              </Text>
              <Text style={[styles.respondedMessage, { color: themeColors.textSecondary }]}>
                You have already responded to this message.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Modal for success/error messages */}
        <Modal
          visible={showModal}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setShowModal(false);
            if (modalConfig.onClose) {
              modalConfig.onClose();
            }
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: themeColors.card }]}>
              <IconSymbol
                ios_icon_name={
                  modalConfig.type === "success" ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
                }
                android_material_icon_name={modalConfig.type === "success" ? "check-circle" : "error"}
                size={48}
                color={modalConfig.type === "success" ? themeColors.success : themeColors.error}
              />
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                {modalConfig.title}
              </Text>
              <Text style={[styles.modalMessage, { color: themeColors.textSecondary }]}>
                {modalConfig.message}
              </Text>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: themeColors.primary }]}
                onPress={() => {
                  setShowModal(false);
                  if (modalConfig.onClose) {
                    modalConfig.onClose();
                  }
                }}
              >
                <Text style={styles.modalButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
  },
  loadingText: {
    ...typography.body,
    marginTop: spacing.md,
  },
  errorTitle: {
    ...typography.h2,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  errorMessage: {
    ...typography.body,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  button: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    ...typography.body,
    fontWeight: '600',
  },
  senderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  senderAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  senderAvatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  senderInfo: {
    flex: 1,
  },
  senderLabel: {
    ...typography.caption,
    marginBottom: spacing.xs,
  },
  senderName: {
    ...typography.h3,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  statusText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  messageCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  messageLabel: {
    ...typography.bodySmall,
    marginBottom: spacing.sm,
    fontWeight: '500',
  },
  messageContent: {
    ...typography.body,
    lineHeight: 24,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  infoText: {
    ...typography.bodySmall,
    marginLeft: spacing.sm,
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    minHeight: 56,
  },
  rejectButton: {
    // Additional styles for reject button
  },
  acceptButton: {
    // Additional styles for accept button
  },
  actionButtonText: {
    color: '#FFFFFF',
    ...typography.body,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  respondedCard: {
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginTop: spacing.md,
    borderWidth: 1,
  },
  respondedTitle: {
    ...typography.h2,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  respondedMessage: {
    ...typography.body,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalTitle: {
    ...typography.h2,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  modalMessage: {
    ...typography.body,
    marginTop: spacing.sm,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  modalButton: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    minWidth: 120,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#FFFFFF',
    ...typography.body,
    fontWeight: '600',
  },
});
