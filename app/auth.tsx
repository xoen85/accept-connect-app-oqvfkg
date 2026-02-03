/**
 * Authentication Screen
 * 
 * Supports multiple authentication methods:
 * - Email/Password (username or email)
 * - Google OAuth
 * - Apple OAuth (iOS only)
 * - GitHub OAuth
 * 
 * Backend Integration:
 * ✅ POST /api/auth/signin - Email/password sign in
 * ✅ POST /api/auth/signup - Email/password sign up
 * ✅ OAuth flows handled by Better Auth
 * 
 * IMPORTANT: Google OAuth Configuration for Android APK
 * ========================================================
 * To enable Google Sign-In on Android builds, you MUST:
 * 
 * 1. Get your SHA-1 fingerprint:
 *    For debug builds:
 *    keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
 * 
 *    For release builds:
 *    keytool -list -v -keystore /path/to/your/release.keystore -alias your-key-alias
 * 
 * 2. Add SHA-1 to Google Cloud Console:
 *    - Go to: https://console.cloud.google.com/apis/credentials
 *    - Select your OAuth 2.0 Client ID for Android
 *    - Add the SHA-1 fingerprint
 *    - Package name: com.alessiobisulca.acceptconnect.com
 * 
 * 3. Verify the Android OAuth Client ID is active and linked
 * 
 * 4. Test the authentication and check logs for detailed error messages
 * 
 * Test Credentials:
 * To test the app, create a new account using:
 * - Username: testuser1 (or any username)
 * - Password: Test123! (or any password with 8+ characters)
 * 
 * Then create a second account to test GPS connections:
 * - Username: testuser2
 * - Password: Test123!
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Modal,
} from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/components/IconSymbol";

type Mode = "signin" | "signup";

export default function AuthScreen() {
  const router = useRouter();
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithApple, signInWithGitHub, loading: authLoading } =
    useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [useUsername, setUseUsername] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    title: string;
    message: string;
    type: "success" | "error";
  }>({ title: "", message: "", type: "success" });

  const showMessage = (title: string, message: string, type: "success" | "error") => {
    setModalConfig({ title, message, type });
    setShowModal(true);
  };

  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const handleEmailAuth = async () => {
    console.log(`[AuthScreen] handleEmailAuth called - mode: ${mode}, email: ${email}, useUsername: ${useUsername}`);
    
    if (!email || !password) {
      const fieldName = useUsername ? "username" : "email";
      const errorMsg = `Please enter ${fieldName} and password`;
      console.log(`[AuthScreen] Validation error: ${errorMsg}`);
      showMessage("Validation Error", errorMsg, "error");
      return;
    }

    if (password.length < 8) {
      const errorMsg = "Password must be at least 8 characters";
      console.log(`[AuthScreen] Validation error: ${errorMsg}`);
      showMessage("Validation Error", errorMsg, "error");
      return;
    }

    setLoading(true);
    console.log(`[AuthScreen] Starting ${mode} process...`);
    
    try {
      if (mode === "signin") {
        console.log(`[AuthScreen] Calling signInWithEmail...`);
        await signInWithEmail(email, password);
        console.log(`[AuthScreen] Sign in successful, navigating to home...`);
        router.replace("/");
      } else {
        console.log(`[AuthScreen] Calling signUpWithEmail...`);
        await signUpWithEmail(email, password, name || email);
        console.log(`[AuthScreen] Sign up successful!`);
        showMessage(
          "Success",
          "Account created successfully! You will be redirected to the home screen.",
          "success"
        );
        setTimeout(() => {
          console.log(`[AuthScreen] Navigating to home...`);
          router.replace("/");
        }, 1500);
      }
    } catch (error: any) {
      console.error(`[AuthScreen] ${mode} failed:`, error);
      console.error(`[AuthScreen] Error object:`, JSON.stringify(error, null, 2));
      
      // Extract the most meaningful error message
      let errorMsg = "Authentication failed. Please try again.";
      
      if (error?.message) {
        errorMsg = error.message;
      } else if (error?.error) {
        errorMsg = error.error;
      } else if (error?.body?.message) {
        errorMsg = error.body.message;
      } else if (typeof error === 'string') {
        errorMsg = error;
      }
      
      console.error(`[AuthScreen] Showing error to user: ${errorMsg}`);
      showMessage(
        mode === "signin" ? "Sign In Failed" : "Sign Up Failed", 
        errorMsg, 
        "error"
      );
    } finally {
      setLoading(false);
      console.log(`[AuthScreen] ${mode} process completed`);
    }
  };

  const handleSocialAuth = async (provider: "google" | "apple" | "github") => {
    console.log(`[AuthScreen] handleSocialAuth called - provider: ${provider}`);
    setLoading(true);
    
    try {
      console.log(`[AuthScreen] Starting ${provider} authentication...`);
      
      if (provider === "google") {
        await signInWithGoogle();
      } else if (provider === "apple") {
        await signInWithApple();
      } else if (provider === "github") {
        await signInWithGitHub();
      }
      
      console.log(`[AuthScreen] ${provider} authentication successful, navigating to home...`);
      router.replace("/");
    } catch (error: any) {
      console.error(`[AuthScreen] ${provider} authentication failed:`, error);
      
      // Provide helpful error messages for common OAuth issues
      let errorMsg = error.message || `${provider} authentication failed. Please try again.`;
      
      // Add specific guidance for Google OAuth on Android
      if (provider === "google" && Platform.OS === "android") {
        if (errorMsg.includes("403") || errorMsg.includes("unauthorized") || errorMsg.includes("invalid")) {
          errorMsg = `Google Sign-In failed. This may be due to:\n\n` +
            `1. Missing SHA-1 fingerprint in Google Cloud Console\n` +
            `2. Incorrect Android package name\n` +
            `3. OAuth client ID not configured\n\n` +
            `Please check the app documentation for setup instructions.\n\n` +
            `Original error: ${errorMsg}`;
        }
      }
      
      console.error(`[AuthScreen] Showing error to user: ${errorMsg}`);
      showMessage("Authentication Error", errorMsg, "error");
    } finally {
      setLoading(false);
      console.log(`[AuthScreen] ${provider} authentication process completed`);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Text style={styles.title}>
            {mode === "signin" ? "Sign In" : "Sign Up"}
          </Text>

          {mode === "signup" && (
            <TextInput
              style={styles.input}
              placeholder="Name (optional)"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          )}

          <TextInput
            style={styles.input}
            placeholder={useUsername ? "Username" : "Email"}
            value={email}
            onChangeText={setEmail}
            keyboardType={useUsername ? "default" : "email-address"}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => setUseUsername(!useUsername)}
          >
            <Text style={styles.toggleText}>
              {useUsername ? "Use email instead" : "Use username instead"}
            </Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleEmailAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {mode === "signin" ? "Sign In" : "Sign Up"}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchModeButton}
            onPress={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            <Text style={styles.switchModeText}>
              {mode === "signin"
                ? "Don't have an account? Sign Up"
                : "Already have an account? Sign In"}
            </Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.socialButton}
            onPress={() => handleSocialAuth("google")}
            disabled={loading}
          >
            <Text style={styles.socialButtonText}>Continue with Google</Text>
          </TouchableOpacity>

          {Platform.OS === "ios" && (
            <TouchableOpacity
              style={[styles.socialButton, styles.appleButton]}
              onPress={() => handleSocialAuth("apple")}
              disabled={loading}
            >
              <Text style={[styles.socialButtonText, styles.appleButtonText]}>
                Continue with Apple
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Message Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <IconSymbol
              ios_icon_name={modalConfig.type === "success" ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"}
              android_material_icon_name={modalConfig.type === "success" ? "check-circle" : "error"}
              size={48}
              color={modalConfig.type === "success" ? "#4CAF50" : "#F44336"}
            />
            <Text style={styles.modalTitle}>
              {modalConfig.title}
            </Text>
            <ScrollView style={styles.modalMessageContainer}>
              <Text style={styles.modalMessage}>
                {modalConfig.message}
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowModal(false)}
            >
              <Text style={styles.modalButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 32,
    textAlign: "center",
    color: "#000",
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  primaryButton: {
    height: 50,
    backgroundColor: "#007AFF",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  switchModeButton: {
    marginTop: 16,
    alignItems: "center",
  },
  switchModeText: {
    color: "#007AFF",
    fontSize: 14,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#ddd",
  },
  dividerText: {
    marginHorizontal: 12,
    color: "#666",
    fontSize: 14,
  },
  socialButton: {
    height: 50,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    backgroundColor: "#fff",
  },
  socialButtonText: {
    fontSize: 16,
    color: "#000",
    fontWeight: "500",
  },
  appleButton: {
    backgroundColor: "#000",
    borderColor: "#000",
  },
  appleButtonText: {
    color: "#fff",
  },
  toggleButton: {
    marginBottom: 8,
    alignItems: 'flex-end',
  },
  toggleText: {
    color: "#007AFF",
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
    color: '#000',
  },
  modalMessageContainer: {
    maxHeight: 300,
    width: '100%',
    marginBottom: 16,
  },
  modalMessage: {
    fontSize: 14,
    textAlign: 'left',
    color: '#666',
    lineHeight: 20,
    paddingVertical: 8,
  },
  modalButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
