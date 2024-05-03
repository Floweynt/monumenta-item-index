import {readFileSync, rmSync} from "fs";
import {mkdir, writeFile} from "fs/promises";
import {AttributeTag, EnchantmentTag, Item, getTagById, getTagId} from "@shared/item";
import {walkDirSync} from "./lib/utils";
import {mappingUnique} from "@shared/utils";
import {inspect} from "util";
import {createAssertParse} from "typia/lib/json";
import {createIs} from "typia";
import {snbtParse} from "./lib/snbt";
import {GatheredItemInfo, InfoSupplier} from "./scraper/scraper";
import {attributeDataProvider, bookDataProvider, charmProvider, enchantmentDataProvider, masterworkProvider, monumentaTagProvider, nameDataProvider, potionDataProvider, rawLoreDataProvider} from "./scraper/providers";
import {argv, chdir} from "process";
import {genItem} from "./lib/generate";
import {rawText} from "@shared/components";
import {dirname} from "path";
import {create} from "jsondiffpatch";

const diff = create({});

if (argv[2] !== undefined) {
    chdir(argv[2]);
}

let skippedCount = 0;

interface LootTableLike {
    pools: {
        entries: unknown[];
    }[];
}

interface ItemEntry {
    type: "item";
    name: string;
    functions: unknown[];
}

interface TagFunction {
    function?: "set_nbt";
    tag: string;
}

const parseLootTable = createAssertParse<LootTableLike>();
const isItemEntry = createIs<ItemEntry>();
const isTagFunction = createIs<TagFunction>();

function* iterateLootTable(data: string): Generator<[string, unknown]> {
    const table = parseLootTable(data);

    for (const pool of table.pools) {
        for (const entry of pool.entries) {
            if (!isItemEntry(entry))
                return;

            const tab = entry.functions.filter<TagFunction>(isTagFunction);
            if (tab.length === 0) {
                skippedCount++;
                return;
            }

            yield [entry.name, snbtParse(Buffer.from(tab[0].tag))];
        }
    }
}

type ExportedItem = Item & {id: string; rawNBT: unknown; oldPath: string};

function getId(item: Item) {
    let id = "";
    const questTag = getTagById(item.tags ?? [], "quest");

    if (getTagById(item.tags ?? [], "book") !== undefined) {
        id += "books/";
    } else if (questTag !== undefined) {
        id += "quests/";
    } else if (item.rarity === "legacy") {
        id += `${item.region ?? "misc"}/`;
        if (item.location) {
            id += `${item.location}/`;
        }
    } else {
        id += `${item.region ?? "misc"}/`;
        if (item.location) {
            id += `${item.location}/`;
        }

        if (item.rarity) {
            const res = Number.parseInt(item.rarity);
            if (!Number.isNaN(res) && Number.isFinite(res))
                id += "t";
            id += `${item.rarity}/`;
        }
    }

    id += rawText(item.name)
        .replaceAll("'", "")
        .replaceAll(/[^a-zA-Z0-9_e]/g, "_")
        .replaceAll(/_+/g, "_")
        .replaceAll(/_+$/g, "")
        .replaceAll(/^_+/g, "")
        .toLowerCase();

    const mwTag = getTagById(item.tags ?? [], "masterwork");
    if (mwTag) {
        id += `_m${mwTag.level}`;
    }

    return id;
}

