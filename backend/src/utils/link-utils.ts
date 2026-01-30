import { randomBytes } from 'crypto';

/**
 * Link Utility Functions
 * Provides link obfuscation and shortening capabilities
 */

/**
 * Generates a short unique identifier from a full token
 * Uses first 12 characters and adds a checksum suffix
 */
export function shortenLink(fullToken: string, baseUrl = 'https://acceptconnect.app'): {
  fullUrl: string;
  shortId: string;
  displayUrl: string;
} {
  // Take first 12 characters of token
  const shortId = fullToken.substring(0, 12);

  // Add 4 character checksum from remaining token
  const checksum = fullToken.substring(fullToken.length - 4);

  const fullId = `${shortId}-${checksum}`;
  const fullUrl = `${baseUrl}/message/${fullToken}`;
  const displayUrl = `${baseUrl}/m/${fullId}`;

  return {
    fullUrl,
    shortId: fullId,
    displayUrl,
  };
}

/**
 * Obfuscates a URL by replacing the full token with a masked version
 * Shows only first and last 4 characters
 */
export function obfuscateUrl(fullUrl: string): string {
  // Extract the token from the URL (last part after /message/)
  const urlParts = fullUrl.split('/message/');
  if (urlParts.length !== 2) {
    return fullUrl;
  }

  const token = urlParts[1];
  if (token.length < 8) {
    return fullUrl; // Token too short to obfuscate safely
  }

  const first4 = token.substring(0, 4);
  const last4 = token.substring(token.length - 4);
  const masked = `${first4}${'*'.repeat(token.length - 8)}${last4}`;

  return `${urlParts[0]}/message/${masked}`;
}

/**
 * Generates a secure short code for link sharing
 * Returns a 6-8 character alphanumeric code
 */
export function generateShortCode(): string {
  // Generate 6-8 character short code using base36
  const randomNum = randomBytes(4).readUInt32BE(0);
  return randomNum.toString(36).toUpperCase().padStart(6, '0').substring(0, 8);
}

/**
 * Generates a shareable message with obfuscated/shortened links
 * Returns different formats suitable for various platforms
 */
export function generateShareableMessage(
  options: {
    fullUrl: string;
    senderName?: string;
    message?: string;
    obfuscate?: boolean;
    shorten?: boolean;
  }
): {
  whatsapp: string;
  email: string;
  telegram: string;
  sms: string;
  generic: string;
} {
  const { fullUrl, senderName = 'A user', message: customMessage, obfuscate = true, shorten = false } = options;

  let displayUrl = fullUrl;

  if (obfuscate) {
    displayUrl = obfuscateUrl(fullUrl);
  }

  if (shorten) {
    const shortened = shortenLink(fullUrl.split('/message/')[1] || '', 'https://acceptconnect.app');
    displayUrl = shortened.displayUrl;
  }

  const defaultMessage = customMessage || 'I would like to share my consent with you';

  return {
    // WhatsApp format (URL will be clickable)
    whatsapp: `${senderName} shared a consent request with you:\n\n${defaultMessage}\n\n${displayUrl}`,

    // Email format (with subject line)
    email: `Subject: Consent Request from ${senderName}\n\n${defaultMessage}\n\nLink: ${displayUrl}`,

    // Telegram format (with emoji)
    telegram: `📋 *Consent Request* from ${senderName}\n${defaultMessage}\n[Respond here](${fullUrl})`,

    // SMS format (concise)
    sms: `${senderName} shared a consent request. Respond here: ${displayUrl}`,

    // Generic format
    generic: `${senderName} shared: ${defaultMessage}\n${displayUrl}`,
  };
}

/**
 * Encodes a token as a URL parameter to prevent accidental parsing
 */
export function encodeTokenParam(token: string): string {
  return Buffer.from(token).toString('base64').replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '');
}

/**
 * Decodes a URL-safe base64 token parameter
 */
export function decodeTokenParam(encoded: string): string {
  const padded = encoded + '=='.substring(0, (4 - (encoded.length % 4)) % 4);
  const base64 = padded.replace(/_/g, '/').replace(/-/g, '+');
  return Buffer.from(base64, 'base64').toString('utf-8');
}
