import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PINNED_GAME_VERSION = "1.0";
const PINNED_BUILD_ID = "24088745";
const PINNED_MAPPING_SHA256 = "741798898aabf3da8803e26ff005a35052b33bd0c90d771aabbb5f2c367f7df7";
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stripEnum = (value) => typeof value === "string" ? value.replace(/^.*::/, "") : value;
const normalizedPath = (path) => path.replaceAll("\\", "/");

export const ITEM_DATA_SCHEMA_VERSION = 1;

/** Accept the common CUE4Parse shapes: {Rows}, [{Rows}], {Exports:[{Rows}]}, and {Properties:{Rows}}. */
export function rowsOf(document, label = "CUE4Parse document") {
  const queue = [{ value: document, depth: 0 }];
  const seen = new Set();
  while (queue.length) {
    const { value, depth } = queue.shift();
    if (value === null || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    if (isObject(value.Rows)) return value.Rows;
    if (depth >= 4) continue;
    if (Array.isArray(value)) {
      for (const child of value) queue.push({ value: child, depth: depth + 1 });
      continue;
    }
    for (const key of ["Exports", "Objects", "Properties", "Data", "Value"])
      if (value[key] !== undefined) queue.push({ value: value[key], depth: depth + 1 });
  }
  throw new Error(`${label} does not contain a DataTable Rows object`);
}

function firstValue(object, keys) {
  for (const key of keys) if (object?.[key] !== undefined && object[key] !== null) return object[key];
  return undefined;
}

function scalarId(value) {
  if (typeof value === "string") return value.trim();
  if (!isObject(value)) return undefined;
  for (const key of ["Key", "RowName", "StaticId", "StaticID", "Id", "ID", "Name", "Value"]) {
    const nested = value[key];
    if (typeof nested === "string") return nested.trim();
  }
  return undefined;
}

function optionalId(value) {
  const id = scalarId(value);
  if (!id || id === "None" || id.endsWith("::None")) return undefined;
  return id;
}

function isNoneId(value) {
  const id = scalarId(value);
  return id === "None" || id?.endsWith("::None") === true;
}

function optionalNumber(object, keys, label) {
  const value = firstValue(object, keys);
  if (value === undefined) return undefined;
  const number = typeof value === "number" ? value
    : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  assert(Number.isFinite(number), `Invalid numeric ${label}: ${JSON.stringify(value)}`);
  return number;
}

function optionalBoolean(object, keys, label) {
  const value = firstValue(object, keys);
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (value === 0 || value === 1) return Boolean(value);
  throw new Error(`Invalid boolean ${label}: ${JSON.stringify(value)}`);
}

function textOf(value, depth = 0) {
  if (typeof value === "string") {
    const text = value.trim();
    return text && text !== "None" ? text : undefined;
  }
  if (!isObject(value) || depth >= 4) return undefined;
  for (const key of ["TextData", "Text", "text", "LocalizedString", "SourceString", "CultureInvariantString", "Value"]) {
    const text = textOf(value[key], depth + 1);
    if (text) return text;
  }
  return undefined;
}

function assetName(path) {
  return basename(path, ".json").replace(/[-_.]v?1\.0$/i, "");
}

function sourceKind(path) {
  return /_Common(?:[-_.]|$)/i.test(basename(path, ".json")) ? "common" : "main";
}

function tablePriority(table) {
  return table.sourceTable === "common" ? 0 : 1;
}

async function walkJson(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walkJson(path));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) paths.push(path);
  }
  return paths.sort();
}

const tablePatterns = {
  items: /^DT_ItemDataTable(?:_Common)?(?:[-_.].*)?\.json$/i,
  recipes: /^DT_ItemRecipeDataTable(?:_Common)?(?:[-_.].*)?\.json$/i,
  technology: /^DT_TechnologyRecipeUnlock(?:_Common)?(?:[-_.].*)?\.json$/i,
  shops: /^DT_ItemShopCreateData(?:_Common)?(?:[-_.].*)?\.json$/i,
  staticItems: /^DA_StaticItemDataAsset(?:[-_.].*)?\.json$/i,
  names: /^DT_ItemNameText(?:_Common)?(?:[-_.].*)?\.json$/i,
  descriptions: /^DT_Item(?:Description|Desc)Text(?:_Common)?(?:[-_.].*)?\.json$/i,
};

function localeOf(path) {
  const normalized = normalizedPath(path).toLowerCase();
  if (/(^|[/_.-])(zh-hans|zh_cn|schinese|simplifiedchinese)([/_.-]|$)/.test(normalized)) return "zh";
  if (/(^|[/_.-])(zh-hant|zh_tw|tchinese|traditionalchinese)([/_.-]|$)/.test(normalized)) return "zhHant";
  if (/(^|[/_.-])(en|english)([/_.-]|$)/.test(normalized)) return "en";
  if (/(^|[/_.-])(ja|jp|japanese)([/_.-]|$)/.test(normalized)) return "ja";
  return "ja"; // Pal's base, non-L10N text tables are Japanese.
}

function parseLocalizedOption(values = []) {
  return values.map((entry) => {
    const separator = entry.indexOf("=");
    assert(separator > 0 && separator < entry.length - 1,
      `Expected localized table as <locale>=<path>, got: ${entry}`);
    return { locale: entry.slice(0, separator), path: resolve(entry.slice(separator + 1)) };
  });
}

async function readTable(path, kind, inputDirectory, locale) {
  const bytes = await readFile(path);
  let document;
  try { document = JSON.parse(bytes.toString("utf8")); }
  catch (error) { throw new Error(`Invalid JSON in ${path}: ${error.message}`); }
  const rows = rowsOf(document, path);
  return {
    kind,
    locale,
    path,
    file: normalizedPath(relative(inputDirectory, path)),
    asset: assetName(path),
    sourceTable: sourceKind(path),
    sha256: sha256(bytes),
    rowCount: Object.keys(rows).length,
    rows,
  };
}

async function readStaticItemAsset(path, inputDirectory) {
  const bytes = await readFile(path);
  let document;
  try { document = JSON.parse(bytes.toString("utf8")); }
  catch (error) { throw new Error(`Invalid JSON in ${path}: ${error.message}`); }
  const exports = Array.isArray(document) ? document : document.Exports;
  assert(Array.isArray(exports), `${path} does not contain CUE4Parse exports`);
  const rows = {};
  for (const entry of exports) {
    const properties = entry?.Properties;
    const id = optionalId(properties?.ID);
    if (!id) continue;
    assert(!rows[id], `Duplicate static item ID in ${path}: ${id}`);
    rows[id] = properties;
  }
  assert(Object.keys(rows).length > 0, `${path} has no Properties.ID item exports`);
  return {
    kind: "staticItems",
    path,
    file: normalizedPath(relative(inputDirectory, path)),
    asset: assetName(path),
    sourceTable: "main",
    sha256: sha256(bytes),
    rowCount: Object.keys(rows).length,
    rows,
  };
}

