import type { BreedRule, PalRecord } from "../../src/core";

export function pal(id: string, internalIndex: number, maleProbability = 0.5): PalRecord {
  return {
    id,
    dexNo: internalIndex + 1,
    variant: false,
    names: { zh: id, en: id },
    elements: [],
    maleProbability,
    breedingPower: internalIndex,
    internalIndex,
    stats: {},
    workSuitability: {},
    activeSkills: [],
    icon: `${id}.png`,
  };
}

export const pals = ["A", "B", "C", "D", "E", "F", "G", "H"].map((id, index) => pal(id, index));

export const rules: BreedRule[] = [
  { id: 0, parentA: "A", parentB: "A", child: "A", allowedSexPairs: [] },
  {
    id: 1,
    parentA: "A",
    parentB: "B",
    child: "C",
    allowedSexPairs: [{ a: "M", b: "F" }],
  },
  {
    id: 2,
    parentA: "A",
    parentB: "B",
    child: "D",
    allowedSexPairs: [{ a: "F", b: "M" }],
  },
  {
    id: 3,
    parentA: "D",
    parentB: "E",
    child: "F",
    allowedSexPairs: [{ a: "M", b: "F" }],
  },
  {
    id: 4,
    parentA: "C",
    parentB: "F",
    child: "G",
    allowedSexPairs: [{ a: "F", b: "M" }],
  },
  {
    id: 5,
    parentA: "G",
    parentB: "H",
    child: "A",
    allowedSexPairs: [],
  },
];
