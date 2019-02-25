import { writeVarInt, decodeVarInt } from "./varint"

export type Packet = PacketReader | PacketWriter | Buffer

export class PacketReader {
    id: number
    offset = 0

    constructor(public buffer: Buffer) {
        this.id = this.readVarInt()
    }

    read(length: number) {
        return this.buffer.slice(this.offset, this.offset += length)
    }

    readString() {
        return this.read(this.readVarInt()).toString()
    }

    readJSON() {
        return JSON.parse(this.readString())
    }

    readBool() {
        return Boolean(this.readUInt8())
    }

    readInt8() {
        return this.buffer.readInt8((this.offset += 1) - 1)
    }

    readUInt8() {
        return this.buffer.readUInt8((this.offset += 1) - 1)
    }

    readInt16() {
        return this.buffer.readInt16BE((this.offset += 2) - 2)
    }

    readUInt16() {
        return this.buffer.readUInt16BE((this.offset += 2) - 2)
    }

    readInt32() {
        return this.buffer.readInt32BE((this.offset += 4) - 4)
    }

    readUInt32() {
        return this.buffer.readUInt32BE((this.offset += 4) - 4)
    }

    readFloat() {
        return this.buffer.readFloatBE((this.offset += 4) - 4)
    }

    readDouble() {
        return this.buffer.readDoubleBE((this.offset += 8) - 8)
    }

    readVarInt() {
        const [result, offset] = decodeVarInt(this.buffer, this.offset)
        this.offset = offset
        return result
    }
}


export class PacketWriter {
    buffer = Buffer.alloc(8)
    offset = 0

    constructor(public id: number) {
        this.writeVarInt(id)
    }

    private extend(len: number) {
        while (this.offset + len > this.buffer.length) {
            this.buffer = Buffer.concat([this.buffer, Buffer.alloc(this.buffer.length)])
        }
    }

    write(buffer: Buffer) {
        this.extend(buffer.length)
        buffer.copy(this.buffer, this.offset)
        this.offset += buffer.length
        return this
    }

    writeString(string: string) {
        const buffer = Buffer.from(string)
        this.writeVarInt(buffer.length).write(buffer)
        return this
    }

    writeJSON(json: any) {
        return this.writeString(JSON.stringify(json))
    }

    writeBool(bool: boolean) {
        this.writeUInt8(bool ? 1 : 0)
        return this
    }

    writeInt8(x: number) {
        this.extend(1)
        this.offset = this.buffer.writeInt8(x, this.offset)
        return this
    }

    writeUInt8(x: number) {
        this.extend(1)
        this.offset = this.buffer.writeUInt8(x, this.offset)
        return this
    }

    writeInt16(x: number) {
        this.extend(2)
        this.offset = this.buffer.writeInt16BE(x, this.offset)
        return this
    }

    writeUInt16(x: number) {
        this.extend(2)
        this.offset = this.buffer.writeUInt16BE(x, this.offset)
        return this
    }

    writeInt32(x: number) {
        this.extend(4)
        this.offset = this.buffer.writeInt32BE(x, this.offset)
        return this
    }

    writeUInt32(x: number) {
        this.extend(4)
        this.offset = this.buffer.writeUInt32BE(x, this.offset)
        return this
    }

    writeFloat(x: number) {
        this.extend(4)
        this.offset = this.buffer.writeFloatBE(x, this.offset)
        return this
    }

    writeDouble(x: number) {
        this.extend(8)
        this.offset = this.buffer.writeDoubleBE(x, this.offset)
        return this
    }

    writeVarInt(x: number) {
        writeVarInt(x, v => this.writeUInt8(v))
        return this
    }

    encode() {
        return this.buffer.slice(0, this.offset)
    }
}
