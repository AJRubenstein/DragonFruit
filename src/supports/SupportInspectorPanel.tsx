"use client";

import React, { useMemo, useSyncExternalStore } from 'react';

import { subscribe, getSnapshot } from './state';
import { inspectSupport, type SupportInspection } from './supportInspector';
import { useResolvedSelectionState } from './interaction/shared/selection/resolvedSelectionStore';
import { getSupportsForModel, modelIdOfParentShaft } from './PlacementLogic/SupportModelLinker';
import {
    SUPPORT_COLLECTION_KEYS,
    SUPPORT_PRIMITIVE_COLLECTIONS,
    SUPPORT_TYPES,
    type SupportCollectionKey,
} from './supportTypeRegistry';

/**
 * What is selected, what it is attached to, and what the active model holds.
 *
 * Every row is derived: the collections come from the registry, the links from
 * each type's declared edges, and the counts from the same walk the model
 * linker uses. Nothing here names a support type.
 */

interface SupportInspectorPanelProps {
    /** The model whose counts are shown. */
    activeModelId?: string | null;
    /** Hovered support id, when the pointer is over one. */
    hoveredSupportId?: string | null;
}

const short = (id: string) => `${id.slice(0, 8)}…`;

const styles = {
    label: { color: '#888' } as React.CSSProperties,
    value: { color: '#eee', wordBreak: 'break-all' } as React.CSSProperties,
    heading: {
        color: '#4fc3f7',
        fontWeight: 'bold',
        marginTop: 8,
        marginBottom: 4,
        borderTop: '1px solid #333',
        paddingTop: 6,
    } as React.CSSProperties,
    grid: {
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: '2px 8px',
    } as React.CSSProperties,
    warn: { color: '#ff9800' } as React.CSSProperties,
    bad: { color: '#f44336' } as React.CSSProperties,
};

/** The declared edges out of a support, and whether each one resolves. */
function LinkRows({ inspection }: { inspection: SupportInspection }) {
    if (inspection.links.length === 0) {
        return (
            <>
                <span style={styles.label}>Attached to</span>
                <span style={styles.value}>nothing (free-standing)</span>
            </>
        );
    }

    return (
        <>
            {inspection.links.map((link) => (
                <React.Fragment key={link.field}>
                    <span style={styles.label}>
                        {link.ownership === 'owns' ? 'owns' : 'hangs off'}
                    </span>
                    <span style={link.resolved ? styles.value : styles.bad}>
                        {link.to} {short(link.id)}
                        {link.resolved ? '' : ' — MISSING'}
                    </span>
                </React.Fragment>
            ))}
        </>
    );
}

