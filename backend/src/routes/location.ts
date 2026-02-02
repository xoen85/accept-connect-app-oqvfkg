import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, ne } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import * as authSchema from '../db/auth-schema.js';
import {
  calculateHaversineDistance,
  parseCoordinate,
  isValidCoordinate,
} from '../utils/distance.js';

/**
 * Location Management Routes
 * Handles GPS location updates and nearby user discovery
 */
export function registerLocationRoutes(app: App) {
  const requireAuth = app.requireAuth();

  /**
   * POST /api/location/update - Update user's current GPS location
   * Upserts user location (updates if exists, inserts if not)
   */
  app.fastify.post(
    '/api/location/update',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;
      const { latitude, longitude, accuracy } = request.body as {
        latitude: number;
        longitude: number;
        accuracy?: number;
      };

      app.logger.info(
        {
          userId,
          latitude,
          longitude,
          hasAccuracy: !!accuracy,
        },
        'Updating user location'
      );

      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return reply.status(400).send({
          error: 'latitude and longitude must be numbers',
        });
      }

      const coord = parseCoordinate(latitude, longitude);
      if (!isValidCoordinate(coord)) {
        return reply.status(400).send({
          error: 'Invalid GPS coordinates',
        });
      }

      if (accuracy !== undefined && accuracy < 0) {
        return reply.status(400).send({
          error: 'Accuracy cannot be negative',
        });
      }

      try {
        // Check if location exists
        const existingLocation = await app.db.query.userLocations.findFirst({
          where: eq(schema.userLocations.userId, userId),
        });

        let location;

        if (existingLocation) {
          // Update existing location
          const [updated] = await app.db
            .update(schema.userLocations)
            .set({
              latitude: latitude.toString(),
              longitude: longitude.toString(),
              accuracy: accuracy ? accuracy.toString() : null,
              updatedAt: new Date(),
            })
            .where(eq(schema.userLocations.userId, userId))
            .returning();

          location = updated;
          app.logger.info(
            { userId, locationId: location.id },
            'User location updated'
          );
        } else {
          // Insert new location
          const [created] = await app.db
            .insert(schema.userLocations)
            .values({
              userId,
              latitude: latitude.toString(),
              longitude: longitude.toString(),
              accuracy: accuracy ? accuracy.toString() : null,
            })
            .returning();

          location = created;
          app.logger.info(
            { userId, locationId: location.id },
            'User location created'
          );
        }

        return {
          success: true,
          location: {
            latitude: parseFloat(location.latitude),
            longitude: parseFloat(location.longitude),
            accuracy: location.accuracy ? parseFloat(location.accuracy) : null,
            updated_at: location.updatedAt,
          },
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId, latitude, longitude },
          'Failed to update location'
        );
        throw error;
      }
    }
  );

  /**
   * GET /api/location/nearby - Find nearby users with the app
   * Query params: ?radius=1000 (radius in meters, default 1000m)
   */
  app.fastify.get(
    '/api/location/nearby',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;
      const { radius = '1000' } = request.query as { radius?: string };

      const radiusMeters = parseInt(radius, 10);

      app.logger.info(
        { userId, radiusMeters },
        'Searching for nearby users'
      );

      if (isNaN(radiusMeters) || radiusMeters < 0) {
        return reply.status(400).send({
          error: 'Radius must be a positive number',
        });
      }

      try {
        // Get current user's location
        const userLocation = await app.db.query.userLocations.findFirst({
          where: eq(schema.userLocations.userId, userId),
        });

        if (!userLocation) {
          return {
            users: [],
            message: 'User location not set. Please update location first.',
          };
        }

        const userCoord = parseCoordinate(
          userLocation.latitude,
          userLocation.longitude
        );

        // Get all other users' locations
        const otherLocations = await app.db
          .select()
          .from(schema.userLocations)
          .where(ne(schema.userLocations.userId, userId));

        // Calculate distances and filter by radius
        const nearbyUsers = [];

        for (const location of otherLocations) {
          const otherCoord = parseCoordinate(
            location.latitude,
            location.longitude
          );

          const distance = calculateHaversineDistance(userCoord, otherCoord);

          if (distance <= radiusMeters) {
            // Fetch user details
            const otherUser = await app.db.query.user.findFirst({
              where: eq(authSchema.user.id, location.userId),
            });

            if (otherUser) {
              nearbyUsers.push({
                user_id: location.userId,
                username: otherUser.name,
                distance_meters: Math.round(distance * 100) / 100, // Round to 2 decimals
                last_seen: location.updatedAt,
              });
            }
          }
        }

        // Sort by distance
        nearbyUsers.sort((a, b) => a.distance_meters - b.distance_meters);

        app.logger.info(
          { userId, radiusMeters, foundCount: nearbyUsers.length },
          'Nearby users search completed'
        );

        return {
          users: nearbyUsers,
          count: nearbyUsers.length,
          radius_meters: radiusMeters,
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId, radiusMeters },
          'Failed to search nearby users'
        );
        throw error;
      }
    }
  );

  /**
   * GET /api/location/current - Get current user's location
   */
  app.fastify.get(
    '/api/location/current',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;

      app.logger.info({ userId }, 'Fetching user location');

      try {
        const location = await app.db.query.userLocations.findFirst({
          where: eq(schema.userLocations.userId, userId),
        });

        if (!location) {
          return {
            location: null,
            message: 'Location not set',
          };
        }

        return {
          location: {
            latitude: parseFloat(location.latitude),
            longitude: parseFloat(location.longitude),
            accuracy: location.accuracy ? parseFloat(location.accuracy) : null,
            updated_at: location.updatedAt,
            created_at: location.createdAt,
          },
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId },
          'Failed to fetch user location'
        );
        throw error;
      }
    }
  );

  /**
   * DELETE /api/location - Delete user's location data
   * For privacy: user can delete their location
   */
  app.fastify.delete(
    '/api/location',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;

      app.logger.info({ userId }, 'Deleting user location');

      try {
        await app.db
          .delete(schema.userLocations)
          .where(eq(schema.userLocations.userId, userId));

        app.logger.info({ userId }, 'User location deleted');

        return {
          success: true,
          message: 'Location deleted',
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId },
          'Failed to delete location'
        );
        throw error;
      }
    }
  );
}
