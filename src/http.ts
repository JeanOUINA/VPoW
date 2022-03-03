import fetch from "node-fetch"
import * as fs from "fs/promises"
import * as bongodl from "bongodl"
import { dirname } from "path"

export async function callViteApi(url:string, method = "GET", body?: any){
    const resp = await fetch(`https://vite-api.thomiz.dev/${url.slice(1)}`, {
        method,
        body: body || null,
        headers: method === "POST" ? {
            "Content-Type": "application/json"
        } : {}
    })
    const text = await resp.text()
    let json:any = {
        error: {
            name: "ServerError",
            message: "The json returned by the server couldn't be parsed."
        }
    }
    try{
        json = JSON.parse(text)
    }catch{}
    if(typeof json === "object" && json !== null && "error" in json){
        const err = new Error(json.error.message)
        err.name = json.error.name
        throw err
    }else {
        return json
    }
}

export function downloadURL(url:string, path:string){
    return new Promise<void>((resolve, reject) => {
        new bongodl.Downloader({
            manifest_url: url+".manifest",
            startAuto: true,
            concurrent: 3,
            emitStatus: false
        }).on("end", async (filepath) => {
            await fs.rename(filepath, path)
            await fs.rm(dirname(filepath), {recursive: true})
            resolve()
        }).on("error", error => {
            reject(error)
        })
    })
}