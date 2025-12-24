import {Component} from "./components";

export type Rarity =
    "0" | "1" | "2" | "3" | "4" | "5" |
    "epic" | "artifact" | "rare" | "uncommon" | "common" |
    "charm" | "rarecharm" | "epiccharm" |
    "fish" | "unique" | "trophy" | "event" | "patron" | "key" | "legacy" | "currency" | "obfuscated" | "legendary" | "event_currency";

export type Region = "valley" | "isles" | "ring";
export type AttributeUsage = "mainhand" | "offhand" | "head" | "chest" | "legs" | "feet" | "projectile";
// length strength 
export type Effect = [number, number, string];
export type Enchantment = [string, number];
export type Attribute = [string, "add" | "base" | "multiply", number];
export type CharmAttribute = [string, "multiply" | "add", number];
export type Class = "shaman" | "warlock" | "mage" | "scout" | "rogue" | "warrior" | "cleric" | "alchemist";
export type CharmClass = Class | "generalist";

export interface EnchantmentTag {
    tag: "enchants";
    enchants: Enchantment[];
}

export interface AttributeTag {
    tag: "attributes";
    usage: AttributeUsage;
    attributes: Attribute[];
}

export interface BookTag {
    tag: "book";
    pages: Component[];
    author: string;
    title: string;
}

export interface CooldownTag {
    tag: "cooldown";
    time: number;
    units: "m" | "s";
}

export interface KeybindTag {
    tag: "keybind";
    keybinds: string[];
    description: Component[];
}

export interface QuestItemTag {
    tag: "quest";
    id: string;
}

export interface PotionTag {
    tag: "potion";
    effects: Effect[];
}

export interface MasterworkTag {
    tag: "masterwork";
    level: number;
}

export interface CharmTag {
    tag: "charm";
    class: CharmClass;
    power: number;
    attributes: CharmAttribute[];
}

export type Tag = "wand" | "glint" | "noglint" | "material" | "alch_potion" |
    EnchantmentTag | AttributeTag | CooldownTag | BookTag | KeybindTag | QuestItemTag | PotionTag | MasterworkTag | CharmTag;

export type TagResult<T extends string> = (Extract<Tag, T> | Extract<Tag, {tag: T}>);

export function getTagId(tag: Tag) {
    return typeof tag === "string" ? tag : tag.tag;
}

export function getTagById<T extends string>(tags: Tag[], id: T): TagResult<T> | undefined {
    return tags.find((x): x is TagResult<T> => getTagId(x) === id);
}

// Represents an item, with some properties
export interface Item {
    name: Component;
    item: string;

    rarity?: Rarity;
    region?: Region;
    location?: string;

    lore: Component[];

    // like "alchemist_potion", "masterwork", to enable "components" for ECS-like behavior 
    tags?: Tag[];

    // allows for plugins to hook into this item's behavior 
    plugin_implementation?: string;
}

export interface RenderedItem {
    display: {
        Name: Component;
        Lore: Component[];
    };
}

