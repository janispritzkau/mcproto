# Minecraft Protocol

[![npm](https://img.shields.io/npm/v/mcproto.svg)](https://www.npmjs.com/package/mcproto)
[![downloads](https://img.shields.io/npm/dm/mcproto.svg)](https://www.npmjs.com/package/mcproto)
[![license](https://img.shields.io/npm/l/mcproto.svg)](https://github.com/janispritzkau/mcproto/blob/master/LICENSE)

`mcproto` is a small and lightweight implementation of the Minecraft protocol.
It aims to be a low-level library that provides the foundations
for building clients, servers, proxies and higher level abstractions.
This implementation only decodes packets that are related to the connection state
or login procedure. That makes it mostly version-independent since those
packets usually don't change from version to version.

## Features

- Compression
- Encryption for client and server
- Utility classes for writing / reading packets.
- Asynchronous `nextPacket` method for reading the next packet _(with id)_.
- VarLong and 64 bit data types using [BigInts](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt)

## Examples

### Server list ping

```js
const { Client, PacketWriter, State } = require("mcproto")

const host = "play.hivemc.com", port = 25565

const client = await Client.connect(host, port)

client.send(new PacketWriter(0x0).writeVarInt(404)
    .writeString(host).writeUInt16(port)
    .writeVarInt(State.Status))

client.send(new PacketWriter(0x0))

const response = await client.nextPacket(0x0)
console.log(response.readJSON())

client.end()
```

### Client

```js
const { Client, PacketWriter, State } = require("mcproto")

const host = "localhost", port = 25565, username = "Notch"

const client = await Client.connect(host, port)

client.send(new PacketWriter(0x0).writeVarInt(340)
    .writeString(host).writeUInt16(port).writeVarInt(State.Login))

// Send login start
client.send(new PacketWriter(0x0).writeString(username))

const listener = client.onPacket(0x0, packet => {
    console.log(packet.readJSON())
})

// The server can request encryption and compression which will be handled
// in the background, so just wait until login success.
await client.nextPacket(0x2, false)
listener.dispose()

client.on("packet", packet => {
    if (packet.id == 0xf) console.log(packet.readJSON())
})

// Send chat message
client.send(new PacketWriter(0x2).writeString("Hello"))
```

For online servers, you must specify an accessToken and profile ID:

```js
Client.connect("localhost", 25565, {
    profile: "<id>", accessToken: "<token>"
})
```

More examples can be found in the repository's `examples` folder.

## Events and errors

`mcproto` uses it's own tiny event emitter class and provides different methods
to handle packet, socket and error events.

Since a lot of the API is promise based, errors that happen during the lifetime
a promise will result in the promise being rejected.

Errors that happen outside of async method calls should be handled with a `error`
event handler on the connection instance.

```js
const listener = client.on("error", console.error)

// listeners can be removed with:
listener.dispose()
// or
client.off("error", console.error)
```

The server class does allow to return a `Promise` in the client handler and
it will forward errors to the server's event emitter.

```js
const server = new Server(async client => {
    // errors thrown inside here won't cause a crash but might
    // show warnings if not handled.
    throw "error"
})
server.on("error", console.error)
server.listen()
```

```js
client.on("packet", packet => {
    // make sure to catch errors inside event handlers
})
```

For details about packets and general information about the protocol,
https://wiki.vg/Protocol is a great reference.

## Related projects

- [mc-chat-format](https://github.com/janispritzkau/mc-chat-format). Converts
  chat components into raw / ansi formatted text.
- [mc-status](https://github.com/janispritzkau/mc-server-status) (Server status checker)
- [mcrevproxy](https://gitlab.com/janispritzkau/mcrevproxy) (Reverse proxy)
