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
    // TODO: Backend Integration - GET /api/messages/sent to fetch sent messages
    // TODO: Backend Integration - GET /api/messages/received to fetch received messages
    setLoadingMessages(false);
  };

  const handleSendMessage = async () => {
    console.log("Send message button tapped");
    
    if (!recipientEmail.trim()) {
      Alert.alert("Error", "Please enter recipient email");
      return;
    }
    
    if (!messageContent.trim()) {
      Alert.alert("Error", "Please enter a message");
      return;
    }

    console.log("Sending message to:", recipientEmail);
    setSending(true);

    try {
      // TODO: Backend Integration - POST /api/messages with { recipientEmail, content: messageContent }
      // Expected response: { id, linkToken, shareUrl, expiresAt }
      
      // Simulate API call for now
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockShareUrl = `https://acceptconnect.app/message/mock-token-${Date.now()}`;
      
      // Share the link
      await Share.share({
        message: `You have received a message on Accept Connect. Open this link to view and respond: ${mockShareUrl}`,
        url: mockShareUrl,
        title: "Accept Connect Message",
      });

      console.log("Message sent successfully");
      Alert.alert("Success", "Message sent! The recipient will receive a secure link.");
      
      // Clear form
      setRecipientEmail("");
      setMessageContent("");
      
      // Reload messages
      loadMessages();
    } catch (error) {
      console.error("Error sending message:", error);
      Alert.alert("Error", "Failed to send message. Please try again.");
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
  const userEmailDisplay = user.email || "";

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
            <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
              Your sent and received messages will appear here
            </Text>
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
});