function pickPaths(discovered, explicit, kind) {
  const paths = explicit?.length ? explicit.map((path) => resolve(path))
    : discovered.filter((path) => tablePatterns[kind].test(basename(path)));
  return [...new Set(paths)].sort();
}

export async function loadItemRawDirectory(inputDirectory, options = {}) {
  const directory = resolve(inputDirectory);
  await access(directory).catch(() => {
    throw new Error(`Raw item export directory does not exist: ${directory}`);
  });
  const discovered = await walkJson(directory);
  const paths = {
    items: pickPaths(discovered, options.itemTables, "items"),
    recipes: pickPaths(discovered, options.recipeTables, "recipes"),
    technology: pickPaths(discovered, options.technologyTables, "technology"),
    shops: pickPaths(discovered, options.shopTables, "shops"),
    staticItems: pickPaths(discovered, options.staticItemAssets, "staticItems"),
  };
  assert(paths.items.length > 0,
    "Missing DT_ItemDataTable JSON. Export it with CUE4Parse or pass --item-table <path>.");
  assert(paths.recipes.length > 0,
    "Missing DT_ItemRecipeDataTable(_Common) JSON. Export it or pass --recipe-table <path>.");
  assert(paths.technology.length > 0,
    "Missing DT_TechnologyRecipeUnlock(_Common) JSON. Export it or pass --technology-table <path>.");
  assert(paths.shops.length > 0,
    "Missing DT_ItemShopCreateData(_Common) JSON. Export it or pass --shop-table <path>.");

  const explicitNames = parseLocalizedOption(options.nameTables);
  const explicitDescriptions = parseLocalizedOption(options.descriptionTables);
  const localized = {
    names: explicitNames.length ? explicitNames
      : pickPaths(discovered, undefined, "names").map((path) => ({ locale: localeOf(path), path })),
    descriptions: explicitDescriptions.length ? explicitDescriptions
      : pickPaths(discovered, undefined, "descriptions").map((path) => ({ locale: localeOf(path), path })),
  };
  const tables = {};
  for (const kind of ["items", "recipes", "technology", "shops"])
    tables[kind] = await Promise.all(paths[kind].map((path) => readTable(path, kind, directory)));
  tables.staticItems = await Promise.all(paths.staticItems.map((path) => readStaticItemAsset(path, directory)));
  for (const kind of ["names", "descriptions"])
    tables[kind] = await Promise.all(localized[kind]
      .map(({ locale, path }) => readTable(path, kind, directory, locale)));
  return tables;
}

function mergeRows(tables) {
  const rows = new Map();
  const sources = new Map();
  let overriddenRows = 0;
  for (const table of [...tables].sort((left, right) => tablePriority(left) - tablePriority(right))) {
    for (const [id, row] of Object.entries(table.rows)) {
      assert(id.trim(), `Empty row ID in ${table.file}`);
      if (rows.has(id)) overriddenRows += 1;
      rows.set(id, { ...(rows.get(id) ?? {}), ...row });
      sources.set(id, [...(sources.get(id) ?? []), table]);
    }
  }
  return { rows, sources, overriddenRows };
}

function effectiveRows(tables) {
  const rows = new Map();
  let overriddenRows = 0;
  for (const table of [...tables].sort((left, right) => tablePriority(left) - tablePriority(right))) {
    for (const [id, row] of Object.entries(table.rows)) {
      if (rows.has(id)) overriddenRows += 1;
      rows.set(id, { row, table });
    }
  }
  return { rows, overriddenRows };
}

function localizedMaps(tables) {
  const maps = new Map();
  for (const table of [...tables].sort((left, right) => tablePriority(left) - tablePriority(right))) {
    const map = maps.get(table.locale) ?? new Map();
    for (const [id, row] of Object.entries(table.rows)) {
      const text = textOf(row);
      if (text) map.set(id.toLowerCase(), text);
    }
    maps.set(table.locale, map);
  }
  return maps;
}

function localizedText(maps, candidateIds) {
  const output = {};
  for (const [locale, map] of maps) {
    const value = candidateIds.filter(Boolean).map((id) => map.get(id.toLowerCase())).find(Boolean);
    if (value) output[locale] = value;
  }
  return output;
}

function normalizedEnum(value) {
  const scalar = scalarId(value);
  const result = stripEnum(scalar);
  return result && result !== "None" ? result : undefined;
}

function normalizedEnumOrNumber(value) {
  return typeof value === "number" ? value : normalizedEnum(value);
}

function assetPathOf(value) {
  if (typeof value === "string") return value !== "None" ? value : undefined;
  const path = value?.AssetPathName;
  return typeof path === "string" && path !== "None" ? path : undefined;
}

function iconIdOf(path) {
  if (!path) return undefined;
  return path.split("/").at(-1)?.split(".")[0] || undefined;
}

