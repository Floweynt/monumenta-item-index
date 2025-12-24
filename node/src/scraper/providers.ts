import {assert, createIs, is} from "typia";
import {InfoSupplier, ofLocation, ofLore, ofRegion, ofTag, withTag} from "./scraper";
import {Component, rawText} from "@shared/components";
import {Attribute, AttributeTag, AttributeUsage, CharmAttribute, CharmClass, Enchantment, EnchantmentTag, Rarity, Region} from "@shared/item";
import {inspect} from "util";
import REGISTRY_META from "@blobs/item_registry_meta.json";
import {componentParser} from "../lib/utils";
import ATTRIBUTE_DATA from "@blobs/whatever.json";
import ITEM_ATTR from "@blobs/item_attr.json";
import ENTITY_ATTR from "@blobs/entity_attr.json";
import {getOrDefault} from "@shared/utils";

interface CustomNameNBT {
    display?: {
        Name?: string;
    };
    title?: string;
}

const isCustomNameNBT = createIs<CustomNameNBT>();

export function nameDataProvider(data: unknown): InfoSupplier | undefined {
    if (isCustomNameNBT(data)) {
        const name = data.display?.Name;
        const title = data.title;
        if (name) {
            return {
                nameSupplier: () => componentParser(name),
            };
        } else if (title) {
            return {
                nameSupplier: () => title,
            };
        }
    }
}

interface MonumentaNBT {
    Monumenta: {
        Lore?: string[];
        Location?: string;
        Region?: string;
        Tier?: string;
    };
}

const isMonumentaNBT = createIs<MonumentaNBT>();

type RawLoreProcessor<T> = [RegExp, (result: RegExpExecArray, comp: Component) => T] | ((text: Component, raw: string, index: number, arr: Component[]) => T | undefined);

function parseLoreForInfo<T>(table: RawLoreProcessor<T>[], lore: Component[], fallback: (c: Component) => T): T[] {
    return lore.map((entry, i, arr) => {
        const raw = rawText(entry);
        for (const lore of table) {
            if (Array.isArray(lore)) {
                const res = lore[0].exec(raw);
                if (res === null) {
                    continue;
                }

                return lore[1](res, entry);
            } else {
                const res = lore(entry, raw, i, arr);
                if (res !== undefined)
                    return res;
            }
        }

        return fallback(entry);
    });
}

