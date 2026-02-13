
import { useRouter } from "expo-router";
import { authenticatedPost } from "@/utils/api";
import { useTheme } from "@react-navigation/native";
import { colors, spacing, borderRadius, typography } from "@/styles/commonStyles";
import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconSymbol } from "@/components/IconSymbol";
import { 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  ActivityIndicator,
  Platform,
  Modal,
  Share,
  LogBox
} from "react-native";

// Suppress warnings in development
LogBox.ignoreLogs(['new NativeEventEmitter']);

const PREDEFINED_MESSAGE = "Do you accept to have lunch with me?";

export default function HomeScreen() {
  const { colors } = useTheme();
  const { user, authLoading } = useAuth();
  const router = useRouter();

  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [modalType, setModalType] = useState<"success" | "error">("success");

  const showConfirmMessage = useCallback((title: string, message: string, type: "success" | "error") => {
    setModalTitle(title);
    setModalMessage(message);
    setModalType(type);
    setModalVisible(true);
  }, []);

  const handleShareLink = useCallback(async () => {
    console.log("User tapped Share Link (Web)");
    try {
      console.log("Generating secure link for message");
      const response = await authenticatedPost("/api/messages/link", {
        message: PREDEFINED_MESSAGE,
      });

      const shareUrl = response.url;
      console.log("Secure link generated:", shareUrl);

      // On web, copy to clipboard
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        showConfirmMessage("Link Copied", "The link has been copied to your clipboard. Share it with someone!", "success");
      } else {
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = shareUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        showConfirmMessage("Link Copied", "The link has been copied to your clipboard. Share it with someone!", "success");
      }

      console.log("Link copied to clipboard");
    } catch (error) {
      console.error("Error sharing link:", error);
      showConfirmMessage("Error", "Failed to generate share link", "error");
    }
  }, [showConfirmMessage]);

  const handleAskButtonPress = useCallback(() => {
    console.log("User tapped Ask button (Web)");
    // On web, only share link is available (no BLE)
    handleShareLink();
  }, [handleShareLink]);

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
  }, []);

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      console.log("User not authenticated, redirecting to auth screen");
      router.replace("/auth");
    }
  }, [user, authLoading, router]);

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
        <Text style={[styles.webNote, { color: colors.text }]}>
          Click to generate a shareable link
        </Text>
      </View>

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
  webNote: {
    marginTop: spacing.md,
    fontSize: typography.sizes.sm,
    textAlign: "center",
    opacity: 0.7,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  confirmModalContent: {
    width: "80%",
    maxWidth: 400,
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
