import { Server, State, Connection, PacketWriter, nbt } from "../src"
import * as chat from "mc-chat-format"
import * as fs from "fs"

const clients: Set<Connection> = new Set

const dimensionCodec = nbt.parse(fs.readFileSync("examples/dimension-codec.snbt", "utf-8"))

new Server(async client => {
    client.socket.on("error", console.log)
    await client.nextPacket()

    if (client.state == State.Status) {
        client.onPacket(0x0, () => client.send(new PacketWriter(0x0).writeJSON({
            version: { name: version, protocol },
            players: { max: -1, online: clients.size },
            description: { text: "Chat server" }
        })))
        return client.onPacket(0x1, packet => {
            client.send(new PacketWriter(0x1).write(packet.read(8)))
        })
    }

    if (client.protocol != protocol) return client.end(new PacketWriter(0x0).writeJSON({
        translate: "multiplayer.disconnect."
            + (client.protocol < protocol ? "outdated_client" : "outdated_server"),
        with: [version]
    }))

    const username = (await client.nextPacket(0x0)).readString()

    await client.encrypt(username)
    client.setCompression(256)

    client.send(new PacketWriter(0x2)
        .write(Buffer.alloc(16))
        .writeString(username))

    client.send(new PacketWriter(ids.joinGame)
        .writeInt32(999)
        .writeBool(false).writeUInt8(3).writeInt8(-1)
        .writeVarInt(1)
        .writeString("minecraft:the_end")
        .writeNBT("", dimensionCodec)
        .writeNBT("", nbt.parse(`{
            piglin_safe: 0b,
            natural: 0b,
            ambient_light: 0f,
            infiniburn: "minecraft:infiniburn_end",
            respawn_anchor_works: 0b,
            has_skylight: 0b,
            bed_works: 0b,
            effects: "minecraft:the_end",
            fixed_time: 6000l,
            has_raids: 1b,
            logical_height: 256,
            coordinate_scale: 1.0,
            ultrawarm: 0b,
            has_ceiling: 0b
        }`))
        .writeString("minecraft:the_end")
        .writeUInt64(0n)
        .writeVarInt(20)
        .writeVarInt(10)
        .writeInt32(0))

    client.send(new PacketWriter(ids.playerPosLookC).write(Buffer.alloc(8 * 3 + 4 * 2 + 2)))

    clients.add(client)

    broadcast({ translate: "multiplayer.player.joined", with: [username] }, client)

    client.onPacket(ids.chatMessageS, packet => broadcast({
        translate: "chat.type.text", with: [username, packet.readString()]
    }))

    let keepAliveInterval = setInterval(() => {
        client.send(new PacketWriter(ids.keepAliveC).writeUInt64(BigInt(Date.now())))
    }, 10000)

    client.on("end", () => {
        clients.delete(client)
        clearInterval(keepAliveInterval)
        broadcast({ translate: "multiplayer.player.left", with: [username] })
    })
}).listen(25565)

function broadcast(text: chat.Component, exclude?: Connection) {
    clients.forEach(client => {
        if (exclude == client) return
        client.send(new PacketWriter(ids.chatMessageC)
            .writeJSON(text)
            .writeInt8(0)
            .write(Buffer.alloc(16)))
    })
    console.log(chat.format(text))
}

const version = "1.16.5"
const protocol = 754

const ids = {
    joinGame: 0x24,
    keepAliveC: 0x1f,
    keepAliveS: 0x10,
    chatMessageC: 0xe,
    chatMessageS: 0x3,
    playerPosLookC: 0x34
}
