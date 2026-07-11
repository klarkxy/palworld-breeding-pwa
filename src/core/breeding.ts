import type {
  BreedMatch,
  BreedPlan,
  BreedRule,
  BreedStep,
  BreedingIndex,
  ChainStart,
  MateMatch,
  OrientedBreedEdge,
  OwnedEntry,
  PairSexFilter,
  PalId,
  PalRecord,
  ParentPairMatch,
  Sex,
  SexPair,
} from "./types";

const DEFAULT_MAX_DEPTH = 5;
const MAX_DEPTH = 8;
const RESULT_LIMIT = 20;
const DEFAULT_SEX_PAIRS: readonly SexPair[] = [
  { a: "M", b: "F" },
  { a: "F", b: "M" },
];

interface PalState {
  palId: PalId;
  sex: Sex;
}

interface ChainTransition {
  from: PalState;
  mate: PalState;
  child: PalState;
  ruleId: number;
}

interface Production {
  ruleId: number;
  parentA: PalState;
  parentB: PalState;
  child: PalState;
}

interface InternalPlan {
  generations: number;
  steps: BreedStep[];
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareSex(a: Sex, b: Sex): number {
  return a === b ? 0 : a === "M" ? -1 : 1;
}

function pairKey(a: PalId, b: PalId): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

function stateKey(state: PalState): string {
  return `${state.sex}\0${state.palId}`;
}

function normalizeDepth(maxDepth: number): number {
  if (!Number.isFinite(maxDepth)) return DEFAULT_MAX_DEPTH;
  return Math.max(0, Math.min(MAX_DEPTH, Math.floor(maxDepth)));
}

function normalizeSexPairs(rule: BreedRule): SexPair[] {
  const input = rule.allowedSexPairs.length
    ? rule.allowedSexPairs
    : DEFAULT_SEX_PAIRS;
  const seen = new Set<string>();
  const pairs = input.filter(({ a, b }) => {
    if (a === b) return false;
    const key = `${a}${b}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!pairs.length) {
    throw new Error(`Breed rule ${rule.id} has no valid opposite-sex pair`);
  }
  return pairs.map(({ a, b }) => ({ a, b }));
}

function comparePal(index: BreedingIndex, a: PalId, b: PalId): number {
  const aIndex = index.pals.get(a)?.internalIndex ?? Number.MAX_SAFE_INTEGER;
  const bIndex = index.pals.get(b)?.internalIndex ?? Number.MAX_SAFE_INTEGER;
  return aIndex - bIndex || compareText(a, b);
}

function compareRule(a: BreedRule, b: BreedRule): number {
  return (
    a.id - b.id ||
    compareText(a.parentA, b.parentA) ||
    compareText(a.parentB, b.parentB) ||
    compareText(a.child, b.child)
  );
}

function compareEdge(index: BreedingIndex, a: OrientedBreedEdge, b: OrientedBreedEdge): number {
  return (
    comparePal(index, a.child, b.child) ||
    comparePal(index, a.mate, b.mate) ||
    a.ruleId - b.ruleId ||
    compareSex(a.parentSex, b.parentSex) ||
    compareSex(a.mateSex, b.mateSex)
  );
}

function orientedPairs(rule: BreedRule, parentA: PalId, parentB: PalId): SexPair[] {
  const result: SexPair[] = [];
  const seen = new Set<string>();
  const add = (a: Sex, b: Sex) => {
    const key = `${a}${b}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ a, b });
    }
  };

  if (rule.parentA === parentA && rule.parentB === parentB) {
    for (const pair of rule.allowedSexPairs) add(pair.a, pair.b);
  }
  if (rule.parentA === parentB && rule.parentB === parentA) {
    for (const pair of rule.allowedSexPairs) add(pair.b, pair.a);
  }
  return result;
}

export function getPossibleSexes(pal: PalRecord): Sex[] {
  const probability = pal.maleProbability;
  if (!Number.isFinite(probability)) return ["M", "F"];
  // Sources normally use 0..1. Also accept percentages while preserving the
  // game's -0.01/1.01 sentinels for single-sex internal records.
  const normalized = probability > 1.01 ? probability / 100 : probability;
  const result: Sex[] = [];
  if (normalized > 0) result.push("M");
  if (normalized < 1) result.push("F");
  return result.length ? result : ["M", "F"];
}

