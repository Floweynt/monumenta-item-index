import {Component, ComponentFormatting, getComponentText, mergeFormatting} from "@shared/components";
import {getSafe, mapPrim} from "@shared/utils";
import {ReactNode} from "react";
import {RenderedItem} from "@shared/item";

const colorMap: {[key: string]: string} = {
    black: "#000000",
    dark_blue: "#0000aa",
    dark_green: "#00aa00",
    dark_aqua: "#00aaaa",
    dark_red: "#aa0000",
    dark_purple: "#aa00aa",
    gold: "#ffaa00",
    gray: "#aaaaaa",
    dark_gray: "#555555",
    blue: "#5555ff",
    green: "#55ff55",
    aqua: "#55ffff",
    red: "#ff5555",
    light_purple: "#ff55ff",
    yellow: "#ffff55",
    white: "#ffffff",
};

function renderJsonComponentImpl(comp: Component, fmt: ComponentFormatting): ReactNode {
    fmt = typeof comp === "string" ? fmt : mergeFormatting(fmt, comp);

    // generate HTML tags
    const tag = ([
        [fmt.bold, (x: ReactNode) => (<b>{x}</b>)],
        [fmt.italic, (x: ReactNode) => (<i>{x}</i>)],
        [fmt.strikethrough, (x: ReactNode) => (<s>{x}</s>)],
        [fmt.underline, (x: ReactNode) => (<u>{x}</u>)]
    ] as [boolean | undefined, (x: ReactNode) => ReactNode][]).reduce<ReactNode>((old, [flag, tag]) => {
        if (flag)
            return tag(old);
        return old;
    }, getComponentText(comp));

    return (<>
        <span style={{
            color: mapPrim(fmt.color, (c) => c.startsWith("#") ? c : getSafe(colorMap, c)),
            fontSize: 20,
        }} >
            {tag}
        </span >
        <>
            {(() => {
                if (typeof comp === "string")
                    return [];

                return comp?.extra?.map(u => renderJsonComponent(u, fmt)) ?? [];
            })()}
        </>
    </>);
}

function renderJsonComponent(comp: Component, fmt: ComponentFormatting): ReactNode {
    fmt = typeof comp === "string" ? fmt : mergeFormatting(fmt, comp);
    return renderJsonComponentImpl(comp, fmt);
}

export function MCItem(props: {item: RenderedItem}) {
    try {
        const item = props.item;
        const title = structuredClone(item.display.Name);
        const lore = structuredClone(item.display.Lore);

        const titleText = renderJsonComponent(title, {color: "white", });
        const loreText = lore.map(lore => renderJsonComponent(lore, {italic: true, "color": "dark_purple", })).map(u => (<p style={{fontSize: 0, }}>{u}</p>));

        return (
            <div style={{
                backgroundColor: "black",
                border: "5pt solid #330055",
                padding: "5pt",
                margin: "5pt",
                verticalAlign: "top",
                display: "inline-block",
            }}>
                <p style={{fontSize: 0, }}>
                    {titleText}
                </p>
                {loreText}
            </div>
        );

    } catch (e) {
        return (
            <div style={{
                backgroundColor: "black",
                border: "5pt solid #330055",
                padding: "5pt",
                display: "inline-block",
                verticalAlign: "top",
                margin: "5pt",
            }}>
                {`${e}`}
            </div>
        );
    }
}


