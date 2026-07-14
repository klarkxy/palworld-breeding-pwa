#!/usr/bin/env python3
"""Generate the checked-in Palworld 1.0 data bundle from pinned snapshots."""

from __future__ import annotations

import hashlib
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "scripts" / "vendor"
DATA = ROOT / "public" / "data"
ICONS = ROOT / "public" / "icons"
ITEM_ICONS = ROOT / "public" / "item-icons"
EXPECTED_PALS = 306
EXPECTED_RULES = 46_972
EXPECTED_ACTIVE_SKILLS = 320
EXPECTED_PARTNER_SKILLS = 288
EXPECTED_PASSIVE_SOURCE_ROWS = 1_905
EXPECTED_PASSIVE_SKILLS = 115
EXPECTED_RANDOMLY_AVAILABLE_PASSIVE_SKILLS = 85
EXPECTED_PASSIVE_RANKS = {-3: 3, -2: 2, -1: 10, 1: 36, 2: 2, 3: 31, 4: 24, 5: 7}
EXPECTED_SURGERY_PASSIVE_SKILLS = 33
EXPECTED_SURGERY_ITEM_PASSIVE_SKILLS = 35
EXPECTED_GUARANTEED_PASSIVE_SKILLS = 23
EXPECTED_GUARANTEED_PASSIVE_ASSIGNMENTS = 53
EXPECTED_REFINEMENT_TABLE_RANKED = 270
EXPECTED_REFINEMENT_TABLE_CHANGED = 258
EXPECTED_ITEMS = 2_466
EXPECTED_LEGAL_ITEMS = 1_891
EXPECTED_ITEM_RECIPES = 1_414
EXPECTED_ITEM_RECIPE_PRODUCTS = 1_399
EXPECTED_ALTERNATE_ITEM_RECIPE_PRODUCTS = 4
EXPECTED_ITEM_TECHNOLOGY_UNLOCKS = 383
EXPECTED_ITEM_SHOP_OFFERS = 587
EXPECTED_ITEM_LOCALIZED_NAMES = 2_438
EXPECTED_ITEM_ICON_RECORDS = 2_456
EXPECTED_ITEM_ICON_FILES = 929
EXPECTED_ITEM_CYCLES = 2
EXPECTED_ITEM_REFERENCE_CORRECTIONS = 10
EXPECTED_ITEM_DROP_SOURCE_ROWS = 790
EXPECTED_ITEM_DROP_EDGES = 2_645
EXPECTED_ITEM_DROP_ITEMS = 148
EXPECTED_ITEM_DROP_CAPTURE_INELIGIBLE_EDGES = 32
EXPECTED_ITEM_DROP_REFERENCE_CORRECTIONS = 2
EXPECTED_CHEST_FIELDS = 109
EXPECTED_CHEST_POOLS = 250
EXPECTED_CHEST_POSITIVE_ENTRIES = 3_523
EXPECTED_CHEST_DROP_EDGES = 3_504
EXPECTED_CHEST_DROP_ITEMS = 647
EXPECTED_CHEST_SOURCES = 170
EXPECTED_SAVEPAL_GAP = {"DarkMutant"}
MOVEMENT_FIELDS = (
    "slowWalkSpeed",
    "walkSpeed",
    "runSpeed",
    "rideSprintSpeed",
    "transportSpeed",
    "swimSpeed",
    "swimDashSpeed",
)
EXPECTED_MOVEMENT_TYPES = {
    "ground": 252,
    "fly": 21,
    "flyAndLanding": 7,
    "swim": 8,
}
EXPECTED_MOVEMENT_TYPE_GAPS = {
    "AmaterasuWolf_Dark_Quest_Friend",
    "POLICE_HawkBird",
    "POLICE_ThunderDog",
    "PREDATOR_FlowerRabbit_Quest",
    "YakushimaMonster001_Blue",
    "YakushimaMonster001_Pink",
    "YakushimaMonster001_Purple",
    "YakushimaMonster001_Rainbow",
    "YakushimaMonster001_Red",
}
EXPECTED_FLY_OVERRIDE_IDS = {
    "BlackGriffon",
    "DarkMechaDragon",
    "FairyDragon",
    "FairyDragon_Water",
    "SkyDragon",
    "SkyDragon_Grass",
}
EXPECTED_EMPTY_ACTIVE_SKILLS = {
    "GhostAnglerfish",
    "GhostAnglerfish_Fire",
    "LazyCatfish",
    "LazyCatfish_Gold",
}
ACTIVE_SKILL_ALIASES = {
    "Unique_PyramidTurtle_PyramidPress": "Unique_CubeTurtle_CubePress",
    "Unique_PyramidTurtle_Neutral_HolyPress": "Unique_CubeTurtle_Neutral_HolyPress",
}
EXPECTED_UNDESCRIBED_ACTIVE_SKILLS = {
    "PredatorBeam",
    "PredatorLockon",
    "PredatorWave",
}


def read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def pal_key(value: dict[str, Any]) -> tuple[int, bool]:
    return int(value["PalDexNo"]), bool(value["IsVariant"])


def json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode()


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def text_file_sha256(path: Path) -> str:
    """Hash checked-in text independently of Git's Windows line-ending checkout."""
    return sha256(path.read_bytes().replace(b"\r\n", b"\n"))


