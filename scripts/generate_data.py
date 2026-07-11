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
EXPECTED_PALS = 306
EXPECTED_RULES = 46_972
EXPECTED_SAVEPAL_GAP = {"DarkMutant"}
EXPECTED_EMPTY_ACTIVE_SKILLS = {
    "GhostAnglerfish",
    "GhostAnglerfish_Fire",
    "LazyCatfish",
    "LazyCatfish_Gold",
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


def icon_bundle_sha256(pals: list[dict[str, Any]]) -> str:
    digest = hashlib.sha256()
    for pal in sorted(pals, key=lambda value: value["id"]):
        path = ICONS / Path(pal["icon"]).name
        digest.update(path.name.encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
    return digest.hexdigest()


def validate_sources(
    db: dict[str, Any], breeding: dict[str, Any], compact: dict[str, Any]
) -> None:
    pals = db["Pals"]
    rules = breeding["Breeding"]
    assert db["Version"] == "v23", f"Unexpected PalCalc DB version: {db['Version']}"
    assert len(pals) == EXPECTED_PALS, f"Expected {EXPECTED_PALS} Pals"
    assert len(rules) == EXPECTED_RULES, f"Expected {EXPECTED_RULES} rules"
    assert len({pal_key(pal["Id"]) for pal in pals}) == EXPECTED_PALS
    assert len({pal["InternalName"] for pal in pals}) == EXPECTED_PALS

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


def build_pals(db: dict[str, Any], save_pals: dict[str, Any]) -> list[dict[str, Any]]:
    save_by_name = {name.casefold(): value for name, value in save_pals.items()}
    active_by_name = {
        skill["InternalName"].casefold(): skill for skill in db["ActiveSkills"]
    }
    save_skills_zh = read_json(VENDOR / "savepal" / "active-skills.zh-Hans.json")
    save_skills_en = read_json(VENDOR / "savepal" / "active-skills.en.json")
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

        active_skills: list[str] = []
        for skill_id, level in sorted(
            save.get("skill_set", {}).items(), key=lambda item: (item[1], item[0])
        ):
            skill = active_by_name.get(skill_id.casefold())
            if skill:
                name = skill["LocalizedNames"].get("zh-Hans") or skill["Name"]
            else:
                key = f"EPalWazaID::{skill_id}"
                name = (
                    save_skills_zh.get(key, {}).get("localized_name")
                    or save_skills_en.get(key, {}).get("localized_name")
                    or skill_id
                )
            active_skills.append(name)

        dex_no, variant = pal_key(source["Id"])
        # Some quest/visual variants have their own PalCalc ID but reuse the
        # game's underlying tribe. Save Pal exposes that join explicitly.
        partner_row = partner_table.get(f"PARTNERSKILL_{internal_name}")
        if partner_row is None and save.get("tribe"):
            partner_row = partner_table.get(f"PARTNERSKILL_{save['tribe']}")
        partner_skill = (
            (partner_row or {}).get("TextData", {}).get("LocalizedString")
        )
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
                "speed": source["RunSpeed"],
            },
            "workSuitability": {
                key: value
                for key, value in source["WorkSuitability"].items()
                if value > 0
            },
            "activeSkills": active_skills,
            "icon": f"/icons/{internal_name}{icon_suffix}",
        }
        if partner_skill:
            pal["partnerSkill"] = partner_skill
        result.append(pal)

    assert missing_savepal == EXPECTED_SAVEPAL_GAP, (
        f"Unexpected save-pal join gaps: {sorted(missing_savepal)}"
    )
    assert sum("partnerSkill" in pal for pal in result) == EXPECTED_PALS
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
    validate_sources(db, breeding_source, compact)

    pals_by_key = {pal_key(pal["Id"]): pal["InternalName"] for pal in db["Pals"]}
    pals = build_pals(db, read_json(VENDOR / "savepal" / "pals.json"))
    rules = build_rules(breeding_source["Breeding"], pals_by_key)
    pal_ids = {pal["id"] for pal in pals}
    assert all(
        rule[part] in pal_ids
        for rule in rules
        for part in ("parentA", "parentB", "child")
    )

    breeding = {"pals": pals, "rules": rules}
    paldex = {"pals": pals}
    breeding_bytes = json_bytes(breeding)
    paldex_bytes = json_bytes(paldex)
    selectable = {pal["id"] for pal in pals if pal["selectable"]}
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
    for pal in pals:
        svg_path = ICONS / f"{pal['id']}.svg"
        if (ICONS / f"{pal['id']}.png").exists():
            svg_path.unlink(missing_ok=True)
        else:
            svg_path.write_bytes(make_icon(pal))

    manifest = {
        "gameVersion": "1.0",
        "dataVersion": f"palworld-1.0-palcalc-{db['Version']}",
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
        },
        "counts": {
            "pals": len(pals),
            "selectablePals": len(selectable),
            "rules": len(rules),
            "usableRules": usable_rules,
            "icons": len(pals),
            "gameIcons": game_icons,
            "placeholderIcons": len(pals) - game_icons,
        },
        "checksums": {
            "breeding": sha256(breeding_bytes),
            "paldex": sha256(paldex_bytes),
            "icons": icon_bundle_sha256(pals),
        },
    }
    (DATA / "manifest.json").write_bytes(json_bytes(manifest))
    print(
        f"Generated {len(pals)} Pals, {len(rules)} rules "
        f"({usable_rules} selectable), {game_icons} PalCalc PNG icons, and "
        f"{len(pals) - game_icons} hidden-record SVG placeholders."
    )


if __name__ == "__main__":
    main()
