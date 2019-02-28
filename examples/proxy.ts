import { createServer, connect } from "net"
import { Connection, PacketWriter, Packet, State } from ".."
import { getProfile } from "./utils"

const host = process.argv[2] || "eu.mineplex.com"
const port = +process.argv[3] || 25565

const { accessToken, displayName, profile } = getProfile()

createServer(async serverSocket => {
    serverSocket.on("error", err => console.error(err.message))
    const server = new Connection(serverSocket, { isServer: true })

    const handshake = await server.nextPacket()
    server.pause()

    const clientSocket = connect({ host, port }, async () => {
        clientSocket.on("close", () => serverSocket.end())
        serverSocket.on("close", () => clientSocket.end())

        const client = new Connection(clientSocket, { accessToken, profile, keepAlive: false })
        client.onError = error => console.error(error.message)

        const protocol = handshake.readVarInt()
        handshake.readString(), handshake.readInt16()

        client.send(new PacketWriter(0x0).writeVarInt(protocol)
        .writeString(host).writeUInt16(port).writeVarInt(server.state))

        const packet = await server.nextPacket()
        server.resume()

        if (server.state == State.Login) {
            client.send(new PacketWriter(0x0).writeString(displayName))

            server.send(await new Promise<Packet>((resolve, reject) => {
                client.onLogin = resolve, client.onDisconnect = reject
            }))
        } else if (server.state == State.Status) {
            client.send(packet)
        }

        client.onPacket = server.send
        server.onPacket = client.send
    })
    clientSocket.on("error", err => console.error(err.message))
}).listen(25565)
