/**
 * Distance Calculation Utilities
 * Implements Haversine formula for calculating distances between GPS coordinates
 */

/**
 * Represents a geographic coordinate
 */
export interface Coordinate {
  latitude: number;
  longitude: number;
}

/**
 * Earth's radius in meters
 */
const EARTH_RADIUS_METERS = 6371000;

/**
 * Converts degrees to radians
 */
function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculates the distance between two GPS coordinates using the Haversine formula
 * Returns distance in meters
 */
export function calculateHaversineDistance(
  coord1: Coordinate,
  coord2: Coordinate
): number {
  const lat1 = degreesToRadians(coord1.latitude);
  const lat2 = degreesToRadians(coord2.latitude);
  const deltaLat = degreesToRadians(coord2.latitude - coord1.latitude);
  const deltaLon = degreesToRadians(coord2.longitude - coord1.longitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_METERS * c;

  return distance;
}

/**
 * Formats a distance in meters to a human-readable string
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(2)}km`;
}

/**
 * Checks if a coordinate is within a specified radius of another coordinate
 */
export function isWithinRadius(
  centerCoord: Coordinate,
  targetCoord: Coordinate,
  radiusMeters: number
): boolean {
  const distance = calculateHaversineDistance(centerCoord, targetCoord);
  return distance <= radiusMeters;
}

/**
 * Validates GPS coordinates
 */
export function isValidCoordinate(coord: Coordinate): boolean {
  return (
    typeof coord.latitude === 'number' &&
    typeof coord.longitude === 'number' &&
    coord.latitude >= -90 &&
    coord.latitude <= 90 &&
    coord.longitude >= -180 &&
    coord.longitude <= 180
  );
}

/**
 * Converts string coordinates to numbers
 */
export function parseCoordinate(lat: string | number, lon: string | number): Coordinate {
  return {
    latitude: typeof lat === 'string' ? parseFloat(lat) : lat,
    longitude: typeof lon === 'string' ? parseFloat(lon) : lon,
  };
}
