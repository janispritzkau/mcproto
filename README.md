# Minecraft Protocol

A small implementation of the Minecraft Protocol written in Typescript.
It provides a functionality to decode or encode packets and has a `Connection`
class which keeps track of the connection state, compression and encryption.

This implementation doesn't automatically decode all packets, it does decode
packets that change the state or type of the connection
like set compression or encryption request. For reading packets,
a class `PacketReader` is provided which contains methods for reading common data types.

Packets are written using the `PacketWriter` class and can be converted to a buffer
with the `.encode()` method. The encoded packet is not prefixed with it's length.

## Server List Ping

```js
import { connect } from "net"
import { Connection, PacketWriter } from "../lib"

const HOST = "play.hivemc.com"

const socket = connect({ host: HOST, port: 25565 }, async () => {
    const client = new Connection(socket)

    client.send(new PacketWriter(0x0).writeVarInt(-1)
    .writeString(HOST).writeUInt16(socket.remotePort!)
    .writeVarInt(1))

    client.send(new PacketWriter(0x0))

    const response = await client.nextPacket
    console.log(response.readString())

    socket.end()
})
```

More examples can be found in the repository's `examples` folder.
