import {readFileSync, writeFileSync} from "fs";
import {argv, exit} from "process";
import * as jsondiffpatch from "jsondiffpatch";

const diff = jsondiffpatch.create();
const args = argv.slice(1);

if (args.length !== 5) {
    console.error(`${args[0]} [patch/diff] [old] [new] [diff]`);
    exit(-1);
}

if (!["patch", "diff"].includes(args[1])) {
    console.error(`${args[0]} [patch/diff] [old] [new] [diff]`);
    exit(-1);
}

if (args[1] === "patch") {
    const oldValue = JSON.parse(readFileSync(args[2]).toString());
    const delta = JSON.parse(readFileSync(args[4]).toString());
    writeFileSync(args[3], JSON.stringify(diff.patch(oldValue, delta as jsondiffpatch.Delta)));
} if (args[1] === "diff") {
    const oldValue = JSON.parse(readFileSync(args[2]).toString());
    const newValue = JSON.parse(readFileSync(args[3]).toString());
    writeFileSync(args[4], JSON.stringify(diff.diff(oldValue, newValue)));
}
