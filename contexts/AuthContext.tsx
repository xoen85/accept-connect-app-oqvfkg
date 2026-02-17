
import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { authClient, setBearerToken, clearAuthTokens, getBearerToken, API_URL } from "@/lib/auth";
import { useRouter } from "expo-router";

interface User {
  id: string;
  email: string;
  name?: string;
  image?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithGitHub: () => Promise<void>;
  signOut: () => Promise<void>;
  fetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function openOAuthPopup(provider: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const popupUrl = `${window.location.origin}/auth-popup?provider=${provider}`;
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      popupUrl,
      "oauth-popup",
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
    );

    if (!popup) {
      reject(new Error("Failed to open popup. Please allow popups."));
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "oauth-success" && event.data?.token) {
        window.removeEventListener("message", handleMessage);
        clearInterval(checkClosed);
        resolve(event.data.token);
      } else if (event.data?.type === "oauth-error") {
        window.removeEventListener("message", handleMessage);
        clearInterval(checkClosed);
        reject(new Error(event.data.error || "OAuth failed"));
      }
    };

    window.addEventListener("message", handleMessage);

    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener("message", handleMessage);
        reject(new Error("Authentication cancelled"));
      }
    }, 500);
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  
  // Track if OAuth flow is in progress to prevent multiple simultaneous attempts
  const oauthInProgressRef = useRef(false);

  useEffect(() => {
    console.log("[AuthContext] Initializing, fetching user...");
    fetchUser();

    // Listen for deep links (e.g. from social auth redirects)
    const subscription = Linking.addEventListener("url", async (event) => {
      console.log("[AuthContext] Deep link received:", event.url);
      
      try {
        // Parse the URL to extract query parameters
        let token: string | null = null;
        
        try {
          const url = new URL(event.url);
          token = url.searchParams.get("better_auth_token");
          console.log("[AuthContext] Parsed as standard URL, token found:", !!token);
        } catch (urlError) {
          console.log("[AuthContext] Standard URL parsing failed, trying manual extraction...");
          const match = event.url.match(/[?&]better_auth_token=([^&]+)/);
          if (match && match[1]) {
            token = decodeURIComponent(match[1]);
            console.log("[AuthContext] Token extracted manually:", !!token);
          }
        }
        
        if (token) {
          console.log("[AuthContext] Found bearer token in deep link");
          await setBearerToken(token);
          console.log("[AuthContext] Token saved, establishing session...");
          
          // Clear OAuth in progress flag
          oauthInProgressRef.current = false;
          
          // Immediately establish the session with the backend
          try {
            const response = await fetch(`${API_URL}/api/user/oauth-session`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ token }),
            });
            
            if (response.ok) {
              const data = await response.json();
              console.log("[AuthContext] OAuth session established:", data.user.email);
              setUser(data.user as User);
              
              // Small delay to ensure state is updated before navigation
              setTimeout(() => {
                router.replace("/(tabs)/(home)");
              }, 100);
            } else {
              console.error("[AuthContext] Failed to establish OAuth session");
              await fetchUser();
            }
          } catch (error) {
            console.error("[AuthContext] Error establishing OAuth session:", error);
            await fetchUser();
          }
        } else {
          console.log("[AuthContext] No token in URL, waiting for Better Auth...");
          
          // Clear OAuth in progress flag
          oauthInProgressRef.current = false;
          
          setTimeout(async () => {
            await fetchUser();
            if (user) {
              router.replace("/(tabs)/(home)");
            }
          }, 1000);
        }
      } catch (error) {
        console.error("[AuthContext] Error processing deep link:", error);
        // Clear OAuth in progress flag on error
        oauthInProgressRef.current = false;
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const fetchUser = async () => {
    try {
      setLoading(true);
      console.log("[AuthContext] Fetching user session...");
      
      // First, try to get the bearer token
      const token = await getBearerToken();
      
      if (token) {
        console.log("[AuthContext] Bearer token found, verifying with backend...");
        
        // Use the backend's verify endpoint to check if the token is still valid
        try {
          const response = await fetch(`${API_URL}/api/user/verify-oauth-token?token=${encodeURIComponent(token)}`);
          
          if (response.ok) {
            const data = await response.json();
            console.log("[AuthContext] Token verification successful:", data.user.email);
            setUser(data.user as User);
            return;
          } else {
            const errorData = await response.json().catch(() => ({}));
            console.log("[AuthContext] Token verification failed:", errorData);
            
            // If token is invalid or expired, clear it
            if (response.status === 401) {
              console.log("[AuthContext] Token expired or invalid, clearing...");
              await clearAuthTokens();
            }
          }
        } catch (verifyError) {
          console.error("[AuthContext] Token verification error:", verifyError);
          await clearAuthTokens();
        }
      }
      
      // Fallback to Better Auth's session endpoint (cookie-based)
      console.log("[AuthContext] Trying Better Auth session endpoint...");
      const session = await authClient.getSession();
      console.log("[AuthContext] Session response:", session);
      
      if (session?.data?.user) {
        console.log("[AuthContext] User session found:", session.data.user.email);
        setUser(session.data.user as User);
        
        // Sync token to storage
        if (session.data.session?.token) {
          await setBearerToken(session.data.session.token);
        }
      } else {
        console.log("[AuthContext] No active session found");
        setUser(null);
      }
    } catch (error) {
      console.error("[AuthContext] Failed to fetch user:", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      console.log("[AuthContext] Signing in with email:", email);
      
      const callbackURL = Platform.OS === "web" 
        ? `${window.location.origin}/auth-callback`
        : "acceptconnect://auth-callback";
      
      console.log("[AuthContext] Using callback URL:", callbackURL);
      
      const result = await authClient.signIn.email({ 
        email, 
        password,
        callbackURL,
      });
      
      console.log("[AuthContext] Sign in result:", result);
      
      if (result.error) {
        console.error("[AuthContext] Sign in error:", result.error);
        throw new Error(result.error.message || "Sign in failed");
      }
      
      console.log("[AuthContext] Sign in successful, fetching user...");
      
      // Wait a moment for the session to be established
      await new Promise(resolve => setTimeout(resolve, 300));
      await fetchUser();
      
      // If user is still not set, try to get the session token from Better Auth
      if (!user) {
        console.log("[AuthContext] User not set after fetchUser, trying to get session...");
        const session = await authClient.getSession();
        if (session?.data?.user) {
          setUser(session.data.user as User);
          
          // Try to extract and save the token if available
          if (session.data.session?.token) {
            await setBearerToken(session.data.session.token);
          }
        }
      }
    } catch (error: any) {
      console.error("[AuthContext] Email sign in failed:", error);
      
      let errorMsg = "Sign in failed. Please check your credentials.";
      if (error?.message) {
        errorMsg = error.message;
      } else if (error?.error?.message) {
        errorMsg = error.error.message;
      }
      
      throw new Error(errorMsg);
    }
  };

  const signUpWithEmail = async (email: string, password: string, name?: string) => {
    try {
      console.log("[AuthContext] Signing up with email:", email, "name:", name);
      
      const callbackURL = Platform.OS === "web" 
        ? `${window.location.origin}/auth-callback`
        : "acceptconnect://auth-callback";
      
      console.log("[AuthContext] Using callback URL:", callbackURL);
      
      const result = await authClient.signUp.email({
        email,
        password,
        name: name || email,
        callbackURL,
      });
      
      console.log("[AuthContext] Sign up result:", result);
      
      if (result.error) {
        console.error("[AuthContext] Sign up error:", result.error);
        throw new Error(result.error.message || "Sign up failed");
      }
      
      console.log("[AuthContext] Sign up successful, fetching user...");
      
      // Wait a moment for the session to be established
      await new Promise(resolve => setTimeout(resolve, 300));
      await fetchUser();
      
      // If user is still not set, try to get the session token from Better Auth
      if (!user) {
        console.log("[AuthContext] User not set after fetchUser, trying to get session...");
        const session = await authClient.getSession();
        if (session?.data?.user) {
          setUser(session.data.user as User);
          
          // Try to extract and save the token if available
          if (session.data.session?.token) {
            await setBearerToken(session.data.session.token);
          }
        }
      }
    } catch (error: any) {
      console.error("[AuthContext] Email sign up failed:", error);
      
      let errorMsg = "Sign up failed. Email may already be in use.";
      if (error?.message) {
        errorMsg = error.message;
      } else if (error?.error?.message) {
        errorMsg = error.error.message;
      }
      
      throw new Error(errorMsg);
    }
  };

  const signInWithSocial = async (provider: "google" | "apple" | "github") => {
    // CRITICAL: Prevent multiple simultaneous OAuth attempts
    if (oauthInProgressRef.current) {
      console.warn(`[AuthContext] ${provider} OAuth already in progress, ignoring duplicate request`);
      throw new Error("Authentication already in progress. Please wait.");
    }

    try {
      console.log(`[AuthContext] Starting ${provider} sign in...`);
      oauthInProgressRef.current = true;
      
      if (Platform.OS === "web") {
        console.log(`[AuthContext] Web platform - opening OAuth popup for ${provider}`);
        const token = await openOAuthPopup(provider);
        console.log(`[AuthContext] OAuth popup returned token`);
        await setBearerToken(token);
        
        // Establish session with the backend using the token
        console.log(`[AuthContext] Establishing OAuth session with backend...`);
        const response = await fetch(`${API_URL}/api/user/oauth-session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log(`[AuthContext] OAuth session established:`, data.user.email);
          setUser(data.user as User);
        } else {
          console.error(`[AuthContext] Failed to establish OAuth session, falling back to fetchUser`);
          await fetchUser();
        }
        
        // Clear the flag after successful completion
        oauthInProgressRef.current = false;
        
      } else {
        // Native: Use WebBrowser to open OAuth flow
        const callbackURL = "acceptconnect://auth-callback";
        console.log(`[AuthContext] Native platform - callback URL: ${callbackURL}`);
        
        const result = await authClient.signIn.social({
          provider,
          callbackURL,
        });
        
        console.log(`[AuthContext] Social sign in result:`, result);
        
        if (result.error) {
          console.error(`[AuthContext] ${provider} sign in error:`, result.error);
          oauthInProgressRef.current = false;
          throw new Error(result.error.message || `${provider} sign in failed`);
        }
        
        if (result.data?.url) {
          console.log(`[AuthContext] Opening OAuth URL in browser`);
          
          try {
            const browserResult = await WebBrowser.openAuthSessionAsync(
              result.data.url,
              callbackURL
            );
            
            console.log(`[AuthContext] Browser result type:`, browserResult.type);
            
            if (browserResult.type === "success" && browserResult.url) {
              console.log(`[AuthContext] OAuth callback received`);
              
              // Extract token from callback URL
              let token: string | null = null;
              
              try {
                const url = new URL(browserResult.url);
                token = url.searchParams.get("better_auth_token");
              } catch (urlError) {
                const match = browserResult.url.match(/[?&]better_auth_token=([^&]+)/);
                if (match && match[1]) {
                  token = decodeURIComponent(match[1]);
                }
              }
              
              if (token) {
                console.log(`[AuthContext] Token found in callback, saving...`);
                await setBearerToken(token);
                
                // Establish session with the backend using the token
                console.log(`[AuthContext] Establishing OAuth session with backend...`);
                try {
                  const response = await fetch(`${API_URL}/api/user/oauth-session`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ token }),
                  });
                  
                  if (response.ok) {
                    const data = await response.json();
                    console.log(`[AuthContext] OAuth session established:`, data.user.email);
                    setUser(data.user as User);
                  } else {
                    console.error(`[AuthContext] Failed to establish OAuth session, falling back to fetchUser`);
                    await fetchUser();
                  }
                } catch (error) {
                  console.error(`[AuthContext] Error establishing OAuth session:`, error);
                  await fetchUser();
                }
              } else {
                console.warn(`[AuthContext] No token in callback URL, waiting for session...`);
                // Give Better Auth time to process
                await new Promise(resolve => setTimeout(resolve, 1500));
                await fetchUser();
              }
              
              // Clear the flag after processing callback
              oauthInProgressRef.current = false;
              
            } else if (browserResult.type === "cancel") {
              oauthInProgressRef.current = false;
              throw new Error("Authentication cancelled");
            } else {
              oauthInProgressRef.current = false;
              throw new Error("Authentication failed");
            }
          } catch (browserError: any) {
            oauthInProgressRef.current = false;
            
            // Check if it's the "already open" error
            if (browserError.message?.includes("already open")) {
              console.error("[AuthContext] WebBrowser already open error caught");
              throw new Error("Please wait for the current authentication to complete");
            }
            
            throw browserError;
          }
        } else {
          oauthInProgressRef.current = false;
          throw new Error("No OAuth URL returned from server");
        }
      }
    } catch (error: any) {
      console.error(`[AuthContext] ${provider} sign in failed:`, error);
      
      // Ensure flag is cleared on any error
      oauthInProgressRef.current = false;
      
      let errorMsg = `${provider} sign in failed. Please try again.`;
      if (error?.message) {
        errorMsg = error.message;
      } else if (error?.error?.message) {
        errorMsg = error.error.message;
      }
      
      throw new Error(errorMsg);
    }
  };

  const signInWithGoogle = () => signInWithSocial("google");
  const signInWithApple = () => signInWithSocial("apple");
  const signInWithGitHub = () => signInWithSocial("github");

  const signOut = async () => {
    try {
      console.log("[AuthContext] Signing out...");
      await authClient.signOut();
      console.log("[AuthContext] Sign out successful");
    } catch (error) {
      console.error("[AuthContext] Sign out failed (API):", error);
    } finally {
      console.log("[AuthContext] Clearing local auth state");
      setUser(null);
      await clearAuthTokens();
      router.replace("/auth");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signInWithApple,
        signInWithGitHub,
        signOut,
        fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
</write file>

Now I'll also update the auth screen to better handle the loading state and prevent multiple rapid clicks:

<write file="app/auth.tsx">
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
