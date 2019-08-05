import { randomBytes, createHash, publicEncrypt } from "crypto"
import { RSA_PKCS1_PADDING } from "constants"
import { Socket } from "net"
import * as dns from "dns"
import { Connection, State, PacketWriter, PacketReader, getPacketIdMap } from "."
import { mcHexDigest, joinSession, mcPublicKeyToPem } from "./utils"

export interface ClientOptions {
    accessToken?: string
    profile?: string
    keepAlive?: boolean
}

export class Client extends Connection {
    static connect(host: string, port?: number, options?: ClientOptions) {
        const client = new Client(options)
        return client.connect(host, port)
    }

    options: ClientOptions

    constructor(options?: ClientOptions) {
        super(new Socket, false)
        this.options = { keepAlive: true, ...options }
        this.on("changeState", this.stateChanged.bind(this))
    }

    async connect(host: string, port?: number) {
        if (!port) port = await new Promise<number>(resolve => {
            dns.resolveSrv("_minecraft._tcp." + host, (err, addrs) => {
                if (err || addrs.length == 0) return resolve(25565)
                host = addrs[0].name
                resolve(addrs[0].port)
            })
        })
        return new Promise<this>((resolve, reject) => {
            this.socket.once("error", reject)
            this.socket.connect({ host, port: port! }, () => {
                this.socket.removeListener("error", reject)
                resolve(this)
            })
        })
    }

    private stateChanged(state: State) {
        if (state == State.Login) {
            const disposeListener = this.onPacket(0x1, this.onEncryptionRequest.bind(this))
            this.once("changeState", disposeListener.dispose)
        } else if (state == State.Play && this.options.keepAlive) {
            const ids = getPacketIdMap(this.protocol)
            this.onPacket(ids.keepAliveC, packet => {
                this.send(new PacketWriter(ids.keepAliveS).writeInt64(packet.readInt64()))
            })
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
            this.emit("error", new Error("Invalid access token"))
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
