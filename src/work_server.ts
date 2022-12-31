import spawn from "cross-spawn"
import { join } from "path"
import { callViteApi } from "./http"

export interface DownloadInfos {
    version: string,
    files: {
        [platform:string]: string
    }
}

export async function fetchWorkServerInfos(){
    return callViteApi("/work_server/infos.json")
}

export function getDownloadURL(infos:DownloadInfos):string{
    let platform = process.platform
    if(platform === "darwin"){
        platform += process.arch
    }
    const filename = infos.files[platform]
    if(!filename)throw new Error(`Platform "${process.platform} ${process.arch}" is not supported.`)
    return `https://vite-api.thomiz.dev/work_server/${infos.version}/${filename}`
}

export function getInstallPath(platform:NodeJS.Platform, arch: string){
    return join(__dirname, `../work_server/${platform}-work-server-${arch}${platform === "win32" ? ".exe" : ""}`)
}

export function launchWorkServer(serverPath:string, gpu:string, port:number){
    const child = spawn(
        serverPath,
        [
            "--gpu",
            gpu,
            "--listen-address",
            "127.0.0.1:"+port,
            // new flag with 0.3.1
            "--shuffle"
        ],
        {
            cwd: __dirname,
            env: process.env,
            stdio: "pipe"
        }
    )
    return child
}