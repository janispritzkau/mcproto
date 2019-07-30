import { Client, PacketWriter, State } from "../src"
import * as chat from "mc-chat-format"

const host = process.argv[2] || "localhost"
const port = +process.argv[3] || 25565

Client.connect(port, host).then(async client => {
    client.send(new PacketWriter(0x0).writeVarInt(-1)
        .writeString(host).writeUInt16(port)
        .writeVarInt(State.Status))
    client.send(new PacketWriter(0x0))

    const status = (await client.nextPacket(0)).readJSON()

    client.send(new PacketWriter(0x1).write(Buffer.alloc(8)))
    const start = Date.now()
    await client.nextPacket(0x1)
    const ping = Date.now() - start

    console.log("\n" + chat.format(status.description, { useAnsiCodes: true }))
    console.log(`\nVersion: ${status.version.name} (${status.version.protocol})`)
    console.log(`Players: ${status.players.online}/${status.players.max}`)
    console.log(`Ping:    ${ping} ms\n`)

    client.end()
})
