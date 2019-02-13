import { connect } from "net";
import { Connection, PacketWriter } from "../lib";

const HOST = "eu.mineplex.com"

const socket = connect({ host: HOST, port: 25565 }, async () => {
    const client = new Connection(socket)

    client.send(new PacketWriter(0x0)
        .writeVarInt(404)
        .writeString(HOST)
        .writeUInt16(socket.remotePort!)
        .writeVarInt(1)
    )

    client.send(new PacketWriter(0x0))

    const response = await client.nextPacket
    console.log(response.readString())
    socket.end()
})