const MONUMENTA_LORE_PARSERS: RawLoreProcessor<InfoSupplier>[] = [
    (_comp, raw, index, arr) => {
        if (raw === "* Quest Item *") {
            const text = rawText(arr[index + 1]).slice(2);
            return ofTag({
                tag: "quest",
                id: text,
            });
        }
    },
    [/\* Magic Wand \*/, () => ofTag("wand")],
    [/#Q.+/, () => ({})]
];


export function monumentaTagProvider(data: unknown): InfoSupplier[] | undefined {
    if (!isMonumentaNBT(data))
        return;

    const supplier: InfoSupplier = {};

    const location = data.Monumenta.Location;
    const region = data.Monumenta.Region;
    const rarity = data.Monumenta.Tier;

    if (location) {
        supplier.locationSupplier = () => location;
    }

    if (region) {
        supplier.regionSupplier = () => region as Region;
    }

    if (rarity) {
        supplier.raritySupplier = () => rarity as Rarity;
    }

    return Array.of(supplier).concat(parseLoreForInfo(MONUMENTA_LORE_PARSERS, data.Monumenta.Lore?.map(u => componentParser(u)) ?? [], ofLore));
}

interface LoreNBT {
    display: {
        Lore: string[];
    };
}

const isLoreNBT = createIs<LoreNBT>();

const RAW_LORE_PARSERS: RawLoreProcessor<InfoSupplier>[] = [
    [/Cooldown\s*:\s*None/, () => ofTag({
        tag: "cooldown",
        time: 0,
        units: "s",
    })],
    [/Cooldown\s*:\s*(\d+)\s*(s|m)/, (res) => ofTag({
        tag: "cooldown",
        time: Number.parseInt(res[1]),
        units: res[2] as ("s" | "m"),
    })],
    [/King's Valley : (.+)/, (res) => {
        const base = ofRegion("valley");

        let q = res[1];
        if (q === "Patron Made")
            q = "Patron";

        const rarity = Object.entries(REGISTRY_META.rarity).filter(([, value]) => q === value.text.text)
            .map(([v]) => v);

        if (rarity.length !== 1)
            throw Error(inspect(q) + inspect(rarity));

        return {...base, raritySupplier: () => assert<Rarity>(rarity[0]), };
    }],
    [/Celsian Isles : (.+)/, (res) => {
        const base = ofRegion("isles");

        let q = res[1];
        if (q === "Patron")
            q = "Patron Made";

        const rarity = Object.entries(REGISTRY_META.rarity).filter(([, value]) => q === value.text.text)
            .map(([v]) => v);

        if (rarity.length !== 1)
            throw Error(inspect(q) + inspect(rarity));

        return {...base, raritySupplier: () => assert<Rarity>(rarity[0]), };
    }],
    [/Architect's Ring : Charm/, () => {
        return {
            raritySupplier: () => "charm",
            regionSupplier: () => "ring",
        };
    }],
    [/\* Magic Wand \*/, () => ofTag("wand")],
    (comp: Component, raw: string) => {
        if (typeof comp === "string")
            return;

        for (const ent of Object.entries(REGISTRY_META.location_text)) {
            const [key, value] = ent;

            if (raw.includes(rawText(value)))
                return ofLocation(key);
        }
    },
    (_comp, raw, index, arr) => {
        if (raw === "* Quest Item *") {
            const text = rawText(arr[index + 1]).slice(2);
            return ofTag({
                tag: "quest",
                id: text,
            });
        }
    },
    [/#Q.+/, () => ({})],
    //  EDGE CASE HANDLING!!! I FUCKING LOVE HANDLING EDGE CASES!!! I LOVE SPENDING HOURS DOING SOME MUNDANE STUPID BULLSHIT!!!!! 
    (comp: Component) => {
        if (typeof comp === "string")
            return;

        if (rawText(comp) === "Material" && !Array.isArray(comp) && comp.color === "gray") {
            return withTag<EnchantmentTag>("enchants", {tag: "enchants", enchants: [], }, (t) => t.enchants.push(["monumenta:material", 1]));
        }

        return;
    },
    (comp: Component) => {
        if (typeof comp === "string")
            return;

        if (rawText(comp) === "Unbreakable" && !Array.isArray(comp) && comp.color === "gray") {
            return withTag<EnchantmentTag>("enchants", {tag: "enchants", enchants: [], }, (t) => t.enchants.push(["monumenta:unbreakable", 1]));
        }

        return;
    }
];

export function rawLoreDataProvider(data: unknown): InfoSupplier[] {
    if (!isLoreNBT(data))
        return [];

    const lore = data.display.Lore.map(u => componentParser(u));

    return parseLoreForInfo(RAW_LORE_PARSERS, lore, ofLore);
}

interface BookNBT {
    pages: string[];
    title: string;
    author: string;
}

const isBookNBT = createIs<BookNBT>();

export function bookDataProvider(data: unknown): InfoSupplier | undefined {
    if (!isBookNBT(data))
        return;

    return ofTag({
        tag: "book",
        author: data.author,
        pages: data.pages.map(u => componentParser(u)),
        title: data.title,
    });
}

interface PotionNBT {
    Monumenta: {
        Stock: {
            Effects: {
                EffectDuration: number;
                EffectStrength: number;
                EffectType: string;
            }[];
        };
    };
    CustomPotionColor?: number;
}

const isPotionNBT = createIs<PotionNBT>();

export function potionDataProvider(data: unknown): InfoSupplier | undefined {
    if (!isPotionNBT(data))
        return;

    return ofTag({
        tag: "potion",
        effects: data.Monumenta.Stock.Effects.map(obj => [obj.EffectDuration, obj.EffectStrength, obj.EffectType]),
    });
}

interface EnchantmentNBT {
    Monumenta?: {
        Stock?: {
            Enchantments?: {
                [key: string]: {
                    Level: number;
                };
            };
        };
    };
    Enchantments?: {
        lvl: number;
        id: string;
    }[];
}

const isEnchantmentNBT = createIs<EnchantmentNBT>();

