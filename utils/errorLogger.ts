
import Constants from "expo-constants";
import { Platform } from "react-native";

// Muted messages that we don't want to log
const MUTED_MESSAGES = [
  "new NativeEventEmitter",
  "Require cycle:",
  "VirtualizedLists should never be nested",
];

const FLUSH_INTERVAL = 5000; // 5 seconds

let logQueue: Array<{ level: string; message: string; source: string; timestamp: number }> = [];
let flushTimer: NodeJS.Timeout | null = null;

// Clear log after a delay to prevent memory leaks
function clearLogAfterDelay(logKey: string) {
  setTimeout(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(logKey);
    }
  }, 60000); // Clear after 1 minute
}

// Check if message should be muted
function shouldMuteMessage(message: string): boolean {
  return MUTED_MESSAGES.some((muted) => message.includes(muted));
}

// Get platform name
function getPlatformName(): string {
  if (Platform.OS === "web") return "web";
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "unknown";
}

// Get log server URL
function getLogServerUrl(): string {
  const backendUrl = Constants.expoConfig?.extra?.backendUrl;
  if (!backendUrl) return "";
  return `${backendUrl}/api/logs`;
}

// Flush logs to server
async function flushLogs() {
  if (logQueue.length === 0) return;

  const logsToSend = [...logQueue];
  logQueue = [];

  const logServerUrl = getLogServerUrl();
  if (!logServerUrl) return;

  try {
    await fetch(logServerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        platform: getPlatformName(),
        logs: logsToSend,
      }),
    });
  } catch (error) {
    console.error("Failed to send logs to server:", error);
  }
}

// Queue log for sending
function queueLog(level: string, message: string, source: string) {
  logQueue.push({
    level,
    message,
    source,
    timestamp: Date.now(),
  });

  // Reset flush timer
  if (flushTimer) {
    clearTimeout(flushTimer);
  }

  flushTimer = setTimeout(() => {
    flushLogs();
  }, FLUSH_INTERVAL);
}

// Send error to parent window (for iframe communication)
function sendErrorToParent(level: string, message: string, data: any) {
  if (typeof window !== "undefined" && window.parent !== window) {
    try {
      window.parent.postMessage(
        {
          type: "console-log",
          level,
          message,
          data,
          timestamp: Date.now(),
        },
        "*"
      );
    } catch (error) {
      console.error("Failed to send message to parent:", error);
    }
  }
}

// Extract source location from stack trace
function extractSourceLocation(stack: string): string {
  const lines = stack.split("\n");
  if (lines.length > 1) {
    const callerLine = lines[2] || lines[1];
    const match = callerLine.match(/\((.+):(\d+):(\d+)\)/);
    if (match) {
      const [, file, line, column] = match;
      return `${file}:${line}:${column}`;
    }
  }
  return "unknown";
}

// Get caller info
function getCallerInfo(): string {
  try {
    const stack = new Error().stack || "";
    return extractSourceLocation(stack);
  } catch (error) {
    return "unknown";
  }
}

// Stringify arguments
function stringifyArgs(args: any[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack}`;
      try {
        return JSON.stringify(arg, null, 2);
      } catch (error) {
        return String(arg);
      }
    })
    .join(" ");
}

// Override console methods
if (typeof window !== "undefined") {
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
  };

  console.log = (...args: any[]) => {
    const message = stringifyArgs(args);
    if (!shouldMuteMessage(message)) {
      originalConsole.log(...args);
      const source = getCallerInfo();
      queueLog("log", message, source);
      sendErrorToParent("log", message, args);
    }
  };

  console.warn = (...args: any[]) => {
    const message = stringifyArgs(args);
    if (!shouldMuteMessage(message)) {
      originalConsole.warn(...args);
      const source = getCallerInfo();
      queueLog("warn", message, source);
      sendErrorToParent("warn", message, args);
    }
  };

  console.error = (...args: any[]) => {
    const message = stringifyArgs(args);
    if (!shouldMuteMessage(message)) {
      originalConsole.error(...args);
      const source = getCallerInfo();
      queueLog("error", message, source);
      sendErrorToParent("error", message, args);
    }
  };

  console.info = (...args: any[]) => {
    const message = stringifyArgs(args);
    if (!shouldMuteMessage(message)) {
      originalConsole.info(...args);
      const source = getCallerInfo();
      queueLog("info", message, source);
      sendErrorToParent("info", message, args);
    }
  };

  console.debug = (...args: any[]) => {
    const message = stringifyArgs(args);
    if (!shouldMuteMessage(message)) {
      originalConsole.debug(...args);
      const source = getCallerInfo();
      queueLog("debug", message, source);
      sendErrorToParent("debug", message, args);
    }
  };
}

export {};
