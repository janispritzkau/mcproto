import * as chat from "mc-chat-format"
import * as rl from "readline"
import { Client, PacketWriter, State } from "../src"
import { getProfile } from "./utils"

const host = process.argv[2] || "localhost"
const port = +process.argv[3] || 25565

const { accessToken, profile, displayName } = getProfile()

async function main() {
    const client = await Client.connect(host, port, { accessToken, profile })

    client.send(new PacketWriter(0x0).writeVarInt(498)
        .writeString(host).writeUInt16(port).writeVarInt(State.Login))
    client.send(new PacketWriter(0x0).writeString(displayName))

    const listener = client.onPacket(0x0, packet => {
        console.log(chat.format(packet.readJSON(), { useAnsiCodes: true }))
    })

    await client.nextPacket(0x2, false)
    listener.dispose()

    client.on("packet", packet => {
        if (packet.id == 0xe || packet.id == 0x1a) {
            console.log(chat.format(packet.readJSON(), { useAnsiCodes: true }))
        } else if (packet.id == 0x35) {
            packet.read(3 * 8 + 2 * 4 + 1)
            const teleportId = packet.readVarInt()
            client.send(new PacketWriter(0x0).writeVarInt(teleportId))
        }
    })

    const readline = rl.createInterface({
        input: process.stdin,
        output: process.stdout
    }).on("line", line => {
        if (!line) return
        client.send(new PacketWriter(0x3).writeString(line))
    })
    client.on("end", () => readline.close())
}

main().catch(console.error)