def icon_bundle_sha256(pals: list[dict[str, Any]]) -> str:
    digest = hashlib.sha256()
    for pal in sorted(pals, key=lambda value: value["id"]):
        path = ICONS / Path(pal["icon"]).name
        digest.update(path.name.encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
    return digest.hexdigest()


def item_icon_bundle_sha256(items: list[dict[str, Any]]) -> tuple[int, str]:
    referenced = sorted({Path(item["icon"]).name for item in items if item.get("icon")})
    actual = sorted(path.name for path in ITEM_ICONS.iterdir() if path.is_file())
    assert actual == referenced, "Item icon directory differs from normalized item references"
    digest = hashlib.sha256()
    for name in referenced:
        path = ITEM_ICONS / name
        digest.update(name.encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
    return len(referenced), digest.hexdigest()


def build_item_documents(
    snapshot: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], int, str]:
    assert snapshot["schemaVersion"] == 1
    assert snapshot["source"]["gameVersion"] == "1.0"
    assert snapshot["source"]["gameBuildId"] == "24088745"
    counts = snapshot["counts"]
    expected_counts = {
        "items": EXPECTED_ITEMS,
        "recipes": EXPECTED_ITEM_RECIPES,
        "recipeProducts": EXPECTED_ITEM_RECIPE_PRODUCTS,
        "alternateRecipeProducts": EXPECTED_ALTERNATE_ITEM_RECIPE_PRODUCTS,
        "technologyUnlocks": EXPECTED_ITEM_TECHNOLOGY_UNLOCKS,
        "shopOffers": EXPECTED_ITEM_SHOP_OFFERS,
        "icons": EXPECTED_ITEM_ICON_RECORDS,
        "cycles": EXPECTED_ITEM_CYCLES,
        "canonicalizedReferences": EXPECTED_ITEM_REFERENCE_CORRECTIONS,
    }
    for key, expected in expected_counts.items():
        assert counts[key] == expected, f"Unexpected item snapshot count {key}"
    assert counts["localizedNames"] == {
        "zh": EXPECTED_ITEM_LOCALIZED_NAMES,
        "en": EXPECTED_ITEM_LOCALIZED_NAMES,
        "ja": 0,
    }
    assert counts["unresolvedItemRefs"] == 0
    assert counts["unresolvedTechnologyRecipeRefs"] == 0
    assert counts["unresolvedShopItemRefs"] == 0
    assert snapshot["diagnostics"]["unresolvedItemRefs"] == []
    assert snapshot["diagnostics"]["unresolvedTechnologyRecipeRefs"] == []
    assert snapshot["diagnostics"]["unresolvedShopItemRefs"] == []
    assert len(snapshot["diagnostics"]["referenceCorrections"]) == EXPECTED_ITEM_REFERENCE_CORRECTIONS

    items = snapshot["items"]
    recipes = snapshot["recipes"]
    assert len(items) == EXPECTED_ITEMS
    assert len({item["id"] for item in items}) == len(items)
    assert len(recipes) == EXPECTED_ITEM_RECIPES
    assert len({recipe["id"] for recipe in recipes}) == len(recipes)
    legal_items = [item for item in items if item.get("flags", {}).get("legalInGame") is True]
    assert len(legal_items) == EXPECTED_LEGAL_ITEMS
    assert all(item["names"].get("zh") and item["names"].get("en") for item in legal_items)
    assert all(item.get("icon") for item in legal_items)
    assert all(
        item.get("baseSellPrice") == item["priceRaw"] // 10
        for item in items
        if item.get("priceRaw", -1) >= 0
    )
    item_icon_files, item_icon_hash = item_icon_bundle_sha256(items)
    assert item_icon_files == EXPECTED_ITEM_ICON_FILES

    common = {
        "schemaVersion": snapshot["schemaVersion"],
        "gameVersion": snapshot["source"]["gameVersion"],
        "gameBuildId": snapshot["source"]["gameBuildId"],
        "source": snapshot["source"],
    }
    items_document = {
        **common,
        "counts": {
            "items": counts["items"],
            "localizedNames": counts["localizedNames"],
            "icons": counts["icons"],
            "shopOffers": counts["shopOffers"],
            "unresolvedShopItemRefs": counts["unresolvedShopItemRefs"],
        },
        "items": items,
    }
    recipes_document = {
        **common,
        "counts": {
            "recipes": counts["recipes"],
            "products": counts["recipeProducts"],
            "alternateRecipeProducts": counts["alternateRecipeProducts"],
            "technologyUnlocks": counts["technologyUnlocks"],
            "cycles": counts["cycles"],
            "unresolvedItemRefs": counts["unresolvedItemRefs"],
            "unresolvedTechnologyRecipeRefs": counts["unresolvedTechnologyRecipeRefs"],
        },
        "recipes": recipes,
        "recipesByProduct": snapshot["recipesByProduct"],
        "cycles": snapshot["cycles"],
    }
    return items_document, recipes_document, item_icon_files, item_icon_hash


def build_item_drop_document(
    snapshot: dict[str, Any],
    chest_snapshot: dict[str, Any],
    items: list[dict[str, Any]],
    pal_ids: set[str],
) -> dict[str, Any]:
    assert snapshot["schemaVersion"] == 2
    assert snapshot["source"]["gameVersion"] == "1.0"
    assert snapshot["source"]["gameBuildId"] == "24088745"
    assert snapshot["source"]["mappingSha256"] == (
        "741798898aabf3da8803e26ff005a35052b33bd0c90d771aabbb5f2c367f7df7"
    )
    assert snapshot["source"]["rawTable"]["rows"] == 1_044
    assert snapshot["source"]["rawTable"]["sha256"] == (
        "a99ec796fa4aad683f12af836c41c43c211883d3766ad0be10ec8226f4da9e5c"
    )
    assert snapshot["source"]["monsterParameterTable"]["rows"] == 753
    assert snapshot["source"]["monsterParameterTable"]["sha256"] == (
        "f4e1ab7ac8c8b064d07d2967af16dbfca8f02181df273a5e872c79f957883644"
    )
    assert snapshot["source"]["palCatalogRows"] == 306
    assert snapshot["source"]["selectablePalRows"] == 288
    counts = snapshot["counts"]
    assert counts["rawSourceRows"] == 1_044
    assert counts["includedSourceRows"] == EXPECTED_ITEM_DROP_SOURCE_ROWS
    assert counts["excludedSourceRows"] == 254
    assert counts["rawMonsterParameterRows"] == 753
    assert counts["sourceRowsByType"] == {"normal": 417, "alpha": 330, "predator": 43}
    assert counts["distinctDropPals"] == 288
    assert counts["palDropEdges"] == EXPECTED_ITEM_DROP_EDGES
    assert counts["distinctDropItems"] == EXPECTED_ITEM_DROP_ITEMS
    assert (
        counts["captureIneligibleEdges"]
        == EXPECTED_ITEM_DROP_CAPTURE_INELIGIBLE_EDGES
    )
    assert (
        counts["canonicalizedItemReferences"]
        == EXPECTED_ITEM_DROP_REFERENCE_CORRECTIONS
    )
    assert counts["unresolvedItemRefs"] == 0
    assert counts["chestDropEdges"] == 0
    assert snapshot["diagnostics"]["unresolvedItemRefs"] == []
    assert snapshot["diagnostics"]["excludedByReason"] == {
        "missingMonsterParameter": 204,
        "nonSelectableOrUnknownTribe": 24,
        "tribeOnlyAlias": 26,
    }
    assert len(snapshot["diagnostics"]["characterFNameCorrections"]) == 24
    assert len(snapshot["diagnostics"]["palFNameCorrections"]) == 23
    assert len(snapshot["diagnostics"]["monsterTribeMismatches"]) == 2
    assert len(snapshot["diagnostics"]["referenceCorrections"]) == (
        EXPECTED_ITEM_DROP_REFERENCE_CORRECTIONS
    )

    item_by_id = {item["id"]: item for item in items}
    assert len(item_by_id) == len(items)
    drops = snapshot["palDrops"]
    assert len(drops) == EXPECTED_ITEM_DROP_EDGES
    assert len({(drop["rowId"], drop["slot"]) for drop in drops}) == len(drops)
    assert {drop["sourceType"] for drop in drops} <= {"normal", "alpha", "predator"}
    assert all(drop["palId"] in pal_ids for drop in drops)
    assert all(drop["itemId"] in item_by_id for drop in drops)
    assert all(
        isinstance(drop["level"], int) and drop["level"] >= 0
        and isinstance(drop["slot"], int) and 1 <= drop["slot"] <= 10
        and 0 < drop["baseChancePercent"] <= 100
        and isinstance(drop["minQuantity"], int) and drop["minQuantity"] > 0
        and isinstance(drop["maxQuantity"], int)
        and drop["maxQuantity"] >= drop["minQuantity"]
        for drop in drops
    )
    assert all(
        drop["captureEligible"]
        == (item_by_id[drop["itemId"]].get("typeB") != "FoodMeat")
        for drop in drops
    )
    assert snapshot["chestDrops"] == []

    assert chest_snapshot["schemaVersion"] == 1
    assert chest_snapshot["source"]["gameVersion"] == "1.0"
    assert chest_snapshot["source"]["gameBuildId"] == "24088745"
    assert chest_snapshot["source"]["mappingSha256"] == (
        "741798898aabf3da8803e26ff005a35052b33bd0c90d771aabbb5f2c367f7df7"
    )
    chest_counts = chest_snapshot["counts"]
    expected_chest_counts = {
        "rawLotteryRows": 8_777,
        "rawFieldNames": 500,
        "classifiedFieldNames": EXPECTED_CHEST_FIELDS,
        "classifiedRawRows": 3_527,
        "positiveWeightEntries": EXPECTED_CHEST_POSITIVE_ENTRIES,
        "excludedNonPositiveWeightRows": 4,
        "fieldGradePools": EXPECTED_CHEST_POOLS,
        "poolItemSummaries": EXPECTED_CHEST_DROP_EDGES,
        "classifiedDistinctItems": 648,
        "distinctItems": EXPECTED_CHEST_DROP_ITEMS,
        "sources": EXPECTED_CHEST_SOURCES,
        "orphanPools": 0,
    }
    for key, expected in expected_chest_counts.items():
        assert chest_counts[key] == expected, f"Unexpected chest snapshot count {key}"
    assert chest_snapshot["diagnostics"]["unresolvedItemReferences"] == []
    assert chest_snapshot["diagnostics"]["orphanPoolIds"] == []

    pools = chest_snapshot["pools"]
    entries = chest_snapshot["entries"]
    sources = chest_snapshot["sources"]
    summaries = chest_snapshot["summary"]
    assert len(pools) == EXPECTED_CHEST_POOLS
    assert len(entries) == EXPECTED_CHEST_POSITIVE_ENTRIES
    assert len(sources) == EXPECTED_CHEST_SOURCES
    assert len(summaries) == EXPECTED_CHEST_DROP_EDGES
    pool_by_id = {pool["id"]: pool for pool in pools}
    entry_by_id = {entry["id"]: entry for entry in entries}
    assert len(pool_by_id) == len(pools)
    assert len(entry_by_id) == len(entries)
    assert len({pool["fieldName"] for pool in pools}) == EXPECTED_CHEST_FIELDS
    assert all(entry["itemId"] in item_by_id for entry in entries)
    assert all(entry["poolId"] in pool_by_id for entry in entries)
    assert all(entry["weight"] > 0 for entry in entries)
    assert all(
        entry["probabilityBasis"] == "conditionalOnGrade"
        and 0 <= entry["conditionalOnGradeChancePercent"] <= 100
        and entry["expectedQuantityPerOpen"] >= 0
        and isinstance(entry["minQuantity"], int)
        and entry["minQuantity"] > 0
        and isinstance(entry["maxQuantity"], int)
        and entry["maxQuantity"] >= entry["minQuantity"]
        for entry in entries
    )

    sources_by_field: dict[str, list[dict[str, Any]]] = {}
    for source in sources:
        assert source["fieldName"] in {pool["fieldName"] for pool in pools}
        assert source["probabilityBasis"] == "conditionalOnGrade"
        sources_by_field.setdefault(source["fieldName"], []).append(source)
    assert len(sources_by_field) == EXPECTED_CHEST_FIELDS

    public_sources = []
    for field_name in sorted(sources_by_field):
        field_sources = sorted(sources_by_field[field_name], key=lambda value: value["id"])
        field_pools = sorted(
            pool["id"] for pool in pools if pool["fieldName"] == field_name
        )
        pool_records = [pool_by_id[pool_id] for pool_id in field_pools]
        first_pool = pool_records[0]
        assert all(pool["sourceKind"] == first_pool["sourceKind"] for pool in pool_records)
        assert all(pool["labelZh"] == first_pool["labelZh"] for pool in pool_records)
        public_sources.append(
            {
                "id": f"field:{field_name}",
                "fieldName": field_name,
                "sourceKind": first_pool["sourceKind"],
                "labelZh": first_pool["labelZh"],
                "sourceLabel": first_pool["labelZh"],
                "probabilityBasis": "conditionalOnGrade",
                "gradeDistributionKnown": False,
                "poolIds": field_pools,
                "sourceRefs": [source["id"] for source in field_sources],
            }
        )

    public_source_by_field = {source["fieldName"]: source for source in public_sources}
    chest_drops = []
    seen_summaries: set[tuple[str, str]] = set()
    for summary in summaries:
        summary_key = (summary["poolId"], summary["itemId"])
        assert summary_key not in seen_summaries
        seen_summaries.add(summary_key)
        pool = pool_by_id[summary["poolId"]]
        assert summary["itemId"] in item_by_id
        assert summary["probabilityBasis"] == "conditionalOnGrade"
        assert 0 < summary["conditionalOnGradeChancePercent"] <= 100
        assert summary["expectedQuantityPerOpen"] > 0
        variants = [entry_by_id[entry_id] for entry_id in summary["variantIds"]]
        assert variants
        assert all(
            entry["poolId"] == summary["poolId"]
            and entry["itemId"] == summary["itemId"]
            for entry in variants
        )
        maximum_by_slot: dict[int, int] = {}
        for entry in variants:
            maximum_by_slot[entry["slot"]] = max(
                maximum_by_slot.get(entry["slot"], 0), entry["maxQuantity"]
            )
        field_source = public_source_by_field[pool["fieldName"]]
        chest_drops.append(
            {
                "poolId": summary["poolId"],
                "sourceId": field_source["id"],
                "sourceIds": field_source["sourceRefs"],
                "sourceLabel": pool["labelZh"],
                "labelZh": pool["labelZh"],
                "sourceKind": pool["sourceKind"],
                "fieldName": pool["fieldName"],
                "slot": 0,
                "itemId": summary["itemId"],
                "probabilityBasis": "conditionalOnGrade",
                "conditionalOnGradeChancePercent": summary[
                    "conditionalOnGradeChancePercent"
                ],
                "expectedQuantityPerOpen": summary["expectedQuantityPerOpen"],
                "minQuantity": min(entry["minQuantity"] for entry in variants),
                "maxQuantity": sum(maximum_by_slot.values()),
                "treasureBoxGrade": pool["treasureBoxGrade"],
                "treasureGrade": pool["treasureBoxGrade"],
                "variantIds": summary["variantIds"],
                "slotContributions": summary["slotContributions"],
            }
        )
    assert len(chest_drops) == EXPECTED_CHEST_DROP_EDGES
    assert len({drop["itemId"] for drop in chest_drops}) == EXPECTED_CHEST_DROP_ITEMS

    public_counts = {
        **counts,
        "chestDropEdges": len(chest_drops),
        "chestDropItems": EXPECTED_CHEST_DROP_ITEMS,
        "chestDropFields": EXPECTED_CHEST_FIELDS,
        "chestDropPools": EXPECTED_CHEST_POOLS,
        "chestDropPositiveEntries": EXPECTED_CHEST_POSITIVE_ENTRIES,
        "chestAuditedSources": EXPECTED_CHEST_SOURCES,
        "chestOrphanPools": 0,
    }
    return {
        "schemaVersion": snapshot["schemaVersion"],
        "gameVersion": snapshot["source"]["gameVersion"],
        "gameBuildId": snapshot["source"]["gameBuildId"],
        "source": snapshot["source"],
        "chestSource": chest_snapshot["source"],
        "counts": public_counts,
        "palDrops": drops,
        "chestDrops": chest_drops,
        "chestSources": public_sources,
    }


def validate_sources(
    db: dict[str, Any],
    breeding: dict[str, Any],
    compact: dict[str, Any],
    movement: dict[str, Any],
) -> None:
    pals = db["Pals"]
    rules = breeding["Breeding"]
    assert db["Version"] == "v23", f"Unexpected PalCalc DB version: {db['Version']}"
    assert len(pals) == EXPECTED_PALS, f"Expected {EXPECTED_PALS} Pals"
    assert len(rules) == EXPECTED_RULES, f"Expected {EXPECTED_RULES} rules"
    assert len({pal_key(pal["Id"]) for pal in pals}) == EXPECTED_PALS
    assert len({pal["InternalName"] for pal in pals}) == EXPECTED_PALS

    movement_records = movement["records"]
    assert len(movement_records) == EXPECTED_PALS
    movement_by_id = {record["id"]: record for record in movement_records}
    assert len(movement_by_id) == EXPECTED_PALS
    assert set(movement_by_id) == {pal["InternalName"] for pal in pals}
    for pal in pals:
        record = movement_by_id[pal["InternalName"]]
        assert record["breedingPower"] == pal["BreedingPower"]
        for source_key, movement_key in (
            ("WalkSpeed", "walkSpeed"),
            ("RunSpeed", "runSpeed"),
            ("RideSprintSpeed", "rideSprintSpeed"),
            ("TransportSpeed", "transportSpeed"),
            ("Stamina", "stamina"),
        ):
            assert record[movement_key] == pal[source_key], (
                f"Movement cross-check failed: {pal['InternalName']}.{movement_key}"
            )
        assert all(
            isinstance(record[field], (int, float)) for field in MOVEMENT_FIELDS
        )
    selectable_ids = {
        pal["InternalName"] for pal in pals if 0 < pal["Id"]["PalDexNo"] < 10_000
    }
    type_counts = {
        movement_type: sum(
            movement_by_id[pal_id].get("movementType") == movement_type
            for pal_id in selectable_ids
        )
        for movement_type in EXPECTED_MOVEMENT_TYPES
    }
    assert type_counts == EXPECTED_MOVEMENT_TYPES
    assert {
        record["id"] for record in movement_records if "movementType" not in record
    } == EXPECTED_MOVEMENT_TYPE_GAPS
    assert {
        record["id"]
        for record in movement_records
        if "flySpeedOverride" in record or "flySprintSpeedOverride" in record
    } == EXPECTED_FLY_OVERRIDE_IDS
    assert all(
        ("flySpeedOverride" in record) == ("flySprintSpeedOverride" in record)
        for record in movement_records
    )

    compact_ids = {
        pal["id"]: (int(pal["dex"]), bool(pal["variant"]))
        for pal in compact["pals"]
    }
    assert len(compact_ids) == EXPECTED_PALS
    assert len(compact["combos"]) == EXPECTED_RULES
    for index, (derived, source) in enumerate(zip(compact["combos"], rules)):
        actual = (
            compact_ids[derived["a"]],
            compact_ids[derived["b"]],
            compact_ids[derived["child"]],
            tuple(derived["genders"]),
        )
        expected = (
            pal_key(source["Parent1ID"]),
            pal_key(source["Parent2ID"]),
            pal_key(source["ChildID"]),
            (source["Parent1Gender"], source["Parent2Gender"]),
        )
        assert actual == expected, f"Compact cross-check failed at rule {index}"


def make_icon(pal: dict[str, Any]) -> bytes:
    digest = hashlib.sha1(pal["id"].encode()).hexdigest()
    hue = int(digest[:4], 16) % 360
    label = "".join(word[0] for word in pal["names"]["en"].split()[:2]).upper() or "P"
    label = html.escape(label[:2])
    number = html.escape(str(pal["dexNo"]))
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl({hue} 70% 88%)"/><stop offset="1" stop-color="hsl({hue} 62% 68%)"/></linearGradient></defs>
<circle cx="50" cy="50" r="47" fill="url(#g)" stroke="hsl({hue} 55% 38%)" stroke-width="3"/>
<text x="50" y="57" text-anchor="middle" font-family="system-ui,sans-serif" font-size="31" font-weight="800" fill="#163742">{label}</text>
<text x="50" y="78" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="#315866">#{number}</text>
</svg>
"""
    return svg.encode()


def build_skill_catalog(
    db: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    save_skills_zh = read_json(VENDOR / "savepal" / "active-skills.zh-Hans.json")
    save_skills_en = read_json(VENDOR / "savepal" / "active-skills.en.json")
    active_overrides_source = read_json(
        VENDOR / "paldb" / "active-skill-overrides.zh-Hans.json"
    )
    active_overrides = {
        entry["id"]: entry for entry in active_overrides_source["entries"]
    }
    active_skills: list[dict[str, Any]] = []
    for source in db["ActiveSkills"]:
        skill_id = source["InternalName"]
        key = f"EPalWazaID::{skill_id}"
        zh = save_skills_zh.get(key, {})
        en = save_skills_en.get(key, {})
        override = active_overrides.get(skill_id, {})
        description = {
            language: value
            for language, value in (
                ("zh", override.get("description") or zh.get("description")),
                ("en", en.get("description")),
            )
            if value
        }
        skill = {
            "id": skill_id,
            "names": {
                "zh": source["LocalizedNames"].get("zh-Hans") or source["Name"],
                "en": source["LocalizedNames"].get("en") or source["Name"],
            },
            "element": source["ElementInternalName"],
            "power": source["Power"],
            "cooldownSeconds": source["CooldownSeconds"],
            "canInherit": source["CanInherit"],
            "hasSkillFruit": source["HasSkillFruit"],
        }
        if description:
            skill["description"] = description
        active_skills.append(skill)

    partner_source = read_json(VENDOR / "paldb" / "partner-skills.zh-Hans.json")
    partner_skills = [
        {
            "id": entry["palId"],
            "name": entry["name"],
            "description": entry["description"],
        }
        for entry in partner_source["entries"]
    ]
    passive_sources = [
        source for source in db["PassiveSkills"] if source["IsStandardPassiveSkill"]
    ]
    passive_ids = {source["InternalName"] for source in passive_sources}
    visible_pal_sources = sorted(
        (
            pal
            for pal in db["Pals"]
            if 0 < int(pal["Id"]["PalDexNo"]) < 10_000
        ),
        key=lambda pal: (int(pal["InternalIndex"]), pal["InternalName"]),
    )
    guaranteed_by: dict[str, list[str]] = {
        passive_id: [] for passive_id in passive_ids
    }
    guaranteed_ids = {
        passive_id
        for pal in visible_pal_sources
        for passive_id in pal["GuaranteedPassivesInternalIds"]
    }
    assert guaranteed_ids <= passive_ids, (
        f"Visible Pals reference non-standard passives: {sorted(guaranteed_ids - passive_ids)}"
    )
    for pal in visible_pal_sources:
        for passive_id in pal["GuaranteedPassivesInternalIds"]:
            guaranteed_by[passive_id].append(pal["InternalName"])

    passive_skills: list[dict[str, Any]] = []
    for source in passive_sources:
        passive = {
            "id": source["InternalName"],
            "names": {
                "zh": source["LocalizedNames"]["zh-Hans"],
                "en": source["LocalizedNames"]["en"],
            },
            "description": {
                "zh": source["LocalizedDescriptions"]["zh-Hans"],
                "en": source["LocalizedDescriptions"]["en"],
            },
            "rank": source["Rank"],
            "randomlyAvailable": source["RandomInheritanceAllowed"],
            "randomWeight": source["RandomInheritanceWeight"],
            "surgeryCost": source["SurgeryCost"],
            "guaranteedBy": guaranteed_by[source["InternalName"]],
        }
        if source["SurgeryRequiredItem"]:
            passive["surgeryItem"] = source["SurgeryRequiredItem"]
        passive_skills.append(passive)

    assert len(active_skills) == EXPECTED_ACTIVE_SKILLS
    assert len({skill["id"] for skill in active_skills}) == EXPECTED_ACTIVE_SKILLS
    assert len(partner_skills) == EXPECTED_PARTNER_SKILLS
    assert len({skill["id"] for skill in partner_skills}) == EXPECTED_PARTNER_SKILLS
    assert len(db["PassiveSkills"]) == EXPECTED_PASSIVE_SOURCE_ROWS
    assert len(passive_skills) == EXPECTED_PASSIVE_SKILLS
    assert len({skill["id"] for skill in passive_skills}) == EXPECTED_PASSIVE_SKILLS
    assert all(
        skill["names"][language] and skill["description"][language]
        for skill in passive_skills
        for language in ("zh", "en")
    )
    assert {
        rank: sum(skill["rank"] == rank for skill in passive_skills)
        for rank in EXPECTED_PASSIVE_RANKS
    } == EXPECTED_PASSIVE_RANKS
    assert sum(
        skill["randomlyAvailable"] for skill in passive_skills
    ) == EXPECTED_RANDOMLY_AVAILABLE_PASSIVE_SKILLS
    assert sum(
        skill["surgeryCost"] > 0 for skill in passive_skills
    ) == EXPECTED_SURGERY_PASSIVE_SKILLS
    assert sum(
        bool(skill.get("surgeryItem")) for skill in passive_skills
    ) == EXPECTED_SURGERY_ITEM_PASSIVE_SKILLS
    assert sum(
        bool(skill["guaranteedBy"]) for skill in passive_skills
    ) == EXPECTED_GUARANTEED_PASSIVE_SKILLS
    assert sum(
        len(skill["guaranteedBy"]) for skill in passive_skills
    ) == EXPECTED_GUARANTEED_PASSIVE_ASSIGNMENTS
    assert {
        skill["id"] for skill in active_skills if "description" not in skill
    } == EXPECTED_UNDESCRIBED_ACTIVE_SKILLS
    active_by_id = {skill["id"]: skill for skill in active_skills}
    partner_by_id = {skill["id"]: skill for skill in partner_skills}
    return (
        {
            "activeSkills": active_skills,
            "partnerSkills": partner_skills,
            "passiveSkills": passive_skills,
        },
        active_by_id,
        partner_by_id,
    )


def build_pals(
    db: dict[str, Any],
    save_pals: dict[str, Any],
    movement_by_id: dict[str, dict[str, Any]],
    refinement_by_id: dict[str, dict[str, Any]],
    active_by_id: dict[str, dict[str, Any]],
    partner_by_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    save_by_name = {name.casefold(): value for name, value in save_pals.items()}
    partner_table = read_json(
        VENDOR / "palmodding" / "partner-skill-names.ja.json"
    )[0]["Rows"]
    gender_probability = db["BreedingGenderProbability"]
    missing_savepal: set[str] = set()
    result: list[dict[str, Any]] = []

    for source in db["Pals"]:
        internal_name = source["InternalName"]
        save = save_by_name.get(internal_name.casefold())
        if save is None:
            missing_savepal.add(internal_name)
            save = {}
        movement_source = movement_by_id[internal_name]
        if save:
            for save_key, movement_key in (
                ("slow_walk_speed", "slowWalkSpeed"),
                ("walk_speed", "walkSpeed"),
                ("run_speed", "runSpeed"),
                ("ride_sprint_speed", "rideSprintSpeed"),
                ("transport_speed", "transportSpeed"),
                ("stamina", "stamina"),
            ):
                assert save[save_key] == movement_source[movement_key], (
                    f"Movement/Save Pal mismatch: {internal_name}.{movement_key}"
                )

        active_skill_refs: list[dict[str, Any]] = []
        for skill_id, level in sorted(
            save.get("skill_set", {}).items(),
            key=lambda item: (item[1], ACTIVE_SKILL_ALIASES.get(item[0], item[0])),
        ):
            catalog_id = ACTIVE_SKILL_ALIASES.get(skill_id, skill_id)
            if catalog_id in active_by_id:
                active_skill_refs.append({"id": catalog_id, "level": level})

        dex_no, variant = pal_key(source["Id"])
        if 0 < dex_no < 10_000:
            assert len(active_skill_refs) == len(save.get("skill_set", {})), (
                f"Unresolved player-facing active skill: {internal_name}"
            )
        # Some quest/visual variants have their own PalCalc ID but reuse the
        # game's underlying tribe. Save Pal exposes that join explicitly.
        partner_row = partner_table.get(f"PARTNERSKILL_{internal_name}")
        if partner_row is None and save.get("tribe"):
            partner_row = partner_table.get(f"PARTNERSKILL_{save['tribe']}")
        partner_skill = (
            (partner_row or {}).get("TextData", {}).get("LocalizedString")
        )
        partner_skill_id = internal_name
        if partner_skill_id not in partner_by_id and save.get("tribe") in partner_by_id:
            partner_skill_id = save["tribe"]
        probability = gender_probability[internal_name]["MALE"] * 100
        icon_suffix = ".png" if (ICONS / f"{internal_name}.png").exists() else ".svg"
        pal = {
            "id": internal_name,
            "dexNo": dex_no,
            "variant": variant,
            "selectable": 0 < dex_no < 10_000,
            "names": {
                "zh": source["LocalizedNames"].get("zh-Hans") or source["Name"],
                "en": source["LocalizedNames"].get("en") or source["Name"],
            },
            "elements": save.get("element_types", []),
            "maleProbability": probability,
            "breedingPower": source["BreedingPower"],
            "internalIndex": source["InternalIndex"],
            "stats": {
                "hp": source["Hp"],
                "attack": source["Attack"],
                "defense": source["Defense"],
                "stamina": source["Stamina"],
            },
            "movement": {
                key: movement_source[key] for key in MOVEMENT_FIELDS
            },
            "workSuitability": {
                key: value
                for key, value in source["WorkSuitability"].items()
                if value > 0
            },
            "activeSkills": [
                active_by_id[skill["id"]]["names"]["zh"]
                for skill in active_skill_refs
            ],
            "activeSkillRefs": active_skill_refs,
            "icon": f"/icons/{internal_name}{icon_suffix}",
        }
        if "movementType" in movement_source:
            pal["movement"]["type"] = movement_source["movementType"]
        for key in ("flySpeedOverride", "flySprintSpeedOverride"):
            if key in movement_source:
                pal["movement"][key] = movement_source[key]
        if partner_skill:
            pal["partnerSkill"] = partner_skill
        if partner_skill_id in partner_by_id:
            pal["partnerSkillId"] = partner_skill_id
        if pal["selectable"]:
            pal["refinement"] = refinement_by_id[internal_name]
        result.append(pal)

    assert missing_savepal == EXPECTED_SAVEPAL_GAP, (
        f"Unexpected save-pal join gaps: {sorted(missing_savepal)}"
    )
    assert sum("partnerSkill" in pal for pal in result) == EXPECTED_PALS
    assert all(
        "partnerSkillId" in pal for pal in result if pal["selectable"]
    ), "Missing player-facing partner-skill references"
    assert all(
        ref["id"] in active_by_id
        for pal in result
        for ref in pal["activeSkillRefs"]
    )
    assert {
        pal["id"] for pal in result if pal["selectable"] and not pal["activeSkills"]
    } == EXPECTED_EMPTY_ACTIVE_SKILLS
    return sorted(result, key=lambda pal: (pal["internalIndex"], pal["id"]))


def build_rules(
    source_rules: list[dict[str, Any]], pals_by_key: dict[tuple[int, bool], str]
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    signatures: set[tuple[Any, ...]] = set()
    for index, source in enumerate(source_rules, start=1):
        parent_a = pals_by_key[pal_key(source["Parent1ID"])]
        parent_b = pals_by_key[pal_key(source["Parent2ID"])]
        child = pals_by_key[pal_key(source["ChildID"])]
        genders = (source["Parent1Gender"], source["Parent2Gender"])
        if genders == ("WILDCARD", "WILDCARD"):
            pairs = [{"a": "M", "b": "F"}, {"a": "F", "b": "M"}]
        else:
            sex = {"MALE": "M", "FEMALE": "F"}
            pairs = [{"a": sex[genders[0]], "b": sex[genders[1]]}]
        signature = (parent_a, parent_b, child, tuple((p["a"], p["b"]) for p in pairs))
        assert signature not in signatures, f"Duplicate breeding rule: {signature}"
        signatures.add(signature)
        result.append(
            {
                "id": index,
                "parentA": parent_a,
                "parentB": parent_b,
                "child": child,
                "allowedSexPairs": pairs,
            }
        )
    return result


def main() -> None:
    db = read_json(VENDOR / "palcalc" / "db.json")
    breeding_source = read_json(VENDOR / "palcalc" / "breeding.json")
    compact = read_json(VENDOR / "palworld-1.0.json")
    movement_path = VENDOR / "palworld" / "movement-v1.json"
    movement_source = read_json(movement_path)
    refinement_path = VENDOR / "palworld" / "refinement-v1.json"
    refinement_source = read_json(refinement_path)
    items_path = VENDOR / "palworld" / "items-v1.json"
    items_source = read_json(items_path)
    items_document, recipes_document, item_icon_files, item_icon_hash = build_item_documents(
        items_source
    )
    item_drops_path = VENDOR / "palworld" / "item-drops-v1.json"
    item_drops_source = read_json(item_drops_path)
    chest_drops_path = VENDOR / "palworld" / "chest-drops-v1.json"
    chest_drops_source = read_json(chest_drops_path)
    validate_sources(db, breeding_source, compact, movement_source)

    pals_by_key = {pal_key(pal["Id"]): pal["InternalName"] for pal in db["Pals"]}
    refinement_by_id = {
        entry["id"]: {key: value for key, value in entry.items() if key != "id"}
        for entry in refinement_source["entries"]
    }
    assert len(refinement_by_id) == EXPECTED_PARTNER_SKILLS
    assert refinement_source["counts"]["tableRanked"] == EXPECTED_REFINEMENT_TABLE_RANKED
    assert refinement_source["counts"]["tableChanged"] == EXPECTED_REFINEMENT_TABLE_CHANGED
    skills, active_by_id, partner_by_id = build_skill_catalog(db)
    pals = build_pals(
        db,
        read_json(VENDOR / "savepal" / "pals.json"),
        {record["id"]: record for record in movement_source["records"]},
        refinement_by_id,
        active_by_id,
        partner_by_id,
    )
    rules = build_rules(breeding_source["Breeding"], pals_by_key)
    pal_ids = {pal["id"] for pal in pals}
    selectable_pal_ids = {pal["id"] for pal in pals if pal["selectable"]}
    item_drops_document = build_item_drop_document(
        item_drops_source,
        chest_drops_source,
        items_source["items"],
        selectable_pal_ids,
    )
    assert all(
        rule[part] in pal_ids
        for rule in rules
        for part in ("parentA", "parentB", "child")
    )

    breeding = {"pals": pals, "rules": rules}
    paldex = {"pals": pals}
    breeding_bytes = json_bytes(breeding)
    paldex_bytes = json_bytes(paldex)
    skills_bytes = json_bytes(skills)
    items_bytes = json_bytes(items_document)
    recipes_bytes = json_bytes(recipes_document)
    item_drops_bytes = json_bytes(item_drops_document)
    active_overrides_source = read_json(
        VENDOR / "paldb" / "active-skill-overrides.zh-Hans.json"
    )
    partner_source = read_json(VENDOR / "paldb" / "partner-skills.zh-Hans.json")
    selectable = selectable_pal_ids
    usable_rules = sum(
        rule["parentA"] in selectable
        and rule["parentB"] in selectable
        and rule["child"] in selectable
        for rule in rules
    )
    game_icons = sum(pal["icon"].endswith(".png") for pal in pals)

    DATA.mkdir(parents=True, exist_ok=True)
    ICONS.mkdir(parents=True, exist_ok=True)
    (DATA / "breeding.json").write_bytes(breeding_bytes)
    (DATA / "paldex.json").write_bytes(paldex_bytes)
    (DATA / "skills.json").write_bytes(skills_bytes)
    (DATA / "items.json").write_bytes(items_bytes)
    (DATA / "recipes.json").write_bytes(recipes_bytes)
    (DATA / "item-drops.json").write_bytes(item_drops_bytes)
    for pal in pals:
        svg_path = ICONS / f"{pal['id']}.svg"
        if (ICONS / f"{pal['id']}.png").exists():
            svg_path.unlink(missing_ok=True)
        else:
            svg_path.write_bytes(make_icon(pal))

    manifest = {
        "gameVersion": "1.0",
        "dataVersion": f"palworld-1.0-palcalc-{db['Version']}-skills2-movement1-refinement1-items1-drops2",
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "sources": {
            "palcalc": {
                "repo": "tylercamp/palcalc",
                "ref": "v1.17.2",
                "commit": "b5e13e90fedc2e95d54fa223da77be464c313001",
                "blobs": {
                    "db": "c9a010f3c4a93957251b6d5d1b9bc1b244256200",
                    "breeding": "2dc04d319bc2de89691031a0a4456aaa55882461",
                },
            },
            "savePal": {
                "repo": "oMaN-Rod/palworld-save-pal",
                "ref": "main",
                "commit": "e46188978a13e74d84c9a1ce5569497ee0555cae",
            },
            "compactCrossCheck": {
                "repo": "ZiSangMuZhi/pal-breeding-calculator",
                "ref": "v1.0.0",
                "commit": "e0fca5b22c2a4905b725c2ed988e6ef7c1914b8c",
                "blob": "e629e284587c3e4f38d5efc834479c75307a5548",
            },
            "partnerSkillNames": {
                "repo": "PalModding/UtililityFiles",
                "ref": "main",
                "commit": "455de2110d8414f703699204f33cb6ac052a3f98",
                "blob": "25a3f5510c4a1b0304d1e31bb172bae21ae2bcb7",
            },
            "localGameMovement": {
                **movement_source["source"],
                "snapshotSha256": text_file_sha256(movement_path),
            },
            "localGameRefinement": {
                **refinement_source["source"],
                "snapshotSha256": text_file_sha256(refinement_path),
            },
            "localGameItems": {
                **items_source["source"],
                "snapshotSha256": text_file_sha256(items_path),
            },
            "localGameItemDrops": {
                **item_drops_source["source"],
                "snapshotSha256": text_file_sha256(item_drops_path),
            },
            "localGameChestDrops": {
                **chest_drops_source["source"],
                "snapshotSha256": text_file_sha256(chest_drops_path),
            },
            "paldb": {
                "activeSkillOverrides": {
                    "source": active_overrides_source["source"],
                    "fetchedAt": active_overrides_source["fetchedAt"],
                    "sourceSha256": active_overrides_source["sourceSha256"],
                    "snapshotSha256": text_file_sha256(
                        VENDOR / "paldb" / "active-skill-overrides.zh-Hans.json"
                    ),
                },
                "partnerSkills": {
                    "source": partner_source["source"],
                    "fetchedAt": partner_source["fetchedAt"],
                    "sourceSha256": partner_source["sourceSha256"],
                    "snapshotSha256": text_file_sha256(
                        VENDOR / "paldb" / "partner-skills.zh-Hans.json"
                    ),
                },
            },
        },
        "counts": {
            "pals": len(pals),
            "selectablePals": len(selectable),
            "rules": len(rules),
            "usableRules": usable_rules,
            "icons": len(pals),
            "gameIcons": game_icons,
            "placeholderIcons": len(pals) - game_icons,
            "activeSkills": len(skills["activeSkills"]),
            "partnerSkills": len(skills["partnerSkills"]),
            "passiveSkillSourceRows": len(db["PassiveSkills"]),
            "passiveSkills": len(skills["passiveSkills"]),
            "randomlyAvailablePassiveSkills": sum(
                skill["randomlyAvailable"] for skill in skills["passiveSkills"]
            ),
            "guaranteedPassiveSkills": sum(
                bool(skill["guaranteedBy"]) for skill in skills["passiveSkills"]
            ),
            "guaranteedPassiveAssignments": sum(
                len(skill["guaranteedBy"]) for skill in skills["passiveSkills"]
            ),
            "movementRecords": len(movement_source["records"]),
            "selectableMovementTypes": sum(EXPECTED_MOVEMENT_TYPES.values()),
            "movementTypes": EXPECTED_MOVEMENT_TYPES,
            "effectiveFlyOverrides": len(EXPECTED_FLY_OVERRIDE_IDS),
            "refinementRecords": len(refinement_source["entries"]),
            "rankedPartnerSkillRecords": refinement_source["counts"]["tableRanked"],
            "changedPartnerSkillRecords": refinement_source["counts"]["tableChanged"],
            "specialRefinementRecords": refinement_source["counts"]["specialCovered"],
            "items": items_source["counts"]["items"],
            "legalItems": EXPECTED_LEGAL_ITEMS,
            "itemRecipes": items_source["counts"]["recipes"],
            "itemRecipeProducts": items_source["counts"]["recipeProducts"],
            "alternateItemRecipeProducts": items_source["counts"]["alternateRecipeProducts"],
            "itemTechnologyUnlocks": items_source["counts"]["technologyUnlocks"],
            "itemShopOffers": items_source["counts"]["shopOffers"],
            "itemLocalizedNames": items_source["counts"]["localizedNames"],
            "itemIconRecords": items_source["counts"]["icons"],
            "itemIconFiles": item_icon_files,
            "itemCycles": items_source["counts"]["cycles"],
            "itemCanonicalizedReferences": items_source["counts"]["canonicalizedReferences"],
            "unresolvedItemRefs": items_source["counts"]["unresolvedItemRefs"],
            "unresolvedTechnologyRecipeRefs": items_source["counts"]["unresolvedTechnologyRecipeRefs"],
            "unresolvedShopItemRefs": items_source["counts"]["unresolvedShopItemRefs"],
            "itemDropSourceRows": item_drops_source["counts"]["includedSourceRows"],
            "itemDropEdges": item_drops_source["counts"]["palDropEdges"],
            "itemDropItems": item_drops_source["counts"]["distinctDropItems"],
            "itemDropCaptureIneligibleEdges": item_drops_source["counts"]["captureIneligibleEdges"],
            "itemDropCanonicalizedReferences": item_drops_source["counts"]["canonicalizedItemReferences"],
            "itemDropUnresolvedItemRefs": item_drops_source["counts"]["unresolvedItemRefs"],
            "chestDropEdges": chest_drops_source["counts"]["poolItemSummaries"],
            "chestDropItems": chest_drops_source["counts"]["distinctItems"],
            "chestDropFields": chest_drops_source["counts"]["classifiedFieldNames"],
            "chestDropPools": chest_drops_source["counts"]["fieldGradePools"],
            "chestDropPositiveEntries": chest_drops_source["counts"]["positiveWeightEntries"],
            "chestAuditedSources": chest_drops_source["counts"]["sources"],
            "chestOrphanPools": chest_drops_source["counts"]["orphanPools"],
        },
        "checksums": {
            "breeding": sha256(breeding_bytes),
            "paldex": sha256(paldex_bytes),
            "skills": sha256(skills_bytes),
            "items": sha256(items_bytes),
            "recipes": sha256(recipes_bytes),
            "itemDrops": sha256(item_drops_bytes),
            "icons": icon_bundle_sha256(pals),
            "itemIcons": item_icon_hash,
        },
    }
    (DATA / "manifest.json").write_bytes(json_bytes(manifest))
    print(
        f"Generated {len(pals)} Pals, {len(rules)} rules "
        f"({usable_rules} selectable), {game_icons} PalCalc PNG icons, and "
        f"{len(pals) - game_icons} hidden-record SVG placeholders, "
        f"{len(items_source['items'])} items, {len(items_source['recipes'])} item recipes, and "
        f"{len(item_drops_source['palDrops'])} Pal drop edges and "
        f"{len(chest_drops_source['summary'])} grade-conditional chest drop edges."
    )


if __name__ == "__main__":
    main()
