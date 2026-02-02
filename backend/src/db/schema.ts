import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  index,
  jsonb,
  numeric,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { user } from './auth-schema.js';

/**
 * Messages table for message exchange functionality
 * Supports link-based, push notification, and proximity-based exchanges
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    senderId: text('sender_id').notNull().references(() => user.id, {
      onDelete: 'cascade',
    }),
    recipientId: text('recipient_id').references(() => user.id, {
      onDelete: 'cascade',
    }),
    content: text('content').notNull(),
    status: text('status', {
      enum: ['pending', 'accepted', 'rejected'],
    })
      .default('pending')
      .notNull(),
    linkToken: text('link_token').unique(),
    linkExpiresAt: timestamp('link_expires_at'),
    singleUse: boolean('single_use').default(false).notNull(),
    linkUsed: boolean('link_used').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('messages_sender_id_idx').on(table.senderId),
    index('messages_recipient_id_idx').on(table.recipientId),
    index('messages_link_token_idx').on(table.linkToken),
    index('messages_status_idx').on(table.status),
  ]
);

/**
 * Proximity sessions table for device-to-device message exchange
 * Manages proximity tokens for secure nearby device communication
 */
export const proximitySessions = pgTable(
  'proximity_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    initiatorId: text('initiator_id').notNull().references(() => user.id, {
      onDelete: 'cascade',
    }),
    proximityToken: text('proximity_token').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    messageId: uuid('message_id').references(() => messages.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('proximity_sessions_initiator_id_idx').on(table.initiatorId),
    index('proximity_sessions_proximity_token_idx').on(table.proximityToken),
    index('proximity_sessions_expires_at_idx').on(table.expiresAt),
  ]
);

/**
 * Push tokens table for device push notification registration
 * Stores platform-specific tokens for iOS and Android devices
 */
export const pushTokens = pgTable(
  'push_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => user.id, {
      onDelete: 'cascade',
    }),
    token: text('token').notNull(),
    platform: text('platform', { enum: ['ios', 'android'] }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('push_tokens_user_id_idx').on(table.userId),
    index('push_tokens_token_idx').on(table.token),
  ]
);

/**
 * User sharing preferences table
 * Stores user preferences for sharing methods (proximity, link, push notifications)
 */
export const userSharingPreferences = pgTable(
  'user_sharing_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().unique().references(() => user.id, {
      onDelete: 'cascade',
    }),
    proximityEnabled: boolean('proximity_enabled').default(true).notNull(),
    linkSharingEnabled: boolean('link_sharing_enabled').default(true).notNull(),
    pushNotificationsEnabled: boolean('push_notifications_enabled')
      .default(true)
      .notNull(),
    obfuscateLinks: boolean('obfuscate_links').default(true).notNull(),
    allowedShareMethods: jsonb('allowed_share_methods').$type<Array<'whatsapp' | 'email' | 'telegram' | 'sms'>>()
      .default(['whatsapp'])
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('user_sharing_prefs_user_id_idx').on(table.userId)]
);

/**
 * Discovered devices table for proximity-based discovery
 * Stores information about devices discovered nearby for the "Ask" feature
 */
export const discoveredDevices = pgTable(
  'discovered_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => user.id, {
      onDelete: 'cascade',
    }),
    deviceId: text('device_id').notNull(),
    deviceName: text('device_name'),
    deviceType: text('device_type', { enum: ['ios', 'android', 'web'] }).notNull(),
    proximityToken: text('proximity_token'),
    rssi: text('rssi'), // Received Signal Strength Indicator for BLE
    discoveredAt: timestamp('discovered_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(), // Device discovery expires after timeout
  },
  (table) => [
    index('discovered_devices_user_id_idx').on(table.userId),
    index('discovered_devices_device_id_idx').on(table.deviceId),
    index('discovered_devices_expires_at_idx').on(table.expiresAt),
  ]
);

/**
 * Password reset tokens table
 * Stores secure tokens for password recovery flow
 */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => user.id, {
      onDelete: 'cascade',
    }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('password_reset_tokens_user_id_idx').on(table.userId),
    index('password_reset_tokens_token_idx').on(table.token),
    index('password_reset_tokens_expires_at_idx').on(table.expiresAt),
  ]
);

/**
 * User locations table for GPS-based device discovery
 * Stores the current GPS coordinates of each user
 */
export const userLocations = pgTable(
  'user_locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().unique().references(() => user.id, {
      onDelete: 'cascade',
    }),
    latitude: numeric('latitude', { precision: 10, scale: 8 }).notNull(),
    longitude: numeric('longitude', { precision: 11, scale: 8 }).notNull(),
    accuracy: numeric('accuracy', { precision: 10, scale: 2 }), // in meters
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('user_locations_user_id_idx').on(table.userId),
    index('user_locations_coords_idx').on(table.latitude, table.longitude),
  ]
);

/**
 * Device connections table for GPS-based connection requests
 * Tracks connection requests between nearby users
 */
export const deviceConnections = pgTable(
  'device_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requesterUserId: text('requester_user_id').notNull().references(() => user.id, {
      onDelete: 'cascade',
    }),
    targetUserId: text('target_user_id').notNull().references(() => user.id, {
      onDelete: 'cascade',
    }),
    status: text('status', {
      enum: ['pending', 'accepted', 'rejected'],
    })
      .default('pending')
      .notNull(),
    distanceMeters: numeric('distance_meters', { precision: 10, scale: 2 }), // in meters
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('device_connections_requester_user_id_idx').on(table.requesterUserId),
    index('device_connections_target_user_id_idx').on(table.targetUserId),
    index('device_connections_status_idx').on(table.status),
    uniqueIndex('device_connections_unique_pair').on(table.requesterUserId, table.targetUserId),
  ]
);
