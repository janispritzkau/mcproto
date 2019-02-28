import { createServer, connect } from "net"
import { Connection, PacketWriter, State } from ".."

const servers: {[key: string]: { host: string, port: number }} = {
    "hive.localhost": { host: "play.hivemc.com", port: 25565 },
    "localhost": { host: "127.0.0.1", port: 25566 }
}

createServer(async serverSocket => {
    serverSocket.on("error", _err => {})
    const server = new Connection(serverSocket, { isServer: true })

    const handshake = await server.nextPacket()
    const protocol = handshake.readVarInt(), address = handshake.readString()

    server.pause()

    const serverAddr = servers[address]
    if (!serverAddr) {
        const msg = { text: "Please use a valid address to connect!", color: "red" }
        if (server.state == State.Status) {
            server.resume()
            await server.nextPacketWithId(0x0)
            server.send(new PacketWriter(0x0).writeJSON({
                version: { name: "Proxy", protocol: -1 },
                players: { max: -1, online: -1 },
                description: msg
            }))
            server.onPacket = packet => {
                if (packet.id == 0x1) server.send(new PacketWriter(0x1).write(packet.read(8)))
            }
        } else if (server.state == State.Login) {
            server.send(new PacketWriter(0x0).writeJSON(msg))
            serverSocket.end()
        }
        return setTimeout(() => serverSocket.end(), 1000)
    }

    const { host, port } = serverAddr
    const clientSocket = connect({ host, port }, async () => {
        const client = new Connection(clientSocket)

        client.send(new PacketWriter(0x0).writeVarInt(protocol)
        .writeString(host).writeUInt16(port).writeVarInt(server.state))

        server.onPacket = packet => client.send(packet)
        server.resume()

        server.destroy(), client.destroy()
        serverSocket.pipe(clientSocket), clientSocket.pipe(serverSocket)
    })

    clientSocket.on("error", error => console.log(error.message))
    clientSocket.on("close", () => serverSocket.end())
    serverSocket.on("close", () => clientSocket.end())
}).listen(25565)

