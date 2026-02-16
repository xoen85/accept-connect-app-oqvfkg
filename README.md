# Accept Connect

This app was built using [Natively.dev](https://natively.dev) - a platform for creating mobile apps.

Made with 💙 for creativity.

## 🔐 OAuth Authentication Fix - Implementation Summary

### What Was Fixed

The OAuth callback flow has been enhanced to properly handle bearer tokens for native apps. The following improvements were made:

#### Frontend Changes

1. **Enhanced Deep Link Handling** (`contexts/AuthContext.tsx`)
   - Added robust token extraction from deep links using multiple parsing methods
   - Improved error handling and logging throughout the OAuth flow
   - Added token verification after saving to storage
   - Better fallback handling when token is not present in URL

2. **Improved OAuth Callback Screen** (`app/auth-callback.tsx`)
   - Added comprehensive logging for debugging OAuth issues
   - Enhanced error messages with debug information
   - Better token validation and verification
   - Improved user feedback during the callback process

3. **Fixed App Scheme** (`app.json`)
   - Changed scheme from "Accept Connect" to "acceptconnect" to match auth client configuration
   - This ensures deep links work correctly: `acceptconnect://`

### How OAuth Flow Works

#### Web Platform
1. User clicks "Continue with Google/Apple/GitHub"
2. Opens popup window with OAuth provider
3. After authentication, redirects to `/auth-callback`
4. Callback page extracts `better_auth_token` from URL
5. Sends token to parent window via `postMessage`
6. Parent window saves token and fetches user session
7. Popup closes automatically

#### Native Platform (iOS/Android)
1. User clicks "Continue with Google/Apple/GitHub"
2. Opens system browser with OAuth provider
3. After authentication, redirects to `acceptconnect://` with token
4. App receives deep link and extracts `better_auth_token` parameter
5. Token is saved to SecureStore
6. User session is fetched with the token
7. User is redirected to home screen

### Backend Requirements

For the OAuth flow to work correctly on native apps, the backend MUST:

1. **Detect Native App Redirects**: Check if the redirect URL uses a custom scheme (e.g., `acceptconnect://`)
2. **Extract Session Token**: After successful OAuth authentication, get the session token from the created session
3. **Append Token to URL**: Add the token as a query parameter: `${redirect_url}?better_auth_token=${token}`

Example backend implementation (pseudo-code):
```javascript
// In OAuth callback handler
if (isNativeAppRedirect(redirectUrl)) {
  const session = await createOrGetSession(user);
  const token = session.token;
  const redirectWithToken = `${redirectUrl}?better_auth_token=${token}`;
  return redirect(redirectWithToken);
}
```

### Testing the OAuth Flow

#### Prerequisites
- Backend must be deployed and accessible
- OAuth providers (Google, Apple, GitHub) must be configured with correct credentials
- For native testing: Build the app with EAS or run on a physical device

#### Test Steps

1. **Web Testing**
   ```bash
   npm run web
   ```
   - Navigate to the auth screen
   - Click "Continue with Google"
   - Check browser console for logs starting with `[AuthCallback]`
   - Verify token is received and popup closes
   - Verify you're redirected to home screen

2. **Native Testing (iOS/Android)**
   ```bash
   # iOS
   npm run ios
   
   # Android
   npm run android
   ```
   - Navigate to the auth screen
   - Click "Continue with Google"
   - Check Metro logs for messages starting with `[AuthContext]`
   - Look for: "Found bearer token in callback URL"
   - Verify you're redirected to home screen

#### Debugging OAuth Issues

If OAuth is not working, check the logs for these key messages:

**Web Platform:**
- `[AuthCallback] Token found: true` - Token was received from backend
- `[AuthCallback] Token length: X` - Shows token size
- `[AuthCallback] Posting message to opener...` - Token sent to parent window

**Native Platform:**
- `[AuthContext] Deep link received: acceptconnect://...` - Deep link was triggered
- `[AuthContext] Found bearer token in deep link` - Token was extracted
- `[AuthContext] Token saved to storage` - Token was persisted
- `[AuthContext] Token verified in storage` - Token save was confirmed

**Common Issues:**

1. **No token in callback URL (Native)**
   - Error: "No token found in callback URL!"
   - Cause: Backend is not appending the token to the redirect URL
   - Solution: Backend needs to implement token appending for native redirects

2. **Popup blocked (Web)**
   - Error: "Failed to open popup"
   - Cause: Browser is blocking popups
   - Solution: Allow popups for the app domain

3. **Deep link not working (Native)**
   - Error: Deep link not received
   - Cause: App scheme not configured correctly
   - Solution: Verify `scheme: "acceptconnect"` in app.json matches lib/auth.ts

4. **Token not persisting**
   - Error: User is not authenticated after OAuth
   - Cause: Token is not being saved to storage
   - Solution: Check SecureStore permissions and storage logs

### Sample Test User

For testing email/password authentication, you can create a new account using the Sign Up flow:

1. Open the app and navigate to the auth screen
2. Click "Sign Up"
3. Enter a username (e.g., "testuser")
4. Enter a password (minimum 8 characters)
5. Click "Sign Up"

The app will create a synthetic email address (`username@acceptconnect.local`) for username-based accounts.

Alternatively, you can sign up with a real email address by clicking "Use email instead" on the auth screen.

### Environment Variables

Ensure these are set in your backend:
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `APPLE_CLIENT_ID` - Apple OAuth client ID (optional)
- `APPLE_CLIENT_SECRET` - Apple OAuth client secret (optional)
- `GITHUB_CLIENT_ID` - GitHub OAuth client ID (optional)
- `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret (optional)

### Next Steps

1. **Verify Backend Implementation**: Ensure the backend is appending tokens to native redirects
   - The backend MUST detect custom scheme redirects (e.g., `acceptconnect://`)
   - It MUST append the session token: `?better_auth_token=<token>`
   - Check backend logs for OAuth callback processing

2. **Test on Physical Devices**: OAuth flows work best on real devices
   - iOS: Use `npx expo run:ios` or build with EAS
   - Android: Use `npx expo run:android` or build with EAS
   - Web: Use `npm run web` (works in browser)

3. **Monitor Logs**: Use the comprehensive logging to debug any issues
   - Metro logs show `[AuthContext]` messages for native OAuth
   - Browser console shows `[AuthCallback]` messages for web OAuth
   - Look for "Token found" or "No token" messages

4. **Test All Providers**: Verify Google, Apple (iOS only), and GitHub OAuth flows
   - Each provider requires proper OAuth credentials in backend
   - Test both web and native platforms separately
   - Verify tokens are being saved and sessions are created

### 🚨 Known Issue: Backend Token Appending

**Current Status**: The frontend is fully prepared to receive and handle OAuth tokens from deep links. However, the backend needs to be configured to append tokens to redirect URLs for native apps.

**What the backend needs to do**:
```javascript
// Pseudo-code for backend OAuth callback handler
app.addHook('onRequest', async (request, reply) => {
  if (request.url.includes('/api/auth/callback/')) {
    // Store original send method
    const originalSend = reply.send.bind(reply);
    
    // Override send to intercept redirects
    reply.send = function(payload) {
      if (reply.statusCode === 302 || reply.statusCode === 301) {
        const location = reply.getHeader('location');
        
        // Check if this is a native app redirect (custom scheme)
        if (location && !location.startsWith('http')) {
          // Extract session token from cookies
          const token = extractTokenFromCookies(request.headers.cookie);
          
          if (token) {
            // Append token to redirect URL
            const separator = location.includes('?') ? '&' : '?';
            const newLocation = `${location}${separator}better_auth_token=${token}`;
            reply.header('location', newLocation);
          }
        }
      }
      return originalSend(payload);
    };
  }
});
```

**Testing the fix**:
1. Run the app on a native device/simulator
2. Click "Continue with Google"
3. Complete OAuth flow in browser
4. Check Metro logs for: `[AuthContext] Found bearer token in deep link`
5. If you see "No token found in callback URL", the backend fix is not working

**Workaround for testing**:
- Use email/password authentication (works without backend changes)
- Test OAuth on web platform (uses cookies, doesn't need token in URL)
