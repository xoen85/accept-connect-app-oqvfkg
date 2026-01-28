import React, { useState } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { IconSymbol } from "@/components/IconSymbol";
import { colors, spacing, borderRadius, typography } from "@/styles/commonStyles";

export default function ProfileScreen() {
  const theme = useTheme();
  const { user, signOut, loading } = useAuth();
  const router = useRouter();
  const isDark = theme.dark;
  const themeColors = isDark ? colors.dark : colors.light;
  
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    console.log("User confirmed sign out");
    setSigningOut(true);
    try {
      await signOut();
      console.log("Sign out successful, redirecting to auth");
      setShowSignOutModal(false);
      router.replace("/auth");
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      setSigningOut(false);
    }
  };

  if (!user) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "Profile",
            headerLargeTitle: true,
          }}
        />
        <View style={[styles.container, { backgroundColor: themeColors.background }]}>
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={themeColors.primary} />
          </View>
        </View>
      </>
    );
  }

  const userNameDisplay = user.name || "User";
  const userEmailDisplay = user.email || "";
  const userInitial = userNameDisplay.charAt(0).toUpperCase();

  return (
    <>
      <Stack.Screen
        options={{
          title: "Profile",
          headerLargeTitle: true,
        }}
      />
      <ScrollView 
        style={[styles.container, { backgroundColor: themeColors.background }]}
        contentContainerStyle={styles.scrollContent}
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
    </>
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
});