function normalizeItems(itemTables, staticItemTables, nameTables, descriptionTables, options) {
  const { rows, sources, overriddenRows } = mergeRows(itemTables);
  const staticItems = effectiveRows(staticItemTables);
  const namesByLocale = localizedMaps(nameTables);
  const descriptionsByLocale = localizedMaps(descriptionTables);
  const items = [];
  const itemIds = [...new Set([...rows.keys(), ...staticItems.rows.keys()])].sort();
  for (const id of itemIds) {
    const staticEntry = staticItems.rows.get(id);
    const row = { ...(rows.get(id) ?? {}), ...(staticEntry?.row ?? {}) };
    const rawOverrideName = firstValue(row, ["OverrideName"]);
    const rawOverrideDescription = firstValue(row, ["OverrideDescription", "OverrideDesc"]);
    const nameMessageId = optionalId(firstValue(row,
      ["OverrideNameMsgID", "OverrideNameMsgId", "NameMsgID", "NameMsgId"]))
      ?? (typeof rawOverrideName === "string" && rawOverrideName.startsWith("ITEM_NAME_")
        ? rawOverrideName : undefined);
    const descriptionMessageId = optionalId(firstValue(row,
      ["OverrideDescMsgID", "OverrideDescMsgId", "DescriptionMsgID", "DescriptionMsgId"]))
      ?? (typeof rawOverrideDescription === "string" && rawOverrideDescription.startsWith("ITEM_DESC_")
        ? rawOverrideDescription : undefined);
    const names = localizedText(namesByLocale, [nameMessageId, `ITEM_NAME_${id}`, id]);
    const description = localizedText(descriptionsByLocale,
      [descriptionMessageId, `ITEM_DESC_${id}`, id]);
    const directName = nameMessageId === rawOverrideName ? undefined
      : textOf(firstValue(row, ["OverrideName", "NameText", "DisplayName"]));
    const directDescription = textOf(firstValue(row,
      descriptionMessageId === rawOverrideDescription
        ? ["DescriptionText", "Description"]
        : ["OverrideDescription", "OverrideDesc", "DescriptionText", "Description"]));
    if (directName && !names.ja) names.ja = directName;
    if (directDescription && !description.ja) description.ja = directDescription;
    const priceRaw = optionalNumber(row, ["Price"], `${id}.Price`);
    const rarityRaw = firstValue(row, ["Rarity"]);
    const rarity = typeof rarityRaw === "number" ? rarityRaw : normalizedEnum(rarityRaw);
    const iconAssetPath = assetPathOf(firstValue(row, ["IconTexture"]));
    const iconTextureId = iconIdOf(iconAssetPath);
    const iconId = optionalId(firstValue(row, ["IconName", "IconId", "IconID"])) ?? iconTextureId;
    const baseItemId = optionalId(firstValue(row, ["ItemBaseName", "BaseItemId", "BaseItemID"]));
    const item = {
      id,
      names,
      ...(Object.keys(description).length ? { description } : {}),
      ...(nameMessageId ? { nameMessageId } : {}),
      ...(descriptionMessageId ? { descriptionMessageId } : {}),
      ...(normalizedEnum(firstValue(row, ["TypeA"])) ? { typeA: normalizedEnum(row.TypeA) } : {}),
      ...(normalizedEnum(firstValue(row, ["TypeB"])) ? { typeB: normalizedEnum(row.TypeB) } : {}),
      ...(optionalNumber(row, ["Rank"], `${id}.Rank`) !== undefined
        ? { rank: optionalNumber(row, ["Rank"], `${id}.Rank`) } : {}),
      ...(rarity !== undefined ? { rarity } : {}),
      ...(priceRaw !== undefined ? { priceRaw } : {}),
      ...(priceRaw !== undefined && priceRaw >= 0 && options.sellPriceDivisor !== undefined
        ? { baseSellPrice: Math.floor(priceRaw / options.sellPriceDivisor) } : {}),
      ...(optionalNumber(row, ["MaxStackCount"], `${id}.MaxStackCount`) !== undefined
        ? { maxStack: optionalNumber(row, ["MaxStackCount"], `${id}.MaxStackCount`) } : {}),
      ...(optionalNumber(row, ["Weight"], `${id}.Weight`) !== undefined
        ? { weight: optionalNumber(row, ["Weight"], `${id}.Weight`) } : {}),
      ...(optionalNumber(row, ["SortID", "SortId"], `${id}.SortID`) !== undefined
        ? { sortId: optionalNumber(row, ["SortID", "SortId"], `${id}.SortID`) } : {}),
      ...(iconId ? { iconId } : {}),
      ...(iconTextureId ? { iconTextureId } : {}),
      ...(iconAssetPath ? { iconAssetPath } : {}),
      ...(baseItemId ? { baseItemId } : {}),
      sourceTables: [
        ...(sources.get(id) ?? []).map((table) => table.asset),
        ...(staticEntry ? [staticEntry.table.asset] : []),
      ],
    };
    const flagFields = [
      ["legalInGame", ["bLegalInGame"]],
      ["notConsumed", ["bNotConsumed"]],
      ["enableHandcraft", ["bEnableHandcraft"]],
      ["inTreasureBox", ["bInTreasureBox"]],
      ["technologyTreeLock", ["TechnologyTreeLock", "bTechnologyTreeLock"]],
    ];
    const flags = {};
    for (const [outputKey, inputKeys] of flagFields) {
      const value = optionalBoolean(row, inputKeys, `${id}.${inputKeys[0]}`);
      if (value !== undefined) flags[outputKey] = value;
    }
    if (Object.keys(flags).length) item.flags = flags;
    items.push(item);
  }
  return { items, overriddenRows, staticItemRows: staticItems.rows.size };
}

function requiredPositiveNumber(row, keys, label) {
  const value = optionalNumber(row, keys, label);
  assert(value !== undefined && Number.isSafeInteger(value) && value > 0,
    `Missing or non-positive integer ${label}`);
  return value;
}

function normalizeMaterial(entry, recipeId, index) {
  const rawItemId = firstValue(entry, ["ItemId", "ItemID", "Item_Id", "MaterialId", "MaterialID"]);
  const itemId = optionalId(rawItemId);
  const count = optionalNumber(entry, ["Count", "ItemCount", "MaterialCount"], `${recipeId}.Materials[${index}].Count`);
  if (isNoneId(rawItemId)) return undefined;
  if (!itemId && (count === undefined || count === 0)) return undefined;
  assert(itemId && count !== undefined && Number.isSafeInteger(count) && count > 0,
    `Incomplete material ${index + 1} in recipe ${recipeId}`);
  return { itemId, count };
}

