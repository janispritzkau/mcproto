
export async function readVarInt(readByte: () => Promise<number>) {
    let numRead = 0, result = 0, byte = 0, value: number
    do {
        byte = await readByte(), value = (byte & 0b01111111)
        result |= value << (7 * numRead), numRead++
        if (numRead > 5) throw new Error("Varint too big!")
    } while ((byte & 0b10000000) != 0)
    return result
}

export function decodeVarInt(buf: Buffer, off = 0) {
    let numRead = 0, result = 0, byte = 0, value: number
    do {
        byte = buf.readUInt8(off), off++, value = (byte & 0b01111111)
        result |= value << (7 * numRead), numRead++
        if (numRead > 5) throw new Error("Varint too big!")
    } while ((byte & 0b10000000) != 0)
    return [result, off]
}

export function writeVarInt(value: number, writeByte: (byte: number) => void) {
    do {
        let temp = value & 0b01111111
        value >>>= 7
        if (value != 0) temp |= 0b10000000
        writeByte(temp)
    } while (value != 0)
}

export function encodeVarInt(value: number): Buffer {
    let bytes = []
    do {
        let temp = value & 0b01111111
        value >>>= 7
        if (value != 0) temp |= 0b10000000
        bytes.push(temp)
    } while (value != 0)
    return Buffer.from(bytes)
}

export function decodeVarLong(buf: Buffer, off = 0): [bigint, number] {
    let numRead = 0n, result = 0n, byte = 0n, value: bigint
    do {
        byte = BigInt(buf.readUInt8(off)), off++, value = (byte & 0b01111111n)
        result |= value << (7n * numRead), numRead++
        if (numRead > 10) throw new Error("Varint too big!")
    } while ((byte & 0b10000000n) != 0n)
    return [result, off]
}

export function writeVarLong(value: bigint, writeByte: (byte: number) => void) {
    value = BigInt.asUintN(64, value)
    do {
        let temp = value & 0b01111111n
        value >>= 7n
        if (value != 0n) temp |= 0b10000000n
        writeByte(Number(temp))
    } while (value != 0n)
}