export function enchantmentDataProvider(data: unknown): InfoSupplier | undefined {
    if (!isEnchantmentNBT(data))
        return;
    const enchants: Enchantment[] = [];

    if (data.Enchantments !== undefined) {
        enchants.push(...data.Enchantments.map(u => [u.id, u.lvl] as Enchantment));
    }

    const parsedEnchants = data?.Monumenta?.Stock?.Enchantments;

    if (parsedEnchants !== undefined) {
        enchants.push(...Object.entries(parsedEnchants).map(([key, value]) => [key, value.Level] as Enchantment));
    }

    if (enchants.length === 0)
        return;

    const actualEnchants: Enchantment[] = [];

    for (const enchant of enchants) {
        if (enchant[0] === "MainhandOffhandDisable")
            continue;
        if (enchant[0] === "OffhandMainhandDisable")
            continue;
        actualEnchants.push(enchant);
    }

    return withTag<EnchantmentTag>("enchants", {
        tag: "enchants",
        enchants: [],
    }, (tag) => {
        tag.enchants.push(...actualEnchants);
    });
}

interface AttributeNBT {
    Monumenta?: {
        Stock?: {
            Attributes?: {
                Operation: "add" | "multiply";
                AttributeName: string;
                Amount: number;
                Slot?: string;
            }[];
        };
    };
    AttributeModifiers?: {
        Operation: number;
        AttributeName: string;
        Amount: number;
        Slot?: string;
    }[];
}

const isAttributeNBT = createIs<AttributeNBT>();

const MC_ATTR_NAMES: {[key: string]: string} = {
    "minecraft:generic.max_health": "Max Health",
    "minecraft:generic.movement_speed": "Speed",
    "minecraft:generic.knockback_resistance": "Knockback Resistance",
    "minecraft:generic.attack_speed": "Attack Speed",
    "minecraft:generic.armor_toughness": "Armor",
};

const ID_2_MC_ATTR_ID: {[key: string]: string} = {
    "attack_speed": "minecraft:generic.attack_speed",
    "attack_damage": "minecraft:generic.attack_damage",
};

const DEFAULT_SLOTS: [string, string][] = [
    ["chestplate", "chest"]
];

// WARNING: SHITTY TYPESCRIPT!
function computeAttributeBase(item: string, attribute: string) {
    const entityBase = ENTITY_ATTR["minecraft:player"];
    const itemBase = ITEM_ATTR[item as keyof typeof ITEM_ATTR] ?? {};

    const mcId = getOrDefault(ID_2_MC_ATTR_ID, attribute, attribute);

    const entityBaseValue = entityBase[mcId as keyof typeof entityBase] ?? 0;
    const itemBaseValue = itemBase[mcId as keyof typeof itemBase] ?? 0;

    return itemBaseValue + entityBaseValue;
}

