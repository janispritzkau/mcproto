import { readFileSync, writeFileSync } from "fs"
import fetch from "node-fetch"

interface AuthResponse {
    accessToken: string
    selectedProfile: { id: string }
}

const headers = {
    'Content-Type': 'application/json'
}

export async function authenticate(username: string, password: string, noCache = true): Promise<AuthResponse> {
    let auth
    try {
        if (noCache) throw null
        auth = JSON.parse(readFileSync(".auth_cache.json", "utf-8"))
    } catch (err) {
        auth = await fetch("https://authserver.mojang.com/authenticate", {
            method: "POST", headers, body: JSON.stringify({
                agent: { name: "minecraft", version: 1 },
                username, password
            })
        }).then(res => res.json())
        if (!noCache) writeFileSync(".auth_cache.json", JSON.stringify(auth))
    }
    return auth
}

export async function sessionJoin(accessToken: string, selectedProfile: string, serverId: string) {
    let response = await fetch("https://sessionserver.mojang.com/session/minecraft/join", {
        method: "POST", headers, body: JSON.stringify({
            accessToken, selectedProfile, serverId
        })
    })
    return response.ok
}

export function mcPublicKeyToPem(buffer: Buffer) {
    let pem = "-----BEGIN PUBLIC KEY-----\n", bpk = buffer.toString('base64')
    const maxLineLength = 65
    while (bpk.length > 0) {
        pem += bpk.substring(0, maxLineLength) + '\n', bpk = bpk.substring(maxLineLength)
    }
    return pem + "-----END PUBLIC KEY-----\n"
}

export function mcHexDigest(hash: Buffer) {
    let negative = hash.readInt8(0) < 0
    if (negative) performTwosCompliment(hash)
    let digest = hash.toString('hex')
    digest = digest.replace(/^0+/g, '')
    if (negative) digest = '-' + digest
    return digest;
}

function performTwosCompliment(buffer: Buffer) {
    let carry = true;
    let i, newByte, value;
    for (i = buffer.length - 1; i >= 0; --i) {
        value = buffer.readUInt8(i);
        newByte = ~value & 0xff;
        if (carry) {
            carry = newByte === 0xff;
            buffer.writeUInt8(newByte + 1, i);
        } else {
            buffer.writeUInt8(newByte, i);
        }
    }
}
