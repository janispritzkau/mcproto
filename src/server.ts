import * as net from "net"
import { Emitter } from "./events"
import { Connection } from "."
import { PacketWriter, getPacketIdMap } from "./packet"
import { generateKeyPairSync, RSAKeyPairOptions, randomBytes, privateDecrypt } from "crypto";
import { hasJoinedSession } from "./utils";
import { RSA_PKCS1_PADDING } from "constants";
import { State } from "./connection";

export interface ServerOptions {
    keepAlive?: boolean
    keepAliveInterval?: number
    generateKeyPair?: boolean
}

const defaultOptions: Required<ServerOptions> = {
    keepAlive: true,
    keepAliveInterval: 10000,
    generateKeyPair: true
}

type ClientHandler = (client: ServerConnection, server: Server) => void | Promise<any>

export class Server extends Emitter {
    options: Required<ServerOptions>
    server = new net.Server

    privateKey?: string
    publicKey?: Buffer

    constructor(handler?: ClientHandler)
    constructor(options?: ServerOptions, handler?: ClientHandler)
    constructor(options?: ServerOptions | ClientHandler, handler?: ClientHandler) {
        super()
        if (typeof options == "function") handler = options, options = undefined
        if (handler) this.onConnection(handler)

        this.options = { ...defaultOptions, ...options }

        this.server.on("connection", this.clientConnected.bind(this));

        if (this.options.generateKeyPair) {
            ({ publicKey: this.publicKey, privateKey: this.privateKey } = generateKeyPair())
        }
    }

    static async encrypt(client: Connection, publicKey: Buffer, privateKey: string, username: string, verify = true) {
        const serverId = randomBytes(4).toString("hex")
        const verifyToken = randomBytes(4)

        client.send(new PacketWriter(0x1).writeString(serverId)
            .writeVarInt(publicKey.length).write(publicKey)
            .writeVarInt(verifyToken.length).write(verifyToken))

        const res = await client.nextPacket(0x1)
        const encryptedSharedKey = res.read(res.readVarInt())
        const encryptedVerifyToken = res.read(res.readVarInt())

        const clientVerifyToken = privateDecrypt({ key: privateKey, padding: RSA_PKCS1_PADDING }, encryptedVerifyToken)
        if (!verifyToken.equals(clientVerifyToken)) {
            client.end()
            throw new Error("Token verification failed")
        }
        const sharedKey = privateDecrypt({ key: privateKey, padding: RSA_PKCS1_PADDING }, encryptedSharedKey)

        if (verify && !hasJoinedSession(username, serverId)) {
            client.end(new PacketWriter(0x0).writeJSON({
                translate: "multiplayer.disconnect.unverified_username"
            }))
            throw new Error("Unverified username")
        }
        client.setEncryption(sharedKey)
    }

    listen(port: number, host?: string) {
        return new Promise<this>((resolve, reject) => {
            this.server.once("error", reject)
            this.server.listen(port, host, () => {
                this.server.removeListener("error", reject)
                resolve(this)
            })
        })
    }

    onConnection(handler: ClientHandler) {
        return this.on("connection", client => {
            const ret = handler(client, this)
            if (ret instanceof Promise) {
                ret.catch(error => {
                    console.error("Unhandled error", error)
                })
            }
        })
    }

    encrypt(client: Connection, username: string, verify = true) {
        if (!this.publicKey || !this.privateKey) throw new Error("Public/private keypair was not generated")
        return Server.encrypt(client, this.publicKey, this.privateKey!, username, verify)
    }

    private async clientConnected(socket: net.Socket) {
        const client = new ServerConnection(socket, this)
        this.emit("connection", client)
    }
}

export class ServerConnection extends Connection {
    constructor(socket: net.Socket, public server: Server) {
        super(socket, true)

        this.onChangeState(state => {
            if (state == State.Play && server.options.keepAlive) {
                this.startKeepAlive()
            }
        })
    }

    startKeepAlive() {
        const ids = getPacketIdMap(this.protocol)

        let id: bigint | null = null
        const keepAliveInterval = setInterval(() => {
            if (id) {
                this.end(new PacketWriter(0x0).writeJSON({ text: "Timed out" }))
            }
            id = BigInt(Date.now())
            this.send(new PacketWriter(ids.keepAliveC).writeUInt64(id))
        }, this.server.options.keepAliveInterval)

        this.onPacket(ids.keepAliveS, packet => {
            if (packet.readUInt64() == id) id = null
        })

        this.onEnd(() => clearInterval(keepAliveInterval))
    }

    encrypt(username: string, verify = true) {
        return this.server.encrypt(this, username, verify)
    }
}

export function generateKeyPair() {
    return generateKeyPairSync("rsa", {
        modulusLength: 1024,
        publicKeyEncoding: { type: "spki", format: "der" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" }
    } as RSAKeyPairOptions<"der", "pem">)
}
