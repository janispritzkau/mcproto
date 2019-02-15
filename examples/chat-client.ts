import { connect } from "net"
import { Connection, PacketWriter } from "../lib"
import { chatToText } from "mc-chat-format"

const HOST = "localhost"
const PORT = 25565

const accessToken = "<access-token>"
const profile = "<profile-id>"
const displayName = "<ingame-name>"

const socket = connect({ host: HOST, port: PORT }, async () => {
    socket.on("close", () => process.exit())
    const client = new Connection(socket, { accessToken, profile, keepAlive: true })

    client.send(new PacketWriter(0x0).writeVarInt(404)
    .writeString(HOST).writeUInt16(PORT).writeVarInt(2))
    client.send(new PacketWriter(0x0).writeString(displayName))

    await new Promise(res => client.onLogin = res)

    client.onPacket = packet => {
        if (packet.id == 0xe || packet.id == 0x1b) {
            console.log(chatToText(packet.readJSON()))
        } else if (packet.id == 0x32) {
            packet.read(3 * 8 + 2 * 4 + 1)
            const teleportId = packet.readVarInt()
            client.send(new PacketWriter(0x0).writeVarInt(teleportId))
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
