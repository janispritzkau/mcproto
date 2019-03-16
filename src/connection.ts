import { PacketWriter, PacketReader, Packet } from "./packet"
import { joinSession, mcPublicKeyToPem, mcHexDigest, hasJoinedSession } from "./utils"
import { Reader, Writer } from "./transforms"
import { randomBytes, publicEncrypt, Cipher, Decipher, createCipheriv,
    createDecipheriv, createHash, privateDecrypt } from "crypto"
import { RSA_PKCS1_PADDING } from "constants"
import { Socket, connect } from "net"
import * as dns from "dns"

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
    kickTimeout?: number
}

export class Connection {
    state = State.Handshake
    compressionThreshold = -1
    isServer = false

    keepAlive = true
    kickTimeout = 30000
    latency = -1
    protocol = -1

    paused = false
    destroyed = false

    accessToken?: string
    profile?: string

    onPacket?: (packet: PacketReader) => void
    onDisconnect?: (reason: any) => void
    onError?: (error: any) => void
    onClose?: () => void

    private nextCallbacks: Set<(error: any, packet?: PacketReader) => void> = new Set
    private packets: Buffer[] = []

    private cipher?: Cipher
    private decipher?: Decipher

    private reader = new Reader
    private writer = new Writer

    private disconnectId?: number
    private keepAliveIdC?: number
    private keepAliveIdS?: number
    private keepAliveInterval: any

    constructor(public socket: Socket, options?: ConnectionOptions) {
        if (options) {
            this.isServer = !!options.isServer
            this.accessToken = options.accessToken
            this.profile = options.profile
            if (options.keepAlive != null) this.keepAlive = options.keepAlive
            this.kickTimeout = options.kickTimeout || this.kickTimeout
        }

        socket.setNoDelay(true)
        socket.on("error", err => this.handleError(err))
        socket.on("end", () => {
            this.onClose && this.onClose()
            this.nextCallbacks.forEach(cb => cb(new Error("Connection closed")))
            this.writer.end()
        })

        this.socket.pipe(this.reader)
        this.writer.pipe(this.socket)

        this.reader.on("data", packet => this.packetReceived(packet))
        this.reader.on("error", error => this.handleError(error))
        this.reader.on("close", () => this.writer.end())
    }

    static async connect(host: string, port?: number, options?: ConnectionOptions) {
        if (!port) port = await new Promise<number>(resolve => {
            dns.resolveSrv("_minecraft._tcp." + host, (err, addrs) => {
                if (err || addrs.length == 0) return resolve(25565)
                host = addrs[0].name
                resolve(addrs[0].port)
            })
        })

        return new Promise<Connection>((resolve, reject) => {
            const socket = connect({ host, port: port! }, () => {
                socket.removeListener("error", reject)
                resolve(new Connection(socket, { ...options, isServer: false }))
            })
            socket.on("error", reject)
        })
    }

    pause() {
        this.paused = true
        this.socket.pause()
        return new Promise<void>(res => this.reader.flush(res))
    }

    async resume() {
        await new Promise<any>(res => this.reader.flush(res))
        for (const packet of this.packets) {
            await Promise.resolve()
            if (!this.socket.writable) break
            this.onPacket && this.onPacket(new PacketReader(packet, this.protocol))
            this.nextCallbacks.forEach(cb => cb(null, new PacketReader(packet, this.protocol)))
            this.nextCallbacks.clear()
        }
        this.packets.length = 0
        this.paused = false
        this.socket.resume()
    }

    destroy() {
        this.destroyed = true
        this.socket.unpipe()
        this.writer.unpipe()
    }

    nextPacket(timeoutMs?: number): Promise<PacketReader> {
        return new Promise((res, rej) => {
            let timeout: any
            if (timeoutMs) {
                timeout = setTimeout(() => rej(new Error("Timeout")), timeoutMs)
            }
            this.nextCallbacks.add((err, packet) => {
                timeout && clearTimeout(timeout)
                if (err) rej(err)
                else res(packet)
            })
        })
    }

    async nextPacketWithId(id: number, timeoutMs?: number) {
        while (true) {
            const packet = await this.nextPacket(timeoutMs)
            if (packet.id == id) return packet
        }
    }

    send(packet: Packet) {
        const buffer = packet instanceof PacketWriter
            ? packet.encode()
            : packet instanceof PacketReader ? packet.buffer : packet

        const reader = packet instanceof PacketReader
            ? packet : new PacketReader(buffer)

        if (!this.isServer && this.state == State.Handshake) {
            this.setProtocol(reader.readVarInt())
            reader.readString(), reader.readUInt16()
            this.state = reader.readVarInt()
        } else if (this.isServer && this.state == State.Login) {
            if (reader.id == 0x2) if (this.keepAlive) this.startKeepAlive()
            this.state = State.Play
        }

        return new Promise((res, rej) => this.writer.write(buffer, err => {
            if (err) rej(err)
            else res()
        }))
    }

    async disconnect(reason?: any) {
        if (reason) {
            const id = this.state == State.Play ? this.disconnectId! : 0x0
            await this.send(new PacketWriter(id).writeJSON(reason))
        }
        this.socket.end()
    }

