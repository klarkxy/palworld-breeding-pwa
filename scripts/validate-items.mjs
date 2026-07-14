import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validatePublicItemData } from "./import-item-snapshot.mjs";

const directory = resolve(process.argv[2] ?? "public/data");
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
  const [items, recipes] = await Promise.all([readJson("items.json"), readJson("recipes.json")]);
  const counts = validatePublicItemData(items, recipes);
  console.log(`Validated ${counts.items} items and ${counts.recipes} recipes.`);
} catch (error) {
  console.error(`Item-data validation failed: ${error.message}`);
  process.exitCode = 1;
}
