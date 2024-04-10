import {BufReader, makeLexerData} from "./lexer";

const LEXER_INFO = makeLexerData(`
ASMA5v////8WAAEBCAIFARICAQEBAwEBBAQBAQQFAQYBBwEBAQgKCQEKAQEFBwELAQcGDAEHAg0BBwY
OAQcHDwEQAREBAQEHAQEBBwESAQcJEwEHBg4BBwcUAQEBFQEBggEBAX8BAgEDAQQBBQEGAQcBCAEJAX
8BBwQKAX8BCwEHAgwBDQF/GA4BfxMPAxABDwwRAQ8FEgQTARILFAESBX8cFQIWAX8CFQR/AxUCfwgVA
38CFQR/AxUCfwgVAhcBfwIYARUBGQEaAX8DGAEZAX8jGwEcAR0Bf8wADgF/Ew8DEAEPDBEBDwV/Fh4W
EgQTARILFAESBX8WHxZ/BhUDfwIVBH8DFQJ/CBUCFwF/AhgBFQEZARoBfwMYARkBfwgVAhcBfwIYARU
BGQEaAX8DGAEZAX8IFQN/AhUEfwMVAn8IFQN/AhUEfwMVAn8IFQN/AhUEfwMVAn8MIAF/FSEBfxUiAX
8LDwMQAQ8MEQEPBRIEEwESCxQBEgV/wgA=
`);

interface Token {
    type: TokenType;
    data?: string | number | bigint | Int8Array | Int32Array | BigInt64Array | boolean;
}

enum TokenType {
    BYTE,
    SHORT,
    INTEGER,
    LONG,
    FLOAT,
    DOUBLE,
    STRING,
    IDENTIFIER,
    BOOLEAN,

    COLON,
    COMMA,

    CLOSE_COMPOUND,
    OPEN_COMPOUND,

    OPEN_LIST,
    OPEN_BYTE_ARR,
    OPEN_INT_ARR,
    OPEN_LONG_ARR,
    CLOSE_LIST,

    EOF
}

class SNBTParser {
    private currentToken: Token;
    private reader: BufReader;

    private printCurr() {
        /*console.log({
            ...this.currentToken,
            type: TokenType[this.currentToken.type],
        });*/
    }

    public constructor(buf: Buffer) {
        this.reader = new BufReader(buf);
        this.currentToken = this.readToken();
        this.printCurr();
    }

    private consume() {
        const curr = this.currentToken;
        this.currentToken = this.readToken();
        this.printCurr();
        return curr;
    }

    private curr() {
        return this.currentToken;
    }

    private static fromIdentifier(str: string) {
        if (str === "true") return {type: TokenType.BOOLEAN, data: true, };
        if (str === "false") return {type: TokenType.BOOLEAN, data: false, };

        const tok = {type: TokenType.IDENTIFIER, data: str, };
        if (str.toLowerCase().endsWith("f")) {
            const num = Number.parseFloat(str.slice(0, str.length - 1));
            if (Number.isNaN(num) || !Number.isFinite(num))
                return tok;

            return {type: TokenType.FLOAT, data: num, };
        }
        if (str.toLowerCase().endsWith("d")) {
            const num = Number.parseFloat(str.slice(0, str.length - 1));
            if (Number.isNaN(num) || !Number.isFinite(num))
                return tok;

            return {type: TokenType.FLOAT, data: num, };
        }

        const num = Number.parseFloat(str);
        if (Number.isNaN(num) || !Number.isFinite(num))
            return tok;

        return {type: TokenType.FLOAT, data: num, };
    }

    private readToken(): Token {
        // reset lexer
        let state = LEXER_INFO.start;
        let latestMatch = -1;
        let start = this.reader.getHead();

        // eslint-disable-next-line no-constant-condition
        while (true) {
            state =
                LEXER_INFO.transition[state * LEXER_INFO.classCount + LEXER_INFO.classifier[this.reader.consume()]];

            if (state !== -1 && LEXER_INFO.endMask[state]) {
                latestMatch = state;
                this.reader.commit();
            }

            if (state === -1) {
                if (latestMatch === -1) {
                    // report error
                    throw new Error("internal lexer error");
                }

                this.reader.rewind();

                switch (latestMatch) {
                case 6: case 7: case 21: return SNBTParser.fromIdentifier(this.reader.slice(start));
                case 9: return {type: TokenType.COLON, };
                case 11: return {type: TokenType.CLOSE_LIST, };
                case 34: return {type: TokenType.OPEN_LONG_ARR, };
                case 19: return {type: TokenType.STRING, data: eval(this.reader.slice(start)), };
                case 2: case 14: break;
                case 12: return {type: TokenType.OPEN_COMPOUND, };
                case 16: return {type: TokenType.STRING, data: eval(this.reader.slice(start)), };
                case 26: return {type: TokenType.SHORT, data: Number.parseInt(this.reader.slice(start, -1)), };
                case 1: return {type: TokenType.EOF, };
                case 25: return {type: TokenType.LONG, data: Number.parseInt(this.reader.slice(start, -1)), };
                case 10: return {type: TokenType.OPEN_LIST, };
                case 13: return {type: TokenType.CLOSE_COMPOUND, };
                case 5: return {type: TokenType.COMMA, };
                case 8: case 22: case 23: return {type: TokenType.INTEGER, data: Number.parseInt(this.reader.slice(start)), };
                case 32: return {type: TokenType.OPEN_BYTE_ARR, };
                case 33: return {type: TokenType.OPEN_INT_ARR, };
                case 24: return {type: TokenType.BYTE, data: Number.parseInt(this.reader.slice(start, -1)), };
                }

                // reset lexer
                state = LEXER_INFO.start;
                latestMatch = -1;
                start = this.reader.getHead();
            }
        }
    }