function ownedStateKeys(index: BreedingIndex, owned: readonly OwnedEntry[]): Set<string> {
  const result = new Set<string>();
  for (const entry of owned) {
    const pal = index.pals.get(entry.palId);
    if (!pal) continue;
    const possible = new Set(getPossibleSexes(pal));
    if (entry.male && possible.has("M")) result.add(stateKey({ palId: entry.palId, sex: "M" }));
    if (entry.female && possible.has("F")) result.add(stateKey({ palId: entry.palId, sex: "F" }));
  }
  return result;
}

function stepKey(step: BreedStep, ignoreFinalSex = false): string {
  return [
    String(step.ruleId).padStart(10, "0"),
    stateKey(step.parentA),
    stateKey(step.parentB),
    step.child.palId,
    ignoreFinalSex ? "" : step.child.requiredSex ?? "",
  ].join("|");
}

function planKey(plan: BreedPlan): string {
  return plan.steps.map((step, index) => stepKey(step, index === plan.steps.length - 1)).join(">");
}

function comparePlan(a: BreedPlan, b: BreedPlan): number {
  return (
    a.generations - b.generations ||
    a.steps.length - b.steps.length ||
    compareText(planKey(a), planKey(b))
  );
}

function uniquePlans(plans: BreedPlan[], limit = RESULT_LIMIT): BreedPlan[] {
  const result: BreedPlan[] = [];
  const seen = new Set<string>();
  for (const plan of plans.sort(comparePlan)) {
    const key = planKey(plan);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(plan);
    if (result.length === limit) break;
  }
  return result;
}

function warningsForSteps(steps: readonly BreedStep[]): string[] {
  return steps.slice(0, -1).map((step) => {
    const sex = step.child.requiredSex === "M" ? "雄性" : "雌性";
    return `中间帕鲁 ${step.child.palId} 需要孵出${sex}`;
  });
}

export function buildBreedingIndex(
  pals: readonly PalRecord[],
  rules: readonly BreedRule[],
): BreedingIndex {
  const palMap = new Map<PalId, PalRecord>();
  for (const pal of pals) {
    if (palMap.has(pal.id)) throw new Error(`Duplicate Pal id: ${pal.id}`);
    palMap.set(pal.id, pal);
  }

  const ruleIds = new Set<number>();
  const normalizedRules = rules.map((rule) => {
    if (ruleIds.has(rule.id)) throw new Error(`Duplicate breed rule id: ${rule.id}`);
    ruleIds.add(rule.id);
    for (const id of [rule.parentA, rule.parentB, rule.child]) {
      if (!palMap.has(id)) throw new Error(`Breed rule ${rule.id} references unknown Pal: ${id}`);
    }
    return { ...rule, allowedSexPairs: normalizeSexPairs(rule) };
  }).sort(compareRule);

  const rulesByPair = new Map<string, BreedRule[]>();
  const rulesByChild = new Map<PalId, BreedRule[]>();
  const edgesByParent = new Map<PalId, OrientedBreedEdge[]>();
  const edgeKeysByParent = new Map<PalId, Set<string>>();

  const addEdge = (edge: OrientedBreedEdge) => {
    const edges = edgesByParent.get(edge.parent) ?? [];
    const keys = edgeKeysByParent.get(edge.parent) ?? new Set<string>();
    const key = `${edge.ruleId}|${edge.parentSex}|${edge.mate}|${edge.mateSex}|${edge.child}`;
    if (!keys.has(key)) {
      keys.add(key);
      edges.push(edge);
    }
    edgesByParent.set(edge.parent, edges);
    edgeKeysByParent.set(edge.parent, keys);
  };

  for (const rule of normalizedRules) {
    const pairRules = rulesByPair.get(pairKey(rule.parentA, rule.parentB)) ?? [];
    pairRules.push(rule);
    rulesByPair.set(pairKey(rule.parentA, rule.parentB), pairRules);

    const childRules = rulesByChild.get(rule.child) ?? [];
    childRules.push(rule);
    rulesByChild.set(rule.child, childRules);

    for (const pair of rule.allowedSexPairs) {
      addEdge({
        ruleId: rule.id,
        parent: rule.parentA,
        parentSex: pair.a,
        mate: rule.parentB,
        mateSex: pair.b,
        child: rule.child,
      });
      addEdge({
        ruleId: rule.id,
        parent: rule.parentB,
        parentSex: pair.b,
        mate: rule.parentA,
        mateSex: pair.a,
        child: rule.child,
      });
    }
  }

  const partialIndex = {
    pals: palMap,
    rules: normalizedRules,
    rulesByPair,
    rulesByChild,
    edgesByParent,
  } satisfies BreedingIndex;
  for (const edges of edgesByParent.values()) edges.sort((a, b) => compareEdge(partialIndex, a, b));
  return partialIndex;
}