    setCompression(threshold: number) {
        if (this.isServer) this.send(new PacketWriter(0x3).writeVarInt(threshold))
        this.compressionThreshold = threshold
        this.reader.compressionThreshold = threshold
        this.writer.compressionThreshold = threshold
    }

    setEncryption(sharedSecret: Buffer) {
        this.cipher = createCipheriv("aes-128-cfb8", sharedSecret, sharedSecret)
        this.decipher = createDecipheriv("aes-128-cfb8", sharedSecret, sharedSecret)
        this.socket.unpipe(), this.writer.unpipe()

        this.socket.pipe(this.decipher).pipe(this.reader)
        this.writer.pipe(this.cipher).pipe(this.socket)
    }

    async encrypt(publicKey: Buffer, privateKey: string, username: string, authenticate = true) {
        if (!this.isServer) throw new Error("Cannot be called on client connection")
        const serverId = randomBytes(4).toString("hex")
        const verifyToken = randomBytes(4)

        this.send(new PacketWriter(0x1).writeString(serverId)
        .writeVarInt(publicKey.length).write(publicKey)
        .writeVarInt(verifyToken.length).write(verifyToken))

        const res = await this.nextPacketWithId(0x1)
        const encryptedSharedKey = res.read(res.readVarInt())
        const encryptedVerifyToken = res.read(res.readVarInt())

        const clientVerifyToken = privateDecrypt({ key: privateKey, padding: RSA_PKCS1_PADDING }, encryptedVerifyToken)
        if (!verifyToken.equals(clientVerifyToken)) {
            this.disconnect()
            throw new Error("Token verification failed")
        }
        const sharedKey = privateDecrypt({ key: privateKey, padding: RSA_PKCS1_PADDING }, encryptedSharedKey)

        if (authenticate && !hasJoinedSession(username, serverId)) {
            this.disconnect({ translate: "multiplayer.disconnect.unverified_username" })
            throw new Error("Authentication failed")
        }
        this.setEncryption(sharedKey)
    }

    private setProtocol(protocol: number) {
        this.protocol = protocol
        this.keepAliveIdC = protocol < 345 ? 0x1f : 0x21
        this.keepAliveIdS = protocol < 389 ? 0xb : 0xe
        this.disconnectId = protocol < 345 ? 0x1a : 0x1b
    }

    private packetReceived(buffer: Buffer) {
        if (!this.socket.writable) return

        if (this.paused) {
            this.packets.push(buffer)
        } else {
            this.onPacket && this.onPacket(new PacketReader(buffer, this.protocol))
            this.nextCallbacks.forEach(cb => cb(null, new PacketReader(buffer, this.protocol)))
            this.nextCallbacks.clear()
        }

        const packet = new PacketReader(buffer)

        if (this.isServer) {
            if (this.state == State.Handshake) {
                this.setProtocol(packet.readVarInt())
                packet.readString(), packet.readUInt16()
                this.state = packet.readVarInt()
            }
            return
        }

        if (this.state == State.Login) switch (packet.id) {
            case 0x0: {
                this.onDisconnect && this.onDisconnect(packet.readJSON())
                break
            }
            case 0x1: {
                this.onEncryptionRequest(packet)
                    .catch(error => this.handleError(error, true))
                break
            }
            case 0x2: {
                this.state = State.Play
                break
            }
            case 0x3: this.setCompression(packet.readVarInt()); break
        } else if (this.state == State.Play) switch (packet.id) {
            case this.keepAliveIdC: {
                if (this.keepAlive)
                    this.send(new PacketWriter(this.keepAliveIdS!)
                        .write(packet.read(8)))
                break
            }
            case this.disconnectId: {
                this.onDisconnect && this.onDisconnect(packet.readJSON())
                break
            }
        }
    }

    private startKeepAlive() {
        this.keepAliveInterval = setInterval(async () => {
            const id = randomBytes(8)
            this.send(new PacketWriter(this.keepAliveIdC!).write(id))

            const start = Date.now()
            await this.nextPacketWithId(this.keepAliveIdS!)
            this.latency = Date.now() - start

            if (this.latency > this.kickTimeout) this.disconnect({
                translate: "disconnect.timeout"
            })
        }, this.kickTimeout / 5)
        this.socket.on("close", () => clearInterval(this.keepAliveInterval))
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
            .digest())

        if (!await joinSession(this.accessToken!, this.profile!, hashedServerId)) {
            this.handleError(new Error("Invalid access token"), true)
        }

        const key = mcPublicKeyToPem(publicKey)
        const encryptedSharedKey = publicEncrypt({ key, padding: RSA_PKCS1_PADDING }, sharedSecret)
        const encryptedVerifyToken = publicEncrypt({ key, padding: RSA_PKCS1_PADDING }, verifyToken)

        this.send(new PacketWriter(0x1)
            .writeVarInt(encryptedSharedKey.length).write(encryptedSharedKey)
            .writeVarInt(encryptedVerifyToken.length).write(encryptedVerifyToken))

        this.setEncryption(sharedSecret)
    }
}
