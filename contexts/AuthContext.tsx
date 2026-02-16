
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { authClient, setBearerToken, clearAuthTokens, getBearerToken } from "@/lib/auth";
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

  useEffect(() => {
    console.log("[AuthContext] Initializing, fetching user...");
    fetchUser();

    // Listen for deep links (e.g. from social auth redirects)
    const subscription = Linking.addEventListener("url", async (event) => {
      console.log("[AuthContext] Deep link received:", event.url);
      
      try {
        // Parse the URL to extract query parameters
        // Handle both standard URLs and custom scheme URLs
        let token: string | null = null;
        
        try {
          // Try parsing as a standard URL
          const url = new URL(event.url);
          token = url.searchParams.get("better_auth_token");
          console.log("[AuthContext] Parsed as standard URL, token found:", !!token);
        } catch (urlError) {
          // If URL parsing fails, try manual extraction for custom schemes
          console.log("[AuthContext] Standard URL parsing failed, trying manual extraction...");
          const match = event.url.match(/[?&]better_auth_token=([^&]+)/);
          if (match && match[1]) {
            token = decodeURIComponent(match[1]);
            console.log("[AuthContext] Token extracted manually:", !!token);
          }
        }
        
        if (token) {
          console.log("[AuthContext] Found bearer token in deep link (length:", token.length, ")");
          console.log("[AuthContext] Token preview:", token.substring(0, 20) + "...");
          
          // Save the token
          await setBearerToken(token);
          console.log("[AuthContext] Token saved to storage");
          
          // Verify the token was saved
          const savedToken = await getBearerToken();
          if (savedToken === token) {
            console.log("[AuthContext] Token verified in storage");
          } else {
            console.error("[AuthContext] Token verification failed! Saved token doesn't match");
          }
          
          // Wait a moment for the token to be synced
          await new Promise(resolve => setTimeout(resolve, 500));
          
          console.log("[AuthContext] Fetching user session with new token...");
          await fetchUser();
          
          // Verify user was set
          console.log("[AuthContext] User state after fetchUser:", user ? "authenticated" : "not authenticated");
        } else {
          // No token in URL, but Better Auth might have set a cookie
          // Give Better Auth time to process the OAuth callback
          console.log("[AuthContext] No token in URL, waiting for Better Auth to process callback...");
          console.log("[AuthContext] Full URL:", event.url);
          
          setTimeout(async () => {
            console.log("[AuthContext] Refreshing user session after deep link (attempt 1)");
            await fetchUser();
            
            // If the first attempt doesn't work, try again after a longer delay
            setTimeout(async () => {
              console.log("[AuthContext] Refreshing user session after deep link (attempt 2)");
              await fetchUser();
            }, 1500);
          }, 1000);
        }
      } catch (error) {
        console.error("[AuthContext] Error processing deep link:", error);
        console.error("[AuthContext] Deep link URL:", event.url);
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
      
      const session = await authClient.getSession();
      console.log("[AuthContext] Session response:", session);
      
      if (session?.data?.user) {
        console.log("[AuthContext] User session found:", session.data.user.email);
        setUser(session.data.user as User);
        
        // Sync token to storage for utils/api.ts
        if (session.data.session?.token) {
          const existingToken = await getBearerToken();
          if (existingToken !== session.data.session.token) {
            console.log("[AuthContext] Updating bearer token in storage");
            await setBearerToken(session.data.session.token);
          } else {
            console.log("[AuthContext] Bearer token already up to date");
          }
        } else {
          console.warn("[AuthContext] Session found but no token available");
        }
      } else {
        console.log("[AuthContext] No active session found");
        setUser(null);
        await clearAuthTokens();
      }
    } catch (error) {
      console.error("[AuthContext] Failed to fetch user:", error);
      setUser(null);
      // Don't clear tokens on error - might be a network issue
    } finally {
      setLoading(false);
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      console.log("[AuthContext] Signing in with email:", email);
      
      const result = await authClient.signIn.email({ 
        email, 
        password,
        callbackURL: Platform.OS === "web" ? undefined : Linking.createURL("/"),
      });
      
      console.log("[AuthContext] Sign in result:", result);
      
      if (result.error) {
        console.error("[AuthContext] Sign in error:", result.error);
        throw new Error(result.error.message || "Sign in failed");
      }
      
      console.log("[AuthContext] Sign in successful, fetching user...");
      await fetchUser();
    } catch (error: any) {
      console.error("[AuthContext] Email sign in failed:", error);
      
      // Extract meaningful error message
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
      
      const result = await authClient.signUp.email({
        email,
        password,
        name: name || email,
        callbackURL: Platform.OS === "web" ? undefined : Linking.createURL("/"),
      });
      
      console.log("[AuthContext] Sign up result:", result);
      
      if (result.error) {
        console.error("[AuthContext] Sign up error:", result.error);
        throw new Error(result.error.message || "Sign up failed");
      }
      
      console.log("[AuthContext] Sign up successful, fetching user...");
      await fetchUser();
    } catch (error: any) {
      console.error("[AuthContext] Email sign up failed:", error);
      
      // Extract meaningful error message
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
    try {
      console.log(`[AuthContext] Starting ${provider} sign in...`);
      
      if (Platform.OS === "web") {
        console.log(`[AuthContext] Web platform - opening OAuth popup for ${provider}`);
        const token = await openOAuthPopup(provider);
        console.log(`[AuthContext] OAuth popup returned token`);
        await setBearerToken(token);
        
        // Wait a moment for the token to be synced
        await new Promise(resolve => setTimeout(resolve, 300));
        
        console.log(`[AuthContext] Fetching user after OAuth...`);
        await fetchUser();
        
        // Verify user was set
        const currentToken = await getBearerToken();
        console.log(`[AuthContext] Token in storage:`, currentToken ? "present" : "missing");
        
      } else {
        // Native: Use WebBrowser to open OAuth flow
        const callbackURL = Linking.createURL("/");
        console.log(`[AuthContext] Native platform - callback URL: ${callbackURL}`);
        console.log(`[AuthContext] Calling authClient.signIn.social for ${provider}...`);
        
        const result = await authClient.signIn.social({
          provider,
          callbackURL,
        });
        
        console.log(`[AuthContext] Social sign in result:`, result);
        
        if (result.error) {
          console.error(`[AuthContext] ${provider} sign in error:`, result.error);
          throw new Error(result.error.message || `${provider} sign in failed`);
        }
        
        // Open the OAuth URL in a browser
        if (result.data?.url) {
          console.log(`[AuthContext] Opening OAuth URL in browser:`, result.data.url);
          const browserResult = await WebBrowser.openAuthSessionAsync(
            result.data.url,
            callbackURL
          );
          
          console.log(`[AuthContext] Browser result type:`, browserResult.type);
          console.log(`[AuthContext] Browser result:`, JSON.stringify(browserResult, null, 2));
          
          if (browserResult.type === "success" && browserResult.url) {
            console.log(`[AuthContext] OAuth callback URL received:`, browserResult.url);
            
            // Extract token from callback URL - try multiple methods
            let token: string | null = null;
            
            try {
              // Method 1: Standard URL parsing
              const url = new URL(browserResult.url);
              token = url.searchParams.get("better_auth_token");
              console.log(`[AuthContext] Token from URL.searchParams:`, !!token);
            } catch (urlError) {
              console.log(`[AuthContext] URL parsing failed, trying manual extraction...`);
            }
            
            if (!token) {
              // Method 2: Manual regex extraction
              const match = browserResult.url.match(/[?&]better_auth_token=([^&]+)/);
              if (match && match[1]) {
                token = decodeURIComponent(match[1]);
                console.log(`[AuthContext] Token from regex extraction:`, !!token);
              }
            }
            
            if (token) {
              console.log(`[AuthContext] Found bearer token in callback URL (length: ${token.length})`);
              console.log(`[AuthContext] Token preview:`, token.substring(0, 20) + "...");
              
              await setBearerToken(token);
              console.log(`[AuthContext] Token saved to storage`);
              
              // Verify the token was saved
              const savedToken = await getBearerToken();
              if (savedToken === token) {
                console.log(`[AuthContext] Token verified in storage`);
              } else {
                console.error(`[AuthContext] Token verification failed!`);
              }
              
              // Wait a moment for the token to be synced
              await new Promise(resolve => setTimeout(resolve, 500));
              
              console.log(`[AuthContext] Fetching user session with new token...`);
              await fetchUser();
              
              // Check if user was set
              const currentToken = await getBearerToken();
              console.log(`[AuthContext] After fetchUser - token in storage:`, !!currentToken);
            } else {
              console.warn(`[AuthContext] No token found in callback URL!`);
              console.warn(`[AuthContext] Full callback URL:`, browserResult.url);
              console.warn(`[AuthContext] This means the backend is not appending the token to the redirect URL`);
              console.warn(`[AuthContext] Attempting to fetch session anyway (will use cookies if available)...`);
              
              // Give Better Auth time to process the callback
              await new Promise(resolve => setTimeout(resolve, 1000));
              await fetchUser();
              
              // If still no user, throw an error
              const currentToken = await getBearerToken();
              if (!currentToken) {
                throw new Error(
                  "Authentication completed but no token was received. " +
                  "The backend may not be configured to append tokens to redirect URLs for native apps. " +
                  "Please check the backend OAuth callback implementation."
                );
              }
            }
          } else if (browserResult.type === "cancel") {
            console.log(`[AuthContext] User cancelled OAuth flow`);
            throw new Error("Authentication cancelled");
          } else {
            console.log(`[AuthContext] OAuth flow failed:`, browserResult);
            throw new Error("Authentication failed");
          }
        } else {
          throw new Error("No OAuth URL returned from server");
        }
      }
    } catch (error: any) {
      console.error(`[AuthContext] ${provider} sign in failed:`, error);
      
      // Extract meaningful error message
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
       // Always clear local state
       console.log("[AuthContext] Clearing local auth state");
       setUser(null);
       await clearAuthTokens();
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