export function attributeDataProvider(item: string, data: unknown): InfoSupplier | undefined {
    if (!isAttributeNBT(data))
        return;

    if (!item.startsWith("minecraft:"))
        item = `minecraft:${item}`;

    const attributes: [string, string, number, string][] = [];

    const mmAttr = data?.Monumenta?.Stock?.Attributes;

    const defaultSlot = DEFAULT_SLOTS.filter(([v]) => item.includes(v))[0]?.[1];
    if (mmAttr !== undefined) {
        attributes.push(...mmAttr.map((u): [string, string, number, string] => [u.AttributeName, u.Operation, u.Amount, u.Slot ?? defaultSlot ?? "unk"]));
    }

    if (data.AttributeModifiers !== undefined) {
        attributes.push(...data.AttributeModifiers.map((u): [string, string, number, string] =>
            [u.AttributeName, ["add", "multiply", "multiply"][u.Operation], u.Amount, u.Slot ?? defaultSlot ?? "unk"]));
    }


    if (attributes.length === 0)
        return;

    // attempt to figure out the proper attribute tags...
    const realAttr = attributes.map(([id, operation, number, part]): [string, string, number, string] => {
        if (id in MC_ATTR_NAMES) {
            id = MC_ATTR_NAMES[id];
        }

        if (id.endsWith(" Add")) {
            id = id.slice(0, id.length - 4);
        } if (id.endsWith(" Multiply")) {
            id = id.slice(0, id.length - 9);
        }

        // try and guess the attribute...
        const guess = Object.entries(ATTRIBUTE_DATA).filter(([, v]) => {
            return id === v.name;
        });

        if (guess.length !== 1) {
            throw Error(`oops: attribute ${id} not impl`);
        }

        const attrInfo = guess[0];

        // super fun conditional 
        if ((attrInfo[1].type === "base" && operation === "add" || (attrInfo[0] === "projectile_speed" && operation === "multiply" && !item.includes("arrow"))) && part === "mainhand") {
            // okay, figure out WTF it's supposed to be...
            // can SOMEONE please EXPLAIN why THIS is SO CANCER?;
            if (attrInfo[0] === "projectile_speed" || attrInfo[0] === "projectile_damage" || attrInfo[0] === "potion_damage" || attrInfo[0] === "potion_radius") {
                // don't have to deal with MC bullshit :3 : 3 :3 
                return [attrInfo[0], "base", number, part];
            }

            return [attrInfo[0], "base", computeAttributeBase(item, attrInfo[0]) + number, part];
        }

        return [
            attrInfo[0],
            assert<"add" | "multiply">(operation),
            number,
            part
        ];
    });

    // partition array 
    const handedness = [...new Set(realAttr.map(([, , , v]) => v))];
    return ofTag(handedness.map((u): AttributeTag | undefined => {
        if (!is<AttributeUsage>(u))
            return;

        const matches = realAttr.filter(([, , , v]) => u === v).map(([a, b, c]) => assert<Attribute>([a, b, c]));

        const hasAttackDamage = matches.filter(([id, type]) => id === "attack_damage" && type === "base").length !== 0;
        const hasAttackSpeed = matches.filter(([id, type]) => id === "attack_speed" && type === "base").length !== 0;

        if (hasAttackDamage && !hasAttackSpeed) {
            matches.push(["attack_speed", "base", computeAttributeBase(item, "attack_speed")]);
        } else if (!hasAttackDamage && hasAttackSpeed) {
            matches.push(["attack_damage", "base", computeAttributeBase(item, "attack_damage")]);
        }

        return {
            tag: "attributes",
            attributes: matches,
            usage: u,
        };
    }).filter((u): u is AttributeTag => u !== undefined));
}

interface MasterworkNBT {
    Monumenta: {
        Masterwork: string;
    };
}

const isMasterworkNBT = createIs<MasterworkNBT>();

export function masterworkProvider(data: unknown): InfoSupplier | unknown {
    if (!isMasterworkNBT(data))
        return;

    return ofTag({
        tag: "masterwork",
        level: Number.parseInt(data.Monumenta.Masterwork),
    });
}

interface CharmNBT {
    Monumenta: {
        CharmText: string[];
        CharmPower: number;
    };
    display: {
        Lore: string[];
    };
}

const isCharmNBT = createIs<CharmNBT>();

const CHARM_PROCESSOR: RawLoreProcessor<CharmAttribute>[] = [
    [/\+([0-9.]+)% (.+)/, (result): CharmAttribute => {
        return [result[2].toLowerCase().replaceAll(" ", "_"), "multiply", Number.parseFloat(result[1]) / 100];
    }],
    [/-([0-9.]+)% (.+)/, (result): CharmAttribute => {
        return [result[2].toLowerCase().replaceAll(" ", "_"), "multiply", -Number.parseFloat(result[1]) / 100];
    }],
    [/\+([0-9.]+) (.+)/, (result): CharmAttribute => {
        return [result[2].toLowerCase().replaceAll(" ", "_"), "add", Number.parseFloat(result[1])];
    }],
    [/-([0-9.]+) (.+)/, (result): CharmAttribute => {
        return [result[2].toLowerCase().replaceAll(" ", "_"), "add", -Number.parseFloat(result[1])];
    }]
];

export function charmProvider(data: unknown): InfoSupplier | undefined {
    if (!isCharmNBT(data))
        return;

    const res = / - (.+)/.exec(rawText(componentParser(data.display.Lore[1])));
    if (res === null)
        throw Error();

    const className = res[1].toLowerCase();

    // okay try and parse lore
    const attr = parseLoreForInfo(CHARM_PROCESSOR, data.Monumenta.CharmText.map(componentParser), (lore) => {
        throw Error(rawText(lore));
    });

    return ofTag({
        tag: "charm",
        class: assert<CharmClass>(className.toLowerCase()),
        power: data.Monumenta.CharmPower,
        attributes: attr,
    });
}

