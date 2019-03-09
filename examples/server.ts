import { createServer } from "net"
import { Connection, PacketWriter, State } from ".."

createServer(async socket => {
    const client = new Connection(socket, { isServer: true })
    client.onError = error => console.log(error.toString())

    const protocol = (await client.nextPacket()).readVarInt()

    if (client.state != State.Status) return client.disconnect()

    client.onPacket = packet => {
        if (packet.id == 0x0) {
            client.send(new PacketWriter(0x0).writeString(JSON.stringify({
                version: { name: "Node", protocol },
                players: { max: 0, online: 0 },
                description: { text: "NodeJS server", color: "light_purple" }
            })))
        } else if (packet.id == 0x1) {
            client.send(new PacketWriter(0x1).write(packet.read(8)))
        }
    }
}).listen(25565)
