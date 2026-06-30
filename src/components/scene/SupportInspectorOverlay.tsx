import React from 'react';
import * as THREE from 'three';
import type {
    Vec3,
    SupportState,
    Trunk,
    Branch,
    Leaf,
    Knot,
    Roots,
    Brace,
    Segment,
    Twig,
    Stick,
    Anchor,
} from '@/supports/types';

// ---------------------------------------------------------------------------
// Tree data structures
// ---------------------------------------------------------------------------

interface LeafNode { leaf: Leaf }
interface BranchKnotNode { knot: Knot; leaves: LeafNode[] }
interface BranchNode { branch: Branch; knots: BranchKnotNode[] }
interface TrunkKnotNode { knot: Knot; branches: BranchNode[]; leaves: LeafNode[] }

interface InspectorTree {
    trunk: Trunk;
    root: Roots | null;
    knots: TrunkKnotNode[];
    braces: Brace[];
}

// ---------------------------------------------------------------------------
// Tree resolution — walks any selected entity up to its root trunk
// ---------------------------------------------------------------------------

function resolveSegmentToTrunk(segmentId: string, state: SupportState, depth = 0): Trunk | null {
    if (depth > 6) return null;
    for (const trunk of Object.values(state.trunks)) {
        if (trunk.segments.some((s) => s.id === segmentId)) return trunk;
    }
    for (const branch of Object.values(state.branches)) {
        if (branch.segments.some((s) => s.id === segmentId)) {
            const knot = state.knots[branch.parentKnotId];
            if (knot) return resolveSegmentToTrunk(knot.parentShaftId, state, depth + 1);
        }
    }
    return null;
}

function resolveKnotToTrunk(knotId: string, state: SupportState): Trunk | null {
    const knot = state.knots[knotId];
    if (!knot) return null;
    return resolveSegmentToTrunk(knot.parentShaftId, state);
}

function resolveToTrunk(
    selectedId: string,
    selectedCategory: string,
    state: SupportState,
): Trunk | null {
    switch (selectedCategory) {
        case 'trunk': return state.trunks[selectedId] ?? null;
        case 'root': return Object.values(state.trunks).find((t) => t.rootId === selectedId) ?? null;
        case 'branch': {
            const b = state.branches[selectedId];
            return b ? resolveKnotToTrunk(b.parentKnotId, state) : null;
        }
        case 'leaf': {
            const l = state.leaves[selectedId];
            return l ? resolveKnotToTrunk(l.parentKnotId, state) : null;
        }
        case 'knot': {
            const k = state.knots[selectedId];
            return k ? resolveSegmentToTrunk(k.parentShaftId, state) : null;
        }
        case 'segment': {
            return resolveSegmentToTrunk(selectedId, state);
        }
        case 'joint': {
            for (const trunk of Object.values(state.trunks)) {
                for (const seg of trunk.segments) {
                    if (seg.bottomJoint?.id === selectedId || seg.topJoint?.id === selectedId) return trunk;
                }
            }
            for (const branch of Object.values(state.branches)) {
                for (const seg of branch.segments) {
                    if (seg.bottomJoint?.id === selectedId || seg.topJoint?.id === selectedId) {
                        return resolveKnotToTrunk(branch.parentKnotId, state);
                    }
                }
            }
            return null;
        }
        case 'contactDisk': {
            for (const trunk of Object.values(state.trunks)) {
                if (trunk.contactCone?.id === selectedId) return trunk;
            }
            for (const branch of Object.values(state.branches)) {
                if (branch.contactCone?.id === selectedId) return resolveKnotToTrunk(branch.parentKnotId, state);
            }
            for (const leaf of Object.values(state.leaves)) {
                if (leaf.contactCone?.id === selectedId) return resolveKnotToTrunk(leaf.parentKnotId, state);
            }
            return null;
        }
        default: return null;
    }
}

function buildTree(
    selectedId: string | null,
    selectedCategory: string | null | undefined,
    state: SupportState,
): InspectorTree | null {
    if (!selectedId || !selectedCategory) return null;
    const trunk = resolveToTrunk(selectedId, selectedCategory, state);
    if (!trunk) return null;

    const root = state.roots[trunk.rootId] ?? null;
    const trunkSegIds = new Set(trunk.segments.map((s) => s.id));
    const trunkKnots = Object.values(state.knots).filter((k) => trunkSegIds.has(k.parentShaftId));
    const allTreeKnotIds = new Set(trunkKnots.map((k) => k.id));

    const knotNodes: TrunkKnotNode[] = trunkKnots.map((knot) => {
        const branches = Object.values(state.branches).filter((b) => b.parentKnotId === knot.id);
        const directLeaves = Object.values(state.leaves).filter((l) => l.parentKnotId === knot.id);
        const branchNodes: BranchNode[] = branches.map((branch) => {
            const branchSegIds = new Set(branch.segments.map((s) => s.id));
            const branchKnots = Object.values(state.knots).filter((k) => branchSegIds.has(k.parentShaftId));
            branchKnots.forEach((k) => allTreeKnotIds.add(k.id));
            return {
                branch,
                knots: branchKnots.map((bk) => ({
                    knot: bk,
                    leaves: Object.values(state.leaves)
                        .filter((l) => l.parentKnotId === bk.id)
                        .map((l) => ({ leaf: l })),
                })),
            };
        });
        return { knot, branches: branchNodes, leaves: directLeaves.map((l) => ({ leaf: l })) };
    });

    const braces = Object.values(state.braces).filter(
        (b) => allTreeKnotIds.has(b.startKnotId) || allTreeKnotIds.has(b.endKnotId),
    );

    return { trunk, root, knots: knotNodes, braces };
}

