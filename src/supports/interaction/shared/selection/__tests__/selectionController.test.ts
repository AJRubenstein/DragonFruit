import assert from 'node:assert/strict';
import test from 'node:test';

import { clearHistory, getUndoCount, undo } from '@/history/historyStore';
import { captureSupportEditSnapshot, pushSupportEditHistory } from '@/supports/history/supportEditHistory';
import { registerSupportHistoryHandlers } from '@/supports/history/useSupportHistoryHandlers';
import { applySettingsToSelectedSupports } from '@/supports/Settings/applySettingsToSelectedSupports';
import { createDefaultSettings } from '@/supports/Settings/types';
import type { Roots, SupportState, Trunk } from '@/supports/types';
import {
    getSnapshot,
    resetStore,
    setSnapshot,
} from '@/supports/state';
import {
    clearSupportSelection,
    getResolvedPrimarySelection,
    selectSupportById,
} from '../selectionController';

function makeTrunk(id: string): Trunk {
    return {
        id,
        modelId: 'model-a',
        rootId: `root-${id}`,
        segments: [],
    };
}

function makeRoot(trunkId: string): Roots {
    return {
        id: `root-${trunkId}`,
        modelId: 'model-a',
        transform: {
            pos: { x: 0, y: 0, z: 0 },
            rot: { x: 0, y: 0, z: 0, w: 1 },
        },
        diameter: 3,
        diskHeight: 0.5,
        coneHeight: 0.5,
    };
}

function seedTrunks(...ids: string[]) {
    const snapshot: SupportState = {
        roots: Object.fromEntries(ids.map((id) => [`root-${id}`, makeRoot(id)])),
        trunks: Object.fromEntries(ids.map((id) => [id, makeTrunk(id)])),
        branches: {},
        leaves: {},
        twigs: {},
        sticks: {},
        braces: {},
        anchors: {},
        knots: {},
        selectedId: null,
        hoveredId: null,
        selectedCategory: null,
        hoveredCategory: 'none',
        interactionWarning: null,
    };
    setSnapshot(snapshot);
}

test('Shift-click keeps the last clicked support as the editable representative', () => {
    resetStore();
    clearSupportSelection();
    seedTrunks('trunk-a', 'trunk-b');

    selectSupportById('trunk-a', false);
    selectSupportById('trunk-b', true);

    const selection = getResolvedPrimarySelection();
    assert.deepEqual(selection.selectedIds, ['trunk-a', 'trunk-b']);
    assert.equal(selection.selectedId, 'trunk-b');
    assert.equal(selection.selectedCategory, 'trunk');

    clearSupportSelection();
    resetStore();
});


test('a settings edit changes every Shift-click-selected support in one undo step', async () => {
    resetStore();
    clearSupportSelection();
    clearHistory();
    seedTrunks('trunk-a', 'trunk-b');
    const unregisterHistory = registerSupportHistoryHandlers();

    try {
        selectSupportById('trunk-a', false);
        selectSupportById('trunk-b', true);

        const before = captureSupportEditSnapshot();
        const settings = createDefaultSettings();
        settings.shaft.diameterMm = 2.75;

        applySettingsToSelectedSupports(settings);

        const after = captureSupportEditSnapshot();
        pushSupportEditHistory('Adjust selected support settings', before, after);
        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.equal(getSnapshot().trunks['trunk-a'].baseDiameterMm, 2.75);
        assert.equal(getSnapshot().trunks['trunk-b'].baseDiameterMm, 2.75);
        assert.equal(getUndoCount(), 1);

        undo();
        assert.equal(getSnapshot().trunks['trunk-a'].baseDiameterMm, undefined);
        assert.equal(getSnapshot().trunks['trunk-b'].baseDiameterMm, undefined);
    } finally {
        unregisterHistory();
        clearHistory();
        clearSupportSelection();
        resetStore();
    }
});

test('Shift-click removal promotes a remaining support as the editable representative', () => {
    resetStore();
    clearSupportSelection();
    seedTrunks('trunk-a', 'trunk-b');

    selectSupportById('trunk-a', false);
    selectSupportById('trunk-b', true);
    selectSupportById('trunk-b', true);

    const selection = getResolvedPrimarySelection();
    assert.deepEqual(selection.selectedIds, ['trunk-a']);
    assert.equal(selection.selectedId, 'trunk-a');
    assert.equal(selection.selectedCategory, 'trunk');

    clearSupportSelection();
    resetStore();
});