export function getChildren(
  index: BreedingIndex,
  parentA: PalId,
  parentB: PalId,
  sexes: PairSexFilter = {},
): BreedMatch[] {
  const matches: BreedMatch[] = [];
  for (const rule of index.rulesByPair.get(pairKey(parentA, parentB)) ?? []) {
    for (const pair of orientedPairs(rule, parentA, parentB)) {
      if (sexes.a && sexes.a !== pair.a) continue;
      if (sexes.b && sexes.b !== pair.b) continue;
      matches.push({
        ruleId: rule.id,
        parentA,
        parentASex: pair.a,
        parentB,
        parentBSex: pair.b,
        child: rule.child,
      });
    }
  }
  return matches.sort((a, b) =>
    comparePal(index, a.child, b.child) ||
    a.ruleId - b.ruleId ||
    compareSex(a.parentASex, b.parentASex) ||
    compareSex(a.parentBSex, b.parentBSex)
  );
}

export function findMates(
  index: BreedingIndex,
  parent: PalId,
  target: PalId,
  parentSex?: Sex,
): MateMatch[] {
  return (index.edgesByParent.get(parent) ?? [])
    .filter((edge) => edge.child === target && (!parentSex || edge.parentSex === parentSex))
    .map((edge) => ({
      ruleId: edge.ruleId,
      parent,
      parentSex: edge.parentSex,
      mate: edge.mate,
      mateSex: edge.mateSex,
      child: edge.child,
    }))
    .sort((a, b) =>
      comparePal(index, a.mate, b.mate) ||
      a.ruleId - b.ruleId ||
      compareSex(a.parentSex, b.parentSex) ||
      compareSex(a.mateSex, b.mateSex)
    );
}

export function getParentPairs(
  index: BreedingIndex,
  target: PalId,
  owned?: readonly OwnedEntry[],
): ParentPairMatch[] {
  const available = owned ? ownedStateKeys(index, owned) : undefined;
  const result: ParentPairMatch[] = [];
  for (const rule of index.rulesByChild.get(target) ?? []) {
    for (const pair of rule.allowedSexPairs) {
      if (available && (
        !available.has(stateKey({ palId: rule.parentA, sex: pair.a })) ||
        !available.has(stateKey({ palId: rule.parentB, sex: pair.b }))
      )) continue;
      result.push({
        ruleId: rule.id,
        parentA: rule.parentA,
        parentASex: pair.a,
        parentB: rule.parentB,
        parentBSex: pair.b,
        child: target,
      });
    }
  }
  return result.sort((a, b) =>
    comparePal(index, a.parentA, b.parentA) ||
    comparePal(index, a.parentB, b.parentB) ||
    a.ruleId - b.ruleId ||
    compareSex(a.parentASex, b.parentASex) ||
    compareSex(a.parentBSex, b.parentBSex)
  );
}

