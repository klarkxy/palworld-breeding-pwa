import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateItemDropSnapshot } from "./import-item-drops.mjs";
import { validatePublicItemData } from "./import-item-snapshot.mjs";

const directory = resolve(process.argv[2] ?? "public/data");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async (name) => {
  const path = resolve(directory, name);
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") throw new Error(
      `Missing ${path}. Run import-item-snapshot.mjs with the local CUE4Parse exports first.`);
    throw error;
  }
};

try {
  const [items, recipes, drops, paldex] = await Promise.all([
    readJson("items.json"), readJson("recipes.json"), readJson("item-drops.json"), readJson("paldex.json"),
  ]);
  const counts = validatePublicItemData(items, recipes);
  const itemById = new Map(items.items.map((item) => [item.id, item]));
  const dropCounts = validateItemDropSnapshot(drops, {
    itemIds: new Set(itemById.keys()),
    itemById,
    palIds: new Set(paldex.pals.map((pal) => pal.id)),
  });
  assert(dropCounts.chestDropEdges === 3_504 && drops.chestDrops.length === 3_504,
    "Expected 3504 public chest-drop edges");
  assert(dropCounts.chestDropFields === 109 && drops.chestSources.length === 109,
    "Expected 109 public chest fields");
  const itemIds = new Set(items.items.map((item) => item.id));
  const sourceIds = new Set(drops.chestSources.map((source) => source.id));
  const chestKeys = new Set();
  for (const drop of drops.chestDrops) {
    const key = `${drop.poolId}\0${drop.itemId}`;
    assert(!chestKeys.has(key), `Duplicate chest pool/item edge: ${key}`);
    chestKeys.add(key);
    assert(itemIds.has(drop.itemId) && sourceIds.has(drop.sourceId), `Broken chest-drop reference: ${key}`);
    assert(drop.probabilityBasis === "conditionalOnGrade"
      && drop.perOpenChancePercent === undefined
      && drop.conditionalOnGradeChancePercent > 0
      && drop.conditionalOnGradeChancePercent <= 100,
    `Invalid chest-drop probability: ${key}`);
    assert(drop.treasureBoxGrade === drop.treasureGrade
      && /^Grade[1-6]$/.test(drop.treasureBoxGrade), `Invalid chest-drop grade: ${key}`);
    assert(drop.expectedQuantityPerOpen > 0 && Number.isInteger(drop.minQuantity)
      && Number.isInteger(drop.maxQuantity) && drop.minQuantity > 0
      && drop.maxQuantity >= drop.minQuantity, `Invalid chest-drop quantity: ${key}`);
  }
  console.log(`Validated ${counts.items} items, ${counts.recipes} recipes, ${dropCounts.palDropEdges} Pal drops, and ${dropCounts.chestDropEdges} grade-conditional chest drops.`);
} catch (error) {
  console.error(`Item-data validation failed: ${error.message}`);
  process.exitCode = 1;
}
