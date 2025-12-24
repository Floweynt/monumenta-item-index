// Warning: terrible code
import {readFileSync, rmSync} from "fs";
import {mkdir, writeFile} from "fs/promises";
import {AttributeTag, EnchantmentTag, Item, Rarity, getTagById, getTagId} from "@shared/item";
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

const diff = create();

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

type ExportedItem = Item & {id: string; rawNBT: unknown; oldPath: string; shortId: string};

function getShortId(item: Item) {
    let res = "";
    if (item.rarity === "legacy")
        res += "legacy/";

    return res + item.region + "/" + rawText(item.name)
        .replaceAll("'", "")
        .replaceAll(/[^a-zA-Z0-9_e]/g, "_")
        .replaceAll(/_+/g, "_")
        .replaceAll(/_+$/g, "")
        .replaceAll(/^_+/g, "")
        .toLowerCase();
}

function getId(item: Item, includeRarity: boolean = true) {
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
        if ((item.tags ?? []).find(tag => getTagId(tag) === "potion") !== undefined) {
            id += "potion/";
        } else {
            id += `${item.region ?? "misc"}/`;
        }

        if (item.location) {
            id += `${item.location}/`;
        }

        if (item.rarity && includeRarity) {
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

    return id;
}

function process(file: string): ExportedItem[] {
    if (file.endsWith(".disabled") || file.endsWith(".txt")) {
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

            return {...item, rawNBT: data, oldPath: file, id: getId(item), shortId: getShortId(item), };
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

function makeIdToItemsTable(arr: ExportedItem[]) {
    const map = new Map<string, ExportedItem[]>();

    arr.forEach(ent => {
        if (!map.has(ent.shortId)) {
            map.set(ent.shortId, []);
        }

        (map.get(ent.shortId) as ExportedItem[]).push(ent);
    });

    return map;
}

function removeExportFields(item: ExportedItem) {
    const cleanObj = {...item, rawNBT: undefined, oldPath: undefined, id: undefined, shortId: undefined, };
    if (cleanObj.rarity && /\d/.test(cleanObj.rarity)) {
        cleanObj.rarity = ("t" + cleanObj.rarity) as Rarity;
    }

    return cleanObj;
}

function filterSameEntries(o1: object, o2: object) {

}

async function doWrite(items: ExportedItem[], shortId: string) {
    if (items.length === 1 && getTagById(items[0].tags ?? [], "masterwork") === undefined) {
        // single item case 
        const rawDumpPath = `data/monumenta/item_registry/${items[0].id}.json`;
        const cleanOutputPath = `data_clean/data/monumenta/plugin/items/${items[0].id}.json`;
        await mkdir(dirname(cleanOutputPath), {recursive: true, });
        await mkdir(dirname(rawDumpPath), {recursive: true, });

        await writeFile(rawDumpPath, JSON.stringify(items));
        await writeFile(cleanOutputPath, JSON.stringify(removeExportFields(items[0]), undefined, 4));
        // many item case 
    } else if (getTagById(items[0].tags ?? [], "masterwork") !== undefined) {
        const id = getId(items[0], false);
        const rawDumpPath = `data/monumenta/item_registry/${id}.json`;
        const cleanOutputPath = `data_clean/data/monumenta/plugin/items/${id}.json`;

        await mkdir(dirname(cleanOutputPath), {recursive: true, });
        await mkdir(dirname(rawDumpPath), {recursive: true, });

        await writeFile(rawDumpPath, JSON.stringify(items));
        await writeFile(cleanOutputPath, JSON.stringify(removeExportFields(items[0]), undefined, 4));

        await writeFile(cleanOutputPath, JSON.stringify({
            variants: Object.fromEntries(items.map(item => [`m${getTagById(item.tags ?? [], "masterwork")?.level}`, removeExportFields(item)])),
        }, undefined, 4));
    } else {
        const first = items[0];
        const res = items.filter((_, index) => index !== 0)
            .map(item => diff.diff(removeExportFields(first), removeExportFields(item)));

        console.log("WTF: " + shortId, items.map(x => x.oldPath));
        console.log(inspect(res, {
            depth: 100,
            colors: true,
        }));
    }
}

// eslint-disable-next-line no-constant-condition
if (false) {
    console.log(process("items/data/datapacks/base/data/epic/loot_tables/r3/charms/unique/scout/bloodhounds_crest.json"));
} else {
    rmSync("data", {recursive: true, force: true, });
    rmSync("data_clean", {recursive: true, force: true, });
    const rawItems = load();
    const uniqueItems = mappingUnique(rawItems, item => JSON.stringify(removeExportFields(item)));
    const itemByName = makeIdToItemsTable(uniqueItems);

    console.log("raw:", rawItems.length);
    console.log("unique:", uniqueItems.length);
    console.log("skipped:", skippedCount);
    console.log("named:", itemByName.size);

    // construct tree structure
    itemByName.forEach(doWrite);

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
