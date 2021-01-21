import { readFileSync } from "fs"
import { homedir } from "os"
import * as path from "path"

export function getProfile() {
    if (process.env.PROFILE) return {
        accessToken: process.env.ACCESS_TOKEN!,
        profile: process.env.PROFILE!,
        name: process.env.DISPLAY_NAME!
    }

    const mcPath = process.platform == "win32"
        ? path.join(homedir(), "AppData/Roaming/.minecraft")
        : process.platform == "darwin"
            ? path.join(homedir(), "Library/Application Support/minecraft")
            : path.join(homedir(), ".minecraft")

    const launcherAccounts = JSON.parse(readFileSync(path.join(mcPath, "launcher_accounts.json"), "utf-8"))

    const account = launcherAccounts.accounts[launcherAccounts.activeAccountLocalId]
    if (!account) throw new Error("No account found")

    const { accessToken, minecraftProfile: { id, name } } = account
    return { accessToken, profile: id, name }
}