function process(file: string): ExportedItem[] {
    if (file.endsWith(".disabled")) {
        return [];
    }
    if (file.includes("books/obsolete")) {
        return [];
    }

    if (file.includes("vanilla"))
        return [];


    try {
        return Array.from(iterateLootTable(readFileSync(file).toString())).map(([itemId, data]): ExportedItem | undefined => {
            const suppliers: InfoSupplier[] = [];

            const basic = nameDataProvider(data);

            if (basic === undefined) {
                skippedCount++;
                console.log(`skipping ${file} because it is invalid`);
                return;
            }

            suppliers.push(basic);

            const monumenta = monumentaTagProvider(data);

            if (monumenta === undefined) {
                suppliers.push(...rawLoreDataProvider(data));
            } else {
                suppliers.push(...monumenta);
            }

            suppliers.push(...[
                bookDataProvider,
                potionDataProvider,
                (x: unknown) => attributeDataProvider(itemId, x),
                enchantmentDataProvider,
                masterworkProvider,
                charmProvider
            ].map(func => func(data) ?? {}));

            const builder = new GatheredItemInfo();
            suppliers.forEach(x => builder.apply(x));

            // we need to process lore to remove duped entries...
            const item = builder.build(itemId);

            const seenLore = new Set(genItem({...structuredClone(item), lore: [], }).display.Lore.map(u => rawText(u).trim()));
            item.lore = item.lore.filter(lore => !seenLore.has(rawText(lore).trim()));

            // filter useless tags 
            item.tags = item.tags?.filter(x => {
                if (getTagId(x) === "enchants")
                    return (x as EnchantmentTag).enchants.length !== 0;
                if (getTagId(x) === "attributes")
                    return (x as AttributeTag).attributes.length !== 0;

                return true;
            });

            if (item.tags !== undefined && item.tags.length === 0)
                item.tags = undefined;

            return {...item, rawNBT: data, oldPath: file, id: getId(item), };
        }).filter<ExportedItem>((u): u is ExportedItem => u !== undefined);
    } catch (e) {
        console.log(`skipping ${file}: ${inspect(e)}`);
        skippedCount++;
    }

    return [];
}

export function load() {
    return Array.from(walkDirSync("items")).flatMap(u => process(u));
}

function preprocDupe(arr: ExportedItem[]) {
    const unique = new Set<string>();

    for (const entry of arr) {
        const key = entry.id;
        if (unique.has(key)) {
            entry.id += entry.item;
        } else {
            unique.add(key);
        }
    }
}

function dumpDupe(arr: ExportedItem[]) {
    const unique = new Map<string, ExportedItem>();
    const dup: [any, any, any][] = [];

    for (const entry of arr) {
        const key = entry.id;
        if (unique.has(key)) {
            const origRaw = unique.get(key) as ExportedItem;
            const orig = {...origRaw, oldPath: undefined, };
            const newer = {...(entry as ExportedItem), oldPath: undefined, };
            const delta = diff.diff(orig, newer) ?? {};
            if (Object.keys(delta).length === 0)
                continue;
            dup.push([origRaw, entry, delta]);
        } else {
            unique.set(key, entry);
        }
    }

    return Array.from(new Set(dup));
}

// eslint-disable-next-line no-constant-condition
if (false) {
    console.log(process("items/data/datapacks/base/data/epic/loot_tables/r3/charms/unique/scout/bloodhounds_crest.json"));
} else {
    rmSync("data", {recursive: true, force: true, });
    rmSync("data_clean", {recursive: true, force: true, });
    rmSync("temp", {recursive: true, force: true, });
    mkdir("temp");
    const entries = mappingUnique(load(), x => ({...x, oldPath: undefined, }));
    preprocDupe(entries);
    writeFile("blobs/out.json", JSON.stringify(entries));

    console.log(entries.length, skippedCount);
    dumpDupe(entries).forEach(async (x, c) => writeFile(`temp/${c}.json`, JSON.stringify(x)));

    // construct tree structure
    entries.forEach(async u => {
        const path = `data/monumenta/item_registry/${u.id}.json`;
        await mkdir(dirname(path), {recursive: true, });
        await writeFile(path, JSON.stringify(u));

        const pathClean = `data_clean/monumenta/item_registry/${u.id}.json`;
        await mkdir(dirname(pathClean), {recursive: true, });
        await writeFile(pathClean, JSON.stringify({...u, rawNBT: undefined, oldPath: undefined, id: undefined, }, undefined, 4));
    });
    /*
        console.log(
            Object.fromEntries(
                unique(entries
                    .flatMap(u => u.tags ?? [])
                    .filter((u): u is AttributeTag => getTag(u) === "attributes")
                    .flatMap(tag => tag.attributes)
                    .map(u => u[0])
                    .map(u => {
                        if (u.startsWith("minecraft:")) {
                            return [u, [u]];
                        }
    
                        return [`monumenta:${u.toLowerCase().replaceAll(" ", "_")}`, [u]];
                    })
                ).sort()
            )
        );
    
        console.log(
            unique(entries
                .flatMap(u => u.tags ?? [])
                .filter((u): u is PotionTag => getTag(u) === "potion")
                .flatMap(tag => tag.effects)
                .map(u => u[2])
                .filter(u => EFFECTS_BLOB[u as keyof typeof EFFECTS_BLOB] === undefined)
            )
        );*/
}

