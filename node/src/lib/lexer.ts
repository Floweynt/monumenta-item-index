export class BufReader {
    private buf: Buffer;
    private head: number;
    private mark: number;

    public constructor(buf: Buffer) {
        this.buf = buf;
        this.head = 0;
        this.mark = 0;
    }

    public readByte() {
        return this.buf.readInt8(this.head++);
    }

    public read(count: number) {
        const buf = this.buf.subarray(this.head, this.head + count);
        this.head += count;
        return buf;
    }

    public readLeb128() {
        let result = 0;
        let cur;
        let count = 0;
        let signBits = -1;

        do {
            cur = this.readByte() & 0xff;
            result |= (cur & 0x7f) << (count * 7);
            signBits <<= 7;
            count++;
        } while (((cur & 0x80) === 0x80) && count < 5);

        if ((cur & 0x80) === 0x80) {
            throw Error("invalid LEB128 sequence");
        }

        // Sign extend if appropriate
        if (((signBits >> 1) & result) !== 0) {
            result |= signBits;
        }

        return result;
    }

    public eof() {
        return this.head >= this.buf.length;
    }

    public peek(): number {
        if (this.eof())
            return 0;

        return this.buf.at(this.head) as number;
    }

    public consume() {
        const ch = this.peek();
        this.head++;
        return ch;
    }

    public commit() {
        this.mark = this.head;
    }

    public getMark() {
        return this.mark;
    }

    public getHead() {
        return this.head;
    }

    public rewind() {
        this.head = this.mark;
    }

    public slice(from: number, offset?: number) {
        offset ??= 0;
        return this.buf.subarray(from, this.mark + offset).toString();
    }
}

export function makeLexerData(data: string) {
    const reader = new BufReader(Buffer.from(data, "base64"));
    if (reader.readByte() !== 1)
        throw Error("cannot use non classifying lexer");

    const stateCount = reader.readLeb128();
    const startState = reader.readLeb128();

    const stateBitset = reader.read(Math.trunc((stateCount + 7) / 8));
    const endBitmask: boolean[] = [];

    for (let i = 0; i < stateCount; i++) {
        endBitmask.push((stateBitset[Math.trunc(i / 8)] & (1 << (i % 8))) !== 0);
    }

    const classCount = reader.readLeb128();
    const classifier = new Int32Array(256);
    let classifierIdx = 0;
    while (classifierIdx < classifier.length) {
        const value = reader.readLeb128();
        const count = reader.readLeb128();
        for (let i = 0; i < count; i++) {
            classifier[classifierIdx++] = value;
        }
    }

    const transition = new Int32Array(classCount * stateCount);
    let transitionIdx = 0;

    while (transitionIdx < transition.length) {
        const value = reader.readLeb128();
        const count = reader.readLeb128();
        for (let i = 0; i < count; i++) {
            transition[transitionIdx++] = value;
        }
    }

    return {
        transition: transition,
        start: startState,
        endMask: endBitmask,
        classifier: classifier,
        classCount: classCount,
    };
}

