import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildBreedingIndex, getChildren, type BreedRule, type PalRecord } from "../../src/core";
import { palMatchesSearch, palPinyinInitials } from "../../src/composables/usePalData";

const read = <T>(name: string): T => JSON.parse(readFileSync(resolve("public/data", name), "utf8")) as T;
const pals = read<{ pals: PalRecord[] }>("paldex.json").pals;
const rules = read<{ rules: BreedRule[] }>("breeding.json").rules;
const pairKey = (a: string, b: string) => a < b ? `${a}\0${b}` : `${b}\0${a}`;

describe("Palworld 1.0 generated data", () => {
  it("keeps the pinned full snapshot and a consistent forward/reverse index", () => {
    expect(pals).toHaveLength(306);
    expect(pals.filter((pal) => pal.selectable)).toHaveLength(288);
    expect(rules).toHaveLength(46_972);
    expect(rules.filter((rule) => rule.allowedSexPairs.length === 1)).toHaveLength(2);

    const index = buildBreedingIndex(pals, rules);
    expect(rules.filter((rule) =>
      !index.rulesByPair.get(pairKey(rule.parentA, rule.parentB))?.some((item) => item.id === rule.id)))
      .toEqual([]);
    expect(rules.filter((rule) =>
      !index.rulesByChild.get(rule.child)?.some((item) => item.id === rule.id)))
      .toEqual([]);
  });

  it("returns the same children when ordinary parents are exchanged", () => {
    const usable = new Set(pals.filter((pal) => pal.selectable).map((pal) => pal.id));
    const usableRules = rules.filter((rule) =>
      usable.has(rule.parentA) && usable.has(rule.parentB) && usable.has(rule.child));
    expect(usableRules).toHaveLength(41_550);
    const index = buildBreedingIndex(pals, usableRules);
    const sample = usableRules.find((rule) => rule.allowedSexPairs.length === 2)!;
    const forward = getChildren(index, sample.parentA, sample.parentB)
      .map((match) => `${match.parentASex}${match.parentBSex}:${match.child}`).sort();
    const reverse = getChildren(index, sample.parentB, sample.parentA)
      .map((match) => `${match.parentBSex}${match.parentASex}:${match.child}`).sort();
    expect(reverse).toEqual(forward);
  });

  it("indexes every visible Chinese name by pinyin initials", () => {
    const visible = pals.filter((pal) => pal.selectable);
    expect(visible.every((pal) => /^[a-z0-9]+$/.test(palPinyinInitials(pal)))).toBe(true);
    expect(visible.every((pal) => palMatchesSearch(pal, palPinyinInitials(pal)))).toBe(true);
    expect(palPinyinInitials(visible.find((pal) => pal.id === "OniGhostGirl")!)).toBe("xsn");
    expect(palPinyinInitials(visible.find((pal) => pal.id === "ClioneTwins")!)).toBe("loln");
    expect(palPinyinInitials(visible.find((pal) => pal.id === "CubeTurtle")!)).toBe("zyg");
  });
});
