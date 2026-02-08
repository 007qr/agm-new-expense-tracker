/**
 * Serializes a Date object to YYYY-MM-DD format in local timezone.
 * Avoids timezone conversion issues that occur with toISOString().
 *
 * @param date - The date to serialize
 * @returns Date string in YYYY-MM-DD format
 */
export function serializeDateLocal(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}
