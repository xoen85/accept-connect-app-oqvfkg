import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import * as schema from '../db/schema.js';

export function registerProximityRoutes(app: App) {
  const requireAuth = app.requireAuth();

  /**
   * POST /api/proximity/session - Create a proximity session
   * Returns a unique token for nearby device discovery
   */
  app.fastify.post(
    '/api/proximity/session',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { expiresIn } = request.body as {
        expiresIn?: number;
      };

      app.logger.info(
        { userId: session.user.id, expiresIn },
        'Creating proximity session'
      );

      try {
        // Generate secure proximity token
        const proximityToken = randomBytes(32).toString('hex');
        // Default expiration: 5 minutes
        const expirationMs = expiresIn || 5 * 60 * 1000;
        const expiresAt = new Date(Date.now() + expirationMs);

        const [proximitySession] = await app.db
          .insert(schema.proximitySessions)
          .values({
            initiatorId: session.user.id,
            proximityToken,
            expiresAt,
          })
          .returning();

        app.logger.info(
          { sessionId: proximitySession.id, initiatorId: session.user.id },
          'Proximity session created'
        );

        return {
          sessionId: proximitySession.id,
          proximityToken,
          expiresAt,
          expiresIn: expirationMs,
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId: session.user.id },
          'Failed to create proximity session'
        );
        throw error;
      }
    }
  );

  /**
   * GET /api/proximity/session/:token - Get proximity session details
   * Does NOT require authentication - needed for recipient to access
   */
  app.fastify.get(
    '/api/proximity/session/:token',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { token } = request.params as { token: string };

      app.logger.info({ proximityToken: token }, 'Accessing proximity session');

      try {
        const proximitySession = await app.db.query.proximitySessions.findFirst({
          where: eq(schema.proximitySessions.proximityToken, token),
        });

        if (!proximitySession) {
          return reply.status(404).send({ error: 'Proximity session not found' });
        }

        // Check if session has expired
        if (new Date() > proximitySession.expiresAt) {
          app.logger.warn(
            { sessionId: proximitySession.id },
            'Proximity session expired'
          );
          return reply.status(410).send({ error: 'Session has expired' });
        }

        app.logger.info(
          { sessionId: proximitySession.id },
          'Proximity session accessed'
        );

        return {
          sessionId: proximitySession.id,
          hasMessage: !!proximitySession.messageId,
          expiresAt: proximitySession.expiresAt,
        };
      } catch (error) {
        app.logger.error(
          { err: error, proximityToken: token },
          'Failed to access proximity session'
        );
        throw error;
      }
    }
  );

  /**
   * POST /api/proximity/session/:token/connect - Connect as recipient to a proximity session
   * Recipient initiates connection and can view session details
   */
  app.fastify.post(
    '/api/proximity/session/:token/connect',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { token } = request.params as { token: string };

      app.logger.info(
        { proximityToken: token, userId: session.user.id },
        'Recipient connecting to proximity session'
      );

      try {
        const proximitySession = await app.db.query.proximitySessions.findFirst({
          where: eq(schema.proximitySessions.proximityToken, token),
        });

        if (!proximitySession) {
          return reply.status(404).send({ error: 'Proximity session not found' });
        }

        // Check if session has expired
        if (new Date() > proximitySession.expiresAt) {
          app.logger.warn(
            { sessionId: proximitySession.id },
            'Cannot connect to expired proximity session'
          );
          return reply.status(410).send({ error: 'Session has expired' });
        }

        // Prevent initiator from connecting as recipient
        if (proximitySession.initiatorId === session.user.id) {
          return reply.status(400).send({
            error: 'Initiator cannot connect as recipient',
          });
        }

        app.logger.info(
          { sessionId: proximitySession.id, recipientId: session.user.id },
          'Recipient connected to proximity session'
        );

        return {
          sessionId: proximitySession.id,
          initiatorId: proximitySession.initiatorId,
          hasMessage: !!proximitySession.messageId,
          expiresAt: proximitySession.expiresAt,
        };
      } catch (error) {
        app.logger.error(
          { err: error, proximityToken: token, userId: session.user.id },
          'Failed to connect to proximity session'
        );
        throw error;
      }
    }
  );

  /**
   * POST /api/proximity/session/:token/send - Attach a message to the proximity session
   * Initiator sends a message via proximity session
   */
  app.fastify.post(
    '/api/proximity/session/:token/send',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { token } = request.params as { token: string };
      const { content } = request.body as { content: string };

      app.logger.info(
        { proximityToken: token, userId: session.user.id, hasContent: !!content },
        'Sending message via proximity session'
      );

      if (!content || content.trim().length === 0) {
        return reply.status(400).send({ error: 'Content is required' });
      }

      try {
        const proximitySession = await app.db.query.proximitySessions.findFirst({
          where: eq(schema.proximitySessions.proximityToken, token),
        });

        if (!proximitySession) {
          return reply.status(404).send({ error: 'Proximity session not found' });
        }

        // Verify requester is the initiator
        if (proximitySession.initiatorId !== session.user.id) {
          return reply.status(403).send({
            error: 'Only session initiator can send messages',
          });
        }

        // Check if session has expired
        if (new Date() > proximitySession.expiresAt) {
          app.logger.warn(
            { sessionId: proximitySession.id },
            'Cannot send message via expired proximity session'
          );
          return reply.status(410).send({ error: 'Session has expired' });
        }

        // Check if message already exists for this session
        if (proximitySession.messageId) {
          return reply.status(400).send({
            error: 'Message already attached to this session',
          });
        }

        // Create message for proximity exchange
        const [message] = await app.db
          .insert(schema.messages)
          .values({
            senderId: session.user.id,
            recipientId: null, // Recipient not known yet in proximity flow
            content,
            status: 'pending',
          })
          .returning();

        // Attach message to proximity session
        const [updated] = await app.db
          .update(schema.proximitySessions)
          .set({ messageId: message.id })
          .where(eq(schema.proximitySessions.id, proximitySession.id))
          .returning();

        app.logger.info(
          { sessionId: updated.id, messageId: message.id },
          'Message sent via proximity session'
        );

        return {
          messageId: message.id,
          sessionId: updated.id,
          expiresAt: updated.expiresAt,
        };
      } catch (error) {
        app.logger.error(
          { err: error, proximityToken: token, userId: session.user.id },
          'Failed to send message via proximity session'
        );
        throw error;
      }
    }
  );

  /**
   * GET /api/proximity/session/:token/message - Get message from a proximity session
   * Recipient retrieves the message from a connected proximity session
   */
  app.fastify.get(
    '/api/proximity/session/:token/message',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { token } = request.params as { token: string };

      app.logger.info(
        { proximityToken: token },
        'Retrieving message from proximity session'
      );

      try {
        const proximitySession = await app.db.query.proximitySessions.findFirst({
          where: eq(schema.proximitySessions.proximityToken, token),
        });

        if (!proximitySession) {
          return reply.status(404).send({ error: 'Proximity session not found' });
        }

        // Check if session has expired
        if (new Date() > proximitySession.expiresAt) {
          app.logger.warn(
            { sessionId: proximitySession.id },
            'Cannot retrieve message from expired session'
          );
          return reply.status(410).send({ error: 'Session has expired' });
        }

        if (!proximitySession.messageId) {
          return reply.status(404).send({ error: 'No message in this session' });
        }

        const message = await app.db.query.messages.findFirst({
          where: eq(schema.messages.id, proximitySession.messageId),
        });

        if (!message) {
          return reply.status(404).send({ error: 'Message not found' });
        }

        app.logger.info(
          { messageId: message.id, sessionId: proximitySession.id },
          'Message retrieved from proximity session'
        );

        return message;
      } catch (error) {
        app.logger.error(
          { err: error, proximityToken: token },
          'Failed to retrieve message from proximity session'
        );
        throw error;
      }
    }
  );
}
