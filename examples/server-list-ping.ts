import { connect } from "net"
import { Connection, PacketWriter } from "../lib"
import * as chat from "mc-chat-format"

const HOST = "eu.mineplex.com"

const socket = connect({ host: HOST, port: 25565 }, async () => {
    const client = new Connection(socket)

    client.send(new PacketWriter(0x0)
        .writeVarInt(-1)
        .writeString(HOST)
        .writeUInt16(socket.remotePort!)
        .writeVarInt(1)
    )

    client.send(new PacketWriter(0x0))

    const status = (await client.nextPacket).readJSON()

    console.log("\n" + chat.format(status.description, { useAnsiCodes: true }))
    console.log(`\nVersion: ${status.version.name} (protocol ${status.version.protocol})`)
    console.log(`Players: ${status.players.online} / ${status.players.max}`)

    socket.end()
})
