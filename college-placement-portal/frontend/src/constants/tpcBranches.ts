// Matches job form Eligible Branches (JobsManagement)
export const TPC_ELIGIBLE_BRANCHES = ['CSE', 'ECE', 'MDS', 'EE', 'Mech', 'Civil', 'MME', 'Chem'] as const;
export type TpcBranch = (typeof TPC_ELIGIBLE_BRANCHES)[number];