function normalizeRecipeRow(id, row, table) {
  const productId = optionalId(firstValue(row,
    ["Product_Id", "Product_ID", "ProductId", "ProductID", "ProductItemId"]));
  assert(productId, `Missing Product_Id in recipe ${id}`);
  const productCount = requiredPositiveNumber(row,
    ["Product_Count", "ProductCount"], `${id}.Product_Count`);
  const workAmountRaw = optionalNumber(row, ["WorkAmount"], `${id}.WorkAmount`);
  assert(workAmountRaw !== undefined && workAmountRaw >= 0, `Missing or negative ${id}.WorkAmount`);
  const materials = [];
  for (let index = 1; index <= 5; index += 1) {
    const rawItemId = firstValue(row, [`Material${index}_Id`, `Material${index}_ID`, `Material${index}Id`]);
    const itemId = optionalId(rawItemId);
    const count = optionalNumber(row,
      [`Material${index}_Count`, `Material${index}Count`], `${id}.Material${index}_Count`);
    if (isNoneId(rawItemId)) continue;
    if (!itemId && (count === undefined || count === 0)) continue;
    assert(itemId && count !== undefined && Number.isSafeInteger(count) && count > 0,
      `Incomplete Material${index} in recipe ${id}`);
    materials.push({ itemId, count });
  }
  if (Array.isArray(row.Materials)) {
    for (const [index, entry] of row.Materials.entries()) {
      const material = normalizeMaterial(entry, id, index);
      if (material) materials.push(material);
    }
  }
  const materialIds = new Set();
  for (const material of materials) {
    assert(!materialIds.has(material.itemId), `Duplicate material ${material.itemId} in recipe ${id}`);
    materialIds.add(material.itemId);
  }
  const workableAttribute = normalizedEnumOrNumber(firstValue(row, ["WorkableAttribute"]));
  const unlockItemId = optionalId(firstValue(row, ["UnlockItemID", "UnlockItemId", "Unlock_Item_Id"]));
  const craftExpRate = optionalNumber(row, ["CraftExpRate"], `${id}.CraftExpRate`);
  const energyType = normalizedEnum(firstValue(row, ["EnergyType"]));
  const energyAmount = optionalNumber(row, ["EnergyAmount"], `${id}.EnergyAmount`);
  return {
    id,
    sourceTable: table.sourceTable,
    sourceAsset: table.asset,
    product: { itemId: productId, count: productCount },
    materials,
    workAmountRaw,
    baseSeconds: workAmountRaw / 100,
    ...(workableAttribute ? { workableAttribute } : {}),
    ...(unlockItemId ? { unlockItemId } : {}),
    ...(craftExpRate !== undefined ? { craftExpRate } : {}),
    ...(energyType ? { energyType } : {}),
    ...(energyAmount !== undefined ? { energyAmount } : {}),
  };
}

function normalizeRecipes(recipeTables) {
  const recipes = new Map();
  let overriddenRows = 0;
  for (const table of [...recipeTables].sort((left, right) => tablePriority(left) - tablePriority(right))) {
    for (const [id, row] of Object.entries(table.rows)) {
      if (recipes.has(id)) overriddenRows += 1;
      recipes.set(id, normalizeRecipeRow(id, row, table));
    }
  }
  return {
    recipes: [...recipes.values()].sort((left, right) => left.id.localeCompare(right.id)),
    overriddenRows,
  };
}

const recipeReferenceKeys = new Set([
  "RecipeID", "RecipeId", "Recipe_ID", "RecipeName", "RecipeRow", "RecipeRowName",
  "UnlockRecipeID", "UnlockRecipeId", "UnlockRecipeName",
  "RecipeIDs", "RecipeIds", "RecipeIDList", "RecipeIdList", "UnlockRecipeIDs", "UnlockRecipeIds",
  "UnlockItemRecipe", "UnlockItemRecipes",
]);

function idsIn(value) {
  const direct = optionalId(value);
  if (direct) return [direct];
  if (Array.isArray(value)) return value.flatMap(idsIn);
  if (isObject(value)) return Object.values(value).flatMap(idsIn);
  return [];
}

function metadataValue(node, rootRow, keys) {
  return firstValue(node, keys) ?? firstValue(rootRow, keys);
}

function collectTechnologyUnlocks(tables) {
  const effective = effectiveRows(tables);
  const unlocks = [];
  for (const [technologyId, { row: rootRow, table }] of effective.rows) {
      const visit = (node, path) => {
        if (Array.isArray(node)) return node.forEach((entry, index) => visit(entry, `${path}[${index}]`));
        if (!isObject(node)) return;
        const refs = [];
        for (const [key, value] of Object.entries(node))
          if (recipeReferenceKeys.has(key)) refs.push(...idsIn(value));
        for (const recipeId of new Set(refs)) {
          const level = optionalNumber({ value: metadataValue(node, rootRow,
            ["Level", "TechnologyLevel", "UnlockLevel", "LevelCap"]) }, ["value"], `${technologyId}.Level`);
          const technologyPoints = optionalNumber({ value: metadataValue(node, rootRow,
            ["TechnologyPoint", "TechnologyPointCost", "NeedTechnologyPoint", "Cost"]) }, ["value"],
          `${technologyId}.TechnologyPoint`);
          const kind = normalizedEnum(metadataValue(node, rootRow,
            ["TechnologyType", "Type", "Category"]));
          const tier = optionalNumber({ value: metadataValue(node, rootRow, ["Tier"]) },
            ["value"], `${technologyId}.Tier`);
          const bossTechnology = optionalBoolean({ value: metadataValue(node, rootRow,
            ["IsBossTechnology", "bBossTechnology"]) }, ["value"], `${technologyId}.IsBossTechnology`);
          const requiredTechnologyId = optionalId(metadataValue(node, rootRow, ["RequireTechnology"]));
          const requiredResearchId = optionalId(metadataValue(node, rootRow, ["RequireResearchId"]));
          const requiredBossType = normalizedEnum(metadataValue(node, rootRow, ["RequireDefeatTowerBoss"]));
          const nameMessageId = optionalId(metadataValue(node, rootRow, ["Name", "NameMsgID"]));
          const descriptionMessageId = optionalId(metadataValue(node, rootRow,
            ["Description", "DescriptionMsgID"]));
          const iconId = optionalId(metadataValue(node, rootRow, ["IconName", "IconId"]));
          unlocks.push({
            technologyId,
            recipeId,
            sourceTable: table.sourceTable,
            sourceAsset: table.asset,
            entryPath: path,
            ...(level !== undefined ? { level } : {}),
            ...(technologyPoints !== undefined ? { technologyPoints } : {}),
            ...(kind ? { kind } : {}),
            ...(tier !== undefined ? { tier } : {}),
            ...(bossTechnology !== undefined ? { bossTechnology } : {}),
            ...(requiredTechnologyId ? { requiredTechnologyId } : {}),
            ...(requiredResearchId ? { requiredResearchId } : {}),
            ...(requiredBossType ? { requiredBossType } : {}),
            ...(nameMessageId ? { nameMessageId } : {}),
            ...(descriptionMessageId ? { descriptionMessageId } : {}),
            ...(iconId ? { iconId } : {}),
          });
        }
        for (const [key, value] of Object.entries(node))
          if (!recipeReferenceKeys.has(key) && value !== null && typeof value === "object")
            visit(value, `${path}.${key}`);
      };
    visit(rootRow, technologyId);
  }
  const seen = new Set();
  const records = unlocks.filter((unlock) => {
    const signature = JSON.stringify(unlock);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  }).sort((left, right) => left.recipeId.localeCompare(right.recipeId)
    || left.technologyId.localeCompare(right.technologyId));
  return { records, overriddenRows: effective.overriddenRows };
}

