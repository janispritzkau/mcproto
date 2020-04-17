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

interface Events {
    packet: (packet: PacketReader) => void
    changeState: (state: number) => void
    error: (error: any) => void
    end: () => void
}

export class Connection extends Emitter<Events> {
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
        socket.on("close", () => {
            this.emit("end")
            this.writer.end()
        })
        socket.on("error", error => this.emitError(error))
        socket.on("close", () => {
            if (!this.writer.writable) return
            this.emit("end")
            this.writer.end()
        })

        this.socket.pipe(this.reader)
        this.writer.pipe(this.socket)

        this.reader.on("error", error => this.socket.destroy(error))
        this.reader.on("data", packet => this.packetReceived(packet))
        this.reader.on("close", () => this.writer.end())
    }

    onPacket(id: number, handler: (packet: PacketReader) => void) {
        return this.on("packet", packet => {
            if (id == null || packet.id == id) handler(packet.clone())
        })
    }

    oncePacket(id: number, handler: (packet: PacketReader) => void) {
        const listener = this.onPacket(id, packet => {
            handler(packet)
            listener.dispose()
        })
        return listener
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
            this.emit("packet", new PacketReader(packet, this.protocol))
        }
        this.packets.length = 0
        this.paused = false
        this.socket.resume()
    }

    unpipe() {
        this.socket.unpipe()
        this.writer.unpipe()
    }

    nextPacket(id?: number, expectNext = true): Promise<PacketReader> {
        return new Promise((resolve, reject) => {
            const endL = this.on("end", () => (reject(new Error("Server closed")), listener.dispose()))
            const listener = this.on("packet", packet => {
                if (id == null || packet.id == id) {
                    resolve(packet)
                    listener.dispose(), endL.dispose()
                } else if (expectNext && id != null && packet.id != id) {
                    reject(new Error(`Expected packet with id ${id} but got ${packet.id}`))
                    listener.dispose(), endL.dispose()
                }
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

        if (this.isServer && this.state == State.Login) {
            const packet = new PacketReader(buffer)
            if (packet.id == 0x2) this.setState(State.Play)
        }

        return new Promise<void>((resolve, reject) => this.writer.write(buffer, error => {
            if (error) reject(error)
            else resolve()
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
        const oldState = this.state
        this.state = state
        if (oldState != state) this.emit("changeState", state)
    }

    private packetReceived(buffer: Buffer) {
        if (!this.socket.writable) return

        if (this.paused) this.packets.push(buffer)
        else this.emit("packet", new PacketReader(buffer, this.protocol))

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

    protected emitError(error: Error) {
        if (!this.emit("error", error)) {
            console.error("Unhandled connection error", error)
        }
    }
}
