import {Component} from "@shared/components";
import {findKey} from "@shared/utils";
import {readdirSync} from "fs";
import {join} from "path";
import {IValidation, assert} from "typia";
import {createValidateParse} from "typia/lib/json";
import {inspect} from "util";

export function* walkDirSync(dir: string): Generator<string> {
    const files = readdirSync(dir, {withFileTypes: true, });
    for (const file of files) {
        if (file.isDirectory()) {
            yield* walkDirSync(join(dir, file.name));
        } else {
            yield join(dir, file.name);
        }
    }
}

const componentParserImpl = checkParse(() => createValidateParse<Component>());

export const componentParser = (str: string) => {
    try {
        return componentParserImpl(str);
    } catch(e) {
        const slowPath = (obj: object, key: string, val: unknown) => {
            if(val === "true")
                (obj as any)[key] = true;
            else if(val === "false")
                (obj as any)[key] = false;
        };

        let object = JSON.parse(str);

        if(Array.isArray(object)) {
            object = {
                text: "",
                extra: object,
            };
        }

        ["bold", "italic"].forEach(k => findKey(object, k, slowPath));

        return assert<Component>(object);
    }
};

export function checkParse<T>(c: () => (parser: string) => IValidation<T>): (str: string) => T {
    const is = c();
    return (str: string) => {
        const res = is(str);
        if (res.success) {
            return res.data;
        } else {
            throw Error(inspect(res.errors));
        }
    };
}

