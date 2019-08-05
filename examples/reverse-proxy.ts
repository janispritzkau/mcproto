import { PacketWriter, State, Server, Client } from "../src"

const servers: { [key: string]: { host: string, port: number } } = {
    "hive.localhost": { host: "play.hivemc.com", port: 25565 },
    "localhost": { host: "127.0.0.1", port: 25566 }
}

new Server(async conn => {
    conn.on("error", console.error)

    const handshake = await conn.nextPacket()
    const protocol = handshake.readVarInt(), address = handshake.readString()

    const serverAddr = servers[address]
    if (!serverAddr) {
        const msg = { text: "Please use a valid address to connect!", color: "red" }
        if (conn.state == State.Status) {
            conn.onPacket(0x0, () => conn.send(new PacketWriter(0x0).writeJSON({
                version: { name: "Proxy", protocol: -1 },
                players: { max: -1, online: -1 },
                description: msg
            })))
            conn.onPacket(0x1, packet => conn.send(new PacketWriter(0x1).write(packet.read(8))))
        } else if (conn.state == State.Login) {
            conn.end(new PacketWriter(0).writeJSON(msg))
        }
        return setTimeout(() => conn.end(), 1000)
    }

    conn.pause()

    const { host, port } = serverAddr

    let client: Client
    try { client = await Client.connect(host, port) }
    catch { return conn.end() }

    client.on("error", console.error)

    client.send(new PacketWriter(0x0).writeVarInt(protocol)
        .writeString(host).writeUInt16(port)
        .writeVarInt(conn.state))

    conn.on("packet", packet => client.send(packet))
    await conn.resume()

    conn.unpipe(), client.unpipe()

    conn.socket.pipe(client.socket, { end: true })
    client.socket.pipe(conn.socket, { end: true })
}).listen(25565)
