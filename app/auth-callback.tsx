import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { Platform } from "react-native";

type Status = "processing" | "success" | "error";

export default function AuthCallbackScreen() {
  const [status, setStatus] = useState<Status>("processing");
  const [message, setMessage] = useState("Processing authentication...");
  const [debugInfo, setDebugInfo] = useState<string>("");

  useEffect(() => {
    if (Platform.OS !== "web") return;
    handleCallback();
  }, []);

  const handleCallback = () => {
    try {
      console.log("[AuthCallback] Processing OAuth callback...");
      console.log("[AuthCallback] Full URL:", window.location.href);
      console.log("[AuthCallback] Search params:", window.location.search);
      
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get("better_auth_token");
      const error = urlParams.get("error");
      
      console.log("[AuthCallback] Token found:", !!token);
      console.log("[AuthCallback] Error found:", !!error);
      
      if (token) {
        console.log("[AuthCallback] Token length:", token.length);
        console.log("[AuthCallback] Token preview:", token.substring(0, 20) + "...");
      }

      if (error) {
        console.error("[AuthCallback] OAuth error:", error);
        setStatus("error");
        setMessage(`Authentication failed: ${error}`);
        setDebugInfo(`Error: ${error}`);
        window.opener?.postMessage({ type: "oauth-error", error }, "*");
        return;
      }

      if (token) {
        console.log("[AuthCallback] Token received, sending to opener window...");
        setStatus("success");
        setMessage("Authentication successful! Closing...");
        setDebugInfo(`Token received (${token.length} chars)`);
        
        // Send token to opener window
        if (window.opener) {
          console.log("[AuthCallback] Posting message to opener...");
          window.opener.postMessage({ type: "oauth-success", token }, "*");
          console.log("[AuthCallback] Message posted successfully");
        } else {
          console.warn("[AuthCallback] No opener window found!");
        }
        
        // Close the popup after a short delay
        setTimeout(() => {
          console.log("[AuthCallback] Closing popup window...");
          window.close();
        }, 1000);
      } else {
        console.error("[AuthCallback] No token found in URL");
        console.error("[AuthCallback] Available params:", Array.from(urlParams.keys()));
        
        setStatus("error");
        setMessage("No authentication token received from server");
        setDebugInfo(`URL: ${window.location.href}\nParams: ${Array.from(urlParams.keys()).join(", ")}`);
        
        window.opener?.postMessage({ 
          type: "oauth-error", 
          error: "No token received from server. The backend may not be configured correctly." 
        }, "*");
      }
    } catch (err) {
      console.error("[AuthCallback] Error processing callback:", err);
      setStatus("error");
      setMessage("Failed to process authentication");
      setDebugInfo(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <View style={styles.container}>
      {status === "processing" && <ActivityIndicator size="large" color="#007AFF" />}
      {status === "success" && <Text style={styles.successIcon}>✓</Text>}
      {status === "error" && <Text style={styles.errorIcon}>✗</Text>}
      <Text style={styles.message}>{message}</Text>
      {debugInfo && (
        <Text style={styles.debugInfo}>{debugInfo}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff",
  },
  successIcon: {
    fontSize: 48,
    color: "#34C759",
  },
  errorIcon: {
    fontSize: 48,
    color: "#FF3B30",
  },
  message: {
    fontSize: 18,
    marginTop: 20,
    textAlign: "center",
    color: "#333",
  },
  debugInfo: {
    fontSize: 12,
    marginTop: 12,
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    color: "#666",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
});