const shopItemKeys = new Set([
  "StaticItemId", "StaticItemID", "ItemId", "ItemID", "ProductItemId", "ProductItemID", "Product_Id",
]);

function collectShopOffers(tables) {
  const effective = effectiveRows(tables);
  const offers = [];
  for (const [shopId, { row: rootRow, table }] of effective.rows) {
      const visit = (node, path) => {
        if (Array.isArray(node)) return node.forEach((entry, index) => visit(entry, `${path}[${index}]`));
        if (!isObject(node)) return;
        const itemIds = [];
        for (const [key, value] of Object.entries(node))
          if (shopItemKeys.has(key)) itemIds.push(...idsIn(value));
        for (const itemId of new Set(itemIds)) {
          const numeric = (keys, label) => optionalNumber({ value: metadataValue(node, rootRow, keys) },
            ["value"], `${shopId}.${label}`);
          const currencyType = normalizedEnum(metadataValue(node, rootRow, ["CurrencyType", "Currency"]));
          const productType = normalizedEnum(metadataValue(node, rootRow, ["ProductType"]));
          offers.push({
            shopId,
            itemId,
            sourceTable: table.sourceTable,
            sourceAsset: table.asset,
            entryPath: path,
            ...(numeric(["OverridePrice"], "OverridePrice") !== undefined
              ? { overridePrice: numeric(["OverridePrice"], "OverridePrice") } : {}),
            ...(numeric(["Price"], "Price") !== undefined ? { price: numeric(["Price"], "Price") } : {}),
            ...(numeric(["BuyRate"], "BuyRate") !== undefined ? { buyRate: numeric(["BuyRate"], "BuyRate") } : {}),
            ...(numeric(["SellRate"], "SellRate") !== undefined ? { sellRate: numeric(["SellRate"], "SellRate") } : {}),
            ...(numeric(["Stock", "StockNum", "StockCount"], "Stock") !== undefined
              ? { stock: numeric(["Stock", "StockNum", "StockCount"], "Stock") } : {}),
            ...(currencyType ? { currencyType } : {}),
            ...(productType ? { productType } : {}),
            ...(numeric(["ProductNum", "ProductCount"], "ProductNum") !== undefined
              ? { productCount: numeric(["ProductNum", "ProductCount"], "ProductNum") } : {}),
          });
        }
        for (const [key, value] of Object.entries(node))
          if (!shopItemKeys.has(key) && value !== null && typeof value === "object")
            visit(value, `${path}.${key}`);
      };
    visit(rootRow, shopId);
  }
  const seen = new Set();
  const records = offers.filter((offer) => {
    const signature = JSON.stringify(offer);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  }).sort((left, right) => left.itemId.localeCompare(right.itemId) || left.shopId.localeCompare(right.shopId));
  return { records, overriddenRows: effective.overriddenRows };
}

function observedRowFields(tables) {
  return [...new Set(tables.flatMap((table) => Object.values(table.rows)
    .flatMap((row) => isObject(row) ? Object.keys(row) : [])))].sort().slice(0, 30).join(", ") || "(none)";
}

function cycleComponents(recipes) {
  const products = new Set(recipes.map((recipe) => recipe.product.itemId));
  const graph = new Map([...products].map((id) => [id, new Set()]));
  for (const recipe of recipes)
    for (const material of recipe.materials)
      if (products.has(material.itemId)) graph.get(recipe.product.itemId).add(material.itemId);
  let nextIndex = 0;
  const indices = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];
  const connect = (node) => {
    indices.set(node, nextIndex);
    low.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);
    for (const target of graph.get(node)) {
      if (!indices.has(target)) {
        connect(target);
        low.set(node, Math.min(low.get(node), low.get(target)));
      } else if (onStack.has(target)) low.set(node, Math.min(low.get(node), indices.get(target)));
    }
    if (low.get(node) !== indices.get(node)) return;
    const component = [];
    let current;
    do {
      current = stack.pop();
      onStack.delete(current);
      component.push(current);
    } while (current !== node);
    component.sort();
    if (component.length > 1 || graph.get(component[0]).has(component[0])) components.push(component);
  };
  for (const node of [...products].sort()) if (!indices.has(node)) connect(node);
  return components.sort((left, right) => left[0].localeCompare(right[0]));
}

async function attachIcons(items, iconsDirectory) {
  if (!iconsDirectory) return;
  const directory = resolve(iconsDirectory);
  await access(directory).catch(() => { throw new Error(`Item icon directory does not exist: ${directory}`); });
  const filenames = new Map((await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile()).map((entry) => [entry.name.toLowerCase(), entry.name]));
  for (const item of items) {
    const filename = [...new Set([item.iconId, item.id].filter(Boolean))]
      .flatMap((id) => ["webp", "png"].map((extension) => `${id}.${extension}`))
      .map((candidate) => filenames.get(candidate.toLowerCase()))
      .find(Boolean);
    if (filename) item.icon = `/item-icons/${filename}`;
  }
}

function caseInsensitiveIndex(ids, label) {
  const index = new Map();
  for (const id of ids) {
    const folded = id.toLowerCase();
    const existing = index.get(folded);
    assert(!existing || existing === id, `Case-insensitive ${label} ID collision: ${existing} / ${id}`);
    index.set(folded, id);
  }
  return index;
}

function canonicalizeReference(record, key, index, correction) {
  const source = record[key];
  if (typeof source !== "string") return;
  const canonical = index.get(source.toLowerCase());
  if (!canonical || canonical === source) return;
  record[key] = canonical;
  record[`source${key[0].toUpperCase()}${key.slice(1)}`] = source;
  correction(source, canonical);
}

