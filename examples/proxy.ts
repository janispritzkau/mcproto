import { PacketWriter, State, Client, Server } from "../src"
import { getProfile } from "./utils"

const host = process.argv[2] || "localhost"
const port = +process.argv[3] || (process.argv[2] ? 25566 : 25565)

const { accessToken, displayName, profile } = getProfile()

new Server({ keepAlive: true }, async conn => {
    conn.onError(console.error)

    const protocol = (await conn.nextPacket()).readVarInt()
    conn.pause()

    let client: Client
    try { client = await Client.connect(port, host, { accessToken, profile, keepAlive: false }) }
    catch { return conn.end() }

    client.onError(console.error)

    client.onEnd(() => conn.end())
    conn.onEnd(() => client.end())

    client.send(new PacketWriter(0x0).writeVarInt(protocol)
        .writeString(host).writeUInt16(port)
        .writeVarInt(conn.state))

    conn.resume()
    const packet = await conn.nextPacket()

    if (conn.state == State.Login) {
        client.send(new PacketWriter(0x0).writeString(displayName))
        // wait for login success
        await client.nextPacket(0x2, false)

    } else if (conn.state == State.Status) {
        client.send(packet)
    }

    client.onPacket(packet => conn.send(packet))
    conn.onPacket(packet => client.send(packet))
}).listen(25565)
