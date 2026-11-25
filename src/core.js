/**
 * Core short ID generation.
 *
 * The ID is a 64-bit integer encoded in base62 (0-9A-Za-z), 11 characters wide.
 * The high 48 bits are a millisecond timestamp from the monotonic clock, the
 * low 16 bits are a per-millisecond sequence counter. This gives 65,536 IDs per
 * millisecond per generator, and IDs sort lexicographically by creation time
 * because the timestamp occupies the most significant bits.
 *
 * Why 48 bits of time? 2^48 ms is about 8,900 years, which is far beyond any
 * reasonable lifetime for an ID scheme, and it leaves exactly 16 bits for the
 * sequence so the base62 encoding is a fixed 11 characters (62^11 > 2^64).
 *
 * Why monotonic time? A wall clock can jump backwards (NTP, manual changes),
 * which would produce IDs that sort out of order and could collide with IDs
 * already issued. A monotonic clock never goes backwards, so the timestamp
 * component is non-decreasing. We still guard against a backwards jump in the
 * supplied clock function by clamping to the last timestamp we saw.
 *
 * The sequence counter is stored as a plain number; it is bounded by 0xffff
 * and incremented at most once per call, so it never loses precision.
 */

const BASE = 62;
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const TIME_BITS = 48;
const SEQ_BITS = 16;
const SEQ_MASK = (1 << SEQ_BITS) - 1;
const MAX_TIME = Math.pow(2, TIME_BITS) - 1;
const ID_LENGTH = 11; // ceil(64 / log2(62)) === 11

/**
 * Encode a non-negative integer as a fixed-width base62 string.
 *
 * @param {number} value - Integer in [0, 2^64).
 * @returns {string} Exactly ID_LENGTH base62 characters.
 */
function encodeBase62(value) {
  // Use BigInt so the arithmetic is exact for the full 64-bit range; Number
  // would silently round above 2^53.
  let n = BigInt(value);
  const base = BigInt(BASE);
  let out = '';
  while (n > 0n) {
    const rem = Number(n % base);
    out = DIGITS[rem] + out;
    n /= base;
  }
  if (out.length === 0) out = '0';
  if (out.length > ID_LENGTH) {
    throw new RangeError('value too large for ' + ID_LENGTH + ' base62 digits');
  }
  return out.padStart(ID_LENGTH, '0');
}

/**
 * Decode a fixed-width base62 string back to a BigInt.
 *
 * @param {string} text - Base62 string.
 * @returns {bigint} The decoded value.
 */
function decodeBase62(text) {
  if (typeof text !== 'string' || text.length !== ID_LENGTH) {
    throw new TypeError('short id must be exactly ' + ID_LENGTH + ' characters');
  }
  let n = 0n;
  const base = BigInt(BASE);
  for (let i = 0; i < text.length; i++) {
    const idx = DIGITS.indexOf(text[i]);
    if (idx === -1) {
      throw new TypeError('invalid base62 character: ' + JSON.stringify(text[i]));
    }
    n = n * base + BigInt(idx);
  }
  return n;
}

/**
 * A generator of sortable, collision-resistant short IDs.
 */
export class ShortIdGenerator {
  /**
   * @param {object} [options]
   * @param {() => number} [options.clock] - Returns the current time in
   *   milliseconds. Defaults to `Date.now`. Tests pass a fake clock so the
   *   suite is deterministic. The value must be a non-negative integer.
   */
  constructor(options = {}) {
    const clock = options.clock === undefined ? Date.now : options.clock;
    if (typeof clock !== 'function') {
      throw new TypeError('clock must be a function');
    }
    this._clock = clock;
    this._lastTime = -1;
    this._seq = 0;
  }

  /**
   * Generate the next ID.
   *
   * @returns {string} An 11-character base62 ID.
   */
  next() {
    let now = this._clock();
    if (!Number.isInteger(now) || now < 0) {
      throw new RangeError('clock must return a non-negative integer');
    }
    if (now > MAX_TIME) {
      throw new RangeError('clock value exceeds ' + TIME_BITS + ' bits');
    }

    // Clamp a backwards clock to the last value we saw. This keeps the
    // timestamp component non-decreasing, which is what makes the IDs sort.
    if (now < this._lastTime) {
      now = this._lastTime;
    }

    if (now === this._lastTime) {
      this._seq += 1;
      if (this._seq > SEQ_MASK) {
        // The sequence for this millisecond is exhausted. Advance the
        // timestamp by one so the next ID is still unique and ordered.
        now += 1;
        this._seq = 0;
      }
    } else {
      this._seq = 0;
    }

    if (now > MAX_TIME) {
      throw new RangeError('timestamp overflow after sequence exhaustion');
    }

    this._lastTime = now;

    const value = (BigInt(now) << BigInt(SEQ_BITS)) | BigInt(this._seq);
    return encodeBase62(value);
  }
}

/**
 * Create a new generator. Convenience wrapper around `new ShortIdGenerator`.
 *
 * @param {object} [options] - Same options as `ShortIdGenerator`.
 * @returns {ShortIdGenerator}
 */
export function createGenerator(options) {
  return new ShortIdGenerator(options);
}

/**
 * Extract the millisecond timestamp embedded in an ID.
 *
 * @param {string} id - A value produced by `ShortIdGenerator.next()`.
 * @returns {number} The timestamp in milliseconds.
 */
export function timestampOf(id) {
  const value = decodeBase62(id);
  return Number(value >> BigInt(SEQ_BITS));
}

/**
 * Extract the sequence number embedded in an ID.
 *
 * @param {string} id - A value produced by `ShortIdGenerator.next()`.
 * @returns {number} The sequence number in [0, 65535].
 */
export function sequenceOf(id) {
  const value = decodeBase62(id);
  return Number(value & BigInt(SEQ_MASK));
}

export const constants = Object.freeze({
  BASE,
  DIGITS,
  ID_LENGTH,
  TIME_BITS,
  SEQ_BITS,
  SEQ_MASK,
  MAX_TIME,
});