function sourceSummary(tables, options) {
  const all = Object.values(tables).flat();
  return {
    gameVersion: options.gameVersion ?? PINNED_GAME_VERSION,
    gameBuildId: options.gameBuildId ?? PINNED_BUILD_ID,
    gamePak: "Pal-Windows.pak",
    extractor: {
      name: "CUE4Parse",
      version: "1.2.2.202607",
      repo: "FabianFG/CUE4Parse",
      commit: "ecad882a3049df6f27e0c5c3a3531346305c010b",
    },
    mapping: {
      repo: "PalModding/UtililityFiles",
      commit: "455de2110d8414f703699204f33cb6ac052a3f98",
      sha256: options.mappingSha256 ?? PINNED_MAPPING_SHA256,
    },
    rawTables: all.map((table) => ({
      kind: table.kind,
      ...(table.locale ? { locale: table.locale } : {}),
      asset: table.asset,
      sourceTable: table.sourceTable,
      file: table.file,
      rows: table.rowCount,
      sha256: table.sha256,
    })).sort((left, right) => left.kind.localeCompare(right.kind) || left.file.localeCompare(right.file)),
    workAmount: { rawUnitsPerBaseSecond: 100 },
    ...(options.sellPriceDivisor !== undefined
      ? { baseSellPrice: {
        formula: `floor(priceRaw / ${options.sellPriceDivisor})`,
        divisor: options.sellPriceDivisor,
        rounding: "floor",
      } }
      : { baseSellPrice: { formula: null, reason: "No --sell-price-divisor was supplied; no sale-price formula was guessed." } }),
  };
}

export async function normalizeItemTables(tables, options = {}) {
  if (options.sellPriceDivisor !== undefined)
    assert(Number.isFinite(options.sellPriceDivisor) && options.sellPriceDivisor > 0,
      "--sell-price-divisor must be a positive number");
  const itemResult = normalizeItems(tables.items, tables.staticItems ?? [], tables.names, tables.descriptions, options);
  const recipeResult = normalizeRecipes(tables.recipes);
  const technologyResult = collectTechnologyUnlocks(tables.technology);
  const shopResult = collectShopOffers(tables.shops);
  const technologyUnlocks = technologyResult.records;
  const shopOffers = shopResult.records;
  assert(tables.technology.every((table) => table.rowCount === 0) || technologyUnlocks.length > 0,
    `Technology tables contained rows but no supported recipe reference field. Expected RecipeID/RecipeId/RecipeName/RecipeRowName/UnlockRecipeID (including list forms). Observed row fields: ${observedRowFields(tables.technology)}`);
  assert(tables.shops.every((table) => table.rowCount === 0) || shopOffers.length > 0,
    `Shop tables contained rows but no supported item reference field. Expected StaticItemId/ItemId/ProductItemId/Product_Id. Observed row fields: ${observedRowFields(tables.shops)}`);
  await attachIcons(itemResult.items, options.iconsDirectory);

  const itemIds = new Set(itemResult.items.map((item) => item.id));
  const recipeIds = new Set(recipeResult.recipes.map((recipe) => recipe.id));
  const canonicalItemIds = caseInsensitiveIndex(itemIds, "item");
  const canonicalRecipeIds = caseInsensitiveIndex(recipeIds, "recipe");
  const referenceCorrections = [];
  for (const recipe of recipeResult.recipes) {
    canonicalizeReference(recipe.product, "itemId", canonicalItemIds, (source, canonical) =>
      referenceCorrections.push({ kind: "recipeProduct", ownerId: recipe.id, source, canonical }));
    for (const material of recipe.materials)
      canonicalizeReference(material, "itemId", canonicalItemIds, (source, canonical) =>
        referenceCorrections.push({ kind: "recipeMaterial", ownerId: recipe.id, source, canonical }));
    if (recipe.unlockItemId) canonicalizeReference(recipe, "unlockItemId", canonicalItemIds,
      (source, canonical) => referenceCorrections.push({
        kind: "recipeUnlockItem", ownerId: recipe.id, source, canonical,
      }));
  }
  for (const unlock of technologyUnlocks)
    canonicalizeReference(unlock, "recipeId", canonicalRecipeIds, (source, canonical) =>
      referenceCorrections.push({ kind: "technologyRecipe", ownerId: unlock.technologyId, source, canonical }));
  for (const offer of shopOffers)
    canonicalizeReference(offer, "itemId", canonicalItemIds, (source, canonical) =>
      referenceCorrections.push({ kind: "shopItem", ownerId: offer.shopId, source, canonical }));
  const unlocksByRecipe = new Map();
  for (const unlock of technologyUnlocks)
    unlocksByRecipe.set(unlock.recipeId, [...(unlocksByRecipe.get(unlock.recipeId) ?? []), unlock]);
  for (const recipe of recipeResult.recipes) {
    const unlocks = unlocksByRecipe.get(recipe.id);
    if (unlocks?.length) recipe.technologyUnlocks = unlocks;
  }
  const offersByItem = new Map();
  for (const offer of shopOffers)
    offersByItem.set(offer.itemId, [...(offersByItem.get(offer.itemId) ?? []), offer]);
  for (const item of itemResult.items) {
    const offers = offersByItem.get(item.id);
    if (offers?.length) item.shopOffers = offers;
  }
  const recipesByProduct = {};
  for (const recipe of recipeResult.recipes)
    (recipesByProduct[recipe.product.itemId] ??= []).push(recipe.id);
  for (const ids of Object.values(recipesByProduct)) ids.sort();
  const cycles = cycleComponents(recipeResult.recipes);
  const unresolvedItemRefs = [...new Set(recipeResult.recipes.flatMap((recipe) => [
    recipe.product.itemId, ...recipe.materials.map((material) => material.itemId),
  ]).filter((id) => !itemIds.has(id)))].sort();
  const unresolvedTechnologyRecipeRefs = [...new Set(technologyUnlocks
    .map((unlock) => unlock.recipeId).filter((id) => !recipeIds.has(id)))].sort();
  const unresolvedShopItemRefs = [...new Set(shopOffers
    .map((offer) => offer.itemId).filter((id) => !itemIds.has(id)))].sort();
  const localized = (locale) => itemResult.items.filter((item) => item.names[locale]).length;
  const counts = {
    items: itemResult.items.length,
    recipes: recipeResult.recipes.length,
    recipeProducts: Object.keys(recipesByProduct).length,
    alternateRecipeProducts: Object.values(recipesByProduct).filter((ids) => ids.length > 1).length,
    technologyUnlocks: technologyUnlocks.length,
    shopOffers: shopOffers.length,
    localizedNames: { zh: localized("zh"), en: localized("en"), ja: localized("ja") },
    icons: itemResult.items.filter((item) => item.icon).length,
    cycles: cycles.length,
    unresolvedItemRefs: unresolvedItemRefs.length,
    unresolvedTechnologyRecipeRefs: unresolvedTechnologyRecipeRefs.length,
    unresolvedShopItemRefs: unresolvedShopItemRefs.length,
    canonicalizedReferences: referenceCorrections.length,
    overriddenItemRows: itemResult.overriddenRows,
    staticItemRows: itemResult.staticItemRows,
    overriddenRecipeRows: recipeResult.overriddenRows,
    overriddenTechnologyRows: technologyResult.overriddenRows,
    overriddenShopRows: shopResult.overriddenRows,
  };
  const snapshot = {
    schemaVersion: ITEM_DATA_SCHEMA_VERSION,
    source: sourceSummary(tables, options),
    counts,
    diagnostics: {
      unresolvedItemRefs, unresolvedTechnologyRecipeRefs, unresolvedShopItemRefs, referenceCorrections,
    },
    items: itemResult.items,
    recipes: recipeResult.recipes,
    recipesByProduct,
    cycles,
    technologyUnlocks,
    shopOffers,
  };
  validateItemSnapshot(snapshot);
  return snapshot;
}

