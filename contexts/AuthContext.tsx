
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
        // Native platform - chain OAuth through backend to get session token
        console.log(`[AuthContext] Native platform - initiating ${provider} OAuth`);

        const appDeepLink = "acceptconnect://auth-callback";
        // After OAuth, Better Auth redirects to our backend endpoint (which has the session cookie),
        // then our endpoint extracts the token and redirects to the app deep link with it appended.
        const backendCallback = `${API_URL}/api/user/oauth-callback?redirect_to=${encodeURIComponent(appDeepLink)}&provider=${provider}`;

        try {
          // Initiate OAuth flow with backend-chained callback
          await authClient.signIn.social({
            provider,
            callbackURL: backendCallback,
          });

          console.log(`[AuthContext] OAuth flow initiated for ${provider}`);
          
          // The deep link handler in useEffect will handle the token when it comes back
          // Clear the flag after a reasonable timeout if no response
          setTimeout(() => {
            if (oauthInProgressRef.current) {
              console.warn(`[AuthContext] OAuth timeout for ${provider}, clearing flag`);
              oauthInProgressRef.current = false;
            }
          }, 60000); // 60 second timeout
          
        } catch (error) {
          console.error(`[AuthContext] Error initiating ${provider} OAuth:`, error);
          
          // Clear the flag on error
          oauthInProgressRef.current = false;
          
          // Try to fetch user session in case it was actually successful
          await fetchUser();
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