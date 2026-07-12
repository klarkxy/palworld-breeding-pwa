import { describe, expect, it } from "vitest";
import {
  buildBreedingIndex,
  findChains,
  findMates,
  getChildren,
  getParentPairs,
  planFromOwned,
  type BreedRule,
} from "../../src/core";
import { pal, pals, rules } from "./fixture";

const index = buildBreedingIndex(pals, rules);

describe("breeding queries", () => {
  it("expands ordinary sex pairs and keeps gender-specific results for the same parents", () => {
    expect(getChildren(index, "A", "A").map((match) => match.parentASex + match.parentBSex))
      .toEqual(["MF", "FM"]);

    expect(getChildren(index, "A", "B").map(({ child }) => child)).toEqual(["C", "D"]);
    expect(getChildren(index, "A", "B", { a: "M", b: "F" }).map(({ child }) => child))
      .toEqual(["C"]);
    expect(getChildren(index, "B", "A", { a: "F", b: "M" }).map(({ child }) => child))
      .toEqual(["C"]);
  });

  it("finds a fixed parent's mates and filters target pairs by exact owned genders", () => {
    expect(findMates(index, "A", "C", "M")).toEqual([{
      ruleId: 1,
      parent: "A",
      parentSex: "M",
      mate: "B",
      mateSex: "F",
      child: "C",
    }]);

    expect(getParentPairs(index, "C", [
      { palId: "A", male: true, female: false },
      { palId: "B", male: false, female: true },
    ])).toHaveLength(1);
    expect(getParentPairs(index, "C", [
      { palId: "A", male: false, female: true },
      { palId: "B", male: false, female: true },
    ])).toEqual([]);
  });
});

