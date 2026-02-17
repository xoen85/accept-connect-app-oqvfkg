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
import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { IconSymbol } from "@/components/IconSymbol";
import { useRouter } from "expo-router";

type Mode = "signin" | "signup";

export default function AuthScreen() {
  const { user, loading: authLoading, signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithApple, fetchUser } = useAuth();
  const router = useRouter();
  
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialProvider, setSocialProvider] = useState<string>("");
  
  const socialTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const socialInProgressRef = useRef(false);

  // Navigate to home when user is authenticated
  useEffect(() => {
    if (user && !authLoading) {
      console.log("[AuthScreen] User authenticated, navigating to home");
      
      // Clear any pending timeouts
      if (socialTimeoutRef.current) {
        clearTimeout(socialTimeoutRef.current);
        socialTimeoutRef.current = null;
      }
      
      setSocialLoading(false);
      setSocialProvider("");
      socialInProgressRef.current = false;
      router.replace("/(tabs)/(home)");
    }
  }, [user, authLoading, router]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (socialTimeoutRef.current) {
        clearTimeout(socialTimeoutRef.current);
      }
    };
  }, []);

  const showMessage = (title: string, message: string, type: "success" | "error") => {
    if (type === "success") {
      setSuccess(message);
      setError(null);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(message);
      setSuccess(null);
    }
  };

  const handleEmailAuth = async () => {
    if (!email || !password) {
      showMessage("Error", "Please fill in all fields", "error");
      return;
    }

    if (mode === "signup" && !name) {
      showMessage("Error", "Please enter your name", "error");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (mode === "signin") {
        await signInWithEmail(email, password);
        showMessage("Success", "Signed in successfully!", "success");
      } else {
        await signUpWithEmail(email, password, name);
        showMessage("Success", "Account created successfully!", "success");
      }
    } catch (err: any) {
      console.error("[AuthScreen] Email auth error:", err);
      showMessage("Error", err.message || "Authentication failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSocialAuth = async (provider: "google" | "apple" | "github") => {
    // CRITICAL: Prevent multiple simultaneous OAuth attempts
    if (socialInProgressRef.current) {
      console.warn("[AuthScreen] OAuth already in progress, ignoring duplicate click");
      showMessage("Info", "Authentication already in progress. Please wait.", "error");
      return;
    }

    socialInProgressRef.current = true;
    setSocialLoading(true);
    setSocialProvider(provider);
    setError(null);

    // Set a timeout to prevent infinite loading
    socialTimeoutRef.current = setTimeout(async () => {
      console.log("[AuthScreen] OAuth timeout reached, checking session one more time...");
      
      try {
        await fetchUser();
        
        // If still no user after final check, show error and reset
        if (!user) {
          console.error("[AuthScreen] OAuth completed but no session established");
          showMessage(
            "Error",
            "Authentication completed but session could not be established. Please try again.",
            "error"
          );
          setSocialLoading(false);
          setSocialProvider("");
          socialInProgressRef.current = false;
        }
      } catch (err) {
        console.error("[AuthScreen] Error during timeout check:", err);
        setSocialLoading(false);
        setSocialProvider("");
        socialInProgressRef.current = false;
      }
    }, 15000); // 15 second timeout

    try {
      if (provider === "google") {
        await signInWithGoogle();
      } else if (provider === "apple") {
        await signInWithApple();
      }
      
      // Give the system time to process the OAuth callback
      console.log("[AuthScreen] OAuth initiated, waiting for callback...");
      
    } catch (err: any) {
      console.error(`[AuthScreen] ${provider} auth error:`, err);
      
      // Clear timeout on error
      if (socialTimeoutRef.current) {
        clearTimeout(socialTimeoutRef.current);
        socialTimeoutRef.current = null;
      }
      
      showMessage("Error", err.message || `${provider} sign in failed`, "error");
      setSocialLoading(false);
      setSocialProvider("");
      socialInProgressRef.current = false;
    }
  };

  const isEmailMode = email.includes("@");

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>{mode === "signin" ? "Sign In" : "Sign Up"}</Text>
          <Text style={styles.subtitle}>
            {mode === "signin" ? "Welcome back!" : "Create your account"}
          </Text>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <IconSymbol
              ios_icon_name="exclamationmark.triangle.fill"
              android_material_icon_name="warning"
              size={20}
              color="#fff"
            />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {success && (
          <View style={styles.successContainer}>
            <IconSymbol
              ios_icon_name="checkmark.circle.fill"
              android_material_icon_name="check-circle"
              size={20}
              color="#fff"
            />
            <Text style={styles.successText}>{success}</Text>
          </View>
        )}

        <View style={styles.form}>
          {mode === "signup" && (
            <View style={styles.inputContainer}>
              <IconSymbol
                ios_icon_name="person.fill"
                android_material_icon_name="person"
                size={20}
                color="#666"
              />
              <TextInput
                style={styles.input}
                placeholder="Name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                editable={!loading && !socialLoading}
              />
            </View>
          )}

          <View style={styles.inputContainer}>
            <IconSymbol
              ios_icon_name="envelope.fill"
              android_material_icon_name="email"
              size={20}
              color="#666"
            />
            <TextInput
              style={styles.input}
              placeholder={isEmailMode ? "Email" : "Username"}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!loading && !socialLoading}
            />
          </View>

          <View style={styles.inputContainer}>
            <IconSymbol
              ios_icon_name="lock.fill"
              android_material_icon_name="lock"
              size={20}
              color="#666"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              editable={!loading && !socialLoading}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, (loading || socialLoading) && styles.buttonDisabled]}
            onPress={handleEmailAuth}
            disabled={loading || socialLoading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {mode === "signin" ? "Sign In" : "Sign Up"}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
              setSuccess(null);
            }}
            disabled={loading || socialLoading}
          >
            <Text style={styles.switchText}>
              {mode === "signin"
                ? "Don't have an account? Sign Up"
                : "Already have an account? Sign In"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or continue with</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.socialButtons}>
          <TouchableOpacity
            style={[styles.socialButton, socialLoading && styles.buttonDisabled]}
            onPress={() => handleSocialAuth("google")}
            disabled={loading || socialLoading}
            activeOpacity={0.7}
          >
            {socialLoading && socialProvider === "google" ? (
              <ActivityIndicator color="#666" />
            ) : (
              <>
                <IconSymbol
                  ios_icon_name="g.circle.fill"
                  android_material_icon_name="g-translate"
                  size={24}
                  color="#666"
                />
                <Text style={styles.socialButtonText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          {Platform.OS === "ios" && (
            <TouchableOpacity
              style={[styles.socialButton, styles.appleButton, socialLoading && styles.buttonDisabled]}
              onPress={() => handleSocialAuth("apple")}
              disabled={loading || socialLoading}
              activeOpacity={0.7}
            >
              {socialLoading && socialProvider === "apple" ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <IconSymbol
                    ios_icon_name="apple.logo"
                    android_material_icon_name="apple"
                    size={24}
                    color="#fff"
                  />
                  <Text style={[styles.socialButtonText, styles.appleButtonText]}>
                    Continue with Apple
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {socialLoading && (
          <View style={styles.loadingHint}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.loadingHintText}>
              Completing authentication...
            </Text>
            <Text style={styles.loadingSubtext}>
              This may take a few seconds
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#000",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ff3b30",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    color: "#fff",
    fontSize: 14,
    flex: 1,
  },
  successContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#34c759",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  successText: {
    color: "#fff",
    fontSize: 14,
    flex: 1,
  },
  form: {
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: 16,
    color: "#000",
  },
  button: {
    backgroundColor: "#007AFF",
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  switchText: {
    color: "#007AFF",
    fontSize: 14,
    textAlign: "center",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#e0e0e0",
  },
  dividerText: {
    color: "#666",
    fontSize: 14,
    marginHorizontal: 16,
  },
  socialButtons: {
    gap: 12,
  },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f5f5",
    height: 50,
    borderRadius: 12,
    gap: 12,
  },
  socialButtonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "500",
  },
  appleButton: {
    backgroundColor: "#000",
  },
  appleButtonText: {
    color: "#fff",
  },
  loadingHint: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    gap: 8,
  },
  loadingHintText: {
    color: "#666",
    fontSize: 14,
    fontWeight: "500",
  },
  loadingSubtext: {
    color: "#999",
    fontSize: 12,
  },
});
