import { createServer } from "net"
import { Connection, PacketWriter, State } from ".."

createServer(async socket => {
    socket.on("error", err => console.error(err.message))
    const client = new Connection(socket, { isServer: true })
    client.onError = error => console.log(error.message)

    const handshake = await client.nextPacket()
    const protocol = handshake.readVarInt()

    if (client.state != State.Status) return socket.end()

    await client.nextPacket()

    client.send(
        new PacketWriter(0x0).writeString(JSON.stringify({
            version: { name: "Node", protocol },
            players: { max: 0, online: 0 },
            description: { text: "NodeJS server", color: "light_purple" }
        }))
    )

    while (true) {
        const ping = await client.nextPacketWithId(0x1)
        client.send(new PacketWriter(0x1).write(ping.read(8)))
    }
}).listen(25565)
