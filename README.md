# Minecraft Protocol

A small implementation of the Minecraft Protocol written in Typescript.
It provides a functionality to decode or encode packets and has a `Connection`
class which keeps track of the connection state, compression and encryption. It
supports version 1.12.2 and 1.13.2.

`mcproto` aims to be a relatively low level library that only handles connection
related state. Connection related error handling is done outside of the library on the
`Socket` class. `mcproto` has some basic event callbacks: `onDisconnect(reason: any)`,
`onLogin(uuid: string, username: string)`, `onPacket(packet: PacketReader)` which can
be set on the `Connection` class. Keep in mind that the protocol and packet ids
can change from version to version.

This implementation doesn't automatically decode all packets, it does only decode
packets that are related to the connection state like set compression
or encryption request. For reading packets, the class `PacketReader` is provided
which contains methods for reading common data types.

Packets are written using the `PacketWriter` class and can be converted to a buffer
with the `.encode()` method. The encoded packet is not prefixed with it's length.

## Server List Ping

```js
import { connect } from "net"
import { Connection, PacketWriter } from "mcproto"

const HOST = "play.hivemc.com"

const socket = connect({ host: HOST, port: 25565 }, async () => {
    const client = new Connection(socket)

    client.send(new PacketWriter(0x0).writeVarInt(-1)
    .writeString(HOST).writeUInt16(socket.remotePort)
    .writeVarInt(1))

    client.send(new PacketWriter(0x0))

    const response = await client.nextPacket()
    console.log(response.readString())

    socket.end()
})
```

More examples can be found in the repository's `examples` folder.
