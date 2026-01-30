import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { shortenLink, obfuscateUrl, generateShareableMessage } from '../utils/link-utils.js';

/**
 * Sharing Routes
 * Provides endpoints for managing and formatting shareable content
 */
export function registerSharingRoutes(app: App) {
  const requireAuth = app.requireAuth();

  /**
   * POST /api/messages/:id/share-formats - Get different share formats for a message
   * Returns link in various formats (full, short, obfuscated) for different platforms
   */
  app.fastify.post(
    '/api/messages/:id/share-formats',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params as { id: string };

      app.logger.info(
        { messageId: id, userId: session.user.id },
        'Generating share formats'
      );

      try {
        const message = await app.db.query.messages.findFirst({
          where: eq(schema.messages.id, id),
        });

        if (!message) {
          return reply.status(404).send({ error: 'Message not found' });
        }

        // Verify user is sender
        if (message.senderId !== session.user.id) {
          return reply.status(403).send({
            error: 'Not authorized to share this message',
          });
        }

        if (!message.linkToken) {
          return reply.status(400).send({
            error: 'Message does not have a share link',
          });
        }

        // Get user preferences
        const preferences = await app.db.query.userSharingPreferences.findFirst({
          where: eq(schema.userSharingPreferences.userId, session.user.id),
        });

        const fullUrl = `https://acceptconnect.app/message/${message.linkToken}`;
        const shortened = shortenLink(message.linkToken);
        const displayUrl = preferences?.obfuscateLinks
          ? obfuscateUrl(fullUrl)
          : fullUrl;

        // Generate shareable messages
        const shareMessages = generateShareableMessage({
          fullUrl,
          senderName: session.user.name || 'A user',
          obfuscate: preferences?.obfuscateLinks ?? true,
        });

        // Filter by allowed methods
        const allowedMethods = preferences?.allowedShareMethods || ['whatsapp'];
        const filteredMessages = Object.fromEntries(
          Object.entries(shareMessages).filter(([method]) =>
            allowedMethods.includes(method as 'whatsapp' | 'email' | 'telegram' | 'sms')
          )
        );

        app.logger.info(
          { messageId: id, userId: session.user.id },
          'Share formats generated'
        );

        return {
          messageId: id,
          urls: {
            full: fullUrl,
            short: shortened.displayUrl,
            display: displayUrl,
          },
          shortCode: shortened.shortId,
          shareMessages: filteredMessages,
          preferences: {
            obfuscateLinks: preferences?.obfuscateLinks ?? true,
            allowedMethods,
          },
        };
      } catch (error) {
        app.logger.error(
          { err: error, messageId: id, userId: session.user.id },
          'Failed to generate share formats'
        );
        throw error;
      }
    }
  );

  /**
   * GET /api/share/:shortCode - Resolve short code to full message link
   * Allows sharing short codes that expand to full links
   */
  app.fastify.get(
    '/api/share/:shortCode',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { shortCode } = request.params as { shortCode: string };

      app.logger.info({ shortCode }, 'Resolving short code');

      try {
        // Short code format: XXXXXX-YYYY (first 12 chars - checksum)
        const [prefix, checksum] = shortCode.split('-');

        if (!prefix || !checksum || prefix.length < 8) {
          return reply.status(400).send({
            error: 'Invalid short code format',
          });
        }

        // Note: In a production system, you would store a mapping of short codes to tokens
        // For now, this is a placeholder that shows the pattern
        // TODO: Implement short code -> token mapping in database

        app.logger.info(
          { shortCode },
          'Short code resolved (mapping needed)'
        );

        return {
          error: 'Short code resolution not yet implemented',
          message: 'Use full message links directly',
        };
      } catch (error) {
        app.logger.error(
          { err: error, shortCode },
          'Failed to resolve short code'
        );
        throw error;
      }
    }
  );

  /**
   * POST /api/messages/:id/copy-link - Generate copyable link text
   * Returns formatted link text ready to copy to clipboard
   */
  app.fastify.post(
    '/api/messages/:id/copy-link',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params as { id: string };
      const { format = 'full' } = request.body as {
        format?: 'full' | 'short' | 'obfuscated';
      };

      app.logger.info(
        { messageId: id, userId: session.user.id, format },
        'Generating copyable link'
      );

      try {
        const message = await app.db.query.messages.findFirst({
          where: eq(schema.messages.id, id),
        });

        if (!message) {
          return reply.status(404).send({ error: 'Message not found' });
        }

        if (message.senderId !== session.user.id) {
          return reply.status(403).send({
            error: 'Not authorized',
          });
        }

        if (!message.linkToken) {
          return reply.status(400).send({
            error: 'Message does not have a share link',
          });
        }

        const fullUrl = `https://acceptconnect.app/message/${message.linkToken}`;

        let copyableLink: string;

        switch (format) {
          case 'short': {
            const shortened = shortenLink(message.linkToken);
            copyableLink = shortened.displayUrl;
            break;
          }
          case 'obfuscated': {
            copyableLink = obfuscateUrl(fullUrl);
            break;
          }
          case 'full':
          default: {
            copyableLink = fullUrl;
            break;
          }
        }

        app.logger.info(
          { messageId: id, format },
          'Copyable link generated'
        );

        return {
          messageId: id,
          copyableLink,
          format,
          instruction: 'Copy this link to share with others',
        };
      } catch (error) {
        app.logger.error(
          { err: error, messageId: id, userId: session.user.id },
          'Failed to generate copyable link'
        );
        throw error;
      }
    }
  );

  /**
   * POST /api/messages/:id/share-message - Get platform-specific share message
   * Returns formatted message text ready for sharing on specific platforms
   */
  app.fastify.post(
    '/api/messages/:id/share-message',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params as { id: string };
      const { platform } = request.body as {
        platform: 'whatsapp' | 'email' | 'telegram' | 'sms';
      };

      app.logger.info(
        {
          messageId: id,
          userId: session.user.id,
          platform,
        },
        'Generating platform-specific share message'
      );

      if (!['whatsapp', 'email', 'telegram', 'sms'].includes(platform)) {
        return reply.status(400).send({
          error: 'Invalid platform',
        });
      }

      try {
        const message = await app.db.query.messages.findFirst({
          where: eq(schema.messages.id, id),
        });

        if (!message) {
          return reply.status(404).send({ error: 'Message not found' });
        }

        if (message.senderId !== session.user.id) {
          return reply.status(403).send({
            error: 'Not authorized',
          });
        }

        // Check if platform is allowed
        const preferences = await app.db.query.userSharingPreferences.findFirst({
          where: eq(schema.userSharingPreferences.userId, session.user.id),
        });

        const allowedMethods = (preferences?.allowedShareMethods || ['whatsapp']) as Array<'whatsapp' | 'email' | 'telegram' | 'sms'>;
        if (!allowedMethods.includes(platform)) {
          return reply.status(403).send({
            error: `Sharing via ${platform} is not enabled`,
          });
        }

        const fullUrl = `https://acceptconnect.app/message/${message.linkToken}`;
        const shareMessages = generateShareableMessage({
          fullUrl,
          senderName: session.user.name || 'A user',
          obfuscate: preferences?.obfuscateLinks ?? true,
        });

        const platformMessage = shareMessages[platform as keyof typeof shareMessages];

        app.logger.info(
          { messageId: id, platform },
          'Share message generated'
        );

        return {
          messageId: id,
          platform,
          message: platformMessage,
          copyTip: `Copy this message and paste it into ${platform}`,
        };
      } catch (error) {
        app.logger.error(
          {
            err: error,
            messageId: id,
            userId: session.user.id,
            platform,
          },
          'Failed to generate share message'
        );
        throw error;
      }
    }
  );
}
