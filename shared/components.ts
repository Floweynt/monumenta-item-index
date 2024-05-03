import {merge} from "./utils";

export interface ComponentFormatting {
    // properties and stuff
    color?: string;
    font?: string;
    bold?: boolean;
    // formatting 
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    obfuscated?: boolean;
}

// JSON component information 
export interface JsonComponentBase extends ComponentFormatting {
    extra?: Component[];
}

export interface TextComponent extends JsonComponentBase {
    type?: "text";
    text: string;
}

export interface KeybindComponent extends JsonComponentBase {
    type?: "keybind";
    keybind: string;
}

export interface TranslatedComponent extends JsonComponentBase {
    type?: "translatable";
    translate: string;
    fallback?: string;
    with?: Component[];
}

export type JsonComponent = TextComponent | TranslatedComponent | KeybindComponent;
export type RawComponent = string | JsonComponent;
export type Component = RawComponent | RawComponent[];

export function normalizeFormatting(format: ComponentFormatting): ComponentFormatting {
    return {
        bold: format.bold,
        color: format.color,
        font: format.font,
        italic: format.italic,
        obfuscated: format.obfuscated,
        strikethrough: format.strikethrough,
        underline: format.underline,
    };
}

export function getComponentText(comp: RawComponent): string {
    if (typeof comp === "string") {
        return comp;
    } else {
        if ("text" in comp) {
            return comp.text;
        } else if ("translate" in comp) {
            return comp.translate ?? comp.fallback;
        } else if ("keybind" in comp) {
            return comp.keybind;
        } else {
            throw Error("Illegal component " + JSON.stringify(comp));
        }
    }
}

export function mergeFormatting(base: ComponentFormatting, diff: ComponentFormatting): ComponentFormatting {
    return normalizeFormatting(merge(base, diff));
}

export function applyFormatting(c: Component, format: ComponentFormatting): JsonComponent {
    format = normalizeFormatting(format);

    if (typeof c === "string") {
        return merge(
            {text: c, },
            format
        );
    } else if (Array.isArray(c)) {
        if (c.length === 0)
            return {text: "foo", } as TextComponent;

        const res = applyFormatting(c[0], format);
        if (res.extra === undefined) {
            res.extra = c.slice(1);
        } else {
            res.extra = res.extra.concat(c.slice(1));
        }
        return res;
    } else {
        return merge(c, format);
    }
}

export function applyDefaultFormatting(format: ComponentFormatting, c: Component): JsonComponent {
    format = normalizeFormatting(format);

    if (typeof c === "string") {
        return merge(
            format,
            {text: c, }
        );
    } else if (Array.isArray(c)) {
        if (c.length === 0)
            return {text: "", };

        const res = applyDefaultFormatting(format, c[0]);
        if (res.extra === undefined) {
            res.extra = c.slice(1);
        } else {
            res.extra = res.extra.concat(c.slice(1));
        }
        return res;
    } else {
        return merge(
            format,
            c
        );
    }
}

export function rawText(data: Component): string {
    if (typeof data === "string") {
        return data;
    }

    if (Array.isArray(data)) {
        return data.map(u => rawText(u)).join("");
    }

    if ("text" in data) {
        return data.text + (data.extra ?? []).map(u => rawText(u)).join("");
    }

    if ("translate" in data) {
        return (data.translate ?? data.fallback ?? "err") + (data.extra ?? []).map(u => rawText(u)).join("");
    }

    if ("keybind" in data) {
        return data.keybind + (data.extra ?? []).map(u => rawText(u)).join("");
    }

    throw Error("not impl");
}

export function optimize(component: Component, defaultFormatting: ComponentFormatting) {
    defaultFormatting = normalizeFormatting(defaultFormatting);
}
