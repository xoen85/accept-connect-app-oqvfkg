import React, { useState, useEffect } from "react";
import { 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView,
  Share,
  ActivityIndicator,
  Platform,
  Modal,
} from "react-native";
import { useTheme } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/components/IconSymbol";
import { colors, spacing, borderRadius, typography } from "@/styles/commonStyles";
import { SafeAreaView } from "react-native-safe-area-context";
import { authenticatedGet, authenticatedPost } from "@/utils/api";

export default function HomeScreen() {
  const theme = useTheme();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const isDark = theme.dark;
  const themeColors = isDark ? colors.dark : colors.light;

  const [recipientEmail, setRecipientEmail] = useState("");
  const [messageContent, setMessageContent] = useState("");
  const [sending, setSending] = useState(false);
  const [sentMessages, setSentMessages] = useState<any[]>([]);
  const [receivedMessages, setReceivedMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    title: string;
    message: string;
    type: "success" | "error";
  }>({ title: "", message: "", type: "success" });

  useEffect(() => {
    console.log("HomeScreen mounted, user:", user);
    if (!authLoading && !user) {
      console.log("User not authenticated, redirecting to auth screen");
      router.replace("/auth");
    } else if (user) {
      console.log("User authenticated, loading messages");
      loadMessages();
    }
  }, [user, authLoading]);

  const loadMessages = async () => {
    console.log("[HomeScreen] Loading messages for user");
    setLoadingMessages(true);
    try {
      // Fetch sent and received messages in parallel
      const [sentResponse, receivedResponse] = await Promise.all([
        authenticatedGet<any[]>("/api/messages?type=sent"),
        authenticatedGet<any[]>("/api/messages?type=received"),
      ]);
      
      console.log("[HomeScreen] Sent messages:", sentResponse);
      console.log("[HomeScreen] Received messages:", receivedResponse);
      
      setSentMessages(sentResponse || []);
      setReceivedMessages(receivedResponse || []);
    } catch (error) {
      console.error("[HomeScreen] Error loading messages:", error);
      // Don't show error modal on initial load, just log it
    } finally {
      setLoadingMessages(false);
    }
  };

  const showModalMessage = (title: string, message: string, type: "success" | "error") => {
    setModalConfig({ title, message, type });
    setShowModal(true);
  };

  const handleSendMessage = async () => {
    console.log("[HomeScreen] Send message button tapped");
    
    if (!recipientEmail.trim()) {
      showModalMessage("Error", "Please enter recipient email", "error");
      return;
    }
    
    if (!messageContent.trim()) {
      showModalMessage("Error", "Please enter a message", "error");
      return;
    }

    console.log("[HomeScreen] Sending message to:", recipientEmail);
    setSending(true);

    try {
      // POST /api/messages with { recipientEmail, content }
      const response = await authenticatedPost<{
        id: string;
        linkToken: string;
        shareUrl: string;
        expiresAt: string;
      }>("/api/messages", {
        recipientEmail: recipientEmail.trim(),
        content: messageContent.trim(),
      });
      
      console.log("[HomeScreen] Message created:", response);
      
      // Share the link - construct URL based on platform
      let shareUrl = response.shareUrl;
      if (!shareUrl) {
        // Fallback: construct URL manually
        if (Platform.OS === 'web') {
          shareUrl = `${window.location.origin}/message/${response.linkToken}`;
        } else {
          // For native, use a universal link or deep link
          shareUrl = `https://acceptconnect.app/message/${response.linkToken}`;
        }
      }
      
      await Share.share({
        message: `You have received a message on Accept Connect. Open this link to view and respond: ${shareUrl}`,
        url: shareUrl,
        title: "Accept Connect Message",
      });

      console.log("[HomeScreen] Message sent successfully");
      showModalMessage("Success", "Message sent! The recipient will receive a secure link.", "success");
      
      // Clear form
      setRecipientEmail("");
      setMessageContent("");
      
      // Reload messages
      loadMessages();
    } catch (error: any) {
      console.error("[HomeScreen] Error sending message:", error);
      const errorMessage = error?.message || "Failed to send message. Please try again.";
      showModalMessage("Error", errorMessage, "error");
    } finally {
      setSending(false);
    }
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
  const userEmailDisplay = user.email || "";

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.greeting, { color: themeColors.text }]}>
            Hello
          </Text>
          <Text style={[styles.userName, { color: themeColors.text }]}>
            {userNameDisplay}
          </Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            Send secure messages that require acceptance
          </Text>
        </View>

        {/* Send Message Card */}
        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <View style={styles.cardHeader}>
            <IconSymbol 
              ios_icon_name="paperplane.fill" 
              android_material_icon_name="send" 
              size={24} 
              color={themeColors.primary} 
            />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>
              Send Message
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: themeColors.textSecondary }]}>
              Recipient Email
            </Text>
            <TextInput
              style={[styles.input, { 
                backgroundColor: themeColors.surface, 
                color: themeColors.text,
                borderColor: themeColors.border,
              }]}
              placeholder="recipient@example.com"
              placeholderTextColor={themeColors.textSecondary}
              value={recipientEmail}
              onChangeText={setRecipientEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: themeColors.textSecondary }]}>
              Message
            </Text>
            <TextInput
              style={[styles.textArea, { 
                backgroundColor: themeColors.surface, 
                color: themeColors.text,
                borderColor: themeColors.border,
              }]}
              placeholder="Enter your message here..."
              placeholderTextColor={themeColors.textSecondary}
              value={messageContent}
              onChangeText={setMessageContent}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: themeColors.primary }]}
            onPress={handleSendMessage}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <IconSymbol 
                  ios_icon_name="paperplane.fill" 
                  android_material_icon_name="send" 
                  size={20} 
                  color="#FFFFFF" 
                />
                <Text style={styles.sendButtonText}>
                  Send Secure Link
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Info Card */}
        <View style={[styles.infoCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <IconSymbol 
            ios_icon_name="info.circle.fill" 
            android_material_icon_name="info" 
            size={20} 
            color={themeColors.primary} 
          />
          <Text style={[styles.infoText, { color: themeColors.textSecondary }]}>
            The recipient will receive a secure link to view and accept or reject your message.
          </Text>
        </View>

        {/* Messages Section */}
        <View style={styles.messagesSection}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
            Recent Activity
          </Text>
          
          {loadingMessages ? (
            <ActivityIndicator size="small" color={themeColors.primary} style={styles.loader} />
          ) : (
            <>
              {/* Received Messages */}
              {receivedMessages.length > 0 && (
                <View style={styles.messageGroup}>
                  <Text style={[styles.messageGroupTitle, { color: themeColors.textSecondary }]}>
                    Received
                  </Text>
                  {receivedMessages.map((msg) => (
                    <View
                      key={msg.id}
                      style={[styles.messageItem, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
                    >
                      <View style={styles.messageItemHeader}>
                        <Text style={[styles.messageItemSender, { color: themeColors.text }]}>
                          From: {msg.senderName || msg.senderId}
                        </Text>
                        <View
                          style={[
                            styles.messageStatusBadge,
                            {
                              backgroundColor:
                                msg.status === "accepted"
                                  ? themeColors.success + "20"
                                  : msg.status === "rejected"
                                  ? themeColors.error + "20"
                                  : themeColors.warning + "20",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.messageStatusText,
                              {
                                color:
                                  msg.status === "accepted"
                                    ? themeColors.success
                                    : msg.status === "rejected"
                                    ? themeColors.error
                                    : themeColors.warning,
                              },
                            ]}
                          >
                            {msg.status}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[styles.messageItemContent, { color: themeColors.textSecondary }]}
                        numberOfLines={2}
                      >
                        {msg.content}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Sent Messages */}
              {sentMessages.length > 0 && (
                <View style={styles.messageGroup}>
                  <Text style={[styles.messageGroupTitle, { color: themeColors.textSecondary }]}>
                    Sent
                  </Text>
                  {sentMessages.map((msg) => (
                    <View
                      key={msg.id}
                      style={[styles.messageItem, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
                    >
                      <View style={styles.messageItemHeader}>
                        <Text style={[styles.messageItemSender, { color: themeColors.text }]}>
                          To: {msg.recipientEmail}
                        </Text>
                        <View
                          style={[
                            styles.messageStatusBadge,
                            {
                              backgroundColor:
                                msg.status === "accepted"
                                  ? themeColors.success + "20"
                                  : msg.status === "rejected"
                                  ? themeColors.error + "20"
                                  : themeColors.warning + "20",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.messageStatusText,
                              {
                                color:
                                  msg.status === "accepted"
                                    ? themeColors.success
                                    : msg.status === "rejected"
                                    ? themeColors.error
                                    : themeColors.warning,
                              },
                            ]}
                          >
                            {msg.status}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[styles.messageItemContent, { color: themeColors.textSecondary }]}
                        numberOfLines={2}
                      >
                        {msg.content}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {sentMessages.length === 0 && receivedMessages.length === 0 && (
                <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                  Your sent and received messages will appear here
                </Text>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* Modal for success/error messages */}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.card }]}>
            <IconSymbol
              ios_icon_name={modalConfig.type === "success" ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"}
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
              onPress={() => setShowModal(false)}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : spacing.sm,
  },
  header: {
    marginBottom: spacing.lg,
  },
  greeting: {
    ...typography.h3,
    marginBottom: spacing.xs,
  },
  userName: {
    ...typography.h1,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.bodySmall,
  },
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  cardTitle: {
    ...typography.h3,
    marginLeft: spacing.sm,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.bodySmall,
    marginBottom: spacing.xs,
    fontWeight: '500',
  },
  input: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...typography.body,
    borderWidth: 1,
  },
  textArea: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...typography.body,
    minHeight: 120,
    borderWidth: 1,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  sendButtonText: {
    color: '#FFFFFF',
    ...typography.body,
    fontWeight: '600',
    marginLeft: spacing.sm,
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
  messagesSection: {
    marginTop: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  loader: {
    marginTop: spacing.lg,
  },
  messageGroup: {
    marginBottom: spacing.lg,
  },
  messageGroupTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  messageItem: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  messageItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  messageItemSender: {
    ...typography.bodySmall,
    fontWeight: '600',
    flex: 1,
  },
  messageStatusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  messageStatusText: {
    ...typography.caption,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  messageItemContent: {
    ...typography.bodySmall,
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
