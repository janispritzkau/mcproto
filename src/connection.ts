import { encodeVarInt, decodeVarInt } from "./varint"
import { PacketWriter, PacketReader, Packet } from "./packet"
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
    /** Limit on how many bytes a packet has to be at minimum to be compressed */
    compressionThreshold = -1
    /** Respond to keep alive packets from server */
    keepAlive = true
    isServer = false

    paused = false
    destroyed = false
    private protocol = -1

    accessToken?: string
    profile?: string

    onPacket = (packet: PacketReader) => {}
    onLogin = (packet: PacketReader) => {}
    onDisconnect = (reason: any) => {}
    onError?: (error: Error) => void

    private nextCallbacks: Set<() => void> = new Set
    private packets: Buffer[] = []

    private cipher?: Cipher
    private decipher?: Decipher

    private buffer = Buffer.alloc(0)

    private reader = new Writable({ write: (chunk, _enc, cb) => {
        this.buffer = Buffer.concat([this.buffer, chunk])
        let len: number, off: number
        if (!this.paused) this.packets.length = 0
        while (true) {
            try { [len, off] = decodeVarInt(this.buffer) } catch (err) { break }
            if (off + len > this.buffer.length) break
            const buffer = this.buffer.slice(off, off + len)
            try {
                if (this.compressionThreshold == -1) this.packets.push(buffer)
                else {
                    const [len, off] = decodeVarInt(buffer)
                    if (len == 0) this.packets.push(buffer.slice(off))
                    else zlib.inflate(buffer.slice(off), (err, decompressed) => {
                        if (err) this.handleError(err)
                        this.packets.push(decompressed)
                    })
                }
                this.buffer = this.buffer.slice(off + len)
            } catch (error) {
                this.handleError(error)
            }
        }
        if (!this.paused) {
            this.packets.forEach(this.packetReceived)
            this.nextCallbacks.forEach(cb => cb())
            this.nextCallbacks.clear()
        }
        return cb()
    }})

    private splitter = new Transform({ transform: (chunk: Buffer, _enc, cb) => {
        if (this.compressionThreshold == -1) {
            this.splitter.push(Buffer.concat([encodeVarInt(chunk.length), chunk]))
        } else {
            if (chunk.length < this.compressionThreshold) {
                this.splitter.push(Buffer.concat([encodeVarInt(chunk.length + 1), encodeVarInt(0), chunk]))
            } else zlib.deflate(chunk, (err, compressed) => {
                if (err) this.handleError(err)
                const buffer = Buffer.concat([encodeVarInt(compressed.length), compressed])
                this.splitter.push(Buffer.concat([encodeVarInt(buffer.length), buffer]))
            })
        }
        cb()
    }})

    constructor(private socket: Socket, options?: ConnectionOptions) {
        if (options) {
            this.isServer = !!options.isServer
            this.accessToken = options.accessToken
            this.profile = options.profile
            if (options.keepAlive != null) this.keepAlive = options.keepAlive
        }
        socket.setNoDelay(true)
        socket.pipe(this.reader)
        this.splitter.pipe(socket)
    }

    /**
     * All packets will be saved and processed next time on resume.
     * Note that you can also pause and resume Node's `net.Socket`.
     */
    pause() {
        this.paused = true
    }

    /** Process all packets that have been received while being paused. */
    resume() {
        this.paused = false
        this.nextCallbacks.forEach(cb => cb())
        this.nextCallbacks.clear()
        this.packets.forEach(this.packetReceived)
    }

    destroy() {
        this.destroyed = true
        this.socket.unpipe(this.reader)
        this.socket.unpipe(this.decipher)
        this.splitter.unpipe(this.socket)
        this.splitter.unpipe(this.cipher)
    }

    async nextPacket() {
        while (true) {
            const packet = this.packets.shift()!
            if (packet) return new PacketReader(packet)
            await new Promise(res => this.nextCallbacks.add(res))
        }
    }

    async nextPacketWithId(id: number) {
        while (true) {
            const packet = await this.nextPacket()
            if (packet.id == id) return packet
        }
    }

    send = (p: Packet) => {
        if (!this.socket.writable) return
        const buffer = p instanceof PacketWriter ? p.encode() : p instanceof PacketReader ? p.buffer : p
        this.splitter.write(buffer)
        const reader = p instanceof PacketReader ? p : new PacketReader(buffer)
        if (this.state == State.Handshake) {
            this.protocol = reader.readVarInt()
            reader.readString(), reader.readUInt16()
            this.state = reader.readVarInt()
        }
    }

    private packetReceived = (buffer: Buffer) => {
        this.onPacket && this.onPacket(new PacketReader(buffer))

        const packet = new PacketReader(buffer)

        if (this.state == State.Handshake) {
            this.protocol = packet.readVarInt()
            this.state = (packet.readString(), packet.readUInt16(), packet.readVarInt())
            return
        }

        if (this.isServer) return

        if (this.state == State.Login) switch (packet.id) {
            case 0x0: this.onDisconnect(packet.readJSON()); break
            case 0x1: this.onEncryptionRequest(packet)
                .catch(err => this.handleError(err, true)); break
            case 0x2: this.state = State.Play, this.onLogin(packet); break
            case 0x3: this.compressionThreshold = packet.readVarInt()
        } else if (this.state == State.Play && this.keepAlive) {
            if (packet.id == (this.protocol < 345 ? 0x1f : 0x21)) {
                this.send(new PacketWriter(this.protocol < 350 ? 0xb : 0xe)
                .write(packet.read(8)))
            }
        }
    }

    private handleError = (error: Error, shouldClose = false) => {
        if (this.onError) this.onError(error)
        else throw error
        if (shouldClose) this.socket.end()
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
