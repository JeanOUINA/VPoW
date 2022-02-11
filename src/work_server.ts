import spawn from "cross-spawn"
import { join } from "path"
import { callViteApi } from "./http"

export interface DownloadInfos {
    version: string,
    files: {
        [platform:string]: string
    }
}

export async function fetchWorkServerInfos(platform:NodeJS.Platform){
    return callViteApi("/work_server/infos.json")
}

export function getDownloadURL(infos:DownloadInfos):string{
    const filename = infos.files[process.platform]
    if(!filename)throw new Error(`Platform "${process.platform}" is not supported.`)
    return `https://vite-api.thomiz.dev/work_server/${infos.version}/${filename}`
}

export function getInstallPath(platform:NodeJS.Platform){
    return join(__dirname, `../work_server/${platform}-work-server${platform === "win32" ? ".exe" : ""}`)
}

export function launchWorkServer(serverPath:string, gpu:string, port:number){
    const child = spawn(
        serverPath,
        [
            "--gpu",
            gpu,
            "--listen-address",
            "127.0.0.1:"+port
        ],
        {
            cwd: __dirname,
            env: process.env,
            stdio: "inherit"
        }
    )
    return child
}