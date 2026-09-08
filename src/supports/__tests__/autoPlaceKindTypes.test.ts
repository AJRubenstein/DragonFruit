import assert from 'node:assert/strict';
import test from 'node:test';

import { LEDGER_KINDS, isLedgerKind } from '../autoSupport/types';
import { SUPPORT_TYPES } from '../supportTypeRegistry';

/**
 * The auto-placement reports name support types as string literals. Those
 * literals are typed against the registry, so a rename breaks the build rather
 * than leaving a comparison that is quietly always false. `tsc` enforces that;
 * these tests cover the runtime half that types cannot reach.
 */

const REGISTRY_IDS = new Set(SUPPORT_TYPES.map((d) => d.id));

test('every ledger kind is a declared support type', () => {
    for (const kind of LEDGER_KINDS) {
        assert.ok(REGISTRY_IDS.has(kind), `${kind} is in LEDGER_KINDS but not the registry`);
    }
});

test('isLedgerKind accepts exactly the ledger kinds', () => {
    for (const kind of LEDGER_KINDS) {
        assert.ok(isLedgerKind(kind), `${kind} should be a ledger kind`);
    }
});

test('isLedgerKind rejects reject and non-ledger types', () => {
    assert.equal(isLedgerKind('reject'), false, 'reject is not a placed type');

    const excluded = SUPPORT_TYPES
        .map((d) => d.id)
        .filter((id) => !(LEDGER_KINDS as readonly string[]).includes(id));

    // Guards the branch that warns instead of mis-filing an unhandled type.
    assert.ok(excluded.length > 0, 'expected at least one type outside the ledger');
    for (const id of excluded) {
        assert.equal(isLedgerKind(id), false, `${id} is not a ledger kind`);
    }
});
