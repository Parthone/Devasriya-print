/**
 * Client-generated identifiers.
 *
 * Records need an id before they are written: a recording is uploaded to a path
 * built from the id of the record that will own it, and the row is only written
 * once the file is safely there. A v4 UUID is generated here rather than by the
 * database for exactly that reason.
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Node 18 and jsdom both provide randomUUID; this is only a last resort.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
