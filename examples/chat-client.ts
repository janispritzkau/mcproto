import { connect } from "net"
import { chatToText } from "mc-chat-format"
import { Connection, PacketWriter } from "../lib"
import { getProfile } from "./utils"

const HOST = "2b2t.org"
const PORT = 25565

const { accessToken, profile, displayName } = getProfile()

const socket = connect({ host: HOST, port: PORT }, async () => {
    socket.on("close", () => process.exit())
    const client = new Connection(socket, { accessToken, profile, keepAlive: true })

    client.send(new PacketWriter(0x0).writeVarInt(404)
    .writeString(HOST).writeUInt16(PORT).writeVarInt(2))
    client.send(new PacketWriter(0x0).writeString(displayName))

    await new Promise((res, rej) => (client.onLogin = res, client.onDisconnect = rej))

    client.onPacket = packet => {
        switch (packet.id) {
            case 0xe: console.log(chatToText(packet.readJSON())); break
            case 0x1b: console.log("Disconnected:", chatToText(packet.readJSON())); break
            case 0x32: {
                packet.read(3 * 8 + 2 * 4 + 1) // ignore other stuff
                const teleportId = packet.readVarInt()
                client.send(new PacketWriter(0x0).writeVarInt(teleportId))
            }; break
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
