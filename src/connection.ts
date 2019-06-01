import { Cipher, Decipher, createCipheriv, createDecipheriv } from "crypto"
import { Socket } from "net"
import { PacketWriter, PacketReader, Packet } from "./packet"
import { Reader, Writer } from "./transforms"
import { Emitter } from "./events"

export enum State {
    Handshake = 0,
    Status = 1,
    Login = 2,
    Play = 3
}

enum Event {
    Packet,
    ChangeState,
    Error,
    End
}

interface Events {
    [Event.Packet]: PacketReader
    [Event.ChangeState]: number
    [Event.Error]: any
    [Event.End]: void
}

export class Connection extends Emitter<Events> {
    static Event = Event

    state = State.Handshake
    protocol = -1

    paused = false
    private packets: Buffer[] = []

    private cipher?: Cipher
    private decipher?: Decipher

    private reader = new Reader
    private writer = new Writer

    constructor(public socket: Socket, public isServer = false) {
        super()
        socket.setNoDelay(true)
        socket.on("end", () => {
            this.emit(Event.End, undefined)
            this.writer.end()
        })
        socket.on("error", error => this.emit(Event.Error, error))

        this.socket.pipe(this.reader)
        this.writer.pipe(this.socket)

        this.reader.on("data", packet => this.packetReceived(packet))
        this.reader.on("close", () => this.writer.end())
    }

    onPacket(id: number, handler: (packet: PacketReader) => void): () => boolean
    onPacket(handler: (packet: PacketReader) => void): () => boolean
    onPacket(id: any, handler?: any) {
        if (typeof id == "function") handler = id, id = undefined

        return this.on(Event.Packet, packet => {
            if (id == null || packet.id == id) handler(packet.clone())
        })
    }

    oncePacket(id: number, handler: (packet: PacketReader) => void) {
        const dispose = this.onPacket(id, packet => {
            handler(packet)
            dispose()
        })
        return dispose
    }

    onChangeState(handler: (state: number) => void) {
        return this.on(Event.ChangeState, handler)
    }

    onError(handler: (error: any) => void) {
        return this.on(Event.Error, handler)
    }

    onEnd(handler: () => void) {
        return this.on(Event.End, handler)
    }

    pause() {
        this.paused = true
        this.socket.pause()
        return new Promise<void>(res => this.reader.flush(res))
    }

    async resume() {
        await new Promise(res => this.reader.flush(res))
        for (const packet of this.packets) {
            await Promise.resolve()
            if (!this.socket.writable) break
            this.emit(Event.Packet, new PacketReader(packet, this.protocol))
        }
        this.packets.length = 0
        this.paused = false
        this.socket.resume()
    }

    unpipe() {
        this.socket.unpipe()
        this.writer.unpipe()
    }

    nextPacket(id?: number): Promise<PacketReader> {
        return new Promise(resolve => {
            const dispose = this.on(Event.Packet, packet => {
                if (id == null || packet.id == id) resolve(packet), dispose()
            })
        })
    }

    send(packet: Packet) {
        const buffer = packet instanceof PacketWriter
            ? packet.encode()
            : packet instanceof PacketReader ? packet.buffer : packet

        if (!this.isServer && this.state == State.Handshake) {
            const handshake = new PacketReader(buffer)
            this.protocol = handshake.readVarInt()
            handshake.readString(), handshake.readUInt16()
            this.setState(handshake.readVarInt())
        }

        return new Promise((res, rej) => this.writer.write(buffer, err => {
            if (err) rej(err)
            else res()
        }))
    }

    async end(packet?: Packet) {
        if (packet) await this.send(packet)
        this.socket.end()
    }

    setCompression(threshold: number) {
        if (this.isServer) this.send(new PacketWriter(0x3).writeVarInt(threshold))
        this.reader.compressionThreshold = threshold
        this.writer.compressionThreshold = threshold
    }

    setEncryption(sharedSecret: Buffer) {
        this.cipher = createCipheriv("aes-128-cfb8", sharedSecret, sharedSecret)
        this.decipher = createDecipheriv("aes-128-cfb8", sharedSecret, sharedSecret)
        this.socket.unpipe(), this.writer.unpipe()

        this.socket.pipe(this.decipher).pipe(this.reader)
        this.writer.pipe(this.cipher).pipe(this.socket)
    }

    private setState(state: number) {
        if (this.state != state) this.emit(Event.ChangeState, state)
        this.state = state
    }

    private packetReceived(buffer: Buffer) {
        if (!this.socket.writable) return

        if (this.paused) this.packets.push(buffer)
        else this.emit(Event.Packet, new PacketReader(buffer, this.protocol))

        const packet = new PacketReader(buffer)

        if (this.isServer) {
            if (this.state == State.Handshake) {
                this.protocol = packet.readVarInt()
                packet.readString(), packet.readUInt16()
                this.setState(packet.readVarInt())
            }
            return
        }

        if (this.state == State.Login) switch (packet.id) {
            case 0x2: this.setState(State.Play); break
            case 0x3: this.setCompression(packet.readVarInt()); break
        }
    }
}
