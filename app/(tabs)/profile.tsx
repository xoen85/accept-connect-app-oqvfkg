/**
 * Profile Screen - User Account Management
 * 
 * Features:
 * - View user profile information
 * - Manage active GPS-based connections
 * - View all user data (GDPR compliance)
 * - Delete user account (GDPR compliance)
 * - Sign out functionality
 * 
 * Backend Integration:
 * ✅ GET /api/connections/active - Gets all accepted connections
 * ✅ DELETE /api/connections/{id} - Removes a connection
 * ✅ GET /api/users/me/data - Gets all user data
 * ✅ DELETE /api/users/me - Deletes user account
 * 
 * Authentication: All endpoints require Bearer token authentication
 */

import React, { useState, useEffect } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  Platform, 
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconSymbol } from "@/components/IconSymbol";
import { useTheme } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "expo-router";
import { colors, spacing, borderRadius, typography } from "@/styles/commonStyles";
import { authenticatedGet, authenticatedDelete } from "@/utils/api";

interface ActiveConnection {
  id: string;
  user_id: string;
  username: string;
  connected_at: string;
}

export default function ProfileScreen() {
  const theme = useTheme();
  const { user, signOut, loading } = useAuth();
  const router = useRouter();
  const isDark = theme.dark;
  const themeColors = isDark ? colors.dark : colors.light;
  
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDataModal, setShowDataModal] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageConfig, setMessageConfig] = useState<{
    title: string;
    message: string;
    type: "success" | "error";
  }>({ title: "", message: "", type: "success" });
  const [activeConnections, setActiveConnections] = useState<ActiveConnection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showConnectionsModal, setShowConnectionsModal] = useState(false);
  const [deletingConnectionId, setDeletingConnectionId] = useState<string | null>(null);

  const showMessage = (title: string, message: string, type: "success" | "error") => {
    setMessageConfig({ title, message, type });
    setShowMessageModal(true);
  };

  useEffect(() => {
    if (user) {
      loadActiveConnections();
    }
  }, [user]);

  const loadActiveConnections = async () => {
    setLoadingConnections(true);
    try {
      console.log("[Profile] Loading active connections...");
      const response = await authenticatedGet<{ connections: ActiveConnection[] }>("/api/connections/active");
      const connections = response.connections || [];
      setActiveConnections(connections);
      console.log("[Profile] Active connections loaded:", connections.length);
      
      if (connections.length > 0) {
        console.log("[Profile] Connected users:", connections.map(c => c.username).join(", "));
      }
    } catch (error: any) {
      console.error("[Profile] Error loading active connections:", error);
      const errorMsg = error?.message || "Failed to load connections";
      console.error("[Profile] Error details:", errorMsg);
    } finally {
      setLoadingConnections(false);
    }
  };

  const handleRefreshConnections = async () => {
    setRefreshing(true);
    await loadActiveConnections();
    setRefreshing(false);
  };

  const handleViewConnections = () => {
    setShowConnectionsModal(true);
    loadActiveConnections();
  };

  const handleDeleteConnection = async (connectionId: string) => {
    setDeletingConnectionId(connectionId);
    try {
      console.log("[Profile] Deleting connection:", connectionId);
      await authenticatedDelete(`/api/connections/${connectionId}`);
      console.log("[Profile] Connection deleted successfully");
      showMessage("Success", "Connection removed successfully", "success");
      await loadActiveConnections();
    } catch (error: any) {
      console.error("[Profile] Error deleting connection:", error);
      const errorMsg = error?.message || "Failed to remove connection";
      showMessage("Error", errorMsg, "error");
    } finally {
      setDeletingConnectionId(null);
    }
  };

  const formatConnectionDate = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const handleSignOut = async () => {
    console.log("[Profile] User confirmed sign out");
    setSigningOut(true);
    try {
      await signOut();
      console.log("[Profile] Sign out successful, redirecting to auth");
      setShowSignOutModal(false);
      router.replace("/auth");
    } catch (error) {
      console.error("[Profile] Error signing out:", error);
    } finally {
      setSigningOut(false);
    }
  };

  const handleViewData = async () => {
    console.log("[Profile] Viewing user data");
    setLoadingData(true);
    setShowDataModal(true);
    
    try {
      // GET /api/users/me/data to fetch all user data
      const data = await authenticatedGet<any>("/api/users/me/data");
      console.log("[Profile] User data loaded:", data);
      setUserData(data);
    } catch (error: any) {
      console.error("[Profile] Error loading user data:", error);
      showMessage("Error", error?.message || "Failed to load user data", "error");
      setShowDataModal(false);
    } finally {
      setLoadingData(false);
    }
  };

  const handleDeleteAccount = async () => {
    console.log("[Profile] User confirmed account deletion");
    setDeleting(true);
    
    try {
      // DELETE /api/users/me to delete account
      await authenticatedDelete("/api/users/me");
      console.log("[Profile] Account deleted successfully");
      setShowDeleteModal(false);
      
      // Sign out and redirect
      await signOut();
      showMessage("Success", "Your account has been deleted successfully.", "success");
      setTimeout(() => {
        router.replace("/auth");
      }, 2000);
    } catch (error: any) {
      console.error("[Profile] Error deleting account:", error);
      showMessage("Error", error?.message || "Failed to delete account. Please try again.", "error");
    } finally {
      setDeleting(false);
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={themeColors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const userNameDisplay = user.name || "User";
  const userEmailDisplay = user.email || "";
  const userInitial = userNameDisplay.charAt(0).toUpperCase();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <ScrollView 
        contentContainerStyle={[
          styles.scrollContent,
          Platform.OS !== 'ios' && styles.contentContainerWithTabBar
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={[styles.avatar, { backgroundColor: themeColors.primary }]}>
            <Text style={styles.avatarText}>
              {userInitial}
            </Text>
          </View>
          <Text style={[styles.name, { color: themeColors.text }]}>
            {userNameDisplay}
          </Text>
          <Text style={[styles.email, { color: themeColors.textSecondary }]}>
            {userEmailDisplay}
          </Text>
        </View>

        {/* Menu Items */}
        <View style={[styles.menuSection, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <TouchableOpacity style={styles.menuItem} onPress={handleViewConnections}>
            <View style={styles.menuItemLeft}>
              <IconSymbol 
                ios_icon_name="person.2.fill" 
                android_material_icon_name="people" 
                size={24} 
                color={themeColors.primary} 
              />
              <Text style={[styles.menuItemText, { color: themeColors.text }]}>
                My Connections
              </Text>
              {activeConnections.length > 0 && (
                <View style={[styles.badge, { backgroundColor: themeColors.primary }]}>
                  <Text style={styles.badgeText}>{activeConnections.length}</Text>
                </View>
              )}
            </View>
            <IconSymbol 
              ios_icon_name="chevron.right" 
              android_material_icon_name="arrow-forward" 
              size={20} 
              color={themeColors.textSecondary} 
            />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <IconSymbol 
                ios_icon_name="bell.fill" 
                android_material_icon_name="notifications" 
                size={24} 
                color={themeColors.text} 
              />
              <Text style={[styles.menuItemText, { color: themeColors.text }]}>
                Notifications
              </Text>
            </View>
            <IconSymbol 
              ios_icon_name="chevron.right" 
              android_material_icon_name="arrow-forward" 
              size={20} 
              color={themeColors.textSecondary} 
            />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <IconSymbol 
                ios_icon_name="lock.fill" 
                android_material_icon_name="lock" 
                size={24} 
                color={themeColors.text} 
              />
              <Text style={[styles.menuItemText, { color: themeColors.text }]}>
                Privacy & Security
              </Text>
            </View>
            <IconSymbol 
              ios_icon_name="chevron.right" 
              android_material_icon_name="arrow-forward" 
              size={20} 
              color={themeColors.textSecondary} 
            />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <IconSymbol 
                ios_icon_name="doc.text.fill" 
                android_material_icon_name="description" 
                size={24} 
                color={themeColors.text} 
              />
              <Text style={[styles.menuItemText, { color: themeColors.text }]}>
                Terms & Privacy Policy
              </Text>
            </View>
            <IconSymbol 
              ios_icon_name="chevron.right" 
              android_material_icon_name="arrow-forward" 
              size={20} 
              color={themeColors.textSecondary} 
            />
          </TouchableOpacity>
        </View>

        {/* GDPR Compliance Section */}
        <View style={[styles.menuSection, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <TouchableOpacity style={styles.menuItem} onPress={handleViewData}>
            <View style={styles.menuItemLeft}>
              <IconSymbol 
                ios_icon_name="doc.text.fill" 
                android_material_icon_name="description" 
                size={24} 
                color={themeColors.primary} 
              />
              <Text style={[styles.menuItemText, { color: themeColors.text }]}>
                View My Data
              </Text>
            </View>
            <IconSymbol 
              ios_icon_name="chevron.right" 
              android_material_icon_name="arrow-forward" 
              size={20} 
              color={themeColors.textSecondary} 
            />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

          <TouchableOpacity style={styles.menuItem} onPress={() => setShowDeleteModal(true)}>
            <View style={styles.menuItemLeft}>
              <IconSymbol 
                ios_icon_name="trash.fill" 
                android_material_icon_name="delete" 
                size={24} 
                color={themeColors.error} 
              />
              <Text style={[styles.menuItemText, { color: themeColors.error }]}>
                Delete Account
              </Text>
            </View>
            <IconSymbol 
              ios_icon_name="chevron.right" 
              android_material_icon_name="arrow-forward" 
              size={20} 
              color={themeColors.textSecondary} 
            />
          </TouchableOpacity>
        </View>

        {/* About Section */}
        <View style={[styles.aboutSection, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <Text style={[styles.aboutTitle, { color: themeColors.text }]}>
            About Accept Connect
          </Text>
          <Text style={[styles.aboutText, { color: themeColors.textSecondary }]}>
            Secure message exchange platform with acceptance workflow. Send messages that require explicit acceptance or rejection.
          </Text>
          <Text style={[styles.version, { color: themeColors.textSecondary }]}>
            Version 1.0.0
          </Text>
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity
          style={[styles.signOutButton, { backgroundColor: themeColors.error }]}
          onPress={() => setShowSignOutModal(true)}
        >
          <IconSymbol 
            ios_icon_name="arrow.right.square.fill" 
            android_material_icon_name="exit-to-app" 
            size={20} 
            color="#FFFFFF" 
          />
          <Text style={styles.signOutText}>
            Sign Out
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Sign Out Confirmation Modal */}
      <Modal
        visible={showSignOutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSignOutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.card }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>
              Sign Out
            </Text>
            <Text style={[styles.modalMessage, { color: themeColors.textSecondary }]}>
              Are you sure you want to sign out?
            </Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: themeColors.surface }]}
                onPress={() => setShowSignOutModal(false)}
                disabled={signingOut}
              >
                <Text style={[styles.modalButtonText, { color: themeColors.text }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary, { backgroundColor: themeColors.error }]}
                onPress={handleSignOut}
                disabled={signingOut}
              >
                {signingOut ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>
                    Sign Out
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Account Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.card }]}>
            <IconSymbol
              ios_icon_name="exclamationmark.triangle.fill"
              android_material_icon_name="warning"
              size={48}
              color={themeColors.error}
            />
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>
              Delete Account
            </Text>
            <Text style={[styles.modalMessage, { color: themeColors.textSecondary }]}>
              Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently deleted.
            </Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: themeColors.surface }]}
                onPress={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                <Text style={[styles.modalButtonText, { color: themeColors.text }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary, { backgroundColor: themeColors.error }]}
                onPress={handleDeleteAccount}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>
                    Delete
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* View Data Modal */}
      <Modal
        visible={showDataModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDataModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.dataModalContent, { backgroundColor: themeColors.card }]}>
            <View style={styles.dataModalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                My Data
              </Text>
              <TouchableOpacity onPress={() => setShowDataModal(false)}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={28}
                  color={themeColors.textSecondary}
                />
              </TouchableOpacity>
            </View>
            
            {loadingData ? (
              <View style={styles.dataModalLoading}>
                <ActivityIndicator size="large" color={themeColors.primary} />
                <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>
                  Loading your data...
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.dataModalScroll}>
                <Text style={[styles.dataText, { color: themeColors.text }]}>
                  {JSON.stringify(userData, null, 2)}
                </Text>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Message Modal */}
      <Modal
        visible={showMessageModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMessageModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.card }]}>
            <IconSymbol
              ios_icon_name={messageConfig.type === "success" ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"}
              android_material_icon_name={messageConfig.type === "success" ? "check-circle" : "error"}
              size={48}
              color={messageConfig.type === "success" ? themeColors.success : themeColors.error}
            />
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>
              {messageConfig.title}
            </Text>
            <Text style={[styles.modalMessage, { color: themeColors.textSecondary }]}>
              {messageConfig.message}
            </Text>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: themeColors.primary }]}
              onPress={() => setShowMessageModal(false)}
            >
              <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>
                OK
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Active Connections Modal */}
      <Modal
        visible={showConnectionsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowConnectionsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.connectionsModalContent, { backgroundColor: themeColors.card }]}>
            <View style={styles.connectionsModalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                My Connections
              </Text>
              <TouchableOpacity onPress={() => setShowConnectionsModal(false)}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={28}
                  color={themeColors.textSecondary}
                />
              </TouchableOpacity>
            </View>
            
            {loadingConnections ? (
              <View style={styles.connectionsModalLoading}>
                <ActivityIndicator size="large" color={themeColors.primary} />
                <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>
                  Loading connections...
                </Text>
              </View>
            ) : activeConnections.length === 0 ? (
              <View style={styles.emptyConnectionsContainer}>
                <IconSymbol
                  ios_icon_name="person.2.slash"
                  android_material_icon_name="person-off"
                  size={48}
                  color={themeColors.textSecondary}
                />
                <Text style={[styles.emptyConnectionsText, { color: themeColors.text }]}>
                  No active connections
                </Text>
                <Text style={[styles.emptyConnectionsSubtext, { color: themeColors.textSecondary }]}>
                  Visit the Nearby tab to connect with users around you
                </Text>
              </View>
            ) : (
              <ScrollView 
                style={styles.connectionsModalScroll}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={handleRefreshConnections} />
                }
              >
                {activeConnections.map((connection) => (
                  <View key={connection.id} style={[styles.connectionItem, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                    <View style={styles.connectionInfo}>
                      <IconSymbol
                        ios_icon_name="person.circle.fill"
                        android_material_icon_name="account-circle"
                        size={40}
                        color={themeColors.primary}
                      />
                      <View style={styles.connectionDetails}>
                        <Text style={[styles.connectionUsername, { color: themeColors.text }]}>
                          {connection.username}
                        </Text>
                        <Text style={[styles.connectionDate, { color: themeColors.textSecondary }]}>
                          Connected {formatConnectionDate(connection.connected_at)}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.deleteConnectionButton, { opacity: deletingConnectionId === connection.id ? 0.5 : 1 }]}
                      onPress={() => handleDeleteConnection(connection.id)}
                      disabled={deletingConnectionId === connection.id}
                    >
                      {deletingConnectionId === connection.id ? (
                        <ActivityIndicator size="small" color={themeColors.error} />
                      ) : (
                        <IconSymbol
                          ios_icon_name="trash.fill"
                          android_material_icon_name="delete"
                          size={20}
                          color={themeColors.error}
                        />
                      )}
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : spacing.sm,
  },
  contentContainerWithTabBar: {
    paddingBottom: 100,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '600',
  },
  name: {
    ...typography.h2,
    marginBottom: spacing.xs,
  },
  email: {
    ...typography.body,
  },
  menuSection: {
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuItemText: {
    ...typography.body,
    marginLeft: spacing.md,
  },
  divider: {
    height: 1,
    marginHorizontal: spacing.md,
  },
  aboutSection: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  aboutTitle: {
    ...typography.h3,
    marginBottom: spacing.sm,
  },
  aboutText: {
    ...typography.bodySmall,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  version: {
    ...typography.caption,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  signOutText: {
    color: '#FFFFFF',
    ...typography.body,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    ...typography.h2,
    marginBottom: spacing.sm,
  },
  modalMessage: {
    ...typography.body,
    marginBottom: spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modalButton: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  modalButtonPrimary: {
    // Additional styles for primary button
  },
  modalButtonText: {
    ...typography.body,
    fontWeight: '600',
  },
  dataModalContent: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '90%',
    maxWidth: 600,
    maxHeight: '80%',
  },
  dataModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  dataModalLoading: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  loadingText: {
    ...typography.body,
    marginTop: spacing.md,
  },
  dataModalScroll: {
    maxHeight: 400,
  },
  dataText: {
    ...typography.bodySmall,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: spacing.sm,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  connectionsModalContent: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    maxHeight: '80%',
    minHeight: '50%',
  },
  connectionsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  connectionsModalLoading: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  connectionsModalScroll: {
    flex: 1,
  },
  emptyConnectionsContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyConnectionsText: {
    ...typography.h3,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  emptyConnectionsSubtext: {
    ...typography.body,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  connectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  connectionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  connectionDetails: {
    marginLeft: spacing.md,
    flex: 1,
  },
  connectionUsername: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  connectionDate: {
    ...typography.caption,
  },
  deleteConnectionButton: {
    padding: spacing.sm,
  },
});
