
import React, { useState, useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView,
  Share,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useTheme } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { IconSymbol } from "@/components/IconSymbol";
import { colors, spacing, borderRadius, typography } from "@/styles/commonStyles";
import { authenticatedGet, authenticatedPost } from "@/utils/api";

const PREDEFINED_MESSAGES = [
  "Do you accept to have lunch with me?",
  "Do you accept to have coffee with me?",
  "Do you accept to meet me for a business discussion?",
  "Do you accept to join me for dinner?",
  "Do you accept to attend the event with me?",
  "Do you accept to collaborate on this project?",
];

export default function HomeScreen() {
  const theme = useTheme();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const isDark = theme.dark;
  const themeColors = isDark ? colors.dark : colors.light;

  const [recipientEmail, setRecipientEmail] = useState("");
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sentMessages, setSentMessages] = useState<any[]>([]);
  const [receivedMessages, setReceivedMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

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
    console.log("Loading messages for user");
    setLoadingMessages(true);
    try {
      const [sentResponse, receivedResponse] = await Promise.all([
        authenticatedGet<any[]>("/api/messages?type=sent"),
        authenticatedGet<any[]>("/api/messages?type=received"),
      ]);
      
      console.log("Sent messages:", sentResponse);
      console.log("Received messages:", receivedResponse);
      
      setSentMessages(sentResponse || []);
      setReceivedMessages(receivedResponse || []);
    } catch (error) {
      console.error("Error loading messages:", error);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSendMessage = async () => {
    console.log("Send message button tapped");
    
    if (!recipientEmail.trim()) {
      Alert.alert("Error", "Please enter recipient email");
      return;
    }
    
    if (!selectedMessage) {
      Alert.alert("Error", "Please select a message");
      return;
    }

    console.log("Sending predefined message to:", recipientEmail);
    setSending(true);

    try {
      const response = await authenticatedPost<{
        id: string;
        linkToken: string;
        shareUrl: string;
        expiresAt: string;
      }>("/api/messages", {
        recipientEmail: recipientEmail.trim(),
        content: selectedMessage,
      });
      
      console.log("Message created:", response);
      
      let shareUrl = response.shareUrl;
      if (!shareUrl) {
        shareUrl = `https://acceptconnect.app/message/${response.linkToken}`;
      }
      
      await Share.share({
        message: `You have received a message on Accept Connect. Open this link to view and respond: ${shareUrl}`,
        url: shareUrl,
        title: "Accept Connect Message",
      });

      console.log("Message sent successfully");
      Alert.alert("Success", "Message sent! The recipient will receive a secure link.");
      
      setRecipientEmail("");
      setSelectedMessage(null);
      
      loadMessages();
    } catch (error: any) {
      console.error("Error sending message:", error);
      const errorMessage = error?.message || "Failed to send message. Please try again.";
      Alert.alert("Error", errorMessage);
    } finally {
      setSending(false);
    }
  };

  if (authLoading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "Accept Connect",
            headerLargeTitle: true,
          }}
        />
        <View style={[styles.container, { backgroundColor: themeColors.background }]}>
          <ActivityIndicator size="large" color={themeColors.primary} />
        </View>
      </>
    );
  }

  if (!user) {
    return null;
  }

  const userNameDisplay = user.name || "User";

  return (
    <>
      <Stack.Screen
        options={{
          title: "Accept Connect",
          headerLargeTitle: true,
        }}
      />
      <ScrollView 
        style={[styles.container, { backgroundColor: themeColors.background }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.greeting, { color: themeColors.text }]}>
            Hello
          </Text>
          <Text style={[styles.userName, { color: themeColors.text }]}>
            {userNameDisplay}
          </Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            Send consent requests with predefined messages
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <View style={styles.cardHeader}>
            <IconSymbol 
              ios_icon_name="paperplane.fill" 
              android_material_icon_name="send" 
              size={24} 
              color={themeColors.primary} 
            />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>
              Send Consent Request
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
              Select Message
            </Text>
            <Text style={[styles.helperText, { color: themeColors.textSecondary }]}>
              Choose a predefined message. Messages cannot be edited.
            </Text>
            <View style={styles.messageOptions}>
              {PREDEFINED_MESSAGES.map((message, index) => {
                const isSelected = selectedMessage === message;
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.messageOption,
                      {
                        backgroundColor: isSelected ? themeColors.primary + '20' : themeColors.surface,
                        borderColor: isSelected ? themeColors.primary : themeColors.border,
                      },
                    ]}
                    onPress={() => setSelectedMessage(message)}
                  >
                    <View style={styles.messageOptionContent}>
                      <View
                        style={[
                          styles.radioButton,
                          {
                            borderColor: isSelected ? themeColors.primary : themeColors.border,
                            backgroundColor: isSelected ? themeColors.primary : 'transparent',
                          },
                        ]}
                      >
                        {isSelected && (
                          <IconSymbol
                            ios_icon_name="checkmark"
                            android_material_icon_name="check"
                            size={14}
                            color="#FFFFFF"
                          />
                        )}
                      </View>
                      <Text
                        style={[
                          styles.messageOptionText,
                          {
                            color: isSelected ? themeColors.primary : themeColors.text,
                          },
                        ]}
                      >
                        {message}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.sendButton,
              {
                backgroundColor: selectedMessage && recipientEmail.trim() ? themeColors.primary : themeColors.border,
              },
            ]}
            onPress={handleSendMessage}
            disabled={sending || !selectedMessage || !recipientEmail.trim()}
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

        <View style={[styles.infoCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <IconSymbol 
            ios_icon_name="info.circle.fill" 
            android_material_icon_name="info" 
            size={20} 
            color={themeColors.primary} 
          />
          <Text style={[styles.infoText, { color: themeColors.textSecondary }]}>
            The recipient will receive a secure link to view and accept or reject your message. No emails are sent.
          </Text>
        </View>

        <View style={styles.messagesSection}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
            Recent Activity
          </Text>
          
          {loadingMessages ? (
            <ActivityIndicator size="small" color={themeColors.primary} style={styles.loader} />
          ) : (
            <>
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
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
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
  helperText: {
    ...typography.caption,
    marginBottom: spacing.sm,
    fontStyle: 'italic',
  },
  input: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...typography.body,
    borderWidth: 1,
  },
  messageOptions: {
    gap: spacing.sm,
  },
  messageOption: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 2,
  },
  messageOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    marginRight: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageOptionText: {
    ...typography.body,
    flex: 1,
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
});