function startStates(index: BreedingIndex, start: ChainStart): PalState[] {
  if (typeof start === "string") {
    const pal = index.pals.get(start);
    return pal ? getPossibleSexes(pal).map((sex) => ({ palId: start, sex })) : [];
  }
  if ("sex" in start) {
    const pal = index.pals.get(start.palId);
    return pal && getPossibleSexes(pal).includes(start.sex)
      ? [{ palId: start.palId, sex: start.sex }]
      : [];
  }
  const pal = index.pals.get(start.palId);
  if (!pal) return [];
  const possible = new Set(getPossibleSexes(pal));
  const result: PalState[] = [];
  if (start.male && possible.has("M")) result.push({ palId: start.palId, sex: "M" });
  if (start.female && possible.has("F")) result.push({ palId: start.palId, sex: "F" });
  return result;
}

function compareTransition(index: BreedingIndex, a: ChainTransition, b: ChainTransition): number {
  return (
    comparePal(index, a.mate.palId, b.mate.palId) ||
    comparePal(index, a.child.palId, b.child.palId) ||
    a.ruleId - b.ruleId ||
    compareSex(a.from.sex, b.from.sex) ||
    compareSex(a.mate.sex, b.mate.sex) ||
    compareSex(a.child.sex, b.child.sex)
  );
}

export function findChains(
  index: BreedingIndex,
  start: ChainStart,
  target: PalId,
  maxDepth = DEFAULT_MAX_DEPTH,
): BreedPlan[] {
  if (!index.pals.has(target)) return [];
  const initial = startStates(index, start);
  if (!initial.length) return [];
  if (initial.some((state) => state.palId === target)) {
    return [{ generations: 0, steps: [], warnings: [] }];
  }

  const depthLimit = normalizeDepth(maxDepth);
  const distances = new Map<string, number>();
  const states = new Map<string, PalState>();
  const predecessors = new Map<string, ChainTransition[]>();
  const queue: PalState[] = [];
  for (const state of initial) {
    const key = stateKey(state);
    distances.set(key, 0);
    states.set(key, state);
    queue.push(state);
  }

  let targetDepth = Number.POSITIVE_INFINITY;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    const currentDepth = distances.get(stateKey(current))!;
    if (currentDepth >= depthLimit || currentDepth >= targetDepth) continue;

    for (const edge of index.edgesByParent.get(current.palId) ?? []) {
      if (edge.parentSex !== current.sex) continue;
      const childPal = index.pals.get(edge.child)!;
      for (const childSex of getPossibleSexes(childPal)) {
        const child = { palId: edge.child, sex: childSex } satisfies PalState;
        const key = stateKey(child);
        const nextDepth = currentDepth + 1;
        const transition = {
          from: current,
          mate: { palId: edge.mate, sex: edge.mateSex },
          child,
          ruleId: edge.ruleId,
        } satisfies ChainTransition;
        const knownDepth = distances.get(key);
        if (knownDepth === undefined) {
          distances.set(key, nextDepth);
          states.set(key, child);
          predecessors.set(key, [transition]);
          queue.push(child);
        } else if (knownDepth === nextDepth) {
          predecessors.get(key)!.push(transition);
        }
        if (edge.child === target) targetDepth = Math.min(targetDepth, nextDepth);
      }
    }
  }

  if (!Number.isFinite(targetDepth)) return [];
  for (const incoming of predecessors.values()) incoming.sort((a, b) => compareTransition(index, a, b));

  const initialKeys = new Set(initial.map(stateKey));
  const memo = new Map<string, ChainTransition[][]>();
  const pathKey = (path: readonly ChainTransition[]) => path.map((transition) => [
    String(transition.ruleId).padStart(10, "0"),
    stateKey(transition.from),
    stateKey(transition.mate),
    stateKey(transition.child),
  ].join("|")).join(">");
  const pathsTo = (key: string): ChainTransition[][] => {
    if (initialKeys.has(key)) return [[]];
    const cached = memo.get(key);
    if (cached) return cached;
    const result: ChainTransition[][] = [];
    for (const transition of predecessors.get(key) ?? []) {
      for (const prefix of pathsTo(stateKey(transition.from))) {
        result.push([...prefix, transition]);
      }
      result.sort((a, b) => compareText(pathKey(a), pathKey(b)));
      result.splice(RESULT_LIMIT);
    }
    memo.set(key, result);
    return result;
  };

  const plans: BreedPlan[] = [];
  const targetStates = [...states.entries()]
    .filter(([key, state]) => state.palId === target && distances.get(key) === targetDepth)
    .sort(([, a], [, b]) => compareSex(a.sex, b.sex));
  for (const [key] of targetStates) {
    for (const transitions of pathsTo(key)) {
      const steps = transitions.map((transition, index) => ({
        ruleId: transition.ruleId,
        generation: index + 1,
        parentA: {
          ...transition.from,
          origin: index === 0 ? "owned" as const : "bred" as const,
        },
        parentB: { ...transition.mate, origin: "recommended" as const },
        child: {
          palId: transition.child.palId,
          requiredSex: index === transitions.length - 1 ? undefined : transition.child.sex,
        },
      }));
      plans.push({ generations: transitions.length, steps, warnings: warningsForSteps(steps) });
    }
  }
  return uniquePlans(plans);
}

