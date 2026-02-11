
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import { authClient, setBearerToken, clearAuthTokens, getBearerToken } from "@/lib/auth";

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
    const subscription = Linking.addEventListener("url", (event) => {
      console.log("[AuthContext] Deep link received:", event.url);
      // Allow time for the client to process the token if needed
      setTimeout(() => {
        console.log("[AuthContext] Refreshing user session after deep link");
        fetchUser();
      }, 500);
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
          await setBearerToken(session.data.session.token);
          console.log("[AuthContext] Bearer token synced to storage");
        }
      } else {
        console.log("[AuthContext] No active session found");
        setUser(null);
        await clearAuthTokens();
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
        await fetchUser();
      } else {
        // Native: Use expo-linking to generate a proper deep link
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
        
        // The redirect will reload the app or be handled by deep linking
        // fetchUser will be called on mount or via event listener
        console.log(`[AuthContext] ${provider} sign in initiated, waiting for redirect...`);
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
