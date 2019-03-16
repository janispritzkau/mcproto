# Minecraft Protocol

mcproto is a small and lightweight implementation of the Minecraft protocol.
It aims to be a low-level library that provides the foundations
for building clients, servers, proxy servers and higher level abstractions.
This implementation only decodes packets that are related to connection state
or the login procedure. That makes it a mostly version independent since those
packets usually don't change from version to version.

## Features

- Compression
- Encryption for client and server
- Helper classes for writing / reading packets.
- Asynchronous method for reading the next packet.
- VarLong and 64 bit data types using [BigInts](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt)

## Examples

### Server list ping

```js
import { connect } from "net"
import { Connection, PacketWriter } from "mcproto"

const host = "play.hivemc.com", port = 25565

const socket = connect({ host, port }, async () => {
    const client = new Connection(socket)

    client.send(new PacketWriter(0x0).writeVarInt(404)
    .writeString(host).writeUInt16(port).writeVarInt(1))

    client.send(new PacketWriter(0x0))

    const response = await client.nextPacket()
    console.log(response.readJSON())

    socket.end()
})
```

### Client

For online servers you need to specify a accessToken and profile id in the
connection options.

```js
import { connect } from "net"
import { Connection, PacketWriter } from "mcproto"

const socket = connect({ host, port }, async () => {
    const client = new Connection(socket, { accessToken, profile })

    client.send(new PacketWriter(0x0).writeVarInt(404)
    .writeString(host).writeUInt16(port).writeVarInt(2))

    client.send(new PacketWriter(0x0).writeString(displayName))

    client.onDisconnect = reason => console.log(reason)
    // login success
    await client.nextPacketWithId(0x2)

    client.onPacket = packet => {
        // chat message or disconnect
        if (packet.id == 0xe || packet.id == 0x1b) {
            console.log(packet.readJSON())
        }
    }

    client.send(new PacketWriter(0x2).writeString("Hello world"))
})
```

More examples can be found in the repository's `examples` folder.

## Related projects

- [mc-chat-format](https://gitlab.com/janispritzkau/mc-chat-format). Converts
  chat components into raw / ansi formatted text.
- [mcrevproxy](https://gitlab.com/janispritzkau/mcrevproxy) (Reverse proxy)
- [mc-status](https://gitlab.com/janispritzkau/mc-status) (Server status checker)