export function validateItemSnapshot(snapshot) {
  assert(snapshot.schemaVersion === ITEM_DATA_SCHEMA_VERSION, "Unexpected item-data schema version");
  assert(Array.isArray(snapshot.items) && snapshot.items.length > 0, "Item snapshot is empty");
  assert(Array.isArray(snapshot.recipes) && snapshot.recipes.length > 0, "Recipe snapshot is empty");
  const itemIds = new Set(snapshot.items.map((item) => item.id));
  const recipeIds = new Set(snapshot.recipes.map((recipe) => recipe.id));
  assert(itemIds.size === snapshot.items.length, "Duplicate normalized item ID");
  assert(recipeIds.size === snapshot.recipes.length, "Duplicate normalized recipe ID");
  for (const item of snapshot.items) {
    assert(typeof item.id === "string" && item.id.length > 0, "Invalid item ID");
    assert(isObject(item.names), `Missing names object: ${item.id}`);
    if (item.priceRaw !== undefined) assert(Number.isFinite(item.priceRaw), `Invalid priceRaw: ${item.id}`);
    if (item.baseSellPrice !== undefined)
      assert(Number.isFinite(item.baseSellPrice), `Invalid baseSellPrice: ${item.id}`);
    if (item.icon !== undefined)
      assert([...new Set([item.iconId, item.id].filter(Boolean))]
        .flatMap((id) => [`/item-icons/${id}.webp`, `/item-icons/${id}.png`])
        .map((path) => path.toLowerCase()).includes(item.icon.toLowerCase()),
      `Unexpected item icon path: ${item.id}`);
  }
  for (const recipe of snapshot.recipes) {
    assert(recipe.product?.itemId && Number.isSafeInteger(recipe.product.count) && recipe.product.count > 0,
      `Invalid product: ${recipe.id}`);
    assert(Number.isFinite(recipe.workAmountRaw) && recipe.workAmountRaw >= 0, `Invalid work amount: ${recipe.id}`);
    assert(recipe.baseSeconds === recipe.workAmountRaw / 100, `Invalid base seconds: ${recipe.id}`);
    assert(Array.isArray(recipe.materials) && recipe.materials.every((material) =>
      material.itemId && Number.isSafeInteger(material.count) && material.count > 0), `Invalid materials: ${recipe.id}`);
  }
  const expectedByProduct = {};
  for (const recipe of snapshot.recipes) (expectedByProduct[recipe.product.itemId] ??= []).push(recipe.id);
  for (const ids of Object.values(expectedByProduct)) ids.sort();
  assert(JSON.stringify(snapshot.recipesByProduct) === JSON.stringify(expectedByProduct),
    "recipesByProduct does not match normalized recipes");
  assert(snapshot.counts.items === snapshot.items.length, "Item count mismatch");
  assert(snapshot.counts.recipes === snapshot.recipes.length, "Recipe count mismatch");
  return snapshot;
}

export function validatePublicItemData(itemsDocument, recipesDocument) {
  assert(itemsDocument.schemaVersion === ITEM_DATA_SCHEMA_VERSION,
    "Unexpected public items.json schema version");
  assert(recipesDocument.schemaVersion === ITEM_DATA_SCHEMA_VERSION,
    "Unexpected public recipes.json schema version");
  assert(itemsDocument.gameVersion === recipesDocument.gameVersion
    && itemsDocument.gameBuildId === recipesDocument.gameBuildId,
  "items.json and recipes.json identify different game builds");
  const snapshot = {
    schemaVersion: ITEM_DATA_SCHEMA_VERSION,
    source: itemsDocument.source,
    counts: {
      items: itemsDocument.counts?.items,
      recipes: recipesDocument.counts?.recipes,
    },
    items: itemsDocument.items,
    recipes: recipesDocument.recipes,
    recipesByProduct: recipesDocument.recipesByProduct,
  };
  validateItemSnapshot(snapshot);
  const expectedCycles = cycleComponents(recipesDocument.recipes);
  assert(JSON.stringify(recipesDocument.cycles) === JSON.stringify(expectedCycles),
    "Public recipe cycles do not match the recipe graph");
  const shopOfferCount = itemsDocument.items.reduce((total, item) => total + (item.shopOffers?.length ?? 0), 0);
  const technologyUnlockCount = recipesDocument.recipes
    .reduce((total, recipe) => total + (recipe.technologyUnlocks?.length ?? 0), 0);
  assert(itemsDocument.counts.shopOffers >= shopOfferCount,
    "Public item shop-offer count is smaller than attached offers");
  assert(recipesDocument.counts.technologyUnlocks >= technologyUnlockCount,
    "Public technology-unlock count is smaller than attached unlocks");
  const rawKinds = new Set(itemsDocument.source?.rawTables?.map((table) => table.kind));
  for (const kind of ["items", "recipes", "technology", "shops"])
    assert(rawKinds.has(kind), `Public source metadata is missing ${kind} tables`);
  return { items: itemsDocument.items.length, recipes: recipesDocument.recipes.length };
}

