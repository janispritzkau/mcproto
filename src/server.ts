import * as net from "net"
import { Emitter } from "./events"
import { Connection } from "."
import { PacketWriter } from "./packet"
import { generateKeyPairSync, RSAKeyPairOptions, randomBytes, privateDecrypt } from "crypto"
import { hasJoinedSession } from "./utils"
import { RSA_PKCS1_PADDING } from "constants"

export interface ServerOptions {
    generateKeyPair?: boolean
}

const defaultOptions: Required<ServerOptions> = {
    generateKeyPair: true
}

type ClientHandler = (client: ServerConnection) => Promise<any> | void

interface Events {
    connection: (client: ServerConnection) => void
    error: (error?: any) => void
}

export class Server extends Emitter<Events> {
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

        client.setEncryption(sharedKey)

        if (verify && !await hasJoinedSession(username, serverId)) {
            client.end(new PacketWriter(0x0).writeJSON({
                translate: "multiplayer.disconnect.unverified_username"
            }))
            throw new Error("Invalid session")
        }
    }

    options: Required<ServerOptions>
    server = new net.Server

    privateKey?: string
    publicKey?: Buffer

    constructor(handler?: ClientHandler)
    constructor(options?: ServerOptions, handler?: ClientHandler)
    constructor(options?: ServerOptions | ClientHandler, handler?: ClientHandler) {
        super()
        if (typeof options == "function") handler = options, options = undefined
        this.options = { ...defaultOptions, ...options }

        if (handler) this.on("connection", client => {
            const handleError = (error: any) => {
                if (!this.emit("error", error)) {
                    console.error("Unhandled connection error:", error)
                }
            }
            try {
                const ret = handler!(client)
                if (ret instanceof Promise) ret.catch(handleError)
            } catch (error) {
                handleError(error)
            }
        })

        this.server.on("error", error => {
            if (!this.emit("error", error)) {
                throw error
            }
        })
        this.server.on("connection", socket => {
            this.emit("connection", new ServerConnection(socket, this))
        })

        if (this.options.generateKeyPair) {
            ({ publicKey: this.publicKey, privateKey: this.privateKey } = generateKeyPair())
        }
    }

    listen(port: number, host?: string) {
        return new Promise<this>((resolve, reject) => {
            this.server.once("error", reject)
            this.server.listen(port, host, () => {
                this.server.off("error", reject)
                resolve(this)
            })
        })
    }

    close() {
        return new Promise<void>((resolve, reject) => {
            this.server.close(error => error ? reject(error) : resolve())
        })
    }
}

export class ServerConnection extends Connection {
    constructor(socket: net.Socket, public server: Server) {
        super(socket, true)
    }

    encrypt(username: string, verify = true) {
        const { server } = this

        if (!server.publicKey || !server.privateKey) {
            throw new Error("Public/private keypair was not generated")
        }

        return Server.encrypt(this, server.publicKey, server.privateKey, username, verify)
    }
}

export function generateKeyPair() {
    return generateKeyPairSync("rsa", {
        modulusLength: 1024,
        publicKeyEncoding: { type: "spki", format: "der" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" }
    } as RSAKeyPairOptions<"der", "pem">)
}
