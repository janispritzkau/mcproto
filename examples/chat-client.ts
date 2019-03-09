import * as chat from "mc-chat-format"
import { Connection, PacketWriter } from ".."
import { getProfile } from "./utils"
import * as rl from "readline"

const host = process.argv[2] || "localhost"
const port = +process.argv[3] || 25565

const { accessToken, profile, displayName } = getProfile()

Connection.connect(host, port, { accessToken, profile }).then(async client => {
    client.send(new PacketWriter(0x0).writeVarInt(404)
    .writeString(host).writeUInt16(port).writeVarInt(2))

    client.send(new PacketWriter(0x0).writeString(displayName))

    client.onDisconnect = reason => {
        console.log(chat.format(reason, { useAnsiCodes: true }))
    }

    await new Promise(resolve => (client.onLogin = resolve))

    client.onPacket = packet => {
        switch (packet.id) {
            case 0xe: {
                console.log(chat.format(packet.readJSON(), { useAnsiCodes: true }))
            }; break
            case 0x32: {
                packet.read(3 * 8 + 2 * 4 + 1)
                const teleportId = packet.readVarInt()
                client.send(new PacketWriter(0x0).writeVarInt(teleportId))
            }
        }
    }

    const readline = rl.createInterface({
        input: process.stdin,
        output: process.stdout
    }).on("line", line => {
        if (!line) return
        client.send(new PacketWriter(0x2).writeString(line))
    })
    client.onClose = () => readline.close()
}).catch(error => console.log(error.toString()))
