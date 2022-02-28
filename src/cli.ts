import { patch as patchConsole } from "modernlog"
patchConsole()

if(process.version.split(".")[0] !== "v16"){
    console.warn(`You're running an unsupported NodeJS version (${process.version}). If you encounter bugs, please install NodeJS v16 https://nodejs.org`)
}

import { existsSync, writeFileSync } from "fs";
import { chmod, mkdir } from "fs-extra";
import { dirname } from "path";
import { downloadURL } from "./http";
import * as crypto from "crypto"
import { fetchWorkServerInfos, getDownloadURL, getInstallPath, launchWorkServer } from "./work_server";
import { connect } from "./ws";
import fetch from "node-fetch";

;(async () => {
    let [
        address,
        gpuId
    ] = process.argv.slice(2)
    if(!address || !/^vite_[\dabcdef]{50}$/.test(address)){
        console.error(`Invalid address: ${address}. Usage: \`npx vite-pow vite_youraddress 0:0\``)
        return
    }
    if(!gpuId){
        gpuId = "0:0"
    }

    console.log("Launching VPoW")
    console.info("Fetching data from api")
    const infos = await fetchWorkServerInfos(process.platform)
    const installPath = getInstallPath(process.platform)
    if(existsSync(installPath)){
        console.info("Verifying installation")
        let installedInfos = require(installPath+".json")
        if(installedInfos.version !== infos.version){
            console.log("New update available ! Downloading")
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
            console.log("Downloaded!")
            installedInfos = infos
            writeFileSync(installPath+".json", JSON.stringify(infos))
        }
        console.log("Installation verified!")
    }else{
        console.log(getDownloadURL(infos))
        console.log("Downloading PoW Server")
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
        console.log("Downloaded!")
        writeFileSync(installPath+".json", JSON.stringify(infos))
    }
    let port = 49152
    const random = crypto.randomBytes(32).toString("hex")
    for(let i = 0;i*2 < random.length;i++){
        port += parseInt(random.slice(i*2, i*2+2), 16)
    }

    console.info("Launching PoW Server using port", port, "for work server.")

    const child = launchWorkServer(installPath, gpuId, port)
    child.on("exit", code => {
        process.exit(code)
    })
    process.on("exit", () => {
        // don't forget to close work server
        child.kill()
    })
    console.log(`Work Server launched !`)

    const connection = await connect(address)

    const works = {}

    connection.on("work_generate", async (data:{
        action: string
        hash: string,
        threshold: string
    }) => {
        const abortController = new AbortController()
        works[data.hash] = () => {
            abortController.abort()
        }
        try{
            const res = await fetch(`http://127.0.0.1:${port}/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(data),
                signal: abortController.signal
            })
            delete works[data.hash]
            if(res.status !== 200)return
            const json = await res.json()
            connection.ws.send(JSON.stringify({
                action: "response",
                hash: data.hash,
                nonce: json.work
            }))
        }catch{}
    })
    connection.on("work_accepted", (data:{
        hash: string,
        payout: string[]
    }) => {
        console.log(`${data.hash}:Accepted:${data.payout.join(" ")}`)
    })
    connection.on("work_cancel", async (data:{
        action: string,
        hash: string
    }) => {
        if(!works[data.hash])return
        works[data.hash]()
        delete works[data.hash]
        
        await fetch(`http://127.0.0.1:${port}/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                action: "work_cancel",
                hash: data.hash
            })
        })
    })
})()