import type { SupportState, Vec3, Knot } from '@/supports/types';

/**
 * Whole-model diagnostic scan for the Support Inspector.
 *
 * Walks every entity collection in SupportState looking for structural
 * problems that are easy to introduce during import/conversion but hard to
 * spot visually — e.g. a brace whose two endpoints have collapsed onto the
 * same point (BraceRenderer silently skips rendering it below
 * BRACE_INVISIBLE_MM, so the brace just vanishes with no error), or a
 * branch whose parent knot resolves back onto the branch's own segment
 * (a self-reference cycle the host's trunk-resolution walk can never escape).
 */

export type SupportProblemSeverity = 'error' | 'warning';

export interface SupportProblem {
    severity: SupportProblemSeverity;
    category: string;
    entityType: string;
    entityId: string;
    /** Import source label of the OWNING support (e.g. "cbx-sub-28"), not
     * necessarily the flagged entity itself — knots/braces don't always carry
     * their own label, so this is resolved up to the nearest labeled owner. */
    sourceLabel?: string;
    /** A representative world-space location for the problem, so it can be
     * found in the viewport without having to resolve the uuid. */
    pos?: Vec3;
    message: string;
    detail?: string;
}

// Mirrors BraceRenderer.tsx's `if (straight.length < 0.001) return null;` — a
// brace shorter than this is silently invisible in the viewport.
const BRACE_INVISIBLE_MM = 0.001;
const BRACE_SUSPICIOUS_MM = 0.1;

// Two distinct knots on the same shaft this close together almost certainly
// represent ONE physical convergence point (e.g. two braces meeting at the
// same spot) that never got merged into a single shared knot. Each keeps its
// own `t`/pos, so a later rebuild (e.g. a diameter edit that changes segment
// length) can reproject the two independently and pull them apart — visually
// splitting what looked like one joint into a tiny rogue strut.
const DUPLICATE_KNOT_MM = 0.01;
const CLOSE_KNOT_MM = 0.5;

