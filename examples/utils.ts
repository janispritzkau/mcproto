import { readFileSync } from "fs"
import { homedir } from "os"
import * as path from "path"

export function getProfile() {
    const config = JSON.parse(readFileSync(path.resolve(homedir(), ".minecraft/launcher_profiles.json"), "utf-8"))
    const { accessToken, profiles } = config.authenticationDatabase[config.selectedUser.account]
    const { profile } = config.selectedUser, { displayName } = profiles[profile]

    return {
        accessToken, profile, displayName
    }
}
