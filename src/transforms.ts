import { Transform, TransformCallback } from "stream"
import { encodeVarInt, decodeVarInt } from "./varint"
import * as zlib from "zlib"

export class Writer extends Transform {
    compressionThreshold = -1

    _transform(chunk: Buffer, _enc: string, callback: TransformCallback) {
        if (this.compressionThreshold == -1) {
            this.push(Buffer.concat([encodeVarInt(chunk.length), chunk]))
        } else {
            if (chunk.length < this.compressionThreshold) {
                this.push(Buffer.concat([
                    encodeVarInt(chunk.length + 1),
                    encodeVarInt(0), chunk
                ]))
            } else {
                return zlib.deflate(chunk, (error, buffer) => {
                    if (error) return callback(error)
                    const len = encodeVarInt(chunk.length)
                    const packetLen = encodeVarInt(len.length + buffer.length)
                    this.push(Buffer.concat([packetLen, len, buffer]))
                    callback()
                })
            }
        }
        callback()
    }
}

export class Reader extends Transform {
    compressionThreshold = -1
    buffer = Buffer.alloc(0)

    async _transform(chunk: Buffer, _enc: string, callback: TransformCallback) {
        this.buffer = Buffer.concat([this.buffer, chunk])

        let offset = 0
        let length: number

        while (true) {
            try {
                [length, offset] = decodeVarInt(this.buffer, offset)
            } catch (err) { break }

            if (length == 0 || offset + length > this.buffer.length) break

            if (this.compressionThreshold == -1) {
                this.push(this.buffer.slice(offset, offset + length))
            } else {
                const [len, off] = decodeVarInt(this.buffer, offset)
                const buffer = this.buffer.slice(off, offset + length)

                if (len == 0) {
                    this.push(buffer)
                } else {
                    await new Promise(resolve => {
                        zlib.inflate(buffer, (error, buffer) => {
                            if (error) callback(error)
                            else this.push(buffer), resolve()
                        })
                    })
                }
            }
            offset += length
        }

        this.buffer = this.buffer.slice(offset)
        return callback()
    }
}
