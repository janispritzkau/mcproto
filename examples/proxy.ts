import { createServer, connect } from "net"
import { Connection, PacketWriter } from "../lib"
import { readFileSync } from "fs"
import * as path from "path"
import { homedir } from "os"

const host = "2b2t.org"
const port = 25565

const profiles = JSON.parse(
    readFileSync(path.resolve(homedir(), ".minecraft/launcher_profiles.json"), "utf-8")
)
const { accessToken, ...account } = profiles.authenticationDatabase[profiles.selectedUser.account]
const name = account.profiles[profiles.selectedUser.profile].displayName
const profile = profiles.selectedUser.profile

createServer(async serverSocket => {
    serverSocket.on("error", err => console.error(err.message))
    const server = new Connection(serverSocket, { isServer: true })

    const handshake = await server.nextPacket

    const clientSocket = connect({ host, port }, async () => {
        clientSocket.on("end", () => serverSocket.end())
        serverSocket.on("end", () => clientSocket.end())

        const client = new Connection(clientSocket, { accessToken, profile })

        const protocol = handshake.readVarInt()
        const nextState = (handshake.readString(), handshake.readInt16(), handshake.readVarInt())

        client.send(new PacketWriter(0x0).writeVarInt(protocol)
        .writeString(host).writeUInt16(port).writeVarInt(nextState))
        client.send(nextState == 2 ? new PacketWriter(0x0).writeString(name) : new PacketWriter(0x0))

        if (nextState == 2) {
            client.onPacket = packet => {
                if (packet.id == 0x2) {
                    console.log(packet.readString(), packet.readString())
                    server.send(packet)
                }
            }
            await new Promise(res => client.onLogin = res)
        }

        client.onPacket = packet => server.send(packet)
        server.onPacket = packet => {
            if (packet.id == 0xb) return
            client.send(packet)
        }
    })
}).listen(25565)
