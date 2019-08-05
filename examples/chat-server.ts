import { Server, State, Connection, PacketWriter } from "../src"
import * as chat from "mc-chat-format"

const clients: Set<Connection> = new Set

const server = new Server({ keepAlive: true }, async client => {
    client.socket.on("error", console.log)
    await client.nextPacket()

    if (client.state == State.Status) {
        client.onPacket(0x0, () => client.send(new PacketWriter(0x0).writeJSON({
            version: { name: "1.14.4", protocol: 498 },
            players: { max: -1, online: clients.size },
            description: { text: "Chat server" }
        })))
        return client.onPacket(0x1, packet => {
            client.send(new PacketWriter(0x1).writeInt64(packet.readInt64()))
        })
    }

    if (client.protocol != 498) return client.end(new PacketWriter(0x0).writeJSON({
        translate: "multiplayer.disconnect."
            + (client.protocol < 498 ? "outdated_client" : "outdated_server"),
        with: ["1.14.4"]
    }))

    const username = (await client.nextPacket(0x0)).readString()

    await client.encrypt(username)
    client.setCompression(256)

    client.send(new PacketWriter(0x2)
        .writeString("00000000-0000-0000-0000-000000000000").writeString(username))

    client.send(new PacketWriter(0x25)
        .writeInt32(0).writeUInt8(3).writeInt32(1).writeUInt8(0)
        .writeString("flat").writeVarInt(2).writeBool(true))

    client.send(new PacketWriter(0x35).write(Buffer.alloc(8 * 3 + 4 * 2 + 2)))

    clients.add(client)

    client.on("end", () => {
        clients.delete(client)
        broadcast({ translate: "multiplayer.player.left", with: [username] })
    })

    broadcast({ translate: "multiplayer.player.joined", with: [username] }, client)

    client.onPacket(0x3, packet => broadcast({
        translate: "chat.type.text", with: [username, packet.readString()]
    }))
})
server.listen(25565)

function broadcast(text: chat.Component, exclude?: Connection) {
    clients.forEach(client => {
        if (exclude == client) return
        client.send(new PacketWriter(0xe).writeJSON(text).writeInt8(0))
    })
    console.log(chat.format(text))
}
