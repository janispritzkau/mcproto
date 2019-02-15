import { encodeVarInt, decodeVarInt } from "./varint"
import { PacketWriter, PacketReader } from "./packet"
import { joinSession, mcPublicKeyToPem, mcHexDigest } from "./utils"
import { randomBytes, publicEncrypt, Cipher, Decipher, createCipheriv, createDecipheriv, createHash } from "crypto"
import { RSA_PKCS1_PADDING } from "constants"
import { Writable, Transform } from "stream"
import * as zlib from "zlib"
import { Socket } from "net"

export enum State {
    Handshake = 0,
    Status = 1,
    Login = 2,
    Play = 3
}

interface ConnectionOptions {
    isServer?: boolean
    accessToken?: string
    profile?: string
    keepAlive?: boolean
}

export class Connection {
    state = State.Handshake
    compressionThreshold = -1
    keepAlive = true
    isServer = false

    accessToken?: string
    profile?: string

    nextPacket = new Promise<PacketReader>(res => this.resolvePacket = res)
    onPacket?: (packet: PacketReader) => void
    onLogin?: (uuid: string, username: string) => void
    private resolvePacket!: (packet: PacketReader) => void

    private cipher?: Cipher
    private decipher?: Decipher

    private buffer = Buffer.alloc(0)

    private reader = new Writable({ write: (chunk, _enc, cb) => {
        this.buffer = Buffer.concat([this.buffer, chunk])
        let len: number, off: number
        while (true) {
            try { [len, off] = decodeVarInt(this.buffer) } catch (err) { return cb() }
            if (off + len > this.buffer.length) break
            const buffer = this.buffer.slice(off, off + len)
            if (this.compressionThreshold == -1) this.packetReceived(buffer)
            else {
                const [len, off] = decodeVarInt(buffer)
                if (len == 0) this.packetReceived(buffer.slice(off))
                else zlib.inflate(buffer.slice(off), (err, decompressed) => {
                    if (err) throw err
                    this.packetReceived(decompressed)
                })
            }
            this.buffer = this.buffer.slice(off + len)
        }
        return cb()
    }})

    private splitter = new Transform({ transform: (chunk: Buffer, _enc, cb) => {
        if (this.compressionThreshold == -1) {
            this.splitter.push(Buffer.concat([encodeVarInt(chunk.length), chunk]))
            cb()
        } else {
            if (chunk.length < this.compressionThreshold) {
                this.splitter.push(Buffer.concat([encodeVarInt(chunk.length + 1), encodeVarInt(0), chunk]))
                cb()
            } else zlib.deflate(chunk, (_err, compressed) => {
                const buffer = Buffer.concat([encodeVarInt(compressed.length), compressed])
                this.splitter.push(Buffer.concat([encodeVarInt(buffer.length), buffer]))
                cb()
            })
        }
    }})

    constructor(public socket: Socket, options?: ConnectionOptions) {
        if (options) {
            this.isServer = !!options.isServer
            this.accessToken = options.accessToken
            this.profile = options.profile
            if (options.keepAlive != null) this.keepAlive = options.keepAlive
        }
        socket.pipe(this.reader)
        this.splitter.pipe(this.socket)
        this.socket.setNoDelay(true)
    }

    async nextPacketWithId(id: number) {
        while (true) {
            const packet = await this.nextPacket
            if (packet.id == id) return packet
        }
    }

    send(p: Buffer | PacketWriter | PacketReader) {
        if (!this.socket.writable) return
        const buffer = p instanceof PacketWriter ? p.encode() : p instanceof PacketReader ? p.buffer : p
        this.splitter.write(buffer)
        const reader = p instanceof PacketReader ? p : new PacketReader(buffer)
        if (this.state == State.Handshake) {
            reader.readVarInt(), reader.readString(), reader.readUInt16()
            this.state = reader.readVarInt()
        }
    }

    private packetReceived(buffer: Buffer) {
        this.onPacket && this.onPacket(new PacketReader(buffer))
        this.resolvePacket(new PacketReader(buffer))
        this.nextPacket = new Promise(res => this.resolvePacket = res)

        const packet = new PacketReader(buffer)
        if (this.state == State.Handshake) {
            this.state = (packet.readVarInt(), packet.readString(), packet.readUInt16(), packet.readVarInt())
        }

        if (this.state == State.Login) {
            if (!this.isServer) {
                if (packet.id == 0x1) this.onEncryptionRequest(packet)
                else if (packet.id == 0x3) this.compressionThreshold = packet.readVarInt()
                else if (packet.id == 0x2) {
                    const uuid = packet.readString(), username = packet.readString()
                    this.state = State.Play
                    this.onLogin && this.onLogin(uuid, username)
                }
                else if (packet.id == 0x0) console.log(packet.readString())
            }
        } else if (this.state == State.Play) {
            if (!this.isServer && packet.id == 0x1f && this.keepAlive) {
                this.send(new PacketWriter(0xb).write(packet.read(8)))
            }
        }
    }

    private async onEncryptionRequest(req: PacketReader) {
        const serverId = req.readString()
        const publicKey = req.read(req.readVarInt())
        const verifyToken = req.read(req.readVarInt())

        const sharedSecret = randomBytes(16)
        const hashedServerId = mcHexDigest(createHash("sha1")
            .update(serverId)
            .update(sharedSecret)
            .update(publicKey)
            .digest()
        )

        if (!await joinSession(this.accessToken!, this.profile!, hashedServerId)) {
            console.error("Couldn't join session! Access token might be invalid")
            return this.socket.end()
        }

        const key = mcPublicKeyToPem(publicKey)
        const encryptedSharedKey = publicEncrypt({ key, padding: RSA_PKCS1_PADDING }, sharedSecret)
        const encryptedVerifyToken = publicEncrypt({ key, padding: RSA_PKCS1_PADDING }, verifyToken)

        this.send(new PacketWriter(0x1)
            .writeVarInt(encryptedSharedKey.length).write(encryptedSharedKey)
            .writeVarInt(encryptedVerifyToken.length).write(encryptedVerifyToken)
        )

        this.cipher = createCipheriv("aes-128-cfb8", sharedSecret, sharedSecret)
        this.decipher = createDecipheriv("aes-128-cfb8", sharedSecret, sharedSecret)
        this.socket.unpipe(this.reader), this.socket.pipe(this.decipher).pipe(this.reader)
        this.splitter.unpipe(this.socket), this.splitter.pipe(this.cipher).pipe(this.socket)
    }
}
