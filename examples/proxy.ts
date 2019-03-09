import { createServer } from "net"
import { Connection, PacketWriter, State } from ".."
import { getProfile } from "./utils"

const host = process.argv[2] || "localhost"
const port = +process.argv[3] || 25565

const { accessToken, displayName, profile } = getProfile()

createServer(async serverSocket => {
    const server = new Connection(serverSocket, { isServer: true })
    server.onError = error => console.log(error.toString())

    const handshake = await server.nextPacket()
    server.pause()

    Connection.connect(host, port, { accessToken, profile, keepAlive: false }).then(async client => {
        client.onError = error => console.log(error.toString())
        client.onClose = server.disconnect
        server.onClose = client.disconnect

        const protocol = handshake.readVarInt()
        handshake.readString(), handshake.readInt16()

        client.send(new PacketWriter(0x0).writeVarInt(protocol)
        .writeString(host).writeUInt16(port).writeVarInt(server.state))

        const packet = await server.nextPacket()
        server.resume()

        if (server.state == State.Login) {
            client.send(new PacketWriter(0x0).writeString(displayName))

            server.send(await new Promise((resolve, reject) => {
                client.onLogin = resolve, client.onDisconnect = reject
            }))
        } else if (server.state == State.Status) {
            client.send(packet)
        }

        client.onPacket = packet => server.send(packet)
        server.onPacket = packet => client.send(packet)
    }).catch(error => console.log(error.toString()))
}).listen(25565)
