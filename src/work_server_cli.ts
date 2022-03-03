#! /usr/bin/env node
if(process.version.split(".")[0] !== "v16"){
    console.warn(`You're running an unsupported NodeJS version (${process.version}). If you encounter bugs, please install NodeJS v16 https://nodejs.org`)
}

import { existsSync, writeFileSync } from "fs";
import { chmod, mkdir } from "fs-extra";
import { dirname } from "path";
import { downloadURL } from "./http";
import { fetchWorkServerInfos, getDownloadURL, getInstallPath, launchWorkServer } from "./work_server";
import spawn from "cross-spawn";

;(async () => {
    const infos = await fetchWorkServerInfos(process.platform)
    const installPath = getInstallPath(process.platform)
    if(existsSync(installPath)){
        let installedInfos = require(installPath+".json")
        if(installedInfos.version !== infos.version){
            await downloadURL(
                getDownloadURL(infos),
                installPath
            )
            if(process.platform !== "win32"){
                await chmod(
                    installPath, 
                    0o775
                )
            }
            installedInfos = infos
            writeFileSync(installPath+".json", JSON.stringify(infos))
        }
    }else{
        if(!existsSync(dirname(installPath))){
            await mkdir(dirname(installPath), {
                recursive: true
            })
        }
        await downloadURL(
            getDownloadURL(infos),
            installPath
        )
        if(process.platform !== "win32"){
            await chmod(
                installPath, 
                0o775
            )
        }
        writeFileSync(installPath+".json", JSON.stringify(infos))
    }

    const child = spawn(installPath, process.argv.slice(2), {
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit"
    })
    child.on("exit", code => {
        process.exit(code)
    })
    process.on("exit", () => {
        // don't forget to close work server
        child.kill()
    })
})()