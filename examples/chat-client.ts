import * as chat from "mc-chat-format"
import * as rl from "readline"
import { Client, PacketWriter, State } from "../src"
import { getProfile } from "./utils"

const host = process.argv[2] || "localhost"
const port = +process.argv[3] || 25565

const { accessToken, profile, name } = getProfile()

async function main() {
    const client = await Client.connect(host, port, { accessToken, profile })

    client.send(new PacketWriter(0x0).writeVarInt(protocol)
        .writeString(host).writeUInt16(port).writeVarInt(State.Login))
    client.send(new PacketWriter(0x0).writeString(name))

    const listener = client.onPacket(0x0, packet => {
        console.log(chat.format(packet.readJSON(), { useAnsiCodes: true }))
    })

    await client.nextPacket(0x2, false)
    listener.dispose()

    client.on("packet", packet => {
        switch (packet.id) {
            case ids.keepAliveC:
                client.send(new PacketWriter(ids.keepAliveS).write(packet.read(8)))
                break
            case ids.disconnectC:
            case ids.chatMessageC:
                console.log(chat.format(packet.readJSON(), { useAnsiCodes: true }))
                break
            case ids.playerPosLookC:
                packet.read(3 * 8 + 2 * 4 + 1)
                const teleportId = packet.readVarInt()
                client.send(new PacketWriter(0x0).writeVarInt(teleportId))
                break
        }
    })

    const readline = rl.createInterface({
        input: process.stdin,
        output: process.stdout
    }).on("line", line => {
        if (!line) return
        client.send(new PacketWriter(ids.chatMessageS).writeString(line))
    })
    client.on("end", () => readline.close())
}

main().catch(console.error)

const protocol = 754

const ids = {
    keepAliveC: 0x1f,
    keepAliveS: 0x10,
    chatMessageC: 0xe,
    chatMessageS: 0x3,
    disconnectC: 0x19,
    playerPosLookC: 0x34
}
