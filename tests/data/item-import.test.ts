import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadItemRawDirectory,
  normalizeItemTables,
  validatePublicItemData,
  writeItemSnapshot,
} from "../../scripts/import-item-snapshot.mjs";

const fixture = resolve("tests/fixtures/item-import");

describe("Palworld item snapshot importer", () => {
  it("normalizes CUE4Parse wrappers, table precedence, graph routes, technology and shops", async () => {
    const tables = await loadItemRawDirectory(fixture);
    const snapshot = await normalizeItemTables(tables, { sellPriceDivisor: 10 });

    expect(snapshot.counts).toMatchObject({
      items: 5,
      recipes: 5,
      recipeProducts: 3,
      alternateRecipeProducts: 2,
      technologyUnlocks: 2,
      shopOffers: 1,
      cycles: 1,
      overriddenRecipeRows: 1,
      unresolvedItemRefs: 0,
      canonicalizedReferences: 1,
    });
    expect(snapshot.items.find((item: { id: string }) => item.id === "Ore")).toMatchObject({
      names: { zh: "矿石", en: "Ore" },
      description: { zh: "可用于冶炼的天然矿石。" },
      typeA: "Material",
      typeB: "Ore",
      priceRaw: 1001,
      baseSellPrice: 100,
      flags: { legalInGame: true },
    });
    expect(snapshot.items.find((item: { id: string }) => item.id === "Ingot")?.shopOffers?.[0])
      .toMatchObject({ shopId: "Merchant_Materials", overridePrice: 500, sellRate: 0.1 });
    expect(snapshot.recipes.find((recipe: { id: string }) => recipe.id === "Recipe_Ingot"))
      .toMatchObject({ sourceTable: "main", workAmountRaw: 200, baseSeconds: 2 });
    expect(snapshot.recipes.find((recipe: { id: string }) => recipe.id === "Recipe_Nail_A")
      ?.technologyUnlocks?.[0]).toMatchObject({ technologyId: "Technology_Metal", level: 12 });
    expect(snapshot.recipesByProduct.Nail).toEqual(["Recipe_Nail_A", "Recipe_Nail_B"]);
    expect(snapshot.recipes.find((recipe: { id: string }) => recipe.id === "Recipe_Nail_B")
      ?.materials[1]).toMatchObject({ itemId: "Wood", sourceItemId: "wood" });
    expect(snapshot.cycles).toEqual([["Ingot", "Scrap"]]);
  });

  it("writes and validates the two public documents", async () => {
    const output = await mkdtemp(resolve(tmpdir(), "pal-item-import-"));
    try {
      const icons = resolve(output, "source-icons");
      await mkdir(icons);
      await writeFile(resolve(icons, "OreShared.png"), Buffer.from("fixture-icon"));
      await writeFile(resolve(icons, "oreshared.webp"), Buffer.from("fixture-webp"));
      const tables = await loadItemRawDirectory(fixture);
      const snapshot = await normalizeItemTables(tables, { iconsDirectory: icons });
      await mkdir(resolve(output, "public/item-icons"), { recursive: true });
      await writeFile(resolve(output, "public/item-icons/stale.png"), Buffer.from("stale"));
      await writeItemSnapshot(snapshot, {
        snapshotOutput: resolve(output, "vendor/items-v1.json"),
        publicDirectory: resolve(output, "public/data"),
        iconsSourceDirectory: icons,
      });
      const items = JSON.parse(await readFile(resolve(output, "public/data/items.json"), "utf8"));
      const recipes = JSON.parse(await readFile(resolve(output, "public/data/recipes.json"), "utf8"));
      expect(validatePublicItemData(items, recipes)).toEqual({ items: 5, recipes: 5 });
      expect(items.items.some((item: { baseSellPrice?: number }) => item.baseSellPrice !== undefined)).toBe(false);
      expect(items.items.find((item: { id: string }) => item.id === "Ore").icon)
        .toBe("/item-icons/oreshared.webp");
      expect(await readFile(resolve(output, "public/item-icons/oreshared.webp"), "utf8"))
        .toBe("fixture-webp");
      await expect(readFile(resolve(output, "public/item-icons/stale.png"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });

  it("fails clearly when the required raw tables are absent", async () => {
    const empty = await mkdtemp(resolve(tmpdir(), "pal-item-empty-"));
    try {
      await expect(loadItemRawDirectory(empty)).rejects.toThrow("Missing DT_ItemDataTable JSON");
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it("reports observed fields instead of silently dropping an unknown upstream schema", async () => {
    const tables = await loadItemRawDirectory(fixture);
    const broken = {
      ...tables,
      technology: [{
        ...tables.technology[0],
        rowCount: 1,
        rows: { BrokenTechnology: { NewUnlockLayout: [] } },
      }],
    };
    await expect(normalizeItemTables(broken)).rejects
      .toThrow("Observed row fields: NewUnlockLayout");
  });
});
