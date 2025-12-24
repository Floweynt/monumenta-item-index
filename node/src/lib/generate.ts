import {Component, ComponentFormatting, applyDefaultFormatting, applyFormatting} from "@shared/components";
import {AttributeTag, BookTag, CharmTag, CooldownTag, EnchantmentTag, Item, MasterworkTag, PotionTag, QuestItemTag, RenderedItem, Tag, getTagId} from "@shared/item";
import {getOrDefault, getSafe} from "@shared/utils";
import REGISTRY_META_RAW from "@blobs/item_registry_meta.json";
import ATTRIBUTE_BY_ID from "@blobs/whatever.json";
import ENCHANT_BLOB from "@blobs/enchants.json";
import POTION_BLOB from "@blobs/potions.json";
import CHARM_BLOB from "@blobs/charm.json";

interface PotionData {
    [key: string]: {
        displayName: string;
        isNegative?: boolean;
        displayLevel?: boolean | "percent" | "percent_bonus" | "percent_negate";
        displayDuration?: boolean;
    };
}

interface RegistryMeta {
    rarity: {
        [key: string]: {
            name_format: ComponentFormatting;
            text: Component;
        };
    };
    region_name: {
        [key: string]: string;
    };
    location_text: {
        [key: string]: Component;
    };
}

interface TagHandler {
    renderBegin(tag: Tag): Component[];
    renderEnd(tag: Tag): Component[];
}

const POTION_DATA = POTION_BLOB as PotionData;
const ENCHANT_DEFS = ENCHANT_BLOB.definitions;
const ENCHANT_LEVEL_DISABLE = new Set(ENCHANT_BLOB.properties.disable_level);

export const USAGE_BY_ID = {
    mainhand: "in Main Hand",
    offhand: "in Off Hand",
    head: "on Head",
    chest: "on Chest",
    legs: "on Legs",
    feet: "on Feet",
    projectile: "Shot",
};


const meta = REGISTRY_META_RAW as RegistryMeta;

const LORE_DEFAULT = {color: "dark_gray", italic: false, };

function fmtFloat(x: number, plus: boolean = true) {
    return (plus && x > 0 ? "+" : "") + Number.parseFloat(x.toPrecision(4));
}

function convertToRoman(num: number) {
    const roman = {
        M: 1000,
        CM: 900,
        D: 500,
        CD: 400,
        C: 100,
        XC: 90,
        L: 50,
        XL: 40,
        X: 10,
        IX: 9,
        V: 5,
        IV: 4,
        I: 1,
    };
    let str = "";

    for (const i of Object.keys(roman) as (keyof typeof roman)[]) {
        const q = Math.floor(num / roman[i]);
        num -= q * roman[i];
        str += i.repeat(q);
    }

    return str;
}

