import { createServer } from "net"
import { Connection, PacketWriter, State } from ".."
import { randomBytes, generateKeyPairSync, RSAKeyPairOptions, privateDecrypt } from "crypto";
import { RSA_PKCS1_PADDING } from "constants";
import * as querystring from "querystring"
import fetch from "node-fetch"

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 1024,
    publicKeyEncoding: {
        type: "spki",
        format: "der"
    },
    privateKeyEncoding: {
        type: "pkcs8",
        format: "pem"
    }
} as RSAKeyPairOptions<"der", "pem">)

const clients: Set<Connection> = new Set

createServer(async socket => {
    socket.on("error", err => console.error(err.message))

    const client = new Connection(socket, { isServer: true })
    client.onError = error => console.log(error)

    const handshake = await client.nextPacket()
    const protocol = handshake.readVarInt()

    if (client.state == State.Status) {
        client.onPacket = packet => {
            if (packet.id == 0x0) client.send(new PacketWriter(0x0).writeJSON({
                version: { name: "1.32.2", protocol: 404 },
                players: { max: -1, online: clients.size },
                description: { text: "Chat server" }
            }))
            else if (packet.id == 0x1) {
                client.send(new PacketWriter(0x1).write(packet.read(8)))
            }
        }
        client.resume()
        return setTimeout(() => socket.end(), 1000)
    }

    const loginStart = await client.nextPacket()
    const username = loginStart.readString()

    if (protocol != 404) {
        client.send(new PacketWriter(0x0)
        .writeJSON({ text: "Server only supports 1.13.2", color: "red" }))
        return socket.end()
    }

    await client.encrypt(publicKey, privateKey, username)
    client.setCompression(256)

    // Login success
    client.send(new PacketWriter(0x2)
    .writeString("00000000-0000-0000-0000-000000000000")
    .writeString(username))

    // Join game
    client.send(new PacketWriter(0x25)
    .writeInt32(0).writeUInt8(3).writeInt32(1).writeUInt16(0)
    .writeString("flat").writeBool(true))

    // Spawn position
    client.send(new PacketWriter(0x49).write(Buffer.alloc(8)))

    // Player abilites
    client.send(new PacketWriter(0x2e).writeUInt8(2).writeFloat(0).writeFloat(1))

    // Player position and look
    client.send(new PacketWriter(0x32)
    .write(Buffer.alloc(8 * 3 + 4 * 2 + 2)))

    clients.add(client)
    socket.on("close", () => {
        clients.delete(client)
        broadcast({ text: username + " left the game", color: "gold" })
    })
    broadcast({ text: username + " joined the game", color: "gold" })

    client.onPacket = packet => {
        if (packet.id == 0x2) {
            broadcast({ translate: "chat.type.text", with: [
                { text: username }, { text: packet.readString() }
            ] })
        }
    }

    setInterval(() => {
        client.send(new PacketWriter(0x1f).write(randomBytes(8)))
    }, 20000)

}).listen(25565)

function broadcast(chat: any) {
    clients.forEach(client => {
        client.send(new PacketWriter(0xe).writeJSON(chat).writeInt8(0))
    })
}
