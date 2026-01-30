import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, gt, lt } from 'drizzle-orm';
import * as schema from '../db/schema.js';

/**
 * Device Discovery Routes
 * Implements proximity-based device discovery for the "Ask" feature
 */
export function registerDeviceDiscoveryRoutes(app: App) {
  const requireAuth = app.requireAuth();

  /**
   * POST /api/devices/discover - Initiate device discovery
   * Called when user clicks "Ask" to find nearby compatible devices
   */
  app.fastify.post(
    '/api/devices/discover',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { searchRadius = '50' } = request.body as {
        searchRadius?: string;
      };

      app.logger.info(
        { userId: session.user.id, searchRadius },
        'Initiating device discovery'
      );

      try {
        // Find nearby devices that haven't expired
        const nearbyDevices = await app.db
          .select({
            id: schema.discoveredDevices.id,
            deviceId: schema.discoveredDevices.deviceId,
            deviceName: schema.discoveredDevices.deviceName,
            deviceType: schema.discoveredDevices.deviceType,
            proximityToken: schema.discoveredDevices.proximityToken,
            rssi: schema.discoveredDevices.rssi,
            discoveredAt: schema.discoveredDevices.discoveredAt,
          })
          .from(schema.discoveredDevices)
          .where(
            and(
              eq(schema.discoveredDevices.userId, session.user.id),
              gt(schema.discoveredDevices.expiresAt, new Date())
            )
          );

        app.logger.info(
          {
            userId: session.user.id,
            deviceCount: nearbyDevices.length,
          },
          'Device discovery completed'
        );

        return {
          devicesFound: nearbyDevices.length,
          devices: nearbyDevices,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId: session.user.id },
          'Device discovery failed'
        );
        throw error;
      }
    }
  );

  /**
   * POST /api/devices/register-discovery - Register a discovered device
   * Called by mobile app when a device is discovered via BLE/Proximity
   */
  app.fastify.post(
    '/api/devices/register-discovery',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { deviceId, deviceName, deviceType, proximityToken, rssi } =
        request.body as {
          deviceId: string;
          deviceName?: string;
          deviceType: 'ios' | 'android' | 'web';
          proximityToken?: string;
          rssi?: string;
        };

      app.logger.info(
        {
          userId: session.user.id,
          deviceId,
          deviceType,
          hasProximityToken: !!proximityToken,
        },
        'Registering device discovery'
      );

      if (!deviceId || !deviceType) {
        return reply.status(400).send({
          error: 'deviceId and deviceType are required',
        });
      }

      try {
        // Device discovery expires after 5 minutes
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        const [discovery] = await app.db
          .insert(schema.discoveredDevices)
          .values({
            userId: session.user.id,
            deviceId,
            deviceName: deviceName || `${deviceType} Device`,
            deviceType,
            proximityToken,
            rssi,
            expiresAt,
          })
          .returning();

        app.logger.info(
          {
            discoveryId: discovery.id,
            userId: session.user.id,
            deviceId,
          },
          'Device discovery registered'
        );

        return {
          id: discovery.id,
          deviceId,
          expiresAt,
          message: 'Device registered successfully',
        };
      } catch (error) {
        app.logger.error(
          {
            err: error,
            userId: session.user.id,
            deviceId,
            deviceType,
          },
          'Failed to register device discovery'
        );
        throw error;
      }
    }
  );

  /**
   * GET /api/devices/nearby - Get list of nearby devices (for "Ask" feature)
   * Returns devices discovered by this user within the timeout window
   */
  app.fastify.get(
    '/api/devices/nearby',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      app.logger.info({ userId: session.user.id }, 'Fetching nearby devices');

      try {
        const nearbyDevices = await app.db
          .select()
          .from(schema.discoveredDevices)
          .where(
            and(
              eq(schema.discoveredDevices.userId, session.user.id),
              gt(schema.discoveredDevices.expiresAt, new Date())
            )
          );

        app.logger.info(
          {
            userId: session.user.id,
            count: nearbyDevices.length,
          },
          'Nearby devices fetched'
        );

        return {
          nearbyDevices,
          count: nearbyDevices.length,
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId: session.user.id },
          'Failed to fetch nearby devices'
        );
        throw error;
      }
    }
  );

  /**
   * DELETE /api/devices/:id - Remove a discovered device
   * Called when user dismisses a device from the list
   */
  app.fastify.delete(
    '/api/devices/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params as { id: string };

      app.logger.info(
        { userId: session.user.id, deviceId: id },
        'Removing discovered device'
      );

      try {
        const device = await app.db.query.discoveredDevices.findFirst({
          where: eq(schema.discoveredDevices.id, id),
        });

        if (!device) {
          return reply.status(404).send({ error: 'Device not found' });
        }

        if (device.userId !== session.user.id) {
          return reply.status(403).send({
            error: 'Not authorized to delete this device',
          });
        }

        await app.db
          .delete(schema.discoveredDevices)
          .where(eq(schema.discoveredDevices.id, id));

        app.logger.info(
          { userId: session.user.id, deviceId: id },
          'Device discovery removed'
        );

        return { success: true };
      } catch (error) {
        app.logger.error(
          { err: error, userId: session.user.id, deviceId: id },
          'Failed to remove device discovery'
        );
        throw error;
      }
    }
  );

  /**
   * POST /api/devices/cleanup - Clean up expired device discoveries
   * Can be called periodically by clients or via cron job
   */
  app.fastify.post(
    '/api/devices/cleanup',
    async (request: FastifyRequest, reply: FastifyReply) => {
      app.logger.info({}, 'Starting device cleanup');

      try {
        // Delete expired device discoveries
        const result = await app.db
          .delete(schema.discoveredDevices)
          .where(lt(schema.discoveredDevices.expiresAt, new Date()));

        app.logger.info(
          { deletedCount: 0 },
          'Device cleanup completed'
        );

        return {
          success: true,
          message: 'Cleanup completed',
        };
      } catch (error) {
        app.logger.error({ err: error }, 'Device cleanup failed');
        throw error;
      }
    }
  );
}
