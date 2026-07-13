import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildBreedingIndex, getChildren,
  type ActiveSkillRecord, type BreedRule, type PalRecord, type PartnerSkillRecord,
  type PassiveSkillRecord,
} from "../../src/core";
import { elementIcon, palMatchesSearch, palPinyinInitials } from "../../src/composables/usePalData";

const read = <T>(name: string): T => JSON.parse(readFileSync(resolve("public/data", name), "utf8")) as T;
const pals = read<{ pals: PalRecord[] }>("paldex.json").pals;
const rules = read<{ rules: BreedRule[] }>("breeding.json").rules;
const skills = read<{
  activeSkills: ActiveSkillRecord[];
  partnerSkills: PartnerSkillRecord[];
  passiveSkills: PassiveSkillRecord[];
}>("skills.json");
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
    const selfBreedOnly = [...index.rulesByChild]
      .filter(([child, childRules]) => childRules.length > 0 &&
        childRules.every((rule) => rule.parentA === child && rule.parentB === child))
      .map(([child]) => child);
    expect(selfBreedOnly).toHaveLength(24);
    expect(selfBreedOnly).toContain("ChickenPal");
    expect(selfBreedOnly).not.toContain("SheepBall");
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
    expect(elementIcon("earth")).toBe("⛰️");
  });

  it("keeps locally unpacked movement parameters and Blueprint overrides", () => {
    const movementFields = [
      "slowWalkSpeed", "walkSpeed", "runSpeed", "rideSprintSpeed",
      "transportSpeed", "swimSpeed", "swimDashSpeed",
    ] as const;
    expect(pals.every((pal) => movementFields.every((field) => Number.isFinite(pal.movement[field])))).toBe(true);
    expect(pals.filter((pal) => pal.selectable).every((pal) => pal.movement.type)).toBe(true);
    expect(Object.fromEntries(["ground", "fly", "flyAndLanding", "swim"].map((type) => [
      type,
      pals.filter((pal) => pal.selectable && pal.movement.type === type).length,
    ]))).toEqual({ ground: 252, fly: 21, flyAndLanding: 7, swim: 8 });

    expect(pals.find((pal) => pal.id === "JetDragon")?.movement).toMatchObject({
      type: "fly", slowWalkSpeed: 200, walkSpeed: 800, runSpeed: 1700,
      rideSprintSpeed: 3300, transportSpeed: 1250, swimSpeed: 510, swimDashSpeed: 990,
    });
    expect(pals.find((pal) => pal.id === "PoseidonOrca")?.movement).toMatchObject({
      type: "ground", swimSpeed: 1800, swimDashSpeed: 2000,
    });
    expect(pals.find((pal) => pal.id === "BlackGriffon")?.movement).toMatchObject({
      type: "flyAndLanding", flySpeedOverride: 1100, flySprintSpeedOverride: 1600,
    });
    expect(pals.filter((pal) => !pal.movement.type).map((pal) => pal.id).sort()).toEqual([
      "AmaterasuWolf_Dark_Quest_Friend", "POLICE_HawkBird", "POLICE_ThunderDog",
      "PREDATOR_FlowerRabbit_Quest", "YakushimaMonster001_Blue", "YakushimaMonster001_Pink",
      "YakushimaMonster001_Purple", "YakushimaMonster001_Rainbow", "YakushimaMonster001_Red",
    ]);
    expect(pals.filter((pal) => pal.movement.flySpeedOverride !== undefined).map((pal) => pal.id).sort()).toEqual([
      "BlackGriffon", "DarkMechaDragon", "FairyDragon", "FairyDragon_Water", "SkyDragon", "SkyDragon_Grass",
    ]);
  });

  it("resolves detailed active and partner skill text for every visible Pal", () => {
    expect(skills.activeSkills).toHaveLength(320);
    expect(skills.partnerSkills).toHaveLength(288);
    const activeById = new Map(skills.activeSkills.map((skill) => [skill.id, skill]));
    const partnerById = new Map(skills.partnerSkills.map((skill) => [skill.id, skill]));
    const visible = pals.filter((pal) => pal.selectable);

    expect(visible.every((pal) => pal.partnerSkillId && partnerById.has(pal.partnerSkillId))).toBe(true);
    expect(visible.flatMap((pal) => pal.activeSkillRefs ?? []).every((reference) => {
      const skill = activeById.get(reference.id);
      return skill && skill.names.zh && skill.description?.zh;
    })).toBe(true);

    expect(activeById.get("Unique_CubeTurtle_CubePress")?.description?.zh)
      .toContain("重岩龟的专用技能");
    expect(partnerById.get("OniGhostGirl")?.name).toBe("播撒欢笑的亡者");
  });

  it("keeps the complete player-facing passive-skill catalog", () => {
    expect(skills.passiveSkills).toHaveLength(115);
    expect(new Set(skills.passiveSkills.map((skill) => skill.id)).size).toBe(115);
    expect(skills.passiveSkills.every((skill) =>
      skill.names.zh && skill.names.en && skill.description.zh && skill.description.en)).toBe(true);
    expect(Object.fromEntries([-3, -2, -1, 1, 2, 3, 4, 5].map((rank) => [
      rank,
      skills.passiveSkills.filter((skill) => skill.rank === rank).length,
    ]))).toEqual({ "-3": 3, "-2": 2, "-1": 10, 1: 36, 2: 2, 3: 31, 4: 24, 5: 7 });
    expect(skills.passiveSkills.filter((skill) => skill.randomlyAvailable)).toHaveLength(85);
    expect(skills.passiveSkills.filter((skill) => skill.surgeryCost > 0)).toHaveLength(33);
    expect(skills.passiveSkills.filter((skill) => skill.surgeryItem)).toHaveLength(35);

    const passiveById = new Map(skills.passiveSkills.map((skill) => [skill.id, skill]));
    expect(passiveById.get("Legend")).toMatchObject({
      names: { zh: "传说", en: "Legend" },
      description: {
        zh: "攻击+20%\n防御+20%\n移动速度提升20%",
        en: "Attack +20%\nDefense +20%\nMovement Speed increases 20%",
      },
      rank: 4,
      randomlyAvailable: false,
      randomWeight: 100,
    });
    expect(passiveById.get("Legend")?.guaranteedBy.length).toBeGreaterThan(0);
    expect(passiveById.get("CraftSpeed_up3")).toMatchObject({
      names: { zh: "卓绝技艺", en: "Remarkable Craftsmanship" },
      description: { zh: "工作速度 +75%", en: "Work Speed +75%" },
      rank: 4,
      randomlyAvailable: true,
      randomWeight: 5,
      surgeryCost: 0,
      surgeryItem: "PalPassiveSkillChange_Consumable_CraftSpeed_up3",
    });
    expect(passiveById.get("CraftSpeed_down2")).toMatchObject({
      names: { zh: "偷懒成瘾", en: "Slacker" },
      rank: -3,
    });
    expect(passiveById.get("WorldTree_ATK")).toMatchObject({
      names: { zh: "双刃圣剑", en: "Twin-Edged Holy Blade" },
      rank: 5,
      randomlyAvailable: false,
    });
  });

  it("keeps exact zero-star and four-star refinement endpoints", () => {
    const visible = pals.filter((pal) => pal.selectable);
    expect(visible.every((pal) => pal.refinement?.fourStar.metrics.length)).toBe(true);
    expect(visible.filter((pal) => pal.refinement?.zeroStar.metrics.length === 0).map((pal) => pal.id).sort())
      .toEqual(["BlackCentaur", "FengyunDeeper", "Garm", "HawkBird", "SaintCentaur", "Serpent"]);
    expect(Object.fromEntries(visible.map((pal) => [pal.refinement!.sourceKind,
      visible.filter((entry) => entry.refinement?.sourceKind === pal.refinement?.sourceKind).length])))
      .toEqual({ table: 270, blueprint: 17, constant: 1 });

    const pinkCat = pals.find((pal) => pal.id === "PinkCat")!.refinement!;
    expect(pinkCat.zeroStar.metrics[0]).toMatchObject({ label: "负重上限增加", value: 100, unit: "点" });
    expect(pinkCat.fourStar.metrics[0]).toMatchObject({ label: "负重上限增加", value: 200, unit: "点" });

    const anubis = pals.find((pal) => pal.id === "Anubis")!.refinement!;
    expect(anubis.zeroStar).toMatchObject({ partnerSkillLevel: 1, consumedCopies: 0, statMultiplier: 1 });
    expect(anubis.fourStar).toMatchObject({ partnerSkillLevel: 5, consumedCopies: 48, statMultiplier: 1.2 });
    expect(anubis.zeroStar.workSuitability).toEqual({ handiwork: 6, mining: 6, transporting: 4 });
    expect(anubis.fourStar.workSuitability).toEqual({ handiwork: 8, mining: 8, transporting: 6 });

    const eagle = pals.find((pal) => pal.id === "Eagle")!.refinement!;
    expect(eagle.zeroStar.metrics.find((metric) => metric.key === "gliderMaxSpeed")?.value).toBe(1000);
    expect(eagle.fourStar.metrics.find((metric) => metric.key === "gliderMaxSpeed")?.value).toBe(1700);
    expect(pals.find((pal) => pal.id === "SheepBall")!.refinement!.fourStar.metrics[0].value)
      .toContain("羊毛 ×1～5");
  });
});
