
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import Constants from "expo-constants";

const API_URL = Constants.expoConfig?.extra?.backendUrl || "";

console.log("[Auth Client] Initializing with backend URL:", API_URL);

export const BEARER_TOKEN_KEY = "acceptconnect_bearer_token";

// Platform-specific storage: localStorage for web, SecureStore for native
const storage = Platform.OS === "web"
  ? {
      getItem: (key: string) => {
        const value = localStorage.getItem(key);
        console.log("[Auth Storage] Web getItem:", key, value ? "found" : "not found");
        return value;
      },
      setItem: (key: string, value: string) => {
        console.log("[Auth Storage] Web setItem:", key);
        localStorage.setItem(key, value);
      },
      deleteItem: (key: string) => {
        console.log("[Auth Storage] Web deleteItem:", key);
        localStorage.removeItem(key);
      },
    }
  : {
      getItem: async (key: string) => {
        const value = await SecureStore.getItemAsync(key);
        console.log("[Auth Storage] Native getItem:", key, value ? "found" : "not found");
        return value;
      },
      setItem: async (key: string, value: string) => {
        console.log("[Auth Storage] Native setItem:", key);
        await SecureStore.setItemAsync(key, value);
      },
      deleteItem: async (key: string) => {
        console.log("[Auth Storage] Native deleteItem:", key);
        await SecureStore.deleteItemAsync(key);
      },
    };

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({
      scheme: "acceptconnect",
      storagePrefix: "acceptconnect",
      storage,
    }),
  ],
});

export async function setBearerToken(token: string) {
  console.log("[Auth] Setting bearer token");
  if (Platform.OS === "web") {
    localStorage.setItem(BEARER_TOKEN_KEY, token);
  } else {
    await SecureStore.setItemAsync(BEARER_TOKEN_KEY, token);
  }
}

export async function getBearerToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return localStorage.getItem(BEARER_TOKEN_KEY);
  } else {
    return await SecureStore.getItemAsync(BEARER_TOKEN_KEY);
  }
}

export async function clearAuthTokens() {
  console.log("[Auth] Clearing auth tokens");
  if (Platform.OS === "web") {
    localStorage.removeItem(BEARER_TOKEN_KEY);
  } else {
    await SecureStore.deleteItemAsync(BEARER_TOKEN_KEY);
  }
}

export { API_URL };