function publicDocuments(snapshot) {
  const common = {
    schemaVersion: snapshot.schemaVersion,
    gameVersion: snapshot.source.gameVersion,
    gameBuildId: snapshot.source.gameBuildId,
    source: snapshot.source,
  };
  return {
    items: {
      ...common,
      counts: {
        items: snapshot.counts.items,
        localizedNames: snapshot.counts.localizedNames,
        icons: snapshot.counts.icons,
        shopOffers: snapshot.counts.shopOffers,
        unresolvedShopItemRefs: snapshot.counts.unresolvedShopItemRefs,
      },
      items: snapshot.items,
    },
    recipes: {
      ...common,
      counts: {
        recipes: snapshot.counts.recipes,
        products: snapshot.counts.recipeProducts,
        alternateRecipeProducts: snapshot.counts.alternateRecipeProducts,
        technologyUnlocks: snapshot.counts.technologyUnlocks,
        cycles: snapshot.counts.cycles,
        unresolvedItemRefs: snapshot.counts.unresolvedItemRefs,
        unresolvedTechnologyRecipeRefs: snapshot.counts.unresolvedTechnologyRecipeRefs,
      },
      recipes: snapshot.recipes,
      recipesByProduct: snapshot.recipesByProduct,
      cycles: snapshot.cycles,
    },
  };
}

export async function writeItemSnapshot(snapshot, options = {}) {
  const snapshotOutput = resolve(options.snapshotOutput
    ?? resolve(root, "scripts/vendor/palworld/items-v1.json"));
  const publicDirectory = resolve(options.publicDirectory ?? resolve(root, "public/data"));
  await Promise.all([mkdir(dirname(snapshotOutput), { recursive: true }), mkdir(publicDirectory, { recursive: true })]);
  let iconsPublicDirectory;
  if (options.iconsSourceDirectory) {
    iconsPublicDirectory = resolve(options.iconsPublicDirectory ?? resolve(dirname(publicDirectory), "item-icons"));
    await mkdir(iconsPublicDirectory, { recursive: true });
    const filenames = new Set(snapshot.items.filter((item) => item.icon)
      .map((item) => item.icon.split("/").at(-1)));
    const existingIcons = await readdir(iconsPublicDirectory, { withFileTypes: true });
    await Promise.all(existingIcons.filter((entry) => entry.isFile()
      && /\.(?:png|webp)$/i.test(entry.name) && !filenames.has(entry.name))
      .map((entry) => unlink(resolve(iconsPublicDirectory, entry.name))));
    await Promise.all([...filenames].map((filename) =>
      copyFile(resolve(options.iconsSourceDirectory, filename), resolve(iconsPublicDirectory, filename))));
  }
  const snapshotBytes = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`);
  await writeFile(snapshotOutput, snapshotBytes);
  const documents = publicDocuments(snapshot);
  await Promise.all([
    writeFile(resolve(publicDirectory, "items.json"), `${JSON.stringify(documents.items)}\n`),
    writeFile(resolve(publicDirectory, "recipes.json"), `${JSON.stringify(documents.recipes)}\n`),
  ]);
  return { snapshotOutput, publicDirectory, iconsPublicDirectory, snapshotSha256: sha256(snapshotBytes) };
}

function usage() {
  return `Usage: node scripts/import-item-snapshot.mjs <raw-unpack-directory> [options]

Required tables (auto-discovered recursively, or pass the matching option):
  DT_ItemDataTable, DT_ItemRecipeDataTable(_Common),
  DT_TechnologyRecipeUnlock(_Common), DT_ItemShopCreateData(_Common)

Options:
  --item-table <path>             Repeatable explicit item DataTable
  --static-item-asset <path>      Repeatable DA_StaticItemDataAsset export
  --recipe-table <path>           Repeatable explicit recipe DataTable
  --technology-table <path>       Repeatable explicit technology DataTable
  --shop-table <path>             Repeatable explicit shop DataTable
  --name-table <locale>=<path>    Repeatable localized item-name DataTable
  --description-table <locale>=<path>
  --icons-dir <path>              Copy <item-id>.webp/png files (WebP preferred)
  --sell-price-divisor <number>   Explicitly derive baseSellPrice; omitted by default
  --snapshot-output <path>        Default scripts/vendor/palworld/items-v1.json
  --public-dir <path>             Default public/data
  --game-version <version>        Default 1.0
  --game-build-id <id>            Default 24088745
  --mapping-sha256 <hash>         Default pinned Palworld 1.0 mapping hash
  --dry-run                       Validate and print counts without writing files`;
}

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      "item-table": { type: "string", multiple: true },
      "static-item-asset": { type: "string", multiple: true },
      "recipe-table": { type: "string", multiple: true },
      "technology-table": { type: "string", multiple: true },
      "shop-table": { type: "string", multiple: true },
      "name-table": { type: "string", multiple: true },
      "description-table": { type: "string", multiple: true },
      "icons-dir": { type: "string" },
      "sell-price-divisor": { type: "string" },
      "snapshot-output": { type: "string" },
      "public-dir": { type: "string" },
      "game-version": { type: "string" },
      "game-build-id": { type: "string" },
      "mapping-sha256": { type: "string" },
      "dry-run": { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(usage());
    return;
  }
  assert(positionals.length === 1, usage());
  const sellPriceDivisor = values["sell-price-divisor"] === undefined
    ? undefined : Number(values["sell-price-divisor"]);
  const rawOptions = {
    itemTables: values["item-table"],
    staticItemAssets: values["static-item-asset"],
    recipeTables: values["recipe-table"],
    technologyTables: values["technology-table"],
    shopTables: values["shop-table"],
    nameTables: values["name-table"],
    descriptionTables: values["description-table"],
  };
  const normalizeOptions = {
    gameVersion: values["game-version"] ?? PINNED_GAME_VERSION,
    gameBuildId: values["game-build-id"] ?? PINNED_BUILD_ID,
    mappingSha256: values["mapping-sha256"] ?? PINNED_MAPPING_SHA256,
    iconsDirectory: values["icons-dir"],
    sellPriceDivisor,
  };
  const tables = await loadItemRawDirectory(positionals[0], rawOptions);
  const snapshot = await normalizeItemTables(tables, normalizeOptions);
  if (!values["dry-run"]) {
    const written = await writeItemSnapshot(snapshot, {
      snapshotOutput: values["snapshot-output"],
      publicDirectory: values["public-dir"],
      iconsSourceDirectory: values["icons-dir"],
    });
    console.log(`Wrote ${snapshot.counts.items} items and ${snapshot.counts.recipes} recipes.`);
    console.log(`Snapshot: ${written.snapshotOutput}`);
    console.log(`Public data: ${written.publicDirectory}`);
  } else console.log(JSON.stringify(snapshot.counts, null, 2));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((error) => {
  console.error(`Item import failed: ${error.message}`);
  process.exitCode = 1;
});