// ---------------------------------------------------------------------------
// Partial info — for entities that can't resolve to a trunk
// ---------------------------------------------------------------------------

interface PartialInfo {
    label: string;
    rows: Array<{ key: string; value: string; warn?: boolean }>;
}

function diagKnotParentShaftId(parentShaftId: string, state: SupportState): string {
    if (parentShaftId.startsWith('leafCone:')) return `on leaf cone ${shortId(parentShaftId.slice(9))}`;
    if (parentShaftId.startsWith('braceSegment:')) return `on brace segment ${shortId(parentShaftId.slice(13))}`;
    const foundInTrunk = Object.values(state.trunks).some((t) => t.segments.some((s) => s.id === parentShaftId));
    const foundInBranch = Object.values(state.branches).some((b) => b.segments.some((s) => s.id === parentShaftId));
    if (foundInTrunk || foundInBranch) return `segment found but trunk resolve failed`;
    return `segment ${shortId(parentShaftId)} not found (orphaned?)`;
}

function buildPartialInfo(
    selectedId: string,
    selectedCategory: string,
    state: SupportState,
): PartialInfo | null {
    switch (selectedCategory) {
        case 'knot': {
            const k = state.knots[selectedId];
            if (!k) return { label: `knot (not in state)`, rows: [{ key: 'id', value: shortId(selectedId), warn: true }] };
            const diag = diagKnotParentShaftId(k.parentShaftId, state);
            const isOrphaned = diag.includes('not found');
            return {
                label: 'knot (no trunk resolved)',
                rows: [
                    { key: 'id', value: shortId(selectedId) },
                    { key: 'pos', value: fmtV3(k.pos) },
                    { key: 'parentShaftId', value: shortId(k.parentShaftId) },
                    { key: 'status', value: diag, warn: isOrphaned },
                ],
            };
        }
        case 'joint': {
            // Trunk/branch segments are also checked here even though resolveToTrunk
            // already walks them: a joint can sit on a perfectly real trunk/branch
            // segment whose tree-build still failed (e.g. a branch whose parent knot
            // has a broken parentShaftId chain). Without this, that joint fell through
            // to a dead-end "orphaned" message even though it has a real owner and
            // import source — exactly the case that should be easiest to diagnose.
            for (const trunk of Object.values(state.trunks)) {
                for (const seg of trunk.segments) {
                    const j = seg.bottomJoint?.id === selectedId ? seg.bottomJoint : (seg.topJoint?.id === selectedId ? seg.topJoint : null);
                    if (j) {
                        return {
                            label: 'joint (on trunk)',
                            rows: [
                                { key: 'pos', value: fmtV3(j.pos) },
                                { key: 'trunk', value: shortId(trunk.id) },
                                ...(trunk.importSourceLabel ? [{ key: 'source', value: trunk.importSourceLabel }] : []),
                            ],
                        };
                    }
                }
            }
            for (const branch of Object.values(state.branches)) {
                for (const seg of branch.segments) {
                    const j = seg.bottomJoint?.id === selectedId ? seg.bottomJoint : (seg.topJoint?.id === selectedId ? seg.topJoint : null);
                    if (j) {
                        const knot = state.knots[branch.parentKnotId];
                        const diag = knot
                            ? diagKnotParentShaftId(knot.parentShaftId, state)
                            : `parent knot ${shortId(branch.parentKnotId)} not found`;
                        const isBroken = !knot || diag.includes('not found');
                        return {
                            label: isBroken ? 'joint (on branch — parent chain broken)' : 'joint (on branch)',
                            rows: [
                                { key: 'pos', value: fmtV3(j.pos) },
                                { key: 'branch', value: shortId(branch.id) },
                                ...(branch.importSourceLabel ? [{ key: 'source', value: branch.importSourceLabel }] : []),
                                { key: 'parentKnotId', value: shortId(branch.parentKnotId), warn: !knot },
                                { key: 'status', value: diag, warn: isBroken },
                            ],
                        };
                    }
                }
            }
            // Walk remaining segment-bearing types.
            for (const twig of Object.values(state.twigs)) {
                for (const seg of twig.segments) {
                    if (seg.bottomJoint?.id === selectedId) return { label: 'joint (on twig)', rows: [{ key: 'pos', value: fmtV3(seg.bottomJoint.pos) }, { key: 'twig', value: shortId(twig.id) }, ...(twig.importSourceLabel ? [{ key: 'source', value: twig.importSourceLabel }] : [])] };
                    if (seg.topJoint?.id === selectedId) return { label: 'joint (on twig)', rows: [{ key: 'pos', value: fmtV3(seg.topJoint.pos) }, { key: 'twig', value: shortId(twig.id) }, ...(twig.importSourceLabel ? [{ key: 'source', value: twig.importSourceLabel }] : [])] };
                }
            }
            for (const stick of Object.values(state.sticks)) {
                for (const seg of stick.segments) {
                    if (seg.bottomJoint?.id === selectedId) return { label: 'joint (on stick)', rows: [{ key: 'pos', value: fmtV3(seg.bottomJoint.pos) }, { key: 'stick', value: shortId(stick.id) }, ...(stick.importSourceLabel ? [{ key: 'source', value: stick.importSourceLabel }] : [])] };
                    if (seg.topJoint?.id === selectedId) return { label: 'joint (on stick)', rows: [{ key: 'pos', value: fmtV3(seg.topJoint.pos) }, { key: 'stick', value: shortId(stick.id) }, ...(stick.importSourceLabel ? [{ key: 'source', value: stick.importSourceLabel }] : [])] };
                }
            }
            for (const anchor of Object.values(state.anchors)) {
                if (anchor.joint.id === selectedId) return { label: 'joint (on anchor)', rows: [{ key: 'pos', value: fmtV3(anchor.joint.pos) }, { key: 'anchor', value: shortId(anchor.id) }, ...(anchor.importSourceLabel ? [{ key: 'source', value: anchor.importSourceLabel }] : [])] };
                for (const seg of anchor.segments) {
                    if (seg.bottomJoint?.id === selectedId) return { label: 'joint (on anchor seg)', rows: [{ key: 'pos', value: fmtV3(seg.bottomJoint.pos) }, { key: 'anchor', value: shortId(anchor.id) }, ...(anchor.importSourceLabel ? [{ key: 'source', value: anchor.importSourceLabel }] : [])] };
                    if (seg.topJoint?.id === selectedId) return { label: 'joint (on anchor seg)', rows: [{ key: 'pos', value: fmtV3(seg.topJoint.pos) }, { key: 'anchor', value: shortId(anchor.id) }, ...(anchor.importSourceLabel ? [{ key: 'source', value: anchor.importSourceLabel }] : [])] };
                }
            }
            return { label: 'joint (orphaned — not found in any segment)', rows: [{ key: 'id', value: shortId(selectedId), warn: true }] };
        }
        case 'contactDisk': {
            // Mirrors the 'joint' case above: trunk/branch/leaf disks are also
            // checked here even though resolveToTrunk already walks them, since a
            // disk can sit on a real trunk/branch/leaf whose tree-build still
            // failed (broken parent-knot chain).
            for (const trunk of Object.values(state.trunks)) {
                if (trunk.contactCone?.id === selectedId) {
                    return {
                        label: 'contact disk (on trunk)',
                        rows: [
                            { key: 'pos', value: fmtV3(trunk.contactCone.pos) },
                            { key: 'trunk', value: shortId(trunk.id) },
                            ...(trunk.importSourceLabel ? [{ key: 'source', value: trunk.importSourceLabel }] : []),
                        ],
                    };
                }
            }
            for (const branch of Object.values(state.branches)) {
                if (branch.contactCone?.id === selectedId) {
                    const knot = state.knots[branch.parentKnotId];
                    const diag = knot
                        ? diagKnotParentShaftId(knot.parentShaftId, state)
                        : `parent knot ${shortId(branch.parentKnotId)} not found`;
                    const isBroken = !knot || diag.includes('not found');
                    return {
                        label: isBroken ? 'contact disk (on branch — parent chain broken)' : 'contact disk (on branch)',
                        rows: [
                            { key: 'pos', value: fmtV3(branch.contactCone.pos) },
                            { key: 'branch', value: shortId(branch.id) },
                            ...(branch.importSourceLabel ? [{ key: 'source', value: branch.importSourceLabel }] : []),
                            { key: 'parentKnotId', value: shortId(branch.parentKnotId), warn: !knot },
                            { key: 'status', value: diag, warn: isBroken },
                        ],
                    };
                }
            }
            for (const leaf of Object.values(state.leaves)) {
                if (leaf.contactCone?.id === selectedId) {
                    const knot = state.knots[leaf.parentKnotId];
                    const diag = knot
                        ? diagKnotParentShaftId(knot.parentShaftId, state)
                        : `parent knot ${shortId(leaf.parentKnotId)} not found`;
                    const isBroken = !knot || diag.includes('not found');
                    return {
                        label: isBroken ? 'contact disk (on leaf — parent chain broken)' : 'contact disk (on leaf)',
                        rows: [
                            { key: 'pos', value: fmtV3(leaf.contactCone.pos) },
                            { key: 'leaf', value: shortId(leaf.id) },
                            ...(leaf.importSourceLabel ? [{ key: 'source', value: leaf.importSourceLabel }] : []),
                            { key: 'parentKnotId', value: shortId(leaf.parentKnotId), warn: !knot },
                            { key: 'status', value: diag, warn: isBroken },
                        ],
                    };
                }
            }
            for (const twig of Object.values(state.twigs)) {
                if (twig.contactDiskA?.id === selectedId) {
                    return { label: 'contact disk (on twig — disk A)', rows: [{ key: 'pos', value: fmtV3(twig.contactDiskA.pos) }, { key: 'twig', value: shortId(twig.id) }, ...(twig.importSourceLabel ? [{ key: 'source', value: twig.importSourceLabel }] : [])] };
                }
                if (twig.contactDiskB?.id === selectedId) {
                    return { label: 'contact disk (on twig — disk B)', rows: [{ key: 'pos', value: fmtV3(twig.contactDiskB.pos) }, { key: 'twig', value: shortId(twig.id) }, ...(twig.importSourceLabel ? [{ key: 'source', value: twig.importSourceLabel }] : [])] };
                }
            }
            for (const stick of Object.values(state.sticks)) {
                if (stick.contactConeA?.id === selectedId) {
                    return { label: 'contact disk (on stick — cone A)', rows: [{ key: 'pos', value: fmtV3(stick.contactConeA.pos) }, { key: 'stick', value: shortId(stick.id) }, ...(stick.importSourceLabel ? [{ key: 'source', value: stick.importSourceLabel }] : [])] };
                }
                if (stick.contactConeB?.id === selectedId) {
                    return { label: 'contact disk (on stick — cone B)', rows: [{ key: 'pos', value: fmtV3(stick.contactConeB.pos) }, { key: 'stick', value: shortId(stick.id) }, ...(stick.importSourceLabel ? [{ key: 'source', value: stick.importSourceLabel }] : [])] };
                }
            }
            for (const anchor of Object.values(state.anchors)) {
                if (anchor.contactCone?.id === selectedId) {
                    return { label: 'contact disk (on anchor)', rows: [{ key: 'pos', value: fmtV3(anchor.contactCone.pos) }, { key: 'anchor', value: shortId(anchor.id) }, ...(anchor.importSourceLabel ? [{ key: 'source', value: anchor.importSourceLabel }] : [])] };
                }
            }
            return { label: 'contact disk (orphaned — not found on any entity)', rows: [{ key: 'id', value: shortId(selectedId), warn: true }] };
        }
        case 'branch': {
            // resolveToTrunk already tries this entity, but a branch can fail to
            // resolve for legitimate reasons (parented to a leafCone/braceSegment
            // knot, not a real trunk/branch segment) as well as genuinely broken
            // ones — show the same diagnosis instead of a dead-end "no info".
            const branch = state.branches[selectedId];
            if (!branch) return { label: 'branch (not in state)', rows: [{ key: 'id', value: shortId(selectedId), warn: true }] };
            const knot = state.knots[branch.parentKnotId];
            const diag = knot
                ? diagKnotParentShaftId(knot.parentShaftId, state)
                : `parent knot ${shortId(branch.parentKnotId)} not found`;
            const isBroken = !knot || diag.includes('not found');
            const rows: PartialInfo['rows'] = [
                { key: 'id', value: shortId(selectedId) },
                ...(branch.importSourceLabel ? [{ key: 'source', value: branch.importSourceLabel }] : []),
                { key: 'segments', value: String(branch.segments.length) },
                { key: 'parentKnotId', value: shortId(branch.parentKnotId), warn: !knot },
                { key: 'status', value: diag, warn: isBroken },
            ];
            branch.segments.forEach((seg, i) => {
                if (seg.bottomJoint) rows.push({ key: `seg${i + 1} ↓`, value: fmtV3(seg.bottomJoint.pos) });
                if (seg.topJoint) rows.push({ key: `seg${i + 1} ↑`, value: fmtV3(seg.topJoint.pos) });
            });
            if (branch.contactCone) rows.push({ key: 'tip', value: fmtV3(branch.contactCone.pos) });
            return { label: isBroken ? 'branch (parent chain broken)' : 'branch (no trunk resolved)', rows };
        }
        case 'leaf': {
            const leaf = state.leaves[selectedId];
            if (!leaf) return { label: 'leaf (not in state)', rows: [{ key: 'id', value: shortId(selectedId), warn: true }] };
            const knot = state.knots[leaf.parentKnotId];
            const diag = knot
                ? diagKnotParentShaftId(knot.parentShaftId, state)
                : `parent knot ${shortId(leaf.parentKnotId)} not found`;
            const isBroken = !knot || diag.includes('not found');
            return {
                label: isBroken ? 'leaf (parent chain broken)' : 'leaf (no trunk resolved)',
                rows: [
                    { key: 'id', value: shortId(selectedId) },
                    ...(leaf.importSourceLabel ? [{ key: 'source', value: leaf.importSourceLabel }] : []),
                    { key: 'parentKnotId', value: shortId(leaf.parentKnotId), warn: !knot },
                    { key: 'status', value: diag, warn: isBroken },
                    { key: 'tip', value: fmtV3(leaf.contactCone.pos) },
                ],
            };
        }
        case 'twig': {
            const twig = state.twigs[selectedId];
            if (!twig) return null;
            const rows: PartialInfo['rows'] = [
                { key: 'id', value: shortId(selectedId) },
                ...(twig.importSourceLabel ? [{ key: 'source', value: twig.importSourceLabel }] : []),
                { key: 'segments', value: String(twig.segments.length) },
                { key: 'diskA pos', value: fmtV3(twig.contactDiskA.pos) },
                { key: 'diskB pos', value: fmtV3(twig.contactDiskB.pos) },
            ];
            twig.segments.forEach((seg, i) => {
                if (seg.bottomJoint) rows.push({ key: `seg${i+1} ↓`, value: fmtV3(seg.bottomJoint.pos) });
                if (seg.topJoint) rows.push({ key: `seg${i+1} ↑`, value: fmtV3(seg.topJoint.pos) });
            });
            return { label: 'twig', rows };
        }
        case 'stick': {
            const stick = state.sticks[selectedId];
            if (!stick) return null;
            const rows: PartialInfo['rows'] = [
                { key: 'id', value: shortId(selectedId) },
                ...(stick.importSourceLabel ? [{ key: 'source', value: stick.importSourceLabel }] : []),
                { key: 'segments', value: String(stick.segments.length) },
                { key: 'coneA pos', value: fmtV3(stick.contactConeA.pos) },
                { key: 'coneB pos', value: fmtV3(stick.contactConeB.pos) },
            ];
            stick.segments.forEach((seg, i) => {
                if (seg.bottomJoint) rows.push({ key: `seg${i+1} ↓`, value: fmtV3(seg.bottomJoint.pos) });
                if (seg.topJoint) rows.push({ key: `seg${i+1} ↑`, value: fmtV3(seg.topJoint.pos) });
            });
            return { label: 'stick', rows };
        }
        case 'anchor': {
            const anchor = state.anchors[selectedId];
            if (!anchor) return null;
            const rows: PartialInfo['rows'] = [
                { key: 'id', value: shortId(selectedId) },
                ...(anchor.importSourceLabel ? [{ key: 'source', value: anchor.importSourceLabel }] : []),
                { key: 'rootPos', value: fmtV3(anchor.rootPos) },
                { key: 'jointPos', value: fmtV3(anchor.joint.pos) },
                { key: 'segments', value: String(anchor.segments.length) },
                { key: 'tip pos', value: fmtV3(anchor.contactCone.pos) },
            ];
            anchor.segments.forEach((seg, i) => {
                if (seg.bottomJoint) rows.push({ key: `seg${i+1} ↓`, value: fmtV3(seg.bottomJoint.pos) });
                if (seg.topJoint) rows.push({ key: `seg${i+1} ↑`, value: fmtV3(seg.topJoint.pos) });
            });
            return { label: 'anchor', rows };
        }
        case 'brace': {
            const brace = state.braces[selectedId];
            if (!brace) return null;
            const sk = state.knots[brace.startKnotId];
            const ek = state.knots[brace.endKnotId];
            const rows: PartialInfo['rows'] = [
                { key: 'id', value: shortId(selectedId) },
                ...(brace.importSourceLabel ? [{ key: 'source', value: brace.importSourceLabel }] : []),
                { key: 'diameter', value: `${brace.profile.diameter.toFixed(2)}mm` },
                { key: 'startKnotId', value: shortId(brace.startKnotId), warn: !sk },
                { key: 'endKnotId', value: shortId(brace.endKnotId), warn: !ek },
            ];
            if (sk) rows.push({ key: 'start pos', value: fmtV3(sk.pos) });
            if (ek) rows.push({ key: 'end pos', value: fmtV3(ek.pos) });
            return { label: 'brace', rows };
        }
        default:
            return null;
    }
}

