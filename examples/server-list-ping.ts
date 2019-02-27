import { connect } from "net"
import { Connection, PacketWriter } from "../lib"
import * as chat from "mc-chat-format"

const host = process.argv[2] || "eu.mineplex.com"
const port = +process.argv[3] || 25565

const socket = connect({ host, port }, async () => {
    const client = new Connection(socket)

    client.send(new PacketWriter(0x0)
        .writeVarInt(-1)
        .writeString(host)
        .writeUInt16(port)
        .writeVarInt(1)
    )

    client.send(new PacketWriter(0x0))

    const status = (await client.nextPacket()).readJSON()

    console.log("\n" + chat.format(status.description, { useAnsiCodes: true }))
    console.log(`\nVersion: ${status.version.name} (protocol ${status.version.protocol})`)
    console.log(`Players: ${status.players.online} / ${status.players.max}`)

    socket.end()
})
