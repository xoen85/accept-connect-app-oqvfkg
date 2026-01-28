import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  index,
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
