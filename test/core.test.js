import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ShortIdGenerator,
  createGenerator,
  timestampOf,
  sequenceOf,
  constants,
} from '../src/index.js';

/**
 * A controllable clock for deterministic tests. It never advances on its own;
 * the test moves it explicitly.
 */
function fakeClock(start = 1_700_000_000_000) {
  let now = start;
  return {
    now: () => now,
    set: (value) => {
      now = value;
    },
    advance: (delta) => {
      now += delta;
    },
  };
}

test('generates an 11-character base62 ID', () => {
  const gen = new ShortIdGenerator({ clock: () => 0 });
  const id = gen.next();
  assert.equal(id.length, 11);
  assert.match(id, /^[0-9A-Za-z]{11}$/);
});

test('IDs are lexicographically ordered by time', () => {
  const clock = fakeClock();
  const gen = new ShortIdGenerator({ clock: clock.now });
  const a = gen.next();
  clock.advance(1);
  const b = gen.next();
  clock.advance(1);
  const c = gen.next();
  assert.ok(a < b);
  assert.ok(b < c);
});

test('sequence increments within the same millisecond', () => {
  const clock = fakeClock();
  const gen = new ShortIdGenerator({ clock: clock.now });
  const a = gen.next();
  const b = gen.next();
  const c = gen.next();
  assert.equal(sequenceOf(a), 0);
  assert.equal(sequenceOf(b), 1);
  assert.equal(sequenceOf(c), 2);
  assert.ok(a < b);
  assert.ok(b < c);
});

test('sequence resets when the clock advances', () => {
  const clock = fakeClock();
  const gen = new ShortIdGenerator({ clock: clock.now });
  gen.next();
  gen.next();
  clock.advance(5);
  const id = gen.next();
  assert.equal(sequenceOf(id), 0);
  assert.equal(timestampOf(id), clock.now());
});

test('a backwards clock is clamped and does not produce duplicate IDs', () => {
  const clock = fakeClock(1000);
  const gen = new ShortIdGenerator({ clock: clock.now });
  const first = gen.next();
  clock.set(500); // clock jumps backwards
  const second = gen.next();
  assert.notEqual(first, second);
  assert.ok(first < second);
  assert.equal(timestampOf(second), 1000);
  assert.equal(sequenceOf(second), 1);
});

test('sequence exhaustion advances the timestamp', () => {
  const clock = fakeClock(42);
  const gen = new ShortIdGenerator({ clock: clock.now });
  // Burn through the entire 16-bit sequence for millisecond 42.
  let last = null;
  for (let i = 0; i <= constants.SEQ_MASK; i++) {
    last = gen.next();
  }
  assert.equal(sequenceOf(last), constants.SEQ_MASK);
  assert.equal(timestampOf(last), 42);

  const overflow = gen.next();
  assert.equal(timestampOf(overflow), 43);
  assert.equal(sequenceOf(overflow), 0);
  assert.ok(last < overflow);
});

test('timestampOf and sequenceOf round-trip the encoded value', () => {
  const clock = fakeClock(123456789);
  const gen = new ShortIdGenerator({ clock: clock.now });
  const id = gen.next();
  assert.equal(timestampOf(id), 123456789);
  assert.equal(sequenceOf(id), 0);
});

test('createGenerator returns a working generator', () => {
  const clock = fakeClock(7);
  const gen = createGenerator({ clock: clock.now });
  const id = gen.next();
  assert.equal(timestampOf(id), 7);
  assert.equal(sequenceOf(id), 0);
});

test('many IDs from a single millisecond are unique', () => {
  const clock = fakeClock();
  const gen = new ShortIdGenerator({ clock: clock.now });
  const seen = new Set();
  for (let i = 0; i < 10_000; i++) {
    const id = gen.next();
    assert.ok(!seen.has(id), 'duplicate id: ' + id);
    seen.add(id);
  }
  assert.equal(seen.size, 10_000);
});

test('a non-integer clock value is rejected', () => {
  const gen = new ShortIdGenerator({ clock: () => 1.5 });
  assert.throws(() => gen.next(), RangeError);
});

test('a negative clock value is rejected', () => {
  const gen = new ShortIdGenerator({ clock: () => -1 });
  assert.throws(() => gen.next(), RangeError);
});

test('a clock value beyond 48 bits is rejected', () => {
  const gen = new ShortIdGenerator({ clock: () => constants.MAX_TIME + 1 });
  assert.throws(() => gen.next(), RangeError);
});

test('a non-function clock is rejected', () => {
  assert.throws(() => new ShortIdGenerator({ clock: 42 }), TypeError);
});

test('timestampOf rejects malformed IDs', () => {
  assert.throws(() => timestampOf('short'), TypeError);
  assert.throws(() => timestampOf('!!!!!!!!!!!'), TypeError);
});

test('default clock is used when none is supplied', () => {
  const gen = new ShortIdGenerator();
  const id = gen.next();
  assert.equal(id.length, 11);
  assert.ok(timestampOf(id) > 0);
});
