import * as net from "net"
import { Emitter } from "./events"
import { Connection } from "."
import { PacketWriter } from "./packet"
import { generateKeyPairSync, RSAKeyPairOptions, randomBytes, privateDecrypt } from "crypto";
import { hasJoinedSession } from "./utils";
import { RSA_PKCS1_PADDING } from "constants";

export interface ServerOptions {
    keepAlive?: boolean
    kickTimeout?: number
    generateKeyPair?: boolean
}

const defaultOptions = {
    keepAlive: true,
    kickTimeout: 20000,
    generateKeyPair: true
}

type ClientHandler = (client: Connection) => void

export class Server extends Emitter {
    options: ServerOptions
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
        return this.on("connection", handler)
    }

    encrypt(client: Connection, username: string, verify = true) {
        if (!this.publicKey || !this.privateKey) throw new Error("Public/private keypair was not generated")
        return Server.encrypt(client, this.publicKey, this.privateKey!, username, verify)
    }

    private async clientConnected(socket: net.Socket) {
        const client = new Connection(socket, true)
        this.emit("connection", client)

        await client.nextPacket(0x2)
    }
}

export function generateKeyPair() {
    return generateKeyPairSync("rsa", {
        modulusLength: 1024,
        publicKeyEncoding: { type: "spki", format: "der" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" }
    } as RSAKeyPairOptions<"der", "pem">)
}
