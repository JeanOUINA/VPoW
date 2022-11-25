import { join } from "path";
import git from "isomorphic-git"
import http from "isomorphic-git/http/node"
import fs from "fs"
import spawn from "cross-spawn";

export const repositoryUrl = "https://github.com/JeanOUINA/pyPow"
export const commit = "5e94896c9cb918df132abf7589f5f20c6ed5b2e7"

export function getPyPowInstallPath(){
    return join(__dirname, `../pyPow`)
}

export async function clonePyPowRepo(dir = getPyPowInstallPath()){
    await git.clone({
        fs: fs,
        dir: dir,
        http: http,
        url: repositoryUrl,
        ref: commit
    })
}

export async function checkoutPyPowRepo(ref:string, dir = getPyPowInstallPath()){
    await git.checkout({
        fs: fs,
        dir: dir,
        ref: ref
    })
}
export async function fetchPyPowRepo(dir = getPyPowInstallPath()){
    return git.fetch({
        fs: fs,
        dir: dir,
        http: http
    })
}
export function installPythonDependencies(dir = getPyPowInstallPath()){
    return new Promise<void>((resolve, reject) => {
        const child = spawn("python3", [
            "-m", "pip",
            "install",
            "-r", "requirements.txt"
        ], {
            cwd: dir,
            stdio: "inherit",
            env: process.env
        })
        child.on("exit", code => {
            if(code !== 0){
                reject(new Error("Python dependencies installation failed. Make sure you are on a supported platform and have python3 installed"))
            }else resolve()
        })
    })
}

export async function getPyPowCurrentCommitId(dir = getPyPowInstallPath()){
    const logs = await git.log({
        fs: fs,
        depth: 1,
        dir: dir
    })
    return logs[0].oid
}

export function launchPyPowServer(gpu:string, port:number, dir = getPyPowInstallPath()){
    const child = spawn(
        "python3",
        [
            "-m", "uvicorn",
            "main:APP",
            "--host", "127.0.0.1",
            "--port", String(port)
        ],
        {
            cwd: dir,
            env: {
                ...process.env,
                PYOPENCL_CTX: gpu
            },
            stdio: "pipe"
        }
    )
    return child
}