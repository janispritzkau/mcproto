import { readFileSync } from "fs"
import { homedir } from "os"
import * as path from "path"

export function getProfile() {
    let mcPath: string

    if (process.platform == "win32") {
        mcPath = path.join(homedir(), "AppData/Roaming/.minecraft")
    } else if (process.platform == "darwin") {
        mcPath = path.join(homedir(), "Library/Application Support/minecraft")
    } else {
        mcPath = path.join(homedir(), ".minecraft")
    }

    const config = JSON.parse(readFileSync(path.join(mcPath, "launcher_profiles.json"), "utf-8"))
    const { accessToken, profiles } = config.authenticationDatabase[config.selectedUser.account]
    const { profile } = config.selectedUser, { displayName } = profiles[profile]

    return {
        accessToken, profile, displayName
    }
}
