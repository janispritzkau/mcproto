import { connect } from "net"
import { Connection, PacketWriter } from ".."
import * as chat from "mc-chat-format"

const host = process.argv[2] || "hive.expr.run"
const port = +process.argv[3] || 25565

const socket = connect({ host, port }, async () => {
    const client = new Connection(socket)

    client.send(new PacketWriter(0x0)
    .writeVarInt(-1)
    .writeString(host)
    .writeUInt16(port)
    .writeVarInt(1))

    client.send(new PacketWriter(0x0))

    const status = (await client.nextPacket()).readJSON()

    client.send(new PacketWriter(0x1).write(Buffer.alloc(8)))
    const start = Date.now()
    await client.nextPacketWithId(0x1)
    const ping = Date.now() - start

    console.log("\n" + chat.format(status.description, { useAnsiCodes: true }))
    console.log(`\nVersion: ${status.version.name} (${status.version.protocol})`)
    console.log(`Players: ${status.players.online}/${status.players.max}`)
    console.log(`Ping:    ${ping} ms`)

    socket.end()
})
