import express from "express";
import {Item} from "./item";
import {genItem} from "./lib/generate";
import {readFileSync} from "fs";
import {assertParse} from "typia/lib/json";
import {componentParser} from "./lib/utils";
import {ItemResponse} from "@shared/api";
import {rawText} from "@shared/components";

export interface DisplayableItemNBT {
    display?: {
        Name?: string;
        Lore?: string[];
    };
}

const data = assertParse<(Item & {rawNBT: DisplayableItemNBT})[]>(readFileSync(process.argv[2]).toString());
const app = express();
const port = 8000;

function compute(): ItemResponse {
    return {
        items: data.map(item => {
            return [
                genItem(item),
                {
                    display: {
                        Name: componentParser(item.rawNBT?.display?.Name ?? "\"???\""),
                        Lore: item.rawNBT?.display?.Lore?.map(line => componentParser(line)) ?? [],
                    },
                }
            ];
        }),
    };
}

app.get("/api/all", (_req, res) => {
    res.type("json").status(200).send(JSON.stringify(compute()));
});

app.get("/api/diff", (_req, res) => {
    const responseData = compute();

    responseData.items = responseData.items.filter(([r, l]) => {
        // super annoying heuristic
        const rp = r.display.Lore.map(line => rawText(line).trim()).filter(s => !/^(By : |==|--)/.test(s)).filter(s => s.length !== 0).sort();
        const lp = l.display.Lore.map(line => rawText(line).trim()).filter(s => s.length !== 0).sort();

        return JSON.stringify(rp) !== JSON.stringify(lp);
    });

    res.type("json").status(200).send(JSON.stringify(responseData));
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});

