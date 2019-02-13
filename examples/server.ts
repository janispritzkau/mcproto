import { createServer } from "net";
import { Connection, PacketWriter, PacketReader } from "../lib"

createServer(async socket => {
    socket.on("error", err => console.error(err.message))
    const client = new Connection(socket)
    let packet: PacketReader

    packet = await client.nextPacket
    const protocol = packet.readVarInt()
    packet.readString(), packet.readUInt16()
    const nextState = packet.readVarInt()

    if (nextState != 1) return socket.end()

    client.send(
        new PacketWriter(0).writeString(JSON.stringify({
            version: { name: "node", protocol },
            players: { max: 0, online: 0 },
            description: { text: "NodeJS server" }
        }))
    )

    while (true) {
        packet = await client.nextPacketWithId(1)
        client.send(new PacketWriter(1).write(packet.read(8)))
    }
}).listen(25565)
