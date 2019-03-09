import { createServer, connect } from "net"
import { Connection, PacketWriter, State } from ".."

const servers: {[key: string]: { host: string, port: number }} = {
    "hive.localhost": { host: "play.hivemc.com", port: 25565 },
    "localhost": { host: "127.0.0.1", port: 25566 }
}

createServer(async serverSocket => {
    const server = new Connection(serverSocket, { isServer: true })
    server.onError = error => console.log(error.toString())

    const handshake = await server.nextPacket()
    const protocol = handshake.readVarInt(), address = handshake.readString()

    const serverAddr = servers[address]
    if (!serverAddr) {
        const msg = { text: "Please use a valid address to connect!", color: "red" }
        if (server.state == State.Status) server.onPacket = packet => {
            if (packet.id == 0x0) {
                server.send(new PacketWriter(0x0).writeJSON({
                    version: { name: "Proxy", protocol: -1 },
                    players: { max: -1, online: -1 },
                    description: msg
                }))
            } else if (packet.id == 0x1) {
                server.send(new PacketWriter(0x1).write(packet.read(8)))
            }
        }
        else if (server.state == State.Login) server.disconnect(msg)
        return setTimeout(() => serverSocket.end(), 1000)
    }

    server.pause()

    const { host, port } = serverAddr
    const client = new Connection(connect({ host, port }, async () => {
        client.send(new PacketWriter(0x0).writeVarInt(protocol)
        .writeString(host).writeUInt16(port).writeVarInt(server.state))

        server.onPacket = packet => client.send(packet)
        await server.resume()

        server.destroy(), client.destroy()
        serverSocket.pipe(client.socket), client.socket.pipe(serverSocket)
    }))

    client.onError = error => console.log(error.toString())

    client.onClose = () => server.disconnect()
    server.onClose = () => client.disconnect()
}).listen(25565)

