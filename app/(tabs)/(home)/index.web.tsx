
import React, { useState, useEffect } from "react";
import { 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  ActivityIndicator,
  Platform,
  Modal,
  Share,
} from "react-native";
import { useTheme } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/components/IconSymbol";
import { colors, spacing, borderRadius, typography } from "@/styles/commonStyles";
import { SafeAreaView } from "react-native-safe-area-context";
import { authenticatedPost } from "@/utils/api";

// Predefined message - non-editable
const PREDEFINED_MESSAGE = "Do you accept to have lunch with me?";

export default function HomeScreen() {
  const theme = useTheme();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const isDark = theme.dark;
  const themeColors = isDark ? colors.dark : colors.light;

  const [sending, setSending] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    title: string;
    message: string;
    type: "success" | "error";
  }>({ title: "", message: "", type: "success" });

  useEffect(() => {
    console.log("[HomeScreen Web] Mounted, user:", user);
    if (!authLoading && !user) {
      console.log("[HomeScreen Web] User not authenticated, redirecting to auth");
      router.replace("/auth");
    }
  }, [user, authLoading]);

  const showConfirmMessage = (title: string, message: string, type: "success" | "error") => {
    setConfirmModalConfig({ title, message, type });
    setShowConfirmModal(true);
  };

  const handleAskButtonPress = async () => {
    console.log("[HomeScreen Web] Ask button pressed - sharing link");
    
    // On web, we only support link sharing (no Bluetooth)
    handleShareLink();
  };

  const handleShareLink = async () => {
    console.log("[HomeScreen Web] Share link option selected");
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

      console.log("[HomeScreen Web] Message created with link:", response);

      let shareUrl = response.shareUrl;
      if (!shareUrl) {
        shareUrl = `${window.location.origin}/message/${response.linkToken}`;
      }

      // On web, we'll copy to clipboard and show the link
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        showConfirmMessage(
          "Link Copied",
          `Your secure link has been copied to clipboard:\n\n${shareUrl}\n\nShare it via WhatsApp, Messenger, or any other app. The recipient must authenticate to respond.`,
          "success"
        );
      } else {
        // Fallback: show the link in a modal
        showConfirmMessage(
          "Share This Link",
          `Copy and share this secure link:\n\n${shareUrl}\n\nThe recipient must authenticate to respond.`,
          "success"
        );
      }

      console.log("[HomeScreen Web] Link generated successfully");
    } catch (error: any) {
      console.error("[HomeScreen Web] Error sharing link:", error);
      showConfirmMessage(
        "Error",
        error?.message || "Failed to generate link. Please try again.",
        "error"
      );
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

          <View style={[styles.webNotice, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <IconSymbol
              ios_icon_name="info.circle"
              android_material_icon_name="info"
              size={20}
              color={themeColors.primary}
            />
            <Text style={[styles.webNoticeText, { color: themeColors.textSecondary }]}>
              Web version: Tap &quot;Ask&quot; to generate a shareable link. Bluetooth proximity features are available on mobile apps.
            </Text>
          </View>
        </View>
      </View>

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
    boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.3)',
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
  webNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    maxWidth: 500,
  },
  webNoticeText: {
    ...typography.bodySmall,
    marginLeft: spacing.sm,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmModalContent: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    margin: spacing.lg,
    alignItems: 'center',
    maxWidth: 500,
    width: '90%',
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
