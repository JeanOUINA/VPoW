#! /usr/bin/env node
import { patch as patchConsole } from "modernlog"
patchConsole()

const supportedVersions = [
    "v16",
    "v18"
]
if(!supportedVersions.includes(process.version.split(".")[0])){
    console.warn(`You're running an unsupported NodeJS version (${process.version}). If you encounter bugs, please install NodeJS v18 https://nodejs.org`)
}

import { appendFileSync, existsSync, writeFileSync } from "fs";
import { chmod, mkdir, rm } from "fs-extra";
import { dirname, join } from "path";
import { downloadURL } from "./http";
import * as crypto from "crypto"
import { fetchWorkServerInfos, getDownloadURL, getInstallPath, launchWorkServer } from "./work_server";
import { connect } from "./ws";
import fetch from "node-fetch";
import { checkoutPyPowRepo, clonePyPowRepo, commit, fetchPyPowRepo, getPyPowCurrentCommitId, getPyPowInstallPath, installPythonDependencies, launchPyPowServer, repositoryUrl } from "./pyPow";

(async () => {
    let address:string
    let gpuId:string
    let usePyPow = false
    for(let i = 2; i < process.argv.length; i++){
        const arg = process.argv[i]
        switch(arg){
            case "--pyPow":
                usePyPow = true
                break
            default: {
                if(!address){
                    address = arg
                }else if(!gpuId){
                    gpuId = arg
                }else{
                    console.error(`Invalid arguments:`, process.argv)
                    return
                }
            }
        }
    }
    if(!address || !/^vite_[\dabcdef]{50}$/.test(address)){
        console.error(`Invalid address: ${address}. Usage: npx vpow <YOUR_VITE_ADDRESS> 0:0`)
        return
    }
    if(!gpuId){
        gpuId = "0:0"
    }

    console.log(`Launching VPoW`)
    let port = 49152
    const random = crypto.randomBytes(32).toString("hex")
    for(let i = 0;i*2 < random.length;i++){
        port += parseInt(random.slice(i*2, i*2+2), 16)
    }
    console.info(`Using port`, port)
    if(usePyPow){
        console.warn(`Using pyPow instead of pow-gpu`)
        console.warn(`Please make sure you have python 3 installed`)
        const installPath = getPyPowInstallPath()
        if(existsSync(join(installPath, "vpow.log"))){
            console.info(`Verifying installation`)
            const commitId = await getPyPowCurrentCommitId()
            if(commitId !== commit){
                console.info(`Outdated pyPow installation; updating...`)
                await fetchPyPowRepo()
                await checkoutPyPowRepo(commit)
                
                console.info(`Installing python dependencies`)
                await installPythonDependencies()
                console.log(`pyPow successfully updated!`)
                appendFileSync(join(installPath, "vpow.log"), `[${commitId} => ${commit}] Successfully updated at ${new Date().toISOString()}\n`)
            }else{
                console.log(`Installation verified!`)
            }
        }else{
            if(existsSync(installPath))await rm(installPath, {
                recursive: true
            })
            console.info(`Cloning pyPow from ${repositoryUrl} to ${installPath} using git (isomorphic-git)`)
            await clonePyPowRepo()
            console.log(`Finished downloading pyPow`)

            console.info(`Installing python dependencies`)
            await installPythonDependencies()
            console.log(`pyPow successfully installed!`)
            writeFileSync(join(installPath, "vpow.log"), `[${commit}] Successfully installed at ${new Date().toISOString()}\n`)
        }

        const child = launchPyPowServer(gpuId, port)
        child.on("exit", code => {
            process.exit(code)
        })
        child.stderr.pipe(process.stderr)
        child.stdout.pipe(process.stdout)
    }else{
        console.info("Fetching data from api")
        const infos = await fetchWorkServerInfos()
        const installPath = getInstallPath(process.platform, process.arch)
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
        

        const child = launchWorkServer(installPath, gpuId, port)
        child.on("exit", code => {
            process.exit(code)
        })
        child.stderr.pipe(process.stderr)

        let data = ""
        child.stdout.on("data", (chunk) => {
            data += chunk.toString("utf8")
            
            const chunks = data.split(/\n/g)
            if(chunks.length === 1)return
            data = data.split(/\n/g).pop()
            for(const chunk of chunks.slice(0, -1)){
                // filter out work_cancel
                if(chunk === "Received work_cancel")continue
                process.stdout.write(chunk+"\n")
            }
        })

        process.on("exit", () => {
            // don't forget to close work server
            child.kill()
        })
    }

    console.log(`Work Server launched !`)

    const connection = await connect(address)

    const works = {}

    connection.on("work_generate", async (data:{
        action: string
        hash: string,
        threshold: string,
        difficulty: string
    }) => {
        const abortController = new AbortController()
        works[data.hash] = () => {
            abortController.abort()
        }
        try{
            let body = null
            if(usePyPow){
                // pyPow
                body = JSON.stringify({
                    jsonrpc: "2.0",
                    id: 0,
                    method: "util_getPoWNonce",
                    params: [
                        data.difficulty,
                        data.hash
                    ]
                })
            }else{
                // pow-gpu
                body = JSON.stringify({
                    action: data.action,
                    hash: data.hash,
                    threshold: data.threshold
                })
            }

            const res = await fetch(`http://127.0.0.1:${port}/`, {
                method: "POST",
                headers: {
                    "accept": "text/plain;charset=UTF-8",
                    "Content-Type": "application/json"
                },
                body: body,
                signal: abortController.signal
            })
            delete works[data.hash]
            let json = await res.json()
            
            if(res.status !== 200)return
            if(usePyPow){
                if(json.result == "input error")return
                json = {
                    work: Buffer.from(json.result, "base64").toString("hex")
                }
            }
            connection.ws?.send(JSON.stringify({
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
        if(usePyPow)return
        
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