// ---------------------------------------------------------------------------
// Plain-text serializer (for clipboard)
// ---------------------------------------------------------------------------

function v3txt(v: Vec3): string {
    return `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
}

function buildPlainText(
    tree: InspectorTree | null,
    partial: PartialInfo | null,
    selectedId: string | null,
    selectedCategory: string | null | undefined,
    state: SupportState,
): string {
    const lines: string[] = ['SUPPORT INSPECTOR', '='.repeat(44)];

    if (partial) {
        lines.push(partial.label.toUpperCase());
        for (const row of partial.rows) {
            lines.push(`  ${row.key}: ${row.value}${row.warn ? ' !' : ''}`);
        }
        return lines.join('\n');
    }

    if (!tree) {
        lines.push(`Nothing selected (${selectedCategory ?? 'none'} ${selectedId ?? '—'})`);
        return lines.join('\n');
    }

    lines.push(`TRUNK  ${tree.trunk.id}${tree.trunk.importSourceLabel ? `  src:${tree.trunk.importSourceLabel}` : ''}`);
    if (tree.trunk.baseDiameterMm != null) {
        lines.push(`  base ⌀: ${tree.trunk.baseDiameterMm.toFixed(3)}mm`);
    }
    if (tree.root) {
        const r = tree.root;
        lines.push(`  root  ${v3txt(r.transform.pos)}  ⌀${r.diameter.toFixed(3)}  disk${r.diskHeight.toFixed(2)} cone${r.coneHeight.toFixed(2)}${r.importSourceLabel ? `  src:${r.importSourceLabel}` : ''}`);
    }
    tree.trunk.segments.forEach((seg, i) => {
        lines.push(`  seg${i + 1}  ⌀${seg.diameter.toFixed(3)}`);
        if (seg.bottomJoint) lines.push(`    ↓ bot  ${v3txt(seg.bottomJoint.pos)}`);
        if (seg.topJoint)    lines.push(`    ↑ top  ${v3txt(seg.topJoint.pos)}`);
    });
    if (tree.trunk.contactCone) lines.push(`  tip  ${v3txt(tree.trunk.contactCone.pos)}`);

    if (tree.knots.length > 0) {
        lines.push(`  knots (${tree.knots.length}):`);
        tree.knots.forEach((kn) => {
            lines.push(`  knot  ${v3txt(kn.knot.pos)}`);
            kn.leaves.forEach((ln) => {
                lines.push(`    leaf  ${v3txt(ln.leaf.contactCone.pos)}${ln.leaf.importSourceLabel ? `  src:${ln.leaf.importSourceLabel}` : ''}`);
            });
            kn.branches.forEach((bn) => {
                lines.push(`    branch  ${bn.branch.id}  ${bn.branch.segments.length} segs${bn.branch.importSourceLabel ? `  src:${bn.branch.importSourceLabel}` : ''}`);
                bn.branch.segments.forEach((seg, i) => {
                    lines.push(`      seg${i + 1}  ⌀${seg.diameter.toFixed(3)}`);
                    if (seg.bottomJoint) lines.push(`        ↓ bot  ${v3txt(seg.bottomJoint.pos)}`);
                    if (seg.topJoint)    lines.push(`        ↑ top  ${v3txt(seg.topJoint.pos)}`);
                });
                if (bn.branch.contactCone) lines.push(`      tip  ${v3txt(bn.branch.contactCone.pos)}`);
                bn.knots.forEach((bkn) => {
                    lines.push(`      knot  ${v3txt(bkn.knot.pos)}`);
                    bkn.leaves.forEach((ln) => lines.push(`        leaf  ${v3txt(ln.leaf.contactCone.pos)}${ln.leaf.importSourceLabel ? `  src:${ln.leaf.importSourceLabel}` : ''}`));
                });
            });
        });
    }

    if (tree.braces.length > 0) {
        lines.push(`  braces (${tree.braces.length}):`);
        tree.braces.forEach((brace) => {
            lines.push(`  brace  ${brace.id}  ⌀${brace.profile.diameter.toFixed(3)}${brace.importSourceLabel ? `  src:${brace.importSourceLabel}` : ''}`);
            const sk = state.knots[brace.startKnotId];
            const ek = state.knots[brace.endKnotId];
            if (sk) lines.push(`    start  ${v3txt(sk.pos)}`);
            if (ek) lines.push(`    end    ${v3txt(ek.pos)}`);
        });
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Shared formatting helpers
// ---------------------------------------------------------------------------

const C = {
    bright: '#e5eefb',
    dim: '#64748b',
    label: '#94a3b8',
    trunk: '#f97316',
    branch: '#22c55e',
    leaf: '#06b6d4',
    knot: '#eab308',
    brace: '#e879f9',
    root: '#d97706',
    warn: '#fca5a5',
} as const;

function fmtV3(v: Vec3): string {
    return `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
}

