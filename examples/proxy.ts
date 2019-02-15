import { createServer, connect } from "net"
import { Connection, PacketWriter } from "../lib"
import { readFileSync } from "fs"
import { homedir } from "os"
import * as path from "path"

const host = "2b2t.org"
const port = 25565

const profiles = JSON.parse(readFileSync(path.resolve(homedir(), ".minecraft/launcher_profiles.json"), "utf-8"))
const { accessToken, ...account } = profiles.authenticationDatabase[profiles.selectedUser.account]
const name = account.profiles[profiles.selectedUser.profile].displayName
const profile = profiles.selectedUser.profile

createServer(async serverSocket => {
    serverSocket.on("error", err => console.error(err.message))
    const server = new Connection(serverSocket, { isServer: true })

    const handshake = await server.nextPacket

    const clientSocket = connect({ host, port }, async () => {
        clientSocket.on("close", () => serverSocket.end())
        serverSocket.on("close", () => clientSocket.end())

        const client = new Connection(clientSocket, { accessToken, profile, keepAlive: false })

        const protocol = handshake.readVarInt()
        handshake.readString(), handshake.readInt16()
        const nextState = handshake.readVarInt()

        client.send(new PacketWriter(0x0).writeVarInt(protocol)
        .writeString(host).writeUInt16(port).writeVarInt(nextState))

        client.send(nextState == 2 ? new PacketWriter(0x0).writeString(name) : new PacketWriter(0x0))

        if (nextState == 2) {
            const [uuid, username] = await new Promise(res => client.onLogin = (...args) => res(args))
            server.send(new PacketWriter(0x2).writeString(uuid).writeString(username))
        }

        client.onPacket = packet => server.send(packet)
        server.onPacket = packet => client.send(packet)
    })
    clientSocket.on("error", err => console.error(err.message))
}).listen(25565)
