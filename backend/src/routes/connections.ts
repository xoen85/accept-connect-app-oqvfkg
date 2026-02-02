import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, or } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import * as authSchema from '../db/auth-schema.js';
import { calculateHaversineDistance, parseCoordinate } from '../utils/distance.js';

/**
 * Device Connections Routes
 * Handles GPS-based connection requests between nearby users
 */
export function registerConnectionRoutes(app: App) {
  const requireAuth = app.requireAuth();

  /**
   * POST /api/connections/request - Send connection request to nearby user
   * Calculates distance and creates entry with 'pending' status
   */
  app.fastify.post(
    '/api/connections/request',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;
      const { target_user_id } = request.body as { target_user_id: string };

      app.logger.info(
        { userId, targetUserId: target_user_id },
        'Creating connection request'
      );

      if (!target_user_id) {
        return reply.status(400).send({
          error: 'target_user_id is required',
        });
      }

      if (target_user_id === userId) {
        return reply.status(400).send({
          error: 'Cannot create connection request to yourself',
        });
      }

      try {
        // Verify target user exists
        const targetUser = await app.db.query.user.findFirst({
          where: eq(authSchema.user.id, target_user_id),
        });

        if (!targetUser) {
          return reply.status(404).send({
            error: 'Target user not found',
          });
        }

        // Check if connection already exists
        const existingConnection = await app.db.query.deviceConnections.findFirst({
          where: and(
            eq(schema.deviceConnections.requesterUserId, userId),
            eq(schema.deviceConnections.targetUserId, target_user_id)
          ),
        });

        if (existingConnection) {
          return reply.status(409).send({
            error: 'Connection request already exists with this user',
          });
        }

        // Get both users' locations
        const [requesterLocation, targetLocation] = await Promise.all([
          app.db.query.userLocations.findFirst({
            where: eq(schema.userLocations.userId, userId),
          }),
          app.db.query.userLocations.findFirst({
            where: eq(schema.userLocations.userId, target_user_id),
          }),
        ]);

        if (!requesterLocation || !targetLocation) {
          return reply.status(400).send({
            error: 'One or both users do not have location data',
          });
        }

        // Calculate distance
        const requesterCoord = parseCoordinate(
          requesterLocation.latitude,
          requesterLocation.longitude
        );
        const targetCoord = parseCoordinate(
          targetLocation.latitude,
          targetLocation.longitude
        );

        const distanceMeters = calculateHaversineDistance(requesterCoord, targetCoord);

        // Create connection request
        const [connection] = await app.db
          .insert(schema.deviceConnections)
          .values({
            requesterUserId: userId,
            targetUserId: target_user_id,
            status: 'pending',
            distanceMeters: distanceMeters.toString(),
          })
          .returning();

        app.logger.info(
          {
            connectionId: connection.id,
            requesterUserId: userId,
            targetUserId: target_user_id,
            distanceMeters: parseFloat(connection.distanceMeters || '0'),
          },
          'Connection request created'
        );

        return {
          success: true,
          connection: {
            id: connection.id,
            target_user_id: connection.targetUserId,
            status: connection.status,
            distance_meters: connection.distanceMeters ? parseFloat(connection.distanceMeters) : null,
            created_at: connection.createdAt,
          },
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId, targetUserId: target_user_id },
          'Failed to create connection request'
        );
        throw error;
      }
    }
  );

  /**
   * GET /api/connections/pending - Get pending connection requests for current user
   */
  app.fastify.get(
    '/api/connections/pending',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;

      app.logger.info({ userId }, 'Fetching pending connections');

      try {
        const connections = await app.db
          .select()
          .from(schema.deviceConnections)
          .where(
            and(
              eq(schema.deviceConnections.targetUserId, userId),
              eq(schema.deviceConnections.status, 'pending')
            )
          );

        // Fetch requester details for each connection
        const requests = await Promise.all(
          connections.map(async (conn) => {
            const requester = await app.db.query.user.findFirst({
              where: eq(authSchema.user.id, conn.requesterUserId),
            });

            return {
              id: conn.id,
              requester_user_id: conn.requesterUserId,
              requester_username: requester?.name || 'Unknown',
              distance_meters: conn.distanceMeters ? parseFloat(conn.distanceMeters) : null,
              created_at: conn.createdAt,
            };
          })
        );

        app.logger.info(
          { userId, count: requests.length },
          'Pending connections fetched'
        );

        return {
          requests,
          count: requests.length,
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId },
          'Failed to fetch pending connections'
        );
        throw error;
      }
    }
  );

  /**
   * POST /api/connections/:id/respond - Accept or reject connection request
   * Body: { action: 'accept' | 'reject' }
   */
  app.fastify.post(
    '/api/connections/:id/respond',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;
      const { id } = request.params as { id: string };
      const { action } = request.body as { action: 'accept' | 'reject' };

      app.logger.info(
        { connectionId: id, userId, action },
        'Responding to connection request'
      );

      if (!['accept', 'reject'].includes(action)) {
        return reply.status(400).send({
          error: 'action must be "accept" or "reject"',
        });
      }

      try {
        const connection = await app.db.query.deviceConnections.findFirst({
          where: eq(schema.deviceConnections.id, id),
        });

        if (!connection) {
          return reply.status(404).send({
            error: 'Connection request not found',
          });
        }

        // Verify current user is the target
        if (connection.targetUserId !== userId) {
          return reply.status(403).send({
            error: 'Not authorized to respond to this request',
          });
        }

        // Verify status is still pending
        if (connection.status !== 'pending') {
          return reply.status(409).send({
            error: `Cannot respond to ${connection.status} request`,
          });
        }

        const newStatus = action === 'accept' ? 'accepted' : 'rejected';

        const [updated] = await app.db
          .update(schema.deviceConnections)
          .set({
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(schema.deviceConnections.id, id))
          .returning();

        app.logger.info(
          {
            connectionId: id,
            userId,
            newStatus,
          },
          'Connection request responded'
        );

        return {
          success: true,
          connection: {
            id: updated.id,
            status: updated.status,
            updated_at: updated.updatedAt,
          },
        };
      } catch (error) {
        app.logger.error(
          { err: error, connectionId: id, userId, action },
          'Failed to respond to connection request'
        );
        throw error;
      }
    }
  );

  /**
   * GET /api/connections/active - Get all accepted connections for current user
   */
  app.fastify.get(
    '/api/connections/active',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;

      app.logger.info({ userId }, 'Fetching active connections');

      try {
        const connections = await app.db
          .select()
          .from(schema.deviceConnections)
          .where(
            and(
              or(
                eq(schema.deviceConnections.requesterUserId, userId),
                eq(schema.deviceConnections.targetUserId, userId)
              ),
              eq(schema.deviceConnections.status, 'accepted')
            )
          );

        // Fetch connected user details
        const activeConnections = await Promise.all(
          connections.map(async (conn) => {
            const connectedUserId =
              conn.requesterUserId === userId
                ? conn.targetUserId
                : conn.requesterUserId;

            const connectedUser = await app.db.query.user.findFirst({
              where: eq(authSchema.user.id, connectedUserId),
            });

            return {
              id: conn.id,
              user_id: connectedUserId,
              username: connectedUser?.name || 'Unknown',
              connected_at: conn.createdAt,
            };
          })
        );

        app.logger.info(
          { userId, count: activeConnections.length },
          'Active connections fetched'
        );

        return {
          connections: activeConnections,
          count: activeConnections.length,
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId },
          'Failed to fetch active connections'
        );
        throw error;
      }
    }
  );

  /**
   * DELETE /api/connections/:id - Disconnect from a user
   */
  app.fastify.delete(
    '/api/connections/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;
      const { id } = request.params as { id: string };

      app.logger.info(
        { connectionId: id, userId },
        'Disconnecting from user'
      );

      try {
        const connection = await app.db.query.deviceConnections.findFirst({
          where: eq(schema.deviceConnections.id, id),
        });

        if (!connection) {
          return reply.status(404).send({
            error: 'Connection not found',
          });
        }

        // Verify current user is part of this connection
        if (
          connection.requesterUserId !== userId &&
          connection.targetUserId !== userId
        ) {
          return reply.status(403).send({
            error: 'Not authorized to delete this connection',
          });
        }

        await app.db
          .delete(schema.deviceConnections)
          .where(eq(schema.deviceConnections.id, id));

        app.logger.info(
          { connectionId: id, userId },
          'Connection deleted'
        );

        return {
          success: true,
          message: 'Connection deleted',
        };
      } catch (error) {
        app.logger.error(
          { err: error, connectionId: id, userId },
          'Failed to delete connection'
        );
        throw error;
      }
    }
  );

  /**
   * GET /api/connections/:id - Get connection details
   */
  app.fastify.get(
    '/api/connections/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;
      const { id } = request.params as { id: string };

      app.logger.info(
        { connectionId: id, userId },
        'Fetching connection details'
      );

      try {
        const connection = await app.db.query.deviceConnections.findFirst({
          where: eq(schema.deviceConnections.id, id),
        });

        if (!connection) {
          return reply.status(404).send({
            error: 'Connection not found',
          });
        }

        // Verify current user is part of this connection
        if (
          connection.requesterUserId !== userId &&
          connection.targetUserId !== userId
        ) {
          return reply.status(403).send({
            error: 'Not authorized to view this connection',
          });
        }

        const otherUserId =
          connection.requesterUserId === userId
            ? connection.targetUserId
            : connection.requesterUserId;

        const otherUser = await app.db.query.user.findFirst({
          where: eq(authSchema.user.id, otherUserId),
        });

        app.logger.info(
          { connectionId: id, userId },
          'Connection details fetched'
        );

        return {
          connection: {
            id: connection.id,
            requester_user_id: connection.requesterUserId,
            target_user_id: connection.targetUserId,
            other_user_id: otherUserId,
            other_username: otherUser?.name || 'Unknown',
            status: connection.status,
            distance_meters: connection.distanceMeters ? parseFloat(connection.distanceMeters) : null,
            created_at: connection.createdAt,
            updated_at: connection.updatedAt,
          },
        };
      } catch (error) {
        app.logger.error(
          { err: error, connectionId: id, userId },
          'Failed to fetch connection details'
        );
        throw error;
      }
    }
  );
}
