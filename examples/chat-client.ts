import { connect } from "net"
import * as chat from "mc-chat-format"
import { Connection, PacketWriter } from "../lib"
import { getProfile } from "./utils"

const host = process.argv[2] || "eu.mineplex.com"
const port = +process.argv[3] || 25565

const { accessToken, profile, displayName } = getProfile()

const socket = connect({ host, port }, async () => {
    socket.on("close", () => process.exit())
    const client = new Connection(socket, { accessToken, profile, keepAlive: true })

    client.send(new PacketWriter(0x0).writeVarInt(404)
    .writeString(host).writeUInt16(port).writeVarInt(2))

    client.send(new PacketWriter(0x0).writeString(displayName))

    client.onDisconnect = reason => console.log(chat.format(reason))
    await new Promise(resolve => (client.onLogin = resolve))

    client.onPacket = packet => {
        switch (packet.id) {
            case 0xe: case 0x1b:
            console.log(chat.format(packet.readJSON(), { useAnsiCodes: true }))
            break
            case 0x32: {
                packet.read(3 * 8 + 2 * 4 + 1) // ignore other stuff
                const teleportId = packet.readVarInt()
                client.send(new PacketWriter(0x0).writeVarInt(teleportId))
            }
        }
    }

    let data = ""
    process.stdin.on("data", chunk => {
        data += (chunk.toString() as string).replace(/(\r\n?)/g, "\n")
        const lines = data.split("\n")
        data = lines.pop()!
        for (let line of lines) client.send(new PacketWriter(0x2).writeString(line))
    })
})
