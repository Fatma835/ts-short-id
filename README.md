# ts-short-id

Generates 11-character base62 IDs from a monotonic millisecond clock; IDs sort lexicographically by creation time and use a per-millisecond sequence to avoid collisions.

```js
import { createGenerator, timestampOf, sequenceOf } from 'ts-short-id';

const gen = createGenerator();
const id = gen.next();
console.log(id);            // e.g. "02Yb8l0G0000"
console.log(timestampOf(id)); // milliseconds since epoch
console.log(sequenceOf(id));  // 0 for the first ID in that millisecond
```

## Why this exists

The common short-ID designs either rely on randomness (and therefore on collision
probabilities you have to reason about) or on a wall clock that can jump
backwards. A backwards jump makes IDs sort out of order and can cause a generator
to reissue an ID it already handed out. This library uses a monotonic clock and
clamps the timestamp to the last value it observed, so the timestamp component is
non-decreasing even if the underlying clock is not. The trade-off is that an ID
is not globally unique across processes: two generators running at the same
millisecond will produce the same timestamp and sequence. If you need
cross-process uniqueness, add a per-process prefix or a random node component.

## The awkward edge

A single generator can emit 65,536 IDs per millisecond. On the 65,537th call in
the same millisecond the sequence is exhausted; the generator advances the
timestamp by one millisecond rather than wrapping. That keeps IDs unique and
ordered, but it means the embedded timestamp can be slightly ahead of the real
clock under sustained high load. `timestampOf` therefore reports the timestamp
the generator used, not necessarily the wall-clock time of the call.

## API

- `createGenerator(options?)` -> `ShortIdGenerator`
- `new ShortIdGenerator(options?)`
  - `options.clock`: `() => number`, defaults to `Date.now`. Must return a
    non-negative integer. Pass a fake clock in tests for deterministic output.
- `gen.next()` -> `string`
- `timestampOf(id)` -> `number`
- `sequenceOf(id)` -> `number`
- `constants`: frozen object with `BASE`, `DIGITS`, `ID_LENGTH`, `TIME_BITS`,
  `SEQ_BITS`, `SEQ_MASK`, `MAX_TIME`.
