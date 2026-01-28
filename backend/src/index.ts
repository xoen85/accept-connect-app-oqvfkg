import { createApplication } from "@specific-dev/framework";
import * as appSchema from './db/schema.js';
import * as authSchema from './db/auth-schema.js';
import { registerMessageRoutes } from './routes/messages.js';
import { registerProximityRoutes } from './routes/proximity.js';
import { registerPushTokenRoutes } from './routes/push-tokens.js';
import { registerUserRoutes } from './routes/users.js';

// Combine app and auth schemas
const schema = { ...appSchema, ...authSchema };

// Create application with combined schema
export const app = await createApplication(schema);

// Export App type for use in route files
export type App = typeof app;

// Enable authentication with Better Auth
app.withAuth();

// Register routes - IMPORTANT: Always use registration functions to avoid circular dependency issues
registerMessageRoutes(app);
registerProximityRoutes(app);
registerPushTokenRoutes(app);
registerUserRoutes(app);

await app.run();
app.logger.info('Application running');