function shortId(id: string): string {
    return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function SrcTag({ label }: { label?: string }) {
    if (!label) return null;
    return (
        <span style={{ color: '#38bdf8', fontSize: 10, marginLeft: 6 }} title="source import record">
            src:{label}
        </span>
    );
}

// ---------------------------------------------------------------------------
// HUD sub-components
// ---------------------------------------------------------------------------

function PosRow({ label, v, extra }: { label: string; v: Vec3; extra?: string }) {
    return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
            <span style={{ color: C.label, minWidth: 42, flexShrink: 0 }}>{label}</span>
            <span style={{ color: C.bright }}>{fmtV3(v)}</span>
            {extra && <span style={{ color: C.dim, fontSize: 10 }}>{extra}</span>}
        </div>
    );
}

function SegRows({ seg, index }: { seg: Segment; index: number }) {
    const bot = seg.bottomJoint?.pos;
    const top = seg.topJoint?.pos;
    return (
        <div style={{ marginLeft: 10, marginTop: 3 }}>
            <span style={{ color: C.dim }}>seg{index + 1}</span>{' '}
            <span style={{ color: C.dim }}>⌀{seg.diameter.toFixed(2)}mm</span>
            {bot
                ? <div style={{ marginLeft: 8 }}><PosRow label="↓ bot" v={bot} /></div>
                : <div style={{ marginLeft: 8, color: C.dim }}>↓ bot —</div>}
            {top
                ? <div style={{ marginLeft: 8 }}><PosRow label="↑ top" v={top} /></div>
                : <div style={{ marginLeft: 8, color: C.dim }}>↑ top —</div>}
        </div>
    );
}

