import assert from 'node:assert/strict';
import test from 'node:test';

import { bridgeMayLandSideways, SUPPORT_TYPES } from '../supportTypeRegistry';

/**
\* Whether a bridge may land where the wide search found it.
 *
 * The rule lived as a named comparison inside `useTrunkPlacement`, a React hook
 * nothing can exercise, so flipping it changed placement with no test signal.
 * It is a plain function now, and these pin what the flag means.
 */

const CUTOFF = 5;

test('a type that may not reach sideways is refused beyond the near cutoff', () => {
    // The wide search reached a landing 8mm out; a stick has to stay near
    // vertical, so it does not build there.
    assert.equal(bridgeMayLandSideways('stick', 8, CUTOFF, true), false);
});

test('a type that may reach sideways is allowed the same landing', () => {
    // A twig is short, so propping the contact off a neighbouring surface is
    // exactly what the reach is for.
    assert.equal(bridgeMayLandSideways('twig', 8, CUTOFF, true), true);
});

test('the reach is irrelevant when the near search found the landing', () => {
    // Inside the near cutoff the landing is an ordinary bridge; the flag has
    // nothing to say about it.
    assert.equal(bridgeMayLandSideways('stick', 3, CUTOFF, true), true);
});

test('the reach is irrelevant when no wide search happened', () => {
    // `reachedSideways` false means the near search answered, so a far landing
    // here is some other path's business, not this rule's.
    assert.equal(bridgeMayLandSideways('stick', 8, CUTOFF, false), true);
});

test('exactly one type may reach sideways', () => {
    // The flag marks a short-bridge type. More than one would be a surprise
    // worth seeing here rather than in a placement result.
    const reaching = SUPPORT_TYPES.filter((descriptor) => descriptor.mayReachSideways);
    assert.deepEqual(reaching.map((descriptor) => descriptor.id), ['twig']);
});

test('exactly one type re-solves its diameter from attachments', () => {
    // The counterpart flag: the removal path calls the stepwise profile only
    // for a host that declares this, and trunk is the type with that profile.
    const recomputing = SUPPORT_TYPES.filter((descriptor) => descriptor.recomputesDiameterFromAttachments);
    assert.deepEqual(recomputing.map((descriptor) => descriptor.id), ['trunk']);
});
