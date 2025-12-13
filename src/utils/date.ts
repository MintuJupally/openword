/**
 * Utility functions for date handling.
 * All timestamps are stored in UTC and converted to local time for display.
 */

/**
 * Gets the current UTC timestamp in milliseconds.
 * This is what we store in the database.
 */
export function getCurrentUTCTimestamp(): number {
  return Date.now();
}

/**
 * Converts a UTC timestamp (milliseconds) to a Date object.
 * The Date object will automatically display in the user's local timezone.
 */
export function utcTimestampToLocalDate(utcTimestamp: number): Date {
  return new Date(utcTimestamp);
}

/**
 * Formats a UTC timestamp for display in the user's local timezone.
 */
export function formatUTCTimestampForDisplay(
  utcTimestamp: number,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = utcTimestampToLocalDate(utcTimestamp);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    ...options,
  });
}

