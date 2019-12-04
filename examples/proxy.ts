import { PacketWriter, State, Client, Server } from "../src"
import { getProfile } from "./utils"

const host = process.argv[2] || "localhost"
const port = +process.argv[3] || (process.argv[2] ? 25565 : 25566)

const { accessToken, displayName, profile } = getProfile()

new Server({ keepAlive: false }, async conn => {
    conn.on("error", console.error)

    const protocol = (await conn.nextPacket(0x0)).readVarInt()
    conn.pause()

    let client: Client
    try { client = await Client.connect(host, port, {
        accessToken, profile, keepAlive: false
    }) }
    catch (error) {
        return conn.end()
    }

    client.on("error", console.error)

    client.on("end", () => conn.end())
    conn.on("end", () => client.end())

    client.send(new PacketWriter(0x0).writeVarInt(protocol)
        .writeString(host).writeUInt16(port)
        .writeVarInt(conn.state))

    conn.resume()
    const packet = await conn.nextPacket(0x0)

    if (conn.state == State.Login) {
        client.send(new PacketWriter(0x0).writeString(displayName))
        // wait for login success
        conn.send(await client.nextPacket(0x2, false))
    } else if (conn.state == State.Status) {
        client.send(packet)
    }

    conn.on("packet", packet => {
        console.log(`[S] 0x${packet.id.toString(16)}`)
        client.send(packet)
    })

    client.on("packet", packet => {
        console.log(`[C] 0x${packet.id.toString(16)}`)
        conn.send(packet)
    })
}).listen(25565)