describe("shortest paths", () => {
  it("finds the shortest gender-aware chain while allowing an arbitrary mate at each step", () => {
    const plans = findChains(index, { palId: "A", sex: "M" }, "G", 5);
    expect(plans).toHaveLength(1);
    const plan = plans[0]!;
    expect(plan.generations).toBe(2);
    expect(plan.steps.map((step) => [step.parentA.palId, step.parentB.palId, step.child.palId]))
      .toEqual([["A", "B", "C"], ["C", "F", "G"]]);
    expect(plan.steps[0]!.child.requiredSex).toBe("F");
    expect(plan.steps[1]!.child.requiredSex).toBeUndefined();
    expect(plan.steps.every((step) => step.parentB.origin === "recommended")).toBe(true);
  });

  it("respects the starting gender, cycles and depth limit", () => {
    expect(findChains(index, { palId: "A", sex: "F" }, "G", 2)).toEqual([]);
    expect(findChains(index, { palId: "A", sex: "F" }, "G", 3)[0]!.generations).toBe(3);
    expect(findChains(index, "A", "A")).toEqual([{ generations: 0, steps: [], warnings: [] }]);
  });

  it("rejects a starting or owned gender that the species cannot produce", () => {
    const singleSexIndex = buildBreedingIndex(
      [pal("OnlyF", 0, -0.01), pal("MateM", 1, 1.01), pal("Child", 2)],
      [{
        id: 1,
        parentA: "OnlyF",
        parentB: "MateM",
        child: "Child",
        allowedSexPairs: [{ a: "F", b: "M" }],
      }],
    );

    expect(findChains(singleSexIndex, { palId: "OnlyF", sex: "M" }, "Child", 1)).toEqual([]);
    expect(planFromOwned(singleSexIndex, [
      { palId: "OnlyF", male: true, female: false },
      { palId: "MateM", male: true, female: false },
    ], "Child", 1)).toEqual([]);
  });

  it("returns at most 20 direct routes in stable order", () => {
    const matePals = Array.from({ length: 25 }, (_, i) => pal(`M${String(i).padStart(2, "0")}`, i + 1));
    const manyRules: BreedRule[] = matePals.map((mate, i) => ({
      id: i + 1,
      parentA: "S",
      parentB: mate.id,
      child: "T",
      allowedSexPairs: [{ a: "M", b: "F" }],
    }));
    const manyIndex = buildBreedingIndex([pal("S", 0), ...matePals, pal("T", 99)], manyRules);
    const plans = findChains(manyIndex, { palId: "S", sex: "M" }, "T", 1);
    expect(plans).toHaveLength(20);
    expect(plans.map((plan) => plan.steps[0]!.ruleId)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });
});

describe("owned collection planning", () => {
  it("combines two independently bred parents as an AND graph", () => {
    const plans = planFromOwned(index, [
      { palId: "A", male: true, female: false },
      { palId: "B", male: false, female: true },
      { palId: "D", male: true, female: false },
      { palId: "E", male: false, female: true },
    ], "G", 5);
    expect(plans).toHaveLength(1);
    const plan = plans[0]!;

    expect(plan.generations).toBe(2);
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps.filter((step) => step.generation === 1).map((step) => step.child.palId))
      .toEqual(["C", "F"]);
    expect(plan.steps.at(-1)?.child).toEqual({ palId: "G" });
    expect(plan.steps.at(-1)?.parentA.origin).toBe("bred");
    expect(plan.steps.at(-1)?.parentB.origin).toBe("bred");
  });

  it("fails cleanly when a required gender or generation is unavailable", () => {
    expect(planFromOwned(index, [
      { palId: "A", male: false, female: true },
      { palId: "B", male: false, female: true },
    ], "C", 5)).toEqual([]);
    expect(planFromOwned(index, [
      { palId: "A", male: true, female: false },
      { palId: "B", male: false, female: true },
      { palId: "D", male: true, female: false },
      { palId: "E", male: false, female: true },
    ], "G", 1)).toEqual([]);
  });

  it("returns a zero-step plan when the target is already owned", () => {
    expect(planFromOwned(index, [{ palId: "G", male: true, female: false }], "G"))
      .toEqual([{ generations: 0, steps: [], warnings: [] }]);
  });

  it("does not duplicate a final plan for the target's hatch sex", () => {
    expect(planFromOwned(index, [
      { palId: "A", male: true, female: false },
      { palId: "B", male: false, female: true },
    ], "C", 1)).toHaveLength(1);
  });

  it("returns the stable first 20 inventory plans", () => {
    const matePals = Array.from({ length: 25 }, (_, i) => pal(`P${String(i).padStart(2, "0")}`, i + 1));
    const manyRules: BreedRule[] = matePals.map((mate, i) => ({
      id: i + 1,
      parentA: "S",
      parentB: mate.id,
      child: "T",
      allowedSexPairs: [{ a: "M", b: "F" }],
    }));
    const manyIndex = buildBreedingIndex([pal("S", 0), ...matePals, pal("T", 99)], manyRules);
    const owned = [
      { palId: "S", male: true, female: false },
      ...matePals.map((mate) => ({ palId: mate.id, male: false, female: true })),
    ];
    const plans = planFromOwned(manyIndex, owned, "T", 1);
    expect(plans).toHaveLength(20);
    expect(plans.map((plan) => plan.steps[0]!.ruleId)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it("prefers fewer total steps when a deeper side branch keeps the same target generation", () => {
    const ruleDefs = [
      ["A", "B", "P"], ["C", "D", "Q"], ["E", "F", "R"], ["G", "H", "S"],
      ["P", "Q", "U"], ["R", "S", "V"], ["U", "V", "X"], ["I", "J", "K"],
      ["K", "L", "M"], ["M", "N", "O"], ["O", "W", "X"], ["I2", "J2", "K2"],
      ["K2", "L2", "M2"], ["M2", "N2", "O2"], ["O2", "W2", "Y"], ["X", "Y", "T"],
    ] as const;
    const tieRules: BreedRule[] = ruleDefs.map(([parentA, parentB, child], ruleIndex) => ({
      id: ruleIndex + 1,
      parentA,
      parentB,
      child,
      allowedSexPairs: [{ a: "M", b: "F" }],
    }));
    const ids = [...new Set(ruleDefs.flat())];
    const tieIndex = buildBreedingIndex(ids.map((id, palIndex) => pal(id, palIndex)), tieRules);
    const ownedSexes = [
      ["A", "M"], ["B", "F"], ["C", "M"], ["D", "F"], ["E", "M"], ["F", "F"],
      ["G", "M"], ["H", "F"], ["I", "M"], ["J", "F"], ["L", "F"], ["N", "F"],
      ["W", "F"], ["I2", "M"], ["J2", "F"], ["L2", "F"], ["N2", "F"], ["W2", "F"],
    ] as const;

    const tied = planFromOwned(tieIndex, ownedSexes.map(([palId, sex]) => ({
      palId,
      male: sex === "M",
      female: sex === "F",
    })), "T", 5);

    expect(tied.slice(0, 2).map((plan) => [plan.generations, plan.steps.length]))
      .toEqual([[5, 9], [5, 12]]);
    expect(tied[0]!.steps.map((step) => step.ruleId))
      .toEqual([8, 12, 9, 13, 10, 14, 11, 15, 16]);
  });

  it("finishes the whole parent layer after finding the shortest target", () => {
    const layerRules: BreedRule[] = [
      { id: 1, parentA: "A", parentB: "B", child: "X", allowedSexPairs: [{ a: "M", b: "F" }] },
      { id: 2, parentA: "C", parentB: "D", child: "Y", allowedSexPairs: [{ a: "M", b: "F" }] },
      { id: 3, parentA: "X", parentB: "D", child: "T", allowedSexPairs: [{ a: "M", b: "F" }] },
      { id: 4, parentA: "Y", parentB: "B", child: "T", allowedSexPairs: [{ a: "M", b: "F" }] },
    ];
    const layerIndex = buildBreedingIndex(
      ["A", "B", "C", "D", "X", "Y", "T"].map((id, i) => pal(id, i)),
      layerRules,
    );
    const layerPlans = planFromOwned(layerIndex, [
      { palId: "A", male: true, female: false },
      { palId: "B", male: false, female: true },
      { palId: "C", male: true, female: false },
      { palId: "D", male: false, female: true },
    ], "T", 5);

    expect(layerPlans.map((plan) => plan.steps.at(-1)?.ruleId)).toEqual([3, 4]);
    expect(layerPlans.every((plan) => plan.generations === 2)).toBe(true);
  });

  it("keeps a locally later route when shared steps make it globally best", () => {
    const ids = new Set<string>();
    const sharedRules: BreedRule[] = [];
    const owned: { palId: string; male: boolean; female: boolean }[] = [];
    for (let i = 1; i <= 21; i += 1) {
      const suffix = String(i).padStart(2, "0");
      const [a, b, x, c] = [`A${suffix}`, `B${suffix}`, `X${suffix}`, `C${suffix}`];
      for (const id of [a, b, x, c]) ids.add(id);
      owned.push(
        { palId: a, male: true, female: false },
        { palId: b, male: false, female: true },
        { palId: c, male: false, female: true },
      );
      sharedRules.push({
        id: i,
        parentA: a,
        parentB: b,
        child: x,
        allowedSexPairs: [{ a: "M", b: "F" }],
      });
    }
    for (const id of ["D", "P", "Q", "T"]) ids.add(id);
    owned.push({ palId: "D", male: false, female: true });
    for (let i = 1; i <= 21; i += 1) {
      const suffix = String(i).padStart(2, "0");
      sharedRules.push({
        id: 100 + i,
        parentA: `X${suffix}`,
        parentB: `C${suffix}`,
        child: "P",
        allowedSexPairs: [{ a: "M", b: "F" }],
      });
    }
    sharedRules.push(
      { id: 200, parentA: "X21", parentB: "D", child: "Q", allowedSexPairs: [{ a: "M", b: "F" }] },
      { id: 201, parentA: "P", parentB: "Q", child: "T", allowedSexPairs: [{ a: "M", b: "F" }] },
    );
    const sharedIndex = buildBreedingIndex(
      [...ids].map((id, internalIndex) => pal(id, internalIndex)),
      sharedRules,
    );

    const plans = planFromOwned(sharedIndex, owned, "T", 3);

    expect(plans[0]!.steps.map((step) => step.ruleId)).toEqual([21, 121, 200, 201]);
    expect(plans[0]!.steps).toHaveLength(4);
    expect(plans.slice(1).every((plan) => plan.steps.length === 5)).toBe(true);
  });

  it("uses canonical production choices as the stable equal-cost tie order", () => {
    const tiePals = ["P", "Q", "T"];
    const tieOwned: { palId: string; male: boolean; female: boolean }[] = [];
    const tieRules: BreedRule[] = [];
    for (const [ruleId, prefix] of [[100, "PA"], [200, "PB"]] as const) {
      tiePals.push(`${prefix}M`, `${prefix}F`);
      tieOwned.push(
        { palId: `${prefix}M`, male: true, female: false },
        { palId: `${prefix}F`, male: false, female: true },
      );
      tieRules.push({
        id: ruleId,
        parentA: `${prefix}M`,
        parentB: `${prefix}F`,
        child: "P",
        allowedSexPairs: [{ a: "M", b: "F" }],
      });
    }
    for (let ruleId = 1; ruleId <= 21; ruleId += 1) {
      const prefix = `Q${String(ruleId).padStart(2, "0")}`;
      tiePals.push(`${prefix}M`, `${prefix}F`);
      tieOwned.push(
        { palId: `${prefix}M`, male: true, female: false },
        { palId: `${prefix}F`, male: false, female: true },
      );
      tieRules.push({
        id: ruleId,
        parentA: `${prefix}M`,
        parentB: `${prefix}F`,
        child: "Q",
        allowedSexPairs: [{ a: "M", b: "F" }],
      });
    }
    tieRules.push({
      id: 300,
      parentA: "P",
      parentB: "Q",
      child: "T",
      allowedSexPairs: [{ a: "M", b: "F" }],
    });
    const tieIndex = buildBreedingIndex(tiePals.map((id, i) => pal(id, i)), tieRules);

    const plans = planFromOwned(tieIndex, tieOwned, "T", 2);

    expect(plans.map((plan) => plan.steps.map((step) => step.ruleId)))
      .toEqual(Array.from({ length: 20 }, (_, i) => [i + 1, 100, 300]));
  });

  it("rejects a chosen production when sharing tightens its budget", () => {
    const staleRules: BreedRule[] = [
      { id: 1, parentA: "A", parentB: "B", child: "X", allowedSexPairs: [{ a: "M", b: "F" }] },
      { id: 2, parentA: "X", parentB: "C", child: "P", allowedSexPairs: [{ a: "M", b: "F" }] },
      { id: 3, parentA: "D", parentB: "E", child: "Z", allowedSexPairs: [{ a: "M", b: "F" }] },
      { id: 4, parentA: "Z", parentB: "F", child: "Y", allowedSexPairs: [{ a: "M", b: "F" }] },
      { id: 5, parentA: "Y", parentB: "G", child: "P", allowedSexPairs: [{ a: "M", b: "F" }] },
      { id: 6, parentA: "P", parentB: "H", child: "Q", allowedSexPairs: [{ a: "F", b: "M" }] },
      { id: 7, parentA: "P", parentB: "I", child: "Q", allowedSexPairs: [{ a: "F", b: "M" }] },
      { id: 8, parentA: "P", parentB: "Q", child: "T", allowedSexPairs: [{ a: "F", b: "M" }] },
    ];
    const staleIds = ["Y", "Z", "A", "B", "C", "X", "D", "E", "F", "G", "H", "I", "P", "Q", "T"];
    const staleIndex = buildBreedingIndex(staleIds.map((id, i) => pal(id, i)), staleRules);
    const owned = [
      ["A", "M"], ["B", "F"], ["C", "F"], ["D", "M"], ["E", "F"],
      ["F", "F"], ["G", "F"], ["H", "M"], ["I", "M"],
    ] as const;

    const plans = planFromOwned(staleIndex, owned.map(([palId, sex]) => ({
      palId,
      male: sex === "M",
      female: sex === "F",
    })), "T", 4);

    expect(plans).toHaveLength(2);
    expect(plans.every((plan) => plan.steps.length === 4)).toBe(true);
    expect(plans.every((plan) => !plan.steps.some((step) => [3, 4, 5].includes(step.ruleId)))).toBe(true);
  });
});

describe("index validation", () => {
  it("rejects duplicate ids and dangling rules", () => {
    expect(() => buildBreedingIndex([pal("A", 0), pal("A", 1)], [])).toThrow(/Duplicate Pal/);
    expect(() => buildBreedingIndex([pal("A", 0)], [{
      id: 1,
      parentA: "A",
      parentB: "missing",
      child: "A",
      allowedSexPairs: [],
    }])).toThrow(/unknown Pal/);
  });
});
