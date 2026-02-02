import React from 'react';
import { Stack } from 'expo-router';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';

export default function TabLayout() {
  // Define the tabs configuration
  const tabs: TabBarItem[] = [
    {
      name: '(home)',
      route: '/(tabs)/(home)/',
      icon: 'home',
      label: 'Home',
    },
    {
      name: 'nearby',
      route: '/(tabs)/nearby',
      icon: 'location-on',
      label: 'Nearby',
    },
    {
      name: 'profile',
      route: '/(tabs)/profile',
      icon: 'account-circle',
      label: 'Profile',
    },
  ];

  // For Android and Web, use Stack navigation with custom floating tab bar
  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none', // Remove fade animation to prevent black screen flash
        }}
      >
        <Stack.Screen key="home" name="(home)" />
        <Stack.Screen key="nearby" name="nearby" />
        <Stack.Screen key="profile" name="profile" />
      </Stack>
      <FloatingTabBar tabs={tabs} />
    </>
  );
}
