/**
 * Canonical branch labels for TPC (matches job form "Eligible Branches" in JobsManagement).
 */
export const TPC_ELIGIBLE_BRANCHES = ['CSE', 'ECE', 'MDS', 'EE', 'Mech', 'Civil', 'MME', 'Chem'] as const;
export type TpcBranchCode = (typeof TPC_ELIGIBLE_BRANCHES)[number];

const ORDER_INDEX: Record<string, number> = Object.fromEntries(
    TPC_ELIGIBLE_BRANCHES.map((b, i) => [b, i])
);

/** Lowercased label to canonical (includes legacy/seed values). */
const LOWER_ALIASES: Record<string, TpcBranchCode> = (() => {
    const m: Record<string, TpcBranchCode> = {};
    const add = (s: string, code: TpcBranchCode) => {
        m[s.trim().toLowerCase()] = code;
    };
    for (const code of TPC_ELIGIBLE_BRANCHES) {
        add(code, code);
    }
    const extras: [string, TpcBranchCode][] = [
        ['cs', 'CSE'],
        ['computer science', 'CSE'],
        ['it', 'CSE'],
        ['information technology', 'CSE'],
        ['eee', 'EE'],
        ['electrical', 'EE'],
        ['electrical engineering', 'EE'],
        ['mech', 'Mech'],
        ['me', 'Mech'],
        ['mechanical', 'Mech'],
        ['mechanical engineering', 'Mech'],
        ['mech engg', 'Mech'],
        ['civil engineering', 'Civil'],
        ['chemical', 'Chem'],
        ['chemical engineering', 'Chem'],
        ['electronics', 'ECE'],
        ['electronics and communication', 'ECE'],
        ['electronics & communication', 'ECE'],
        ['metallurgical', 'MME'],
        ['metallurgy', 'MME'],
        ['metallurgical engineering', 'MME'],
        ['materials and metallurgical', 'MME'],
        ['meta', 'MME'],
    ];
    for (const [k, v] of extras) add(k, v);
    return m;
})();

const FILTER_EQUALS_VARIANTS: Record<TpcBranchCode, string[]> = {
    CSE: ['CSE', 'CS', 'IT', 'Computer Science'],
    ECE: ['ECE', 'Electronics', 'Electronics and Communication', 'Electronics & Communication'],
    MDS: ['MDS'],
    EE: ['EE', 'EEE', 'Electrical', 'Electrical Engineering'],
    Mech: ['Mech', 'ME', 'MECH', 'Mechanical', 'Mechanical Engineering'],
    Civil: ['Civil', 'CIVIL', 'Civil Engineering'],
    MME: ['MME', 'META', 'Meta', 'Metallurgical', 'Metallurgy'],
    Chem: ['Chem', 'CHEM', 'Chemical', 'Chemical Engineering'],
};

export function isTpcBranchCode(s: string): s is TpcBranchCode {
    return (TPC_ELIGIBLE_BRANCHES as readonly string[]).includes(s);
}

export function normalizeTpcBranch(raw: string | null | undefined): string {
    const t = (raw || '').trim();
    if (!t) return 'Unknown';

    for (const code of TPC_ELIGIBLE_BRANCHES) {
        if (t === code) return code;
    }
    const low = t.toLowerCase();
    if (LOWER_ALIASES[low]) return LOWER_ALIASES[low]!;
    const u = t.toUpperCase();
    const shout: Record<string, TpcBranchCode> = {
        CSE: 'CSE',
        ECE: 'ECE',
        MDS: 'MDS',
        EE: 'EE',
        EEE: 'EE',
        IT: 'CSE',
        CS: 'CSE',
        MECH: 'Mech',
        ME: 'Mech',
        CIVIL: 'Civil',
        CHEM: 'Chem',
        MME: 'MME',
        META: 'MME',
    };
    if (shout[u]) return shout[u]!;

    return t;
}

export function compareTpcBranchNames(a: string, b: string): number {
    const ia = ORDER_INDEX[a];
    const ib = ORDER_INDEX[b];
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return a.localeCompare(b);
}

export function prismaBranchMatchesCanonical(
    canonical: TpcBranchCode
): { OR: { branch: { equals: string; mode: 'insensitive' } }[] } {
    const variants = FILTER_EQUALS_VARIANTS[canonical] ?? [canonical];
    return {
        OR: variants.map((equals) => ({ branch: { equals, mode: 'insensitive' as const } })),
    };
}