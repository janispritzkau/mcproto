import * as chat from "mc-chat-format"
import * as rl from "readline"
import { Client, PacketWriter, State } from "../src"
import { getProfile } from "./utils"

const host = process.argv[2] || "localhost"
const port = +process.argv[3] || 25565
const version = process.argv[4] || "1.14.4"

const { accessToken, profile, displayName } = getProfile()

async function main() {
    let protocolI = ["1.12.2", "1.13.2", "1.14.4"].indexOf(version)
    if (protocolI == -1) protocolI = 2

    const protocol = [340, 404, 498][protocolI]
    const ids = {
        chatMessageS: [0x2, 0x2, 0x3][protocolI],
        chatMessageC: [0xf, 0xe, 0xe][protocolI],
        disconnectC: [0x1a, 0x1b, 0x1a][protocolI],
        playerPosLookC: [0x2f, 0x32, 0x35][protocolI]
    }

    const client = await Client.connect(host, port, { accessToken, profile })

    client.send(new PacketWriter(0x0).writeVarInt(protocol)
        .writeString(host).writeUInt16(port).writeVarInt(State.Login))
    client.send(new PacketWriter(0x0).writeString(displayName))

    const listener = client.onPacket(0x0, packet => {
        console.log(chat.format(packet.readJSON(), { useAnsiCodes: true }))
    })

    await client.nextPacket(0x2, false)
    listener.dispose()

    client.on("packet", packet => {
        if (packet.id == ids.chatMessageC || packet.id == ids.disconnectC) {
            console.log(chat.format(packet.readJSON(), { useAnsiCodes: true }))
        } else if (packet.id == ids.playerPosLookC) {
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
        client.send(new PacketWriter(ids.chatMessageS).writeString(line))
    })
    client.on("end", () => readline.close())
}

main().catch(console.error)