function dist(a: Vec3, b: Vec3): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function isFiniteVec3(v: Vec3 | undefined | null): v is Vec3 {
    return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

export function shortId(id: string): string {
    return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

export function fmtV3(v: Vec3 | undefined): string {
    if (!v) return '—';
    return `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
}

export interface ShaftOwner {
    type: 'trunk' | 'branch' | 'twig' | 'stick' | 'anchor';
    id: string;
    sourceLabel?: string;
}

/** Finds the entity (trunk/branch/twig/stick/anchor) whose segment list
 * contains `segmentId` — used to attribute a knot problem back to a labeled
 * support, since Knot itself carries no import source label. */
export function findShaftOwner(segmentId: string, state: SupportState): ShaftOwner | null {
    for (const trunk of Object.values(state.trunks)) {
        if (trunk.segments.some((s) => s.id === segmentId)) {
            return { type: 'trunk', id: trunk.id, sourceLabel: trunk.importSourceLabel };
        }
    }
    for (const branch of Object.values(state.branches)) {
        if (branch.segments.some((s) => s.id === segmentId)) {
            return { type: 'branch', id: branch.id, sourceLabel: branch.importSourceLabel };
        }
    }
    for (const twig of Object.values(state.twigs)) {
        if (twig.segments.some((s) => s.id === segmentId)) {
            return { type: 'twig', id: twig.id, sourceLabel: twig.importSourceLabel };
        }
    }
    for (const stick of Object.values(state.sticks)) {
        if (stick.segments.some((s) => s.id === segmentId)) {
            return { type: 'stick', id: stick.id, sourceLabel: stick.importSourceLabel };
        }
    }
    for (const anchor of Object.values(state.anchors)) {
        if (anchor.segments.some((s) => s.id === segmentId)) {
            return { type: 'anchor', id: anchor.id, sourceLabel: anchor.importSourceLabel };
        }
    }
    return null;
}

function ownerTag(owner: ShaftOwner | null): string {
    if (!owner) return 'owner=?';
    return `owner=${owner.type} ${shortId(owner.id)}${owner.sourceLabel ? `  src:${owner.sourceLabel}` : ''}`;
}

export function scanForSupportProblems(state: SupportState): SupportProblem[] {
    const problems: SupportProblem[] = [];
    const push = (p: SupportProblem) => problems.push(p);

    const trunkSegIds = new Set<string>();
    for (const trunk of Object.values(state.trunks)) {
        for (const seg of trunk.segments) trunkSegIds.add(seg.id);
    }
    const branchSegIds = new Set<string>();
    for (const branch of Object.values(state.branches)) {
        for (const seg of branch.segments) branchSegIds.add(seg.id);
    }
    const twigSegIds = new Set<string>();
    for (const twig of Object.values(state.twigs)) {
        for (const seg of twig.segments) twigSegIds.add(seg.id);
    }
    const stickSegIds = new Set<string>();
    for (const stick of Object.values(state.sticks)) {
        for (const seg of stick.segments) stickSegIds.add(seg.id);
    }
    const anchorSegIds = new Set<string>();
    for (const anchor of Object.values(state.anchors)) {
        for (const seg of anchor.segments) anchorSegIds.add(seg.id);
    }

    // --- Knots: non-finite positions, orphaned host segment ---
    for (const knot of Object.values(state.knots)) {
        const owner = findShaftOwner(knot.parentShaftId, state);
        const knotPosFinite = isFiniteVec3(knot.pos);
        if (!knotPosFinite) {
            push({
                severity: 'error', category: 'invalid-position', entityType: 'knot', entityId: knot.id,
                sourceLabel: owner?.sourceLabel,
                message: 'knot has a non-finite position',
                detail: `pos=(${knot.pos && knot.pos.x}, ${knot.pos && knot.pos.y}, ${knot.pos && knot.pos.z})  ${ownerTag(owner)}`,
            });
            continue;
        }
        const psid = knot.parentShaftId;
        const known = psid.startsWith('leafCone:') || psid.startsWith('braceSegment:')
            || trunkSegIds.has(psid) || branchSegIds.has(psid) || twigSegIds.has(psid)
            || stickSegIds.has(psid) || anchorSegIds.has(psid);
        if (!known) {
            push({
                severity: 'error', category: 'orphaned-knot', entityType: 'knot', entityId: knot.id,
                pos: knot.pos,
                message: "knot's host segment was not found (orphaned)",
                detail: `parentShaftId=${shortId(psid)}`,
            });
        }
    }

    // --- Knots: near-duplicate / unmerged knots sharing a shaft ---
    const knotsByShaft = new Map<string, Knot[]>();
    for (const knot of Object.values(state.knots)) {
        const psid = knot.parentShaftId;
        if (psid.startsWith('leafCone:') || psid.startsWith('braceSegment:')) continue;
        if (!isFiniteVec3(knot.pos)) continue;
        const bucket = knotsByShaft.get(psid);
        if (bucket) bucket.push(knot); else knotsByShaft.set(psid, [knot]);
    }
    for (const [shaftId, knotsOnShaft] of knotsByShaft) {
        const owner = findShaftOwner(shaftId, state);
        for (let i = 0; i < knotsOnShaft.length; i++) {
            for (let j = i + 1; j < knotsOnShaft.length; j++) {
                const a = knotsOnShaft[i];
                const b = knotsOnShaft[j];
                const d = dist(a.pos, b.pos);
                if (d < DUPLICATE_KNOT_MM) {
                    push({
                        severity: 'error', category: 'duplicate-knot', entityType: 'knot', entityId: a.id,
                        sourceLabel: owner?.sourceLabel,
                        pos: a.pos,
                        message: 'near-exact duplicate of another knot on the same shaft — should likely be ONE shared knot (divergence risk on rebuild)',
                        detail: `at=${fmtV3(a.pos)}  dup=${shortId(b.id)} at ${fmtV3(b.pos)}  Δ=${d.toFixed(4)}mm  ${ownerTag(owner)}`,
                    });
                } else if (d < CLOSE_KNOT_MM) {
                    push({
                        severity: 'warning', category: 'close-knots', entityType: 'knot', entityId: a.id,
                        sourceLabel: owner?.sourceLabel,
                        pos: a.pos,
                        message: 'sits very close to another knot on the same shaft',
                        detail: `at=${fmtV3(a.pos)}  other=${shortId(b.id)} at ${fmtV3(b.pos)}  Δ=${d.toFixed(3)}mm  ${ownerTag(owner)}`,
                    });
                }
            }
        }
    }

    // --- Trunks ---
    for (const trunk of Object.values(state.trunks)) {
        const trunkPos = trunk.segments[0]?.bottomJoint?.pos ?? trunk.segments[0]?.topJoint?.pos;
        if (!state.roots[trunk.rootId]) {
            push({
                severity: 'error', category: 'missing-root', entityType: 'trunk', entityId: trunk.id,
                sourceLabel: trunk.importSourceLabel,
                pos: trunkPos,
                message: "trunk references a root that doesn't exist",
                detail: `rootId=${shortId(trunk.rootId)}`,
            });
        }
        if (trunk.segments.length === 0) {
            push({
                severity: 'warning', category: 'empty-segments', entityType: 'trunk', entityId: trunk.id,
                sourceLabel: trunk.importSourceLabel, message: 'trunk has no segments',
            });
        }
        for (const seg of trunk.segments) {
            if (!(seg.diameter > 0) || !Number.isFinite(seg.diameter)) {
                push({
                    severity: 'error', category: 'invalid-diameter', entityType: 'trunk', entityId: trunk.id,
                    sourceLabel: trunk.importSourceLabel,
                    pos: seg.bottomJoint?.pos ?? seg.topJoint?.pos,
                    message: 'trunk segment has an invalid diameter',
                    detail: `⌀${seg.diameter}`,
                });
            }
        }
    }

    // --- Branches: missing parent knot, self-referencing fork-junction cycle ---
    for (const branch of Object.values(state.branches)) {
        const branchOwnSegIds = new Set(branch.segments.map((s) => s.id));
        const parentKnot = state.knots[branch.parentKnotId];
        const branchPos = parentKnot?.pos ?? branch.segments[0]?.bottomJoint?.pos;
        if (!parentKnot) {
            push({
                severity: 'error', category: 'missing-parent-knot', entityType: 'branch', entityId: branch.id,
                sourceLabel: branch.importSourceLabel,
                pos: branchPos,
                message: "branch's parent knot doesn't exist",
                detail: `parentKnotId=${shortId(branch.parentKnotId)}`,
            });
        } else if (branchOwnSegIds.has(parentKnot.parentShaftId)) {
            push({
                severity: 'error', category: 'self-referencing-branch', entityType: 'branch', entityId: branch.id,
                sourceLabel: branch.importSourceLabel,
                pos: branchPos,
                message: "branch's parent knot is hosted on the branch's OWN segment — self-reference cycle",
                detail: `parentKnotId=${shortId(branch.parentKnotId)}`,
            });
        }
        if (branch.segments.length === 0) {
            push({
                severity: 'warning', category: 'empty-segments', entityType: 'branch', entityId: branch.id,
                sourceLabel: branch.importSourceLabel, pos: branchPos, message: 'branch has no segments',
            });
        }
    }

    // --- Leaves: missing parent knot ---
    for (const leaf of Object.values(state.leaves)) {
        if (!state.knots[leaf.parentKnotId]) {
            push({
                severity: 'error', category: 'missing-parent-knot', entityType: 'leaf', entityId: leaf.id,
                sourceLabel: leaf.importSourceLabel,
                pos: leaf.contactCone?.pos,
                message: "leaf's parent knot doesn't exist",
                detail: `parentKnotId=${shortId(leaf.parentKnotId)}`,
            });
        }
    }

    // --- Braces: missing knots, degenerate / suspiciously short, invalid diameter ---
    for (const brace of Object.values(state.braces)) {
        const sk = state.knots[brace.startKnotId];
        const ek = state.knots[brace.endKnotId];
        const braceOwner = brace.importSourceLabel
            ? undefined
            : (findShaftOwner(sk?.parentShaftId ?? '', state) ?? findShaftOwner(ek?.parentShaftId ?? '', state));
        const braceSourceLabel = brace.importSourceLabel ?? braceOwner?.sourceLabel;
        const bracePos = sk?.pos ?? ek?.pos;
        if (!sk || !ek) {
            push({
                severity: 'error', category: 'missing-knot', entityType: 'brace', entityId: brace.id,
                sourceLabel: braceSourceLabel,
                pos: bracePos,
                message: 'brace references a missing knot',
                detail: `start=${sk ? `ok ${fmtV3(sk.pos)}` : 'MISSING'}  end=${ek ? `ok ${fmtV3(ek.pos)}` : 'MISSING'}${braceOwner ? `  ${ownerTag(braceOwner)}` : ''}`,
            });
        } else if (isFiniteVec3(sk.pos) && isFiniteVec3(ek.pos)) {
            const len = dist(sk.pos, ek.pos);
            if (len < BRACE_INVISIBLE_MM) {
                push({
                    severity: 'error', category: 'degenerate-brace', entityType: 'brace', entityId: brace.id,
                    sourceLabel: braceSourceLabel,
                    pos: bracePos,
                    message: `brace is invisible — endpoints coincide (renderer silently skips below ${BRACE_INVISIBLE_MM}mm)`,
                    detail: `start=${fmtV3(sk.pos)}  end=${fmtV3(ek.pos)}  length=${len.toFixed(5)}mm${braceOwner ? `  ${ownerTag(braceOwner)}` : ''}`,
                });
            } else if (len < BRACE_SUSPICIOUS_MM) {
                push({
                    severity: 'warning', category: 'short-brace', entityType: 'brace', entityId: brace.id,
                    sourceLabel: braceSourceLabel,
                    pos: bracePos,
                    message: 'brace is suspiciously short',
                    detail: `start=${fmtV3(sk.pos)}  end=${fmtV3(ek.pos)}  length=${len.toFixed(3)}mm${braceOwner ? `  ${ownerTag(braceOwner)}` : ''}`,
                });
            }
        }
        if (!(brace.profile.diameter > 0) || !Number.isFinite(brace.profile.diameter)) {
            push({
                severity: 'error', category: 'invalid-diameter', entityType: 'brace', entityId: brace.id,
                sourceLabel: braceSourceLabel,
                pos: bracePos,
                message: 'brace has an invalid diameter',
                detail: `⌀${brace.profile.diameter}`,
            });
        }
    }

    // --- Roots ---
    for (const root of Object.values(state.roots)) {
        if (!(root.diameter > 0) || !Number.isFinite(root.diameter)) {
            push({
                severity: 'error', category: 'invalid-diameter', entityType: 'root', entityId: root.id,
                sourceLabel: root.importSourceLabel,
                pos: isFiniteVec3(root.transform?.pos) ? root.transform.pos : undefined,
                message: 'root has an invalid diameter',
                detail: `⌀${root.diameter}`,
            });
        }
        if (!isFiniteVec3(root.transform?.pos)) {
            push({
                severity: 'error', category: 'invalid-position', entityType: 'root', entityId: root.id,
                sourceLabel: root.importSourceLabel, message: 'root has a non-finite position',
            });
        }
    }

    const severityRank: Record<SupportProblemSeverity, number> = { error: 0, warning: 1 };
    problems.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.entityType.localeCompare(b.entityType));
    return problems;
}

export function buildSupportProblemScanPlainText(problems: SupportProblem[], scannedAtMs: number | null): string {
    const lines: string[] = ['SUPPORT PROBLEM SCAN', '='.repeat(44)];
    lines.push(`scanned: ${scannedAtMs ? new Date(scannedAtMs).toISOString() : '—'}`);
    if (problems.length === 0) {
        lines.push('No problems found.');
        return lines.join('\n');
    }
    const errors = problems.filter((p) => p.severity === 'error');
    const warnings = problems.filter((p) => p.severity === 'warning');
    lines.push(`${errors.length} error${errors.length !== 1 ? 's' : ''}, ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`);
    lines.push('');
    for (const p of problems) {
        lines.push(`[${p.severity.toUpperCase()}] ${p.category} — ${p.entityType} ${shortId(p.entityId)}${p.sourceLabel ? `  src:${p.sourceLabel}` : ''}`);
        if (p.pos) lines.push(`  at ${fmtV3(p.pos)}`);
        lines.push(`  ${p.message}`);
        if (p.detail) lines.push(`  ${p.detail}`);
    }
    return lines.join('\n');
}