const HANDLERS: {[key: string]: TagHandler} = {
    "cooldown": {
        renderBegin: () => {
            return [];
        },
        renderEnd: (tag) => {
            const cooldownTag = tag as CooldownTag;
            return [{
                text: "Cooldown : ",
                extra: [{
                    text: cooldownTag.time === 0 ? "None" : "" + cooldownTag.time,
                    color: "#4AC2E5",
                }],
            }];
        },
    },
    "enchants": {
        renderBegin: (tag: Tag) => {
            const enchantTag = tag as EnchantmentTag;

            return enchantTag.enchants.map(([id, level]) => {
                const ench = getOrDefault(ENCHANT_DEFS, id, "<ERROR>");
                return {
                    text: ench + (ENCHANT_LEVEL_DISABLE.has(id) && level === 1 ? "" : " " + convertToRoman(level)),
                    color: "gray",
                    italic: false,
                };
            });
        },
        renderEnd: () => [],
    },
    "attributes": {
        renderBegin: () => [],
        renderEnd: (tag: Tag) => {
            const gearTag = tag as AttributeTag;
            const usage = getSafe(USAGE_BY_ID, gearTag.usage);
            return Array.of<Component>({
                text: `When ${usage}:`,
                color: "gray",
                italic: false,
            }).concat(gearTag.attributes.map(([id, operation, value]): Component => {
                const attr = getOrDefault(ATTRIBUTE_BY_ID, id, {name: id, type: "mod", });

                const positiveColor = (attr as any)?.color?.positive ?? "#5555FF";
                const negativeColor = (attr as any)?.color?.negative ?? "#FF5555";
                const color = value > 0 ? positiveColor : negativeColor;

                if (id === "knockback_resistance")
                    value *= 10; // IDK why

                if (operation === "add") {
                    return {
                        color: color,
                        text: `${fmtFloat(value)} ${attr.name}`,
                    };
                } else if (operation === "multiply") {
                    return {
                        color: color,
                        text: `${fmtFloat(value * 100)}% ${attr.name}`,
                    };
                } else if (operation === "base") {
                    return {
                        color: "dark_green",
                        text: `${fmtFloat(value, false)} ${attr.name}`,
                    };
                }

                throw Error("How did we get here");
            }));
        },
    },
    "book": {
        renderBegin: (tag) => {
            const bookTag = tag as BookTag;
            return [{
                ...LORE_DEFAULT,
                text: "By : ",
                extra: [{
                    text: bookTag.author,
                    color: "gold",
                }],
            }];
        },
        renderEnd: () => [],
    },
    "quest": {
        renderEnd: (tag) => {
            return [{
                text: "* Quest Item *",
                color: "#ff55ff",
            }, {
                text: "#Q" + (tag as QuestItemTag).id,
            }];
        },
        renderBegin: () => [],
    },
    "wand": {
        renderBegin: () => ["* Magic Wand *"],
        renderEnd: () => [],
    },
    "alch_potion": {
        renderBegin: () => ["* Alchemical Utensil *"],
        renderEnd: () => [],
    },
    "potion": {
        renderEnd: (tag) => [
            {
                text: "When Consumed:",
                color: "gray",
            },
            ...(tag as PotionTag).effects.map(([duration, level, id]): Component => {
                duration /= 20;
                const info = getOrDefault(POTION_DATA, id, {displayName: `<${id}>`, });
                const isNegative = info.isNegative ?? false;
                const displayLevel = info.displayLevel ?? true;
                const displayDuration = info.displayDuration ?? true;
                const parts: Component[] = [];
                const color = isNegative ? "#D02E28" : "#40C2E5";

                if (displayLevel === "percent") {
                    parts.push({
                        color,
                        text: `${fmtFloat(level * 100, false)}% `,
                    });
                } else if (displayLevel === "percent_bonus") {
                    parts.push({
                        color,
                        text: `${fmtFloat(level * 100)}% `,
                    });
                } else if (displayLevel === "percent_negate") {
                    parts.push({
                        color,
                        text: `${fmtFloat(-level * 100)}% `,
                    });
                }

                parts.push({
                    color,
                    text: `${info.displayName} `,
                });

                if (displayLevel === true) {
                    parts.push({
                        text: `${convertToRoman(level)} `,
                        color,
                    });
                }

                if (displayDuration) {
                    parts.push({
                        text: `(${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, "0")})`,
                        color: "dark_gray",
                    });
                }

                return {
                    text: "",
                    extra: parts,
                };
            })
        ],
        renderBegin: () => [],
    },
    "glint": {
        renderBegin: () => [],
        renderEnd: () => [],
    },
    "noglint": {
        renderBegin: () => [],
        renderEnd: () => [],
    },
    "material": {
        renderBegin: () => [{color: "gray", text: "Material", }],
        renderEnd: () => [],
    },
    "masterwork": {
        renderBegin: (tag) => {
            const level = (tag as MasterworkTag).level;
            return [{
                text: "", extra: [
                    "Masterwork : ",
                    {
                        color: "gold",
                        text: "★".repeat(level),
                    },
                    {
                        color: "dark_gray",
                        text: "☆".repeat(Math.max(4 - level, 0)),
                    }
                ],
            }];
        },
        renderEnd: () => [],
    },
    "charm": {
        renderBegin: () => [],
        renderEnd: (tag) => {
            const charm = tag as CharmTag;
            return [{
                text: "Charm Power : ",
                extra: [{
                    text: "★".repeat(charm.power),
                    color: "#FFFA75",
                }, {
                    text: " - ",
                    color: "dark_gray",
                }, CHARM_BLOB.class_text[charm.class]],
            }, {
                text: "When in Charm Slot:",
                color: "gray",
            }, ...charm.attributes.map(([id, type, value]) => {
                const info = getSafe(CHARM_BLOB.attributes, id);
                // T F 
                const color = info.isNegative !== value > 0 ? "#40C2E5" : "#D02E28";
                if (type === "multiply") {
                    return {
                        text: `${fmtFloat(value * 100)}% ${info.displayName}`,
                        color,
                    };
                } else {
                    return {
                        text: `${fmtFloat(value)} ${info.displayName}`,
                        color,
                    };
                }
            })];
        },
    },
};

function getRarityInfo(itemRarity: string | undefined) {
    if (itemRarity === undefined)
        return undefined;

    const res = meta.rarity[itemRarity];

    if (res === undefined)
        throw Error(`unknown rarity ${itemRarity}`);
    return res;
}

function getRegionInfo(itemRegion: string | undefined) {
    if (itemRegion === undefined)
        return undefined;

    const res = meta.region_name[itemRegion];

    if (res === undefined)
        throw Error(`unknown region ${itemRegion}`);
    return res;
}

function getLocationInfo(locationRegion: string | undefined) {
    if (locationRegion === undefined)
        return undefined;

    const res = meta.location_text[locationRegion];

    if (res === undefined)
        throw Error(`unknown location ${locationRegion}`);
    return res;
}

export function genItem(item: Item): RenderedItem {
    const rarityInfo = getRarityInfo(item.rarity);
    const regionInfo = getRegionInfo(item.region);
    const locationInfo = getLocationInfo(item.location);
    const tags = item.tags ?? [];

    const name = applyFormatting(item.name, rarityInfo?.name_format ?? {});
    const lore: Component[] = [];


    lore.push(...tags.flatMap(tag => getSafe(HANDLERS, typeof tag === "string" ? tag : tag.tag).renderBegin(tag)).map(lore => applyDefaultFormatting(LORE_DEFAULT, lore)));

    if (rarityInfo !== undefined && regionInfo !== undefined) {
        lore.push(
            {
                text: regionInfo + " : ",
                ...LORE_DEFAULT,
                extra: [
                    rarityInfo.text
                ],
            }
        );
    }

    if (locationInfo !== undefined) {
        lore.push(applyFormatting(locationInfo, {italic: false, }));
    }

    lore.push(...item.lore.map(line => applyDefaultFormatting(LORE_DEFAULT, line)));

    lore.push(...tags.flatMap(tag => getSafe(HANDLERS, typeof tag === "string" ? tag : tag.tag).renderEnd(tag)).map(lore => applyDefaultFormatting(LORE_DEFAULT, lore)));

    lore.push(`--tags: ${tags.map(u => getTagId(u)).join(" ")}`);
    lore.push(`--mc: ${item.item}`);

    if ("id" in item && typeof item.id === "string")
        lore.push(`--id: ${item.id}`);

    return {
        display: {
            Name: name,
            Lore: lore,
        },
    };
}