function compareProduction(index: BreedingIndex, a: Production, b: Production): number {
  return (
    comparePal(index, a.parentA.palId, b.parentA.palId) ||
    comparePal(index, a.parentB.palId, b.parentB.palId) ||
    a.ruleId - b.ruleId ||
    compareSex(a.parentA.sex, b.parentA.sex) ||
    compareSex(a.parentB.sex, b.parentB.sex) ||
    compareSex(a.child.sex, b.child.sex)
  );
}

function mergeSteps(...groups: readonly BreedStep[][]): BreedStep[] {
  const result: BreedStep[] = [];
  const seen = new Set<string>();
  for (const step of groups.flat()) {
    const key = stepKey(step);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(step);
    }
  }
  return result.sort((a, b) => a.generation - b.generation || compareText(stepKey(a), stepKey(b)));
}

export function planFromOwned(
  index: BreedingIndex,
  owned: readonly OwnedEntry[],
  target: PalId,
  maxDepth = DEFAULT_MAX_DEPTH,
): BreedPlan[] {
  if (!index.pals.has(target)) return [];
  const depthLimit = normalizeDepth(maxDepth);
  const ownedKeys = new Set(
    ownedStateKeys(index, owned),
  );
  if (!ownedKeys.size) return [];
  if ([...ownedKeys].some((key) => key.slice(2) === target)) {
    return [{ generations: 0, steps: [], warnings: [] }];
  }

  const depths = new Map<string, number>();
  for (const key of ownedKeys) depths.set(key, 0);

  const statesByDepth = Array.from({ length: depthLimit + 1 }, () => [] as PalState[]);
  for (const key of ownedKeys) {
    statesByDepth[0]!.push({ palId: key.slice(2), sex: key[0] as Sex });
  }

  let targetDepth = Number.POSITIVE_INFINITY;
  for (let depth = 0; depth < depthLimit && depth < targetDepth; depth += 1) {
    for (const current of statesByDepth[depth]!) {
      if (depths.get(stateKey(current)) !== depth) continue;
      for (const edge of index.edgesByParent.get(current.palId) ?? []) {
        if (edge.parentSex !== current.sex) continue;
        const mateDepth = depths.get(stateKey({ palId: edge.mate, sex: edge.mateSex }));
        if (mateDepth === undefined) continue;
        const candidate = Math.max(depth, mateDepth) + 1;
        if (candidate > depthLimit) continue;
        for (const sex of getPossibleSexes(index.pals.get(edge.child)!)) {
          const child = { palId: edge.child, sex } satisfies PalState;
          const childKey = stateKey(child);
          const known = depths.get(childKey);
          if (known !== undefined && known <= candidate) continue;
          depths.set(childKey, candidate);
          statesByDepth[candidate]!.push(child);
          if (edge.child === target) targetDepth = candidate;
        }
      }
    }
  }

  targetDepth = Math.min(
    targetDepth,
    ...getPossibleSexes(index.pals.get(target)!)
      .map((sex) => depths.get(stateKey({ palId: target, sex })) ?? Number.POSITIVE_INFINITY),
  );
  if (!Number.isFinite(targetDepth)) return [];

  const productionMemo = new Map<string, Production[]>();
  const productionsFor = (key: string): Production[] => {
    const cached = productionMemo.get(key);
    if (cached) return cached;
    const child = { palId: key.slice(2), sex: key[0] as Sex } satisfies PalState;
    const entries: Production[] = [];
    if (getPossibleSexes(index.pals.get(child.palId)!).includes(child.sex)) {
      for (const rule of index.rulesByChild.get(child.palId) ?? []) {
        for (const pair of rule.allowedSexPairs) {
          const parentA = { palId: rule.parentA, sex: pair.a } satisfies PalState;
          const parentB = { palId: rule.parentB, sex: pair.b } satisfies PalState;
          if (depths.has(stateKey(parentA)) && depths.has(stateKey(parentB))) {
            entries.push({ ruleId: rule.id, parentA, parentB, child });
          }
        }
      }
    }
    entries.sort((a, b) => compareProduction(index, a, b));
    productionMemo.set(key, entries);
    return entries;
  };

  const memo = new Map<string, InternalPlan[]>();
  const internalPlanKey = (plan: InternalPlan) =>
    plan.steps.map((step) => stepKey(step)).join(">");
  const compareInternalPlan = (a: InternalPlan, b: InternalPlan) =>
    a.steps.length - b.steps.length ||
    a.generations - b.generations ||
    compareText(internalPlanKey(a), internalPlanKey(b));
  const plansFor = (key: string, budget: number): InternalPlan[] => {
    if (ownedKeys.has(key)) return [{ generations: 0, steps: [] }];
    if (budget < 1 || (depths.get(key) ?? Number.POSITIVE_INFINITY) > budget) return [];
    const memoKey = `${budget}\0${key}`;
    const cached = memo.get(memoKey);
    if (cached) return cached;
    const result: InternalPlan[] = [];
    const seen = new Set<string>();
    for (const production of productionsFor(key)) {
      const parentAKey = stateKey(production.parentA);
      const parentBKey = stateKey(production.parentB);
      if ((depths.get(parentAKey) ?? Number.POSITIVE_INFINITY) >= budget ||
          (depths.get(parentBKey) ?? Number.POSITIVE_INFINITY) >= budget) continue;
      for (const left of plansFor(parentAKey, budget - 1)) {
        for (const right of plansFor(parentBKey, budget - 1)) {
          const generation = Math.max(left.generations, right.generations) + 1;
          if (generation > budget) continue;
          const step: BreedStep = {
            ruleId: production.ruleId,
            generation,
            parentA: {
              ...production.parentA,
              origin: ownedKeys.has(stateKey(production.parentA)) ? "owned" : "bred",
            },
            parentB: {
              ...production.parentB,
              origin: ownedKeys.has(stateKey(production.parentB)) ? "owned" : "bred",
            },
            child: { palId: production.child.palId, requiredSex: production.child.sex },
          };
          const steps = mergeSteps(left.steps, right.steps, [step]);
          const signature = `${generation}|${steps.map((item) => stepKey(item)).join(">")}`;
          if (!seen.has(signature)) {
            seen.add(signature);
            result.push({ generations: generation, steps });
          }
        }
      }
      // ponytail: the public API returns 20 plans; keep the same K-best frontier
      // at each state. Raise RESULT_LIMIT if a larger result surface is added.
      result.sort(compareInternalPlan);
      result.splice(RESULT_LIMIT);
    }
    memo.set(memoKey, result);
    return result;
  };

  const plans: BreedPlan[] = [];
  for (const sex of getPossibleSexes(index.pals.get(target)!)) {
    const key = stateKey({ palId: target, sex });
    if (depths.get(key) !== targetDepth) continue;
    for (const internal of plansFor(key, targetDepth)) {
      if (internal.generations !== targetDepth) continue;
      const steps = internal.steps.map((step) => ({
        ...step,
        child: step.child.palId === target && step.generation === targetDepth
          ? { palId: step.child.palId }
          : step.child,
      }));
      plans.push({ generations: internal.generations, steps, warnings: warningsForSteps(steps) });
    }
  }
  return uniquePlans(plans);
}
