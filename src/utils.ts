import fetch from "node-fetch"
import * as querystring from "querystring"

export async function joinSession(accessToken: string, selectedProfile: string, serverId: string) {
    const response = await fetch("https://sessionserver.mojang.com/session/minecraft/join", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            accessToken, selectedProfile, serverId
        })
    })
    return response.ok
}

export async function hasJoinedSession(username: string, serverId: string, ip?: string) {
    const response = await fetch("https://sessionserver.mojang.com/session/minecraft/hasJoined?"
    + querystring.stringify({ username, serverId }))
    return response.ok
}

export function mcPublicKeyToPem(buffer: Buffer) {
    let pem = "-----BEGIN PUBLIC KEY-----\n"
    let bpk = buffer.toString("base64")
    const maxLineLength = 65
    while (bpk.length > 0) {
        pem += bpk.substring(0, maxLineLength) + "\n"
        bpk = bpk.substring(maxLineLength)
    }
    return pem + "-----END PUBLIC KEY-----\n"
}

export function mcHexDigest(hash: Buffer) {
    const isNegative = hash.readInt8(0) < 0
    if (isNegative) performTwosCompliment(hash)
    let digest = hash.toString("hex")
    digest = digest.replace(/^0+/g, "")
    if (isNegative) digest = "-" + digest
    return digest
}

function performTwosCompliment(buffer: Buffer) {
    let carry = true, newByte: number, value: number
    for (let i = buffer.length - 1; i >= 0; --i) {
        value = buffer.readUInt8(i)
        newByte = ~value & 0xff
        if (carry) carry = newByte == 0xff, buffer.writeUInt8(newByte + 1, i)
        else buffer.writeUInt8(newByte, i)
    }
}
