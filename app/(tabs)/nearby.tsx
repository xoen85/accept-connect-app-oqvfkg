
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useTheme } from "@react-navigation/native";
import { colors, spacing, borderRadius, typography } from "@/styles/commonStyles";
import { useRouter } from "expo-router";
import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconSymbol } from "@/components/IconSymbol";
import { authenticatedGet, authenticatedPost } from "@/utils/api";
import * as Location from "expo-location";

interface NearbyUser {
  id: string;
  username: string;
  distance: number;
  lastSeen: string;
}

export default function NearbyScreen() {
  const { colors } = useTheme();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locationPermission, setLocationPermission] = useState(false);

  const requestLocationPermission = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === "granted";
      setLocationPermission(granted);
      
      if (!granted) {
        console.log("Location permission denied");
      } else {
        console.log("Location permission granted");
      }
      
      return granted;
    } catch (error) {
      console.error("Error requesting location permission:", error);
      return false;
    }
  }, []);

  const updateLocation = useCallback(async () => {
    if (!locationPermission) return;

    try {
      const location = await Location.getCurrentPositionAsync({});
      console.log("Current location:", location.coords);

      await authenticatedPost("/api/location/update", {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      console.log("Location updated on server");
    } catch (error) {
      console.error("Error updating location:", error);
    }
  }, [locationPermission]);

  const loadNearbyUsers = useCallback(async () => {
    try {
      console.log("Loading nearby users");
      const response = await authenticatedGet<{ users: NearbyUser[] }>("/api/location/nearby");
      const users = response.users || [];
      setNearbyUsers(users);
      console.log("Loaded nearby users:", users.length);
    } catch (error) {
      console.error("Error loading nearby users:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await updateLocation();
    await loadNearbyUsers();
  }, [updateLocation, loadNearbyUsers]);

  const handleSendRequest = useCallback(async (userId: string) => {
    try {
      console.log("Sending connection request to user:", userId);
      await authenticatedPost("/api/connections/request", {
        recipientId: userId,
        message: "Do you accept to have lunch with me?",
      });
      console.log("Connection request sent successfully");
    } catch (error) {
      console.error("Error sending connection request:", error);
    }
  }, []);

  const formatDistance = useCallback((meters: number) => {
    if (meters < 1000) {
      const distanceText = `${Math.round(meters)}m`;
      return distanceText;
    }
    const km = meters / 1000;
    const distanceText = `${km.toFixed(1)}km`;
    return distanceText;
  }, []);

  // Request location permission on mount
  useEffect(() => {
    requestLocationPermission();
  }, [requestLocationPermission]);

  // Update location and load nearby users periodically
  useEffect(() => {
    if (locationPermission) {
      updateLocation();
      loadNearbyUsers();

      const interval = setInterval(() => {
        updateLocation();
        loadNearbyUsers();
      }, 30000); // Update every 30 seconds

      return () => clearInterval(interval);
    }
  }, [locationPermission, updateLocation, loadNearbyUsers]);

  // Redirect to auth if not logged in - moved after all hooks
  useEffect(() => {
    if (!authLoading && !user) {
      console.log("User not authenticated, redirecting to auth screen");
      router.replace("/auth");
    }
  }, [user, authLoading, router]);

  if (authLoading || loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!locationPermission) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
        <View style={styles.emptyContainer}>
          <IconSymbol
            ios_icon_name="location.slash"
            android_material_icon_name="location-off"
            size={64}
            color={colors.text}
          />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Location Permission Required
          </Text>
          <Text style={[styles.emptyText, { color: colors.text }]}>
            Please enable location permissions to see nearby users
          </Text>
          <TouchableOpacity
            style={[styles.permissionButton, { backgroundColor: colors.primary }]}
            onPress={requestLocationPermission}
          >
            <Text style={styles.permissionButtonText}>Enable Location</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Nearby Users
        </Text>
      </View>

      <FlatList
        data={nearbyUsers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const distanceText = formatDistance(item.distance);
          return (
            <View style={[styles.userCard, { backgroundColor: colors.card }]}>
              <View style={styles.userInfo}>
                <IconSymbol
                  ios_icon_name="person.circle"
                  android_material_icon_name="account-circle"
                  size={48}
                  color={colors.primary}
                />
                <View style={styles.userDetails}>
                  <Text style={[styles.username, { color: colors.text }]}>
                    {item.username}
                  </Text>
                  <Text style={[styles.distance, { color: colors.text }]}>
                    {distanceText}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.sendButton, { backgroundColor: colors.primary }]}
                onPress={() => handleSendRequest(item.id)}
              >
                <IconSymbol
                  ios_icon_name="paperplane.fill"
                  android_material_icon_name="send"
                  size={20}
                  color="#fff"
                />
              </TouchableOpacity>
            </View>
          );
        }}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <IconSymbol
              ios_icon_name="person.2.slash"
              android_material_icon_name="person"
              size={64}
              color={colors.text}
            />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No Nearby Users
            </Text>
            <Text style={[styles.emptyText, { color: colors.text }]}>
              There are no users nearby at the moment
            </Text>
          </View>
        }
        contentContainerStyle={nearbyUsers.length === 0 ? styles.emptyList : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  headerTitle: {
    fontSize: typography.sizes.xxl,
    fontWeight: "bold",
  },
  userCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  userDetails: {
    marginLeft: spacing.md,
    flex: 1,
  },
  username: {
    fontSize: typography.sizes.lg,
    fontWeight: "600",
  },
  distance: {
    fontSize: typography.sizes.sm,
    marginTop: 4,
    opacity: 0.7,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  emptyList: {
    flex: 1,
  },
  emptyTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: "bold",
    marginTop: spacing.lg,
    textAlign: "center",
  },
  emptyText: {
    fontSize: typography.sizes.md,
    marginTop: spacing.sm,
    textAlign: "center",
    opacity: 0.7,
  },
  permissionButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
  },
  permissionButtonText: {
    color: "#fff",
    fontSize: typography.sizes.md,
    fontWeight: "600",
  },
});