    private expect(type: TokenType) {
        const val = this.curr();
        if (val.type !== type)
            throw Error(`expected: ${TokenType[type]}, but got ${TokenType[val.type]}`);
        return val;
    }

    private eat(type: TokenType) {
        const val = this.consume();
        if (val.type !== type)
            throw Error(`expected: ${TokenType[type]}, but got ${TokenType[val.type]}`);
        return val;
    }

    private eatToken<T>(type: TokenType): T {
        return this.eat(type).data as T;
    }

    public parse(): unknown {
        const tok = this.curr();
        switch (tok.type) {
        case TokenType.OPEN_COMPOUND:
            return this.parseCompound();
        case TokenType.OPEN_LIST:
            return this.parseGenericList(tok.type, [] as unknown[], (arr) => arr.push(this.parse()));
        case TokenType.OPEN_BYTE_ARR:
            return new Int8Array(this.parseGenericList(tok.type, [] as number[], (arr) => arr.push(this.eatToken<number>(TokenType.BYTE))));
        case TokenType.OPEN_INT_ARR:
            return new Int32Array(this.parseGenericList(tok.type, [] as number[], (arr) => arr.push(this.eatToken<number>(TokenType.INTEGER))));
        case TokenType.OPEN_LONG_ARR:
            return new BigInt64Array(this.parseGenericList(tok.type, [] as bigint[], (arr) => arr.push(this.eatToken<bigint>(TokenType.LONG))));
        case TokenType.STRING:
        case TokenType.BYTE:
        case TokenType.LONG:
        case TokenType.IDENTIFIER:
        case TokenType.INTEGER:
        case TokenType.SHORT:
        case TokenType.FLOAT:
        case TokenType.DOUBLE:
            return this.consume().data;
        default:
            throw Error(`failed to parse ${TokenType[tok.type]}`);
        }
    }

    private parseCompound() {
        this.eat(TokenType.OPEN_COMPOUND);

        const val: {[key: string]: unknown} = {};

        while (this.curr().type !== TokenType.CLOSE_COMPOUND) {
            const key = this.consume();

            if (!(key.type === TokenType.STRING || TokenType.IDENTIFIER)) {
                throw Error();
            }

            this.eat(TokenType.COLON);

            val[key.data as string] = this.parse();

            if (this.curr().type !== TokenType.COMMA)
                break;
            this.consume();
        }

        this.eat(TokenType.CLOSE_COMPOUND);
        return val;
    }

    private parseGenericList<T>(type: TokenType, arr: T, elemParser: (arr: T) => void) {
        this.eat(type);

        while (this.curr().type !== TokenType.CLOSE_LIST) {
            elemParser(arr);
            if (this.curr().type !== TokenType.COMMA)
                break;
            this.consume();
        }

        this.eat(TokenType.CLOSE_LIST);
        return arr;
    }
}

export function snbtParse(data: string | Buffer) {
    return new SNBTParser(typeof data === "string" ? Buffer.from(data) : data).parse();
}

class SNBTDumper {
    private buf: string[];

    public constructor() {
        this.buf = [];
    }

    public dump(data: unknown) {
        if (typeof data === "string") {
            this.buf.push(JSON.stringify(data));
        } else if (typeof data === "number") {
            throw Error(":(");
        } else if (Array.isArray(data)) {
            this.buf.push("[");
            data.forEach(x => this.dump(x));
            this.buf.push("]");
        } else if (data instanceof Int8Array) {
            this.buf.push("[B;");
            this.buf.push(data.join(","));
            this.buf.push("]");
        } else if (data instanceof Int32Array) {
            this.buf.push("[I;");
            this.buf.push(data.join(","));
            this.buf.push("]");
        } else if (data instanceof BigInt64Array) {
            this.buf.push("[L;");
            this.buf.push(data.join(","));
            this.buf.push("]");
        } else {
            this.buf.push("{");
            Object.entries((ent: [string, unknown]) => {
                this.buf.push(JSON.stringify(ent[0]));
                this.buf.push(":");
                this.dump(ent[1]);
            });
            this.buf.push("}");
        }
    }

    public get() {
        return this.buf.join("");
    }
}

export function snbtStringify(data: unknown) {
    const d = new SNBTDumper();
    d.dump(data);
    return d.get();
}
