import { randomBytes, createHash, publicEncrypt } from "crypto"
import { RSA_PKCS1_PADDING } from "constants"
import { Socket } from "net"
import * as dns from "dns"
import { Connection, State, PacketWriter, PacketReader } from "."
import { mcHexDigest, joinSession, mcPublicKeyToPem } from "./utils"

export interface ClientOptions {
    accessToken?: string
    profile?: string
    /** @default 120000 ms */
    timeout?: number
    /** @default 10000 ms */
    connectTimeout?: number
}

const defaultOptions: Partial<ClientOptions> = {
    connectTimeout: 10000,
    timeout: 120000
}

export class Client extends Connection {
    static connect(host: string, port?: number | null, options?: ClientOptions) {
        const client = new Client(options)
        return client.connect(host, port)
    }

    options: ClientOptions

    constructor(options?: ClientOptions) {
        super(new Socket, false)
        this.options = { ...defaultOptions, ...options }
        this.socket.on("timeout", () => this.socket.destroy())
        this.on("changeState", this.stateChanged.bind(this))
    }

    async connect(host: string, port?: number | null) {
        const isIp = host.includes(":") || /^([0-9]+\.){3}[0-9]+$/.test(host)
        const isDomain = !isIp && /^(\w+\.)+(\w+)?$/i.test(host)
        if (isDomain && !port) port = await new Promise<number>(resolve => {
            dns.resolveSrv("_minecraft._tcp." + host, (err, addrs) => {
                if (err || addrs.length == 0) return resolve(25565)
                host = addrs[0].name
                resolve(addrs[0].port)
            })
        })
        return new Promise<this>((resolve, reject) => {
            this.once("error", reject)
            this.socket.setTimeout(this.options.connectTimeout || 0, () => {
                this.socket.destroy()
                reject(new Error("Connection timed out"))
            })
            this.socket.connect({ host, port: port || 25565 }, () => {
                this.removeListener("error", reject)
                this.socket.setTimeout(this.options.timeout || 0)
                resolve(this)
            })
        })
    }

    private stateChanged(state: State) {
        if (state == State.Login) {
            const disposeListener = this.onPacket(0x1, this.onEncryptionRequest.bind(this))
            this.once("changeState", disposeListener.dispose)
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
            .digest())

        if (!await joinSession(this.options.accessToken!, this.options.profile!, hashedServerId)) {
            this.emitError(new Error("Invalid access token"))
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
