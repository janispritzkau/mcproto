import * as chat from "mc-chat-format"
import * as rl from "readline"
import { Client, PacketWriter, State } from "../src"
import { getProfile } from "./utils"

const host = process.argv[2] || "localhost"
const port = +process.argv[3] || 25565

const { accessToken, profile, displayName } = getProfile()

async function main() {
    const client = await Client.connect(port, host, { accessToken, profile })
    console.log("connected")

    client.send(new PacketWriter(0x0).writeVarInt(404)
        .writeString(host).writeUInt16(port).writeVarInt(State.Login))
    client.send(new PacketWriter(0x0).writeString(displayName))

    const dispose = client.onPacket(0x0, packet => {
        console.log(chat.format(packet.readJSON(), { useAnsiCodes: true }))
    })

    await client.nextPacket(0x2)
    dispose()

    console.log("logged in")

    client.onPacket(packet => {
        if (packet.id == 0xe || packet.id == 0x1b) {
            console.log(chat.format(packet.readJSON(), { useAnsiCodes: true }))
        } else if (packet.id == 0x32) {
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
        client.send(new PacketWriter(0x2).writeString(line))
    })
    client.onEnd(() => readline.close())
}

main().catch(console.error)
