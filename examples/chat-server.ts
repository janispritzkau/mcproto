import { createServer } from "net"
import { Connection, PacketWriter, State } from ".."
import { generateKeyPairSync, RSAKeyPairOptions } from "crypto"
import * as chat from "mc-chat-format"
import * as rl from "readline"

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
    const client = new Connection(socket, { isServer: true })

    socket.on("error", err => console.error(err.message))
    client.onError = err => console.log(err.message)

    const handshake = await client.nextPacket()
    const protocol = handshake.readVarInt()

    if (client.state == State.Status) {
        client.onPacket = packet => {
            if (packet.id == 0x0) client.send(new PacketWriter(0x0).writeJSON({
                version: { name: "1.32.2", protocol: 404 },
                players: { max: -1, online: clients.size },
                description: { text: "Chat server" }
            }))
            else if (packet.id == 0x1)
                client.send(new PacketWriter(0x1).write(packet.read(8)))
        }
        return setTimeout(() => socket.end(), 10000)
    }

    const loginStart = await client.nextPacket()
    const username = loginStart.readString()

    if (protocol != 404) {
        client.send(new PacketWriter(0x0).writeJSON({
            translate: "multiplayer.disconnect."
            + (protocol < 404 ? "outdated_client" : "outdated_server"),
            with: ["1.13.2"]
        }))
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
        broadcast({ translate: "multiplayer.player.left", with: [username] })
    })

    broadcast({ translate: "multiplayer.player.joined", with: [username] })

    client.onPacket = packet => {
        if (packet.id == 0x2) broadcast({
            translate: "chat.type.text", with: [username, packet.readString()]
        })
    }
}).listen(25565)

rl.createInterface({
    input: process.stdin,
    output: process.stdout
}).on("line", line => {
    if (!line) return
    broadcast({ translate: "chat.type.announcement", with: ["Server", line] })
})

function broadcast(text: any) {
    console.log(chat.format(text, { useAnsiCodes: true }))
    clients.forEach(client => {
        client.send(new PacketWriter(0xe).writeJSON(text).writeInt8(0))
    })
}