function LeafRow({ leaf, indent = 10 }: { leaf: Leaf; indent?: number }) {
    return (
        <div style={{ marginLeft: indent, marginTop: 2 }}>
            <span style={{ color: C.leaf }}>leaf</span>{' '}
            <span style={{ color: C.label, fontSize: 10 }}>{shortId(leaf.id)}</span>
            <SrcTag label={leaf.importSourceLabel} />
            <div style={{ marginLeft: 8 }}><PosRow label="tip" v={leaf.contactCone.pos} /></div>
        </div>
    );
}

function BranchBlock({ branchNode }: { branchNode: BranchNode }) {
    const { branch } = branchNode;
    return (
        <div style={{ marginLeft: 10, marginTop: 3, borderLeft: '1px solid #1e3a5f', paddingLeft: 6 }}>
            <span style={{ color: C.branch, fontWeight: 600 }}>branch</span>{' '}
            <span style={{ color: C.dim, fontSize: 10 }}>{shortId(branch.id)}</span>{' '}
            <span style={{ color: C.dim, fontSize: 10 }}>{branch.segments.length} seg{branch.segments.length !== 1 ? 's' : ''}</span>
            <SrcTag label={branch.importSourceLabel} />
            {branch.segments.map((seg, i) => <SegRows key={seg.id} seg={seg} index={i} />)}
            {branch.contactCone && (
                <div style={{ marginLeft: 10, marginTop: 2 }}>
                    <PosRow label="tip" v={branch.contactCone.pos} />
                </div>
            )}
            {branchNode.knots.map((bkn) => (
                <div key={bkn.knot.id} style={{ marginLeft: 10, marginTop: 3 }}>
                    <span style={{ color: C.knot }}>knot</span>{' '}
                    <span style={{ color: C.bright }}>{fmtV3(bkn.knot.pos)}</span>
                    {bkn.leaves.map((ln) => <LeafRow key={ln.leaf.id} leaf={ln.leaf} indent={8} />)}
                </div>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// HUD component
// ---------------------------------------------------------------------------

export function SupportInspectorHud({
    supportState,
    treeTypesEnabled,
}: {
    supportState: SupportState;
    treeTypesEnabled: boolean;
}) {
    const tree = React.useMemo(
        () => buildTree(supportState.selectedId, supportState.selectedCategory, supportState),
        [supportState],
    );

    const partial = React.useMemo(() => {
        if (tree || !supportState.selectedId || !supportState.selectedCategory) return null;
        return buildPartialInfo(supportState.selectedId, supportState.selectedCategory, supportState);
    }, [tree, supportState]);

    const [copied, setCopied] = React.useState(false);

    const handleCopy = React.useCallback(() => {
        const text = buildPlainText(
            tree, partial, supportState.selectedId, supportState.selectedCategory, supportState,
        );
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
    }, [tree, partial, supportState]);

    const noSelection = !supportState.selectedId;
    const unresolvable = supportState.selectedId && !tree && !partial;

    return (
        <div
            style={{
                pointerEvents: 'auto',
                position: 'absolute',
                left: 12,
                top: 12,
                zIndex: 64,
                color: C.bright,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 11,
                lineHeight: 1.4,
                width: 'min(380px, calc(100vw - 24px))',
                maxHeight: 'min(80vh, 680px)',
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: '10px 12px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(9, 14, 26, 0.92), rgba(21, 33, 53, 0.82))',
                border: '1px solid rgba(148, 163, 184, 0.45)',
                boxShadow: '0 16px 48px rgba(0,0,0,0.36)',
                backdropFilter: 'blur(6px)',
                whiteSpace: 'normal',
            }}
        >
            {/* Title row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ color: '#f8fafc', fontWeight: 700 }}>Support Inspector</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {(tree || partial) && (
                        <button
                            onClick={handleCopy}
                            style={{
                                background: copied ? 'rgba(34,197,94,0.2)' : 'rgba(148,163,184,0.12)',
                                border: `1px solid ${copied ? 'rgba(34,197,94,0.5)' : 'rgba(148,163,184,0.3)'}`,
                                borderRadius: 4,
                                color: copied ? '#86efac' : C.label,
                                cursor: 'pointer',
                                fontSize: 10,
                                padding: '2px 7px',
                                transition: 'all 0.15s',
                            }}
                        >
                            {copied ? 'copied!' : 'copy'}
                        </button>
                    )}
                    <span style={{ color: C.dim, fontSize: 10 }}>
                        I close · T{' '}
                        <span style={{ color: treeTypesEnabled ? C.knot : C.dim }}>
                            {treeTypesEnabled ? 'types on' : 'types'}
                        </span>
                    </span>
                </div>
            </div>

            {noSelection && (
                <div style={{ color: C.dim }}>Select a support to inspect</div>
            )}

            {unresolvable && (
                <div style={{ color: C.dim }}>
                    No info available for {supportState.selectedCategory} — {shortId(supportState.selectedId!)}
                </div>
            )}

            {/* Partial info (twig, stick, anchor, brace, orphaned knot/joint) */}
            {partial && (
                <div>
                    <div style={{ color: C.warn, marginBottom: 4, fontWeight: 600 }}>
                        {partial.label}
                    </div>
                    {partial.rows.map((row) => (
                        <div key={row.key} style={{ display: 'flex', gap: 8, marginLeft: 8 }}>
                            <span style={{ color: C.label, minWidth: 80, flexShrink: 0 }}>{row.key}</span>
                            <span style={{ color: row.warn ? C.warn : C.bright }}>{row.value}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Full tree */}
            {tree && (
                <>
                    <div style={{ marginBottom: 4 }}>
                        <span style={{ color: C.trunk, fontWeight: 700 }}>TRUNK</span>{' '}
                        <span style={{ color: C.dim }}>{shortId(tree.trunk.id)}</span>
                        {tree.trunk.baseDiameterMm != null && (
                            <span style={{ color: C.dim }}> ⌀{tree.trunk.baseDiameterMm.toFixed(2)}mm base</span>
                        )}
                        <SrcTag label={tree.trunk.importSourceLabel} />
                    </div>

                    {tree.root && (
                        <div style={{ marginLeft: 10, marginBottom: 4 }}>
                            <span style={{ color: C.root }}>root</span>
                            <SrcTag label={tree.root.importSourceLabel} />
                            <div style={{ marginLeft: 8 }}>
                                <PosRow
                                    label="pos"
                                    v={tree.root.transform.pos}
                                    extra={`⌀${tree.root.diameter.toFixed(2)}  disk${tree.root.diskHeight.toFixed(1)}  cone${tree.root.coneHeight.toFixed(1)}`}
                                />
                            </div>
                        </div>
                    )}

                    {tree.trunk.segments.map((seg, i) => (
                        <SegRows key={seg.id} seg={seg} index={i} />
                    ))}

                    {tree.trunk.contactCone && (
                        <div style={{ marginLeft: 10, marginTop: 2 }}>
                            <PosRow label="tip" v={tree.trunk.contactCone.pos} />
                        </div>
                    )}

                    {tree.knots.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                            <div style={{ color: C.dim, marginBottom: 2 }}>
                                {tree.knots.length} knot{tree.knots.length !== 1 ? 's' : ''}
                            </div>
                            {tree.knots.map((kn) => (
                                <div key={kn.knot.id} style={{ marginLeft: 10, marginTop: 4 }}>
                                    <span style={{ color: C.knot }}>knot</span>{' '}
                                    <span style={{ color: C.bright }}>{fmtV3(kn.knot.pos)}</span>
                                    {kn.branches.map((bn) => (
                                        <BranchBlock key={bn.branch.id} branchNode={bn} />
                                    ))}
                                    {kn.leaves.map((ln) => (
                                        <LeafRow key={ln.leaf.id} leaf={ln.leaf} />
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}

                    {tree.braces.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                            <div style={{ color: C.dim, marginBottom: 2 }}>
                                {tree.braces.length} brace{tree.braces.length !== 1 ? 's' : ''}
                            </div>
                            {tree.braces.map((brace) => {
                                const sk = supportState.knots[brace.startKnotId];
                                const ek = supportState.knots[brace.endKnotId];
                                return (
                                    <div key={brace.id} style={{ marginLeft: 10, marginTop: 2 }}>
                                        <span style={{ color: C.brace }}>brace</span>{' '}
                                        <span style={{ color: C.dim }}>⌀{brace.profile.diameter.toFixed(2)}mm</span>
                                        <SrcTag label={brace.importSourceLabel} />
                                        {sk && <div style={{ marginLeft: 8 }}><PosRow label="start" v={sk.pos} /></div>}
                                        {ek && <div style={{ marginLeft: 8 }}><PosRow label="end" v={ek.pos} /></div>}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// 3D overlay — colored points + shaft lines
// ---------------------------------------------------------------------------

function buildPositionArray(points: Vec3[]): Float32Array {
    const out = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
        out[i * 3] = points[i].x;
        out[i * 3 + 1] = points[i].y;
        out[i * 3 + 2] = points[i].z;
    }
    return out;
}

function TypePoints({ points, color, size }: { points: Vec3[]; color: string; size: number }) {
    const positions = React.useMemo(() => buildPositionArray(points), [points]);
    if (points.length === 0) return null;
    return (
        <points renderOrder={1002} frustumCulled={false}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            </bufferGeometry>
            <pointsMaterial
                color={color}
                size={size}
                sizeAttenuation={false}
                transparent
                opacity={0.9}
                depthWrite={false}
                depthTest={false}
                toneMapped={false}
            />
        </points>
    );
}

function ShaftLine({ start, end, color }: { start: Vec3; end: Vec3; color: string }) {
    const line = React.useMemo(() => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(buildPositionArray([start, end]), 3));
        const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, depthTest: false, toneMapped: false });
        const obj = new THREE.Line(geo, mat);
        obj.renderOrder = 1003;
        obj.frustumCulled = false;
        return obj;
    }, [start, end, color]);

    React.useEffect(() => () => {
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
    }, [line]);

    return <primitive object={line} />;
}

function collectTreePoints(tree: InspectorTree) {
    const rootPts: Vec3[] = [];
    const trunkJointPts: Vec3[] = [];
    const trunkKnotPts: Vec3[] = [];
    const branchJointPts: Vec3[] = [];
    const branchKnotPts: Vec3[] = [];
    const leafPts: Vec3[] = [];
    const trunkLines: Array<{ start: Vec3; end: Vec3 }> = [];
    const branchLines: Array<{ start: Vec3; end: Vec3 }> = [];

    if (tree.root) rootPts.push(tree.root.transform.pos);

    for (const seg of tree.trunk.segments) {
        if (seg.bottomJoint) trunkJointPts.push(seg.bottomJoint.pos);
        if (seg.topJoint) trunkJointPts.push(seg.topJoint.pos);
        if (seg.bottomJoint && seg.topJoint) trunkLines.push({ start: seg.bottomJoint.pos, end: seg.topJoint.pos });
    }

    for (const kn of tree.knots) {
        trunkKnotPts.push(kn.knot.pos);
        for (const ln of kn.leaves) leafPts.push(ln.leaf.contactCone.pos);
        for (const bn of kn.branches) {
            for (const seg of bn.branch.segments) {
                if (seg.bottomJoint) branchJointPts.push(seg.bottomJoint.pos);
                if (seg.topJoint) branchJointPts.push(seg.topJoint.pos);
                if (seg.bottomJoint && seg.topJoint) branchLines.push({ start: seg.bottomJoint.pos, end: seg.topJoint.pos });
            }
            if (bn.branch.contactCone) leafPts.push(bn.branch.contactCone.pos);
            for (const bkn of bn.knots) {
                branchKnotPts.push(bkn.knot.pos);
                for (const ln of bkn.leaves) leafPts.push(ln.leaf.contactCone.pos);
            }
        }
    }

    return { rootPts, trunkJointPts, trunkKnotPts, branchJointPts, branchKnotPts, leafPts, trunkLines, branchLines };
}

export function SupportInspectorTreeOverlay({ supportState }: { supportState: SupportState }) {
    const tree = React.useMemo(
        () => buildTree(supportState.selectedId, supportState.selectedCategory, supportState),
        [supportState],
    );

    const pts = React.useMemo(() => tree ? collectTreePoints(tree) : null, [tree]);

    const bracePts = React.useMemo(() => {
        if (!tree) return [];
        const out: Vec3[] = [];
        for (const brace of tree.braces) {
            const sk = supportState.knots[brace.startKnotId];
            const ek = supportState.knots[brace.endKnotId];
            if (sk) out.push(sk.pos);
            if (ek) out.push(ek.pos);
        }
        return out;
    }, [tree, supportState.knots]);

    if (!tree || !pts) return null;

    return (
        <group name="support-inspector-overlay">
            <TypePoints points={pts.rootPts} color={C.root} size={12} />
            <TypePoints points={pts.trunkJointPts} color={C.trunk} size={7} />
            <TypePoints points={pts.trunkKnotPts} color={C.knot} size={10} />
            <TypePoints points={pts.branchJointPts} color={C.branch} size={6} />
            <TypePoints points={pts.branchKnotPts} color="#84cc16" size={8} />
            <TypePoints points={pts.leafPts} color={C.leaf} size={9} />
            <TypePoints points={bracePts} color={C.brace} size={9} />
            {pts.trunkLines.map((l, i) => (
                <ShaftLine key={`tl${i}`} start={l.start} end={l.end} color={C.trunk} />
            ))}
            {pts.branchLines.map((l, i) => (
                <ShaftLine key={`bl${i}`} start={l.start} end={l.end} color={C.branch} />
            ))}
        </group>
    );
}
