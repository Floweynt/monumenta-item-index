import {AttributeTag, Enchantment, EnchantmentTag, Item, PotionTag, Rarity, Region, Tag, getTagId} from "@shared/item";
import {Component} from "@shared/components";
import {flatOf, unique} from "@shared/utils";
import ENCHANT_BLOB from "@blobs/enchants.json";
import {exit} from "process";

const ENCHANT_DEFS = ENCHANT_BLOB.definitions;

export class GatheredItemInfo {
    public name?: Component;
    public lore: Component[] = [];
    public tags: Tag[] = [];

    public region?: Region;
    public rarity?: Rarity;
    public location?: string;

    public build(item: string): Item {
        if (this.name === undefined)
            throw Error("name is null");

        if (item.startsWith("minecraft:"))
            item = item.slice("minecraft:".length);

        this.tags.filter((x): x is EnchantmentTag => getTagId(x) === "enchants").forEach(tag => {
            tag.enchants = unique(tag.enchants.map((enchant): Enchantment => {
                if (!(enchant[0] in ENCHANT_DEFS)) {
                    let res = Object.entries(ENCHANT_DEFS).filter(([, v]) => v === enchant[0]);
                    if (res.length === 0) {
                        const val = (ENCHANT_BLOB.fallback as any)[enchant[0]];
                        if (val !== undefined) {
                            res = [[val, enchant[0]]];
                        }
                    }

                    if (res.length !== 1) {
                        console.log("unknown enchant", enchant[0], this.name);
                        return ["minecraft:unknown", 0];
                    }

                    return [res[0][0], enchant[1]];
                }

                return enchant;
            })).filter(([id, level]) => {
                if (id === "minecraft:power" && level === 1) {
                    this.tags.push("glint");
                    return false;
                }
                if (id === "monumenta:magic_wand" && level === 1) {
                    this.tags.push("wand");
                    return false;
                }

                if (["helmet", "head", "leggings", "chestplate"].find(x => item.includes(x)) === undefined && id === "minecraft:aqua_affinity" && level === 1) {
                    this.tags.push("glint");
                    return false;
                }

                if (id === "monumenta:noglint" && level === 1) {
                    this.tags.push("noglint");
                    return false;
                }

                if (id === "monumenta:material" && level === 1) {
                    this.tags.push("material");
                    return false;
                }

                if (id === "monumenta:alchemical_utensil" && level === 1) {
                    this.tags.push("alch_potion");
                    return false;
                }

                if (["monumenta:hideinfo", "monumenta:hideenchants", "monumenta:hideattributes", "monumenta:delete_on_shatter"].indexOf(id) !== -1) {
                    return false;
                }

                return true;
            });
        });

        this.tags.filter((x): x is AttributeTag => getTagId(x) === "attributes").forEach(tag => {
            tag.attributes = unique(tag.attributes.filter(([id, type, amount]) => {
                if (id === "armor" && type === "multiply" && amount === 1)
                    return false;

                return true;
            }));
        });

        this.tags.filter((x): x is PotionTag => getTagId(x) === "potion").forEach(tag => {
            tag.effects = unique(tag.effects);
        });

        return {
            item,
            name: this.name,
            lore: this.lore,
            tags: unique(this.tags),
            region: this.region,
            location: this.location,
            rarity: this.rarity,
        };
    }

    public apply(supplier: InfoSupplier) {
        if (supplier.tagSupplier) {
            this.tags.push(...supplier.tagSupplier());
        }

        if (supplier.regionSupplier) {
            const region = supplier.regionSupplier();
            if (this.region !== undefined && this.region !== region) {
                throw Error(`Inconsistent info; region: ${this.region}, but also supplied ${region}`);
            }

            this.region = region;
        }

        if (supplier.raritySupplier) {
            const rarity = supplier.raritySupplier();
            if (this.rarity !== undefined && this.rarity !== rarity) {
                throw Error(`Inconsistent info; rarity: ${this.rarity}, but also supplied ${rarity}`);
            }

            this.rarity = rarity;
        }

        if (supplier.locationSupplier) {
            const location = supplier.locationSupplier();
            if (this.location !== undefined && this.location !== location) {
                throw Error(`Inconsistent info; location: ${this.location}, but also supplied ${location}`);
            }

            this.location = location;
        }

        if (supplier.nameSupplier) {
            this.name = supplier.nameSupplier();
        }

        if (supplier.tagTransformer) {
            supplier.tagTransformer(this.tags);
        }

        if (supplier.loreSupplier) {
            this.lore.push(...supplier.loreSupplier());
        }
    }
}

export interface InfoSupplier {
    tagSupplier?: () => Tag[];
    tagTransformer?: (tags: Tag[]) => void;
    regionSupplier?: () => Region;
    raritySupplier?: () => Rarity;
    locationSupplier?: () => string;
    nameSupplier?: () => Component;
    loreSupplier?: () => Component[];
}

export function ofTag(tag: Tag | Tag[]): InfoSupplier {
    return {tagSupplier: () => flatOf(tag), };
}

export function ofLore(lore: Component | Component[]): InfoSupplier {
    return {loreSupplier: () => flatOf(lore), };
}

export function ofLocation(location: string): InfoSupplier {
    return {locationSupplier: () => location, };
}

export function ofRegion(region: Region): InfoSupplier {
    return {regionSupplier: () => region, };
}

export function withTag<T extends Tag>(tag: string, def: T, handler: (x: T) => void) {
    return {
        tagTransformer: (tags: Tag[]) => {
            const items = tags.filter(ent => getTagId(ent) === tag);
            let value: T;

            if (items.length === 0) {
                tags.push(def);
                value = def;
            } else {
                value = items[0] as T;
            }

            handler(value);
        },
    };
}

