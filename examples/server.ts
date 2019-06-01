import { Server, State, PacketWriter } from "../src"

const server = new Server(async client => {
    await client.nextPacket()
    if (client.state != State.Status) return client.end()

    client.onPacket(packet => {
        if (packet.id == 0x0) {
            client.send(new PacketWriter(0x0).writeString(JSON.stringify({
                version: { name: "Node", protocol: client.protocol },
                players: { max: 0, online: 0 },
                description: { text: "NodeJS server", color: "light_purple" }
            })))
        } else if (packet.id == 0x1) {
            client.send(new PacketWriter(0x1).write(packet.read(8)))
        }
    })
})
server.listen(25565)
