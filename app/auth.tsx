
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
 * ✅ POST /api/auth/sign-in/email - Email/password sign in (Better Auth)
 * ✅ POST /api/auth/sign-up/email - Email/password sign up (Better Auth)
 * ✅ GET /api/auth/get-session - Get current session (Better Auth)
 * ✅ OAuth flows handled by Better Auth
 */

import React, { useState, useEffect } from "react";
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
  const { user, signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithApple, signInWithGitHub, loading: authLoading } =
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

  // Redirect to home when user is authenticated
  useEffect(() => {
    if (user && !authLoading) {
      console.log("[AuthScreen] User authenticated, redirecting to home...");
      setLoading(false); // Clear loading state
      
      // Small delay to show success state
      setTimeout(() => {
        router.replace("/(tabs)/(home)");
      }, 500);
    }
  }, [user, authLoading, router]);

  const showMessage = (title: string, message: string, type: "success" | "error") => {
    console.log(`[AuthScreen] Showing ${type} message:`, title, message);
    setModalConfig({ title, message, type });
    setShowModal(true);
  };

  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading...</Text>
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
      // For sign up, we need a valid email format
      // If user entered a username, we'll create a synthetic email
      let emailToUse = email;
      let nameToUse = name || email;
      
      if (mode === "signup") {
        if (useUsername) {
          // User entered a username, create a synthetic email
          // The username will be stored in the 'name' field
          emailToUse = `${email}@acceptconnect.local`;
          nameToUse = email; // Store username as name
          console.log(`[AuthScreen] Sign up with username: ${email}, synthetic email: ${emailToUse}`);
        } else {
          // User entered an email
          nameToUse = name || email.split('@')[0]; // Use name or email prefix
          console.log(`[AuthScreen] Sign up with email: ${email}, name: ${nameToUse}`);
        }
        
        console.log(`[AuthScreen] Calling signUpWithEmail...`);
        await signUpWithEmail(emailToUse, password, nameToUse);
        console.log(`[AuthScreen] Sign up successful!`);
        showMessage(
          "Success",
          "Account created successfully! You will be redirected to the home screen.",
          "success"
        );
        // Navigation will happen via useEffect when user state updates
      } else {
        // For sign in, try with the input as-is first
        // If it's a username, try the synthetic email format
        console.log(`[AuthScreen] Calling signInWithEmail...`);
        
        try {
          await signInWithEmail(email, password);
          console.log(`[AuthScreen] Sign in successful!`);
          // Navigation will happen via useEffect when user state updates
        } catch (firstError: any) {
          // If sign in failed and user might have entered a username, try synthetic email
          if (useUsername && !email.includes('@')) {
            console.log(`[AuthScreen] First attempt failed, trying with synthetic email format...`);
            const syntheticEmail = `${email}@acceptconnect.local`;
            await signInWithEmail(syntheticEmail, password);
            console.log(`[AuthScreen] Sign in successful with synthetic email!`);
            // Navigation will happen via useEffect when user state updates
          } else {
            throw firstError;
          }
        }
      }
    } catch (error: any) {
      console.error(`[AuthScreen] ${mode} failed:`, error);
      
      // Extract the most meaningful error message
      let errorMsg = "Authentication failed. Please try again.";
      
      if (error?.message) {
        errorMsg = error.message;
      } else if (error?.error) {
        errorMsg = error.error;
      } else if (typeof error === 'string') {
        errorMsg = error;
      }
      
      // Provide helpful hints for common errors
      if (mode === "signin" && errorMsg.includes("Invalid")) {
        if (useUsername) {
          errorMsg = "Invalid username or password. Please check your credentials and try again.";
        } else {
          errorMsg = "Invalid email or password. Please check your credentials and try again.";
        }
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
      
      console.log(`[AuthScreen] ${provider} authentication initiated successfully!`);
      console.log(`[AuthScreen] Waiting for OAuth callback to complete...`);
      
      // On native platforms, keep loading state active while waiting for deep link
      // On web, the popup will handle the flow
      if (Platform.OS !== "web") {
        console.log(`[AuthScreen] Native platform - waiting for deep link callback...`);
        console.log(`[AuthScreen] Expected deep link format: acceptconnect://?better_auth_token=...`);
        console.log(`[AuthScreen] If authentication doesn't complete, check the backend logs`);
        console.log(`[AuthScreen] The backend must append the token to the redirect URL for native apps`);
      }
      
      // Navigation will happen via useEffect when user state updates after the deep link callback
      // Keep loading state active to show user that authentication is in progress
    } catch (error: any) {
      console.error(`[AuthScreen] ${provider} authentication failed:`, error);
      
      // Provide helpful error messages for common OAuth issues
      let errorMsg = error.message || `${provider} authentication failed. Please try again.`;
      
      // Check if this is the "no token received" error
      if (errorMsg.includes("no token was received") || errorMsg.includes("backend may not be configured")) {
        errorMsg = `OAuth authentication completed but the app couldn't sign you in.\n\n` +
          `This is likely because the backend is not configured to append authentication tokens to redirect URLs for native apps.\n\n` +
          `Technical details:\n` +
          `- The backend OAuth callback must detect native app redirects (URLs starting with "acceptconnect://")\n` +
          `- It must append the session token as a query parameter: ?better_auth_token=<token>\n\n` +
          `Please contact the app administrator to fix this issue.`;
      }
      
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
      setLoading(false);
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

          {__DEV__ && (
            <View style={styles.debugInfo}>
              <Text style={styles.debugTitle}>🔧 Debug Info</Text>
              <Text style={styles.debugText}>
                Backend: {Platform.OS === "web" ? "Web" : "Native"} mode
              </Text>
              <Text style={styles.debugText}>
                Scheme: acceptconnect://
              </Text>
              <Text style={styles.debugText}>
                Check Metro logs for OAuth flow details
              </Text>
            </View>
          )}

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

      {/* Loading Overlay for OAuth */}
      {loading && Platform.OS !== "web" && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingTitle}>Authenticating...</Text>
            <Text style={styles.loadingSubtitle}>
              Complete the sign-in in your browser
            </Text>
            {__DEV__ && (
              <Text style={styles.loadingDebug}>
                Waiting for deep link callback...
              </Text>
            )}
          </View>
        </View>
      )}

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
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
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
  debugInfo: {
    backgroundColor: "#f5f5f5",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: "#333",
  },
  debugText: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
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
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    maxWidth: 300,
    margin: 24,
  },
  loadingTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    color: '#000',
  },
  loadingSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  loadingDebug: {
    fontSize: 12,
    color: '#999',
    marginTop: 12,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
});
