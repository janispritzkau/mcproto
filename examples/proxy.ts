import { createServer, connect } from "net"
import { Connection, PacketWriter } from "../lib"

const username = "username"
const ign_username = "username"
const password = "password"

const host = "localhost"
const port = 25566

createServer(async serverSocket => {
    serverSocket.on("error", err => console.error(err.message))
    const server = new Connection(serverSocket, { isServer: true })

    const handshake = await server.nextPacket
    const response = server.nextPacketWithId(0x0)

    const clientSocket = connect({ host, port }, async () => {
        clientSocket.on("end", () => serverSocket.end())
        serverSocket.on("end", () => clientSocket.end())

        const client = new Connection(clientSocket, { username, password })

        const protocol = handshake.readVarInt()
        const nextState = (handshake.readString(), handshake.readInt16(), handshake.readVarInt())

        client.send(new PacketWriter(0).writeVarInt(protocol)
        .writeString(host).writeUInt16(port).writeVarInt(nextState))
        if (nextState == 2) console.log((await response).readString())
        client.send(nextState == 2 ? new PacketWriter(0x0).writeString(ign_username) : new PacketWriter(0x0))

        if (nextState == 2) {
            client.onPacket = packet => {
                console.log(packet.id)
                if (packet.id == 0x02) {
                    console.log(packet.readString(), packet.readString())
                    server.send(packet)
                }
            }
            await new Promise(res => client.onLogin = res)
        }

        client.onPacket = packet => server.send(packet)
        server.onPacket = packet => {
            if (packet.id == 0xb) return
            console.log(packet.id.toString(16))
            client.send(packet)
        }
    })
}).listen(25565)