export function SupportInspectorPanel({
    activeModelId,
    hoveredSupportId,
}: SupportInspectorPanelProps) {
    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const selection = useResolvedSelectionState();

    const primaryId = selection.selectedId ?? selection.selectedIds[0] ?? null;
    const inspection = useMemo(
        () => (primaryId ? inspectSupport(state, primaryId) : null),
        [state, primaryId],
    );
    const hovered = useMemo(
        () => (hoveredSupportId ? inspectSupport(state, hoveredSupportId) : null),
        [state, hoveredSupportId],
    );

    /**
     * How many of each collection the active model holds.
     *
     * Knots carry no `modelId`, so they resolve through the shaft segment they
     * sit on -- the same resolution the model linker uses for everything else.
     */
    const counts = useMemo(() => {
        if (!activeModelId) return null;

        const byModel = getSupportsForModel(state, activeModelId);
        const result: { key: SupportCollectionKey; label: string; count: number }[] = [];

        for (const primitive of SUPPORT_PRIMITIVE_COLLECTIONS) {
            const record = state[primitive.key] as unknown as Record<string, { modelId?: string; parentShaftId?: string }>;
            const count = Object.values(record ?? {}).filter((entity) => (
                entity.modelId
                    ? entity.modelId === activeModelId
                    : !!entity.parentShaftId
                        && modelIdOfParentShaft(state, entity.parentShaftId) === activeModelId
            )).length;
            result.push({ key: primitive.key, label: primitive.key, count });
        }

        for (const descriptor of SUPPORT_TYPES) {
            const key = descriptor.location.key as SupportCollectionKey;
            result.push({ key, label: descriptor.label, count: byModel[key]?.length ?? 0 });
        }

        return result;
    }, [state, activeModelId]);

    const totalInScene = useMemo(
        () => SUPPORT_COLLECTION_KEYS.reduce(
            (sum, key) => sum + Object.keys((state[key] as unknown as object) ?? {}).length,
            0,
        ),
        [state],
    );

    return (
        <div
            style={{
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                color: '#fff',
                padding: '8px 12px',
                borderRadius: 4,
                fontFamily: 'var(--font-geist-mono)',
                fontSize: 11,
                minWidth: 260,
                maxWidth: 340,
                maxHeight: '70vh',
                overflowY: 'auto',
                pointerEvents: 'none',
            }}
        >
            <div style={{ fontWeight: 'bold', color: '#4fc3f7' }}>Support Inspector</div>

            <div style={styles.heading}>Selected</div>
            {!inspection ? (
                <div style={styles.label}>
                    {selection.selectedIds.length > 1
                        ? `${selection.selectedIds.length} supports selected`
                        : 'Nothing selected'}
                </div>
            ) : (
                <div style={styles.grid}>
                    <span style={styles.label}>Type</span>
                    <span style={{ ...styles.value, color: '#ff9800' }}>{inspection.label}</span>

                    <span style={styles.label}>Id</span>
                    <span style={styles.value}>{short(inspection.id)}</span>

                    <span style={styles.label}>Model</span>
                    <span style={inspection.modelId ? styles.value : styles.warn}>
                        {inspection.modelId ? short(inspection.modelId) : 'none (inherited)'}
                    </span>

                    {inspection.segmentCount > 0 && (
                        <>
                            <span style={styles.label}>Segments</span>
                            <span style={styles.value}>{inspection.segmentCount}</span>
                        </>
                    )}

                    {inspection.contacts.map((contact) => (
                        <React.Fragment key={contact.field}>
                            <span style={styles.label}>{contact.kind}</span>
                            <span style={contact.present ? styles.value : styles.warn}>
                                {contact.field}{contact.present ? '' : ' — absent'}
                            </span>
                        </React.Fragment>
                    ))}

                    <LinkRows inspection={inspection} />

                    <span style={styles.label}>Hosts</span>
                    <span style={styles.value}>
                        {inspection.dependents.length === 0
                            ? 'nothing'
                            : `${inspection.dependents.length} (${
                                [...new Set(inspection.dependents.map((d) => d.collection))].join(', ')
                            })`}
                    </span>

                    <span style={styles.label}>Delete takes</span>
                    <span style={inspection.cascadeCount > 0 ? styles.warn : styles.value}>
                        {inspection.cascadeCount} other
                    </span>

                    {inspection.danglingLinks.length > 0 && (
                        <>
                            <span style={styles.label}>Broken</span>
                            <span style={styles.bad}>
                                {inspection.danglingLinks.map((l) => l.field).join(', ')}
                            </span>
                        </>
                    )}
                </div>
            )}

            <div style={styles.heading}>Hovered</div>
            {!hovered ? (
                <div style={styles.label}>Nothing</div>
            ) : (
                <div style={styles.grid}>
                    <span style={styles.label}>Type</span>
                    <span style={{ ...styles.value, color: '#ff9800' }}>{hovered.label}</span>
                    <span style={styles.label}>Id</span>
                    <span style={styles.value}>{short(hovered.id)}</span>
                    <span style={styles.label}>Hosts</span>
                    <span style={styles.value}>{hovered.dependents.length}</span>
                </div>
            )}

            <div style={styles.heading}>
                Active model {activeModelId ? `(${short(activeModelId)})` : '(none)'}
            </div>
            {!counts ? (
                <div style={styles.label}>No active model</div>
            ) : (
                <div style={styles.grid}>
                    {counts.map((row) => (
                        <React.Fragment key={row.key}>
                            <span style={styles.label}>{row.label}</span>
                            <span style={styles.value}>{row.count}</span>
                        </React.Fragment>
                    ))}
                    <span style={{ ...styles.label, borderTop: '1px solid #333', paddingTop: 2 }}>
                        scene total
                    </span>
                    <span style={{ ...styles.value, borderTop: '1px solid #333', paddingTop: 2 }}>
                        {totalInScene}
                    </span>
                </div>
            )}
        </div>
    );
}
