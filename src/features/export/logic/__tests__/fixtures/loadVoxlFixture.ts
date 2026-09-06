import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { parseVoxlBinaryV2 } from '@/features/scene/voxl/codec-v2';
import { loadFromImportFormat, getSnapshot, resetStore } from '@/supports/state';
import { SUPPORT_TYPES } from '@/supports/supportTypeRegistry';
import type { DragonfruitImportFormat, SupportState } from '@/supports/types';

/**
 * A real, deliberately awkward scene to run export against.
 *
 * `lysdiag/` sits outside the repo and is not committed -- the file is a
 * ChituBox import kept because it is slightly malformed on purpose, so it
 * exercises the paths a clean generated fixture never reaches.
 *
 * Every test using this must skip when the file is absent, so the suite still
 * passes on a machine that does not have it.
 */

const FIXTURE_DIR = join(process.cwd(), '..', 'lysdiag');
const FIXTURE_NAME = 'Lance, head, small shields (1)_DF_Scene.voxl';

export const voxlFixturePath = join(FIXTURE_DIR, FIXTURE_NAME);

/** Whether the local-only fixture is present on this machine. */
export function hasVoxlFixture(): boolean {
    return existsSync(voxlFixturePath);
}

/** The support payload the fixture carries, straight out of its SUPP chunk. */
export function readVoxlSupportPayload(): DragonfruitImportFormat {
    const bytes = new Uint8Array(readFileSync(voxlFixturePath));
    const parsed = parseVoxlBinaryV2(bytes);
    return parsed.document.supports as DragonfruitImportFormat;
}

/** The fixture loaded into the real store, as opening the file would leave it. */
export function loadVoxlFixtureIntoStore(): SupportState {
    resetStore();
    loadFromImportFormat(readVoxlSupportPayload());
    return getSnapshot();
}

/** How many of each collection the loaded fixture holds. */
export function describeFixture(state: SupportState): Record<string, number> {
    const counts: Record<string, number> = {
        roots: Object.keys(state.roots).length,
        knots: Object.keys(state.knots).length,
    };
    for (const descriptor of SUPPORT_TYPES) {
        counts[descriptor.location.key] = Object.keys(state[descriptor.location.key] ?? {}).length;
    }
    return counts;
}

/** Every model id the fixture's supports belong to. */
export function fixtureModelIds(state: SupportState): string[] {
    const ids = new Set<string>();
    for (const descriptor of SUPPORT_TYPES) {
        const collection = state[descriptor.location.key] as unknown as Record<string, { modelId?: string }>;
        for (const entity of Object.values(collection ?? {})) {
            if (entity.modelId) ids.add(entity.modelId);
        }
    }
    return Array.from(ids).sort();
}
