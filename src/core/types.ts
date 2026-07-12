export type Sex = "M" | "F";
export type PalId = string;

export interface PalSkillRef {
  id: string;
  level: number;
}

export interface ActiveSkillRecord {
  id: string;
  names: Readonly<{ zh: string; en: string }>;
  description?: Readonly<{ zh?: string; en?: string }>;
  element: string;
  power: number;
  cooldownSeconds: number;
  canInherit: boolean;
  hasSkillFruit: boolean;
}

export interface PartnerSkillRecord {
  id: string;
  name: string;
  description: string;
}

export interface PalRecord {
  id: PalId;
  dexNo: number;
  variant: boolean;
  names: Readonly<{ zh: string; en: string }>;
  elements: readonly string[];
  maleProbability: number;
  breedingPower: number;
  internalIndex: number;
  stats: Readonly<Record<string, number>>;
  workSuitability: Readonly<Record<string, number>>;
  activeSkills: readonly string[];
  activeSkillRefs?: readonly PalSkillRef[];
  partnerSkill?: string;
  partnerSkillId?: string;
  icon: string;
  /** False for internal/disabled records that rules may reference but selectors must hide. */
  selectable?: boolean;
}

export interface SexPair {
  a: Sex;
  b: Sex;
}

export interface BreedRule {
  id: number;
  parentA: PalId;
  parentB: PalId;
  child: PalId;
  /** An empty list means the usual M+F / F+M combinations. */
  allowedSexPairs: readonly SexPair[];
}

export interface OwnedEntry {
  palId: PalId;
  male: boolean;
  female: boolean;
}

export interface PairSexFilter {
  a?: Sex;
  b?: Sex;
}

export interface BreedMatch {
  ruleId: number;
  parentA: PalId;
  parentASex: Sex;
  parentB: PalId;
  parentBSex: Sex;
  child: PalId;
}

export interface MateMatch {
  ruleId: number;
  parent: PalId;
  parentSex: Sex;
  mate: PalId;
  mateSex: Sex;
  child: PalId;
}

export type ParentPairMatch = BreedMatch;

export type ParentOrigin = "owned" | "bred" | "recommended";

export interface BreedParent {
  palId: PalId;
  sex: Sex;
  origin: ParentOrigin;
}

export interface BreedChild {
  palId: PalId;
  /** Omitted for the final target, whose sex does not matter. */
  requiredSex?: Sex;
}

export interface BreedStep {
  ruleId: number;
  generation: number;
  parentA: BreedParent;
  parentB: BreedParent;
  child: BreedChild;
}

export interface BreedPlan {
  generations: number;
  steps: BreedStep[];
  warnings: string[];
}

export type ChainStart =
  | PalId
  | OwnedEntry
  | { palId: PalId; sex: Sex };

export interface BreedingIndex {
  readonly pals: ReadonlyMap<PalId, PalRecord>;
  readonly rules: readonly BreedRule[];
  /** Internal lookup tables; exposed read-only for diagnostics and data tests. */
  readonly rulesByPair: ReadonlyMap<string, readonly BreedRule[]>;
  readonly rulesByChild: ReadonlyMap<PalId, readonly BreedRule[]>;
  readonly edgesByParent: ReadonlyMap<PalId, readonly OrientedBreedEdge[]>;
}

export interface OrientedBreedEdge {
  ruleId: number;
  parent: PalId;
  parentSex: Sex;
  mate: PalId;
  mateSex: Sex;
  child: PalId;
}
