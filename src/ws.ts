import EventEmitter from "events"
import WebSocket from "ws"

enum States {
    CLOSED = "CLOSED",
    CONNECTING = "CONNECTING",
    CONNECTED = "CONNECTED",
    CLOSING = "CLOSING"
}


export async function connect(address: string){
    console.log(`Connecting to VPoW server`)
    const url = "wss://pow.vitamin.tips/?address="+address
    
    const connection = new WebsocketConnection()
    connection.url = url
    connection.on("error", () => {})
    try{
        await connection.connect()
    }catch(err){
        console.error(err)
        console.error("Connection failed; Exiting")
        process.exit()
    }
    console.log("Connected!")
    return connection
}

export class WebsocketConnection extends EventEmitter {
    ws: WebSocket
    url: string
    pingTimeout: NodeJS.Timeout
    async connect(){
        if(![WebsocketConnection.States.CLOSING, WebsocketConnection.States.CLOSED].includes(this.state))return // Already connected
        const ws = this.ws = new WebSocket(this.url)
        ws.on("message", message => {
            const data = JSON.parse(message.toString("utf8"))
            this.onMessage(data)
        })
        await new Promise<void>((resolve, reject) => {
            const cleanEvents = () => {
                ws.off("open", openEvent)
            }
            const openEvent = () => {
                cleanEvents()
                this.emit("open")
                this.resetPingTimeout()
                resolve()
            }
            const errorEvent = (err) => {
                cleanEvents()
                this.ws = null
                this.emit("error", err)
                clearTimeout(this.pingTimeout)

                setTimeout(() => {
                    this.connect().catch(()=>{})
                }, 2000)
                reject(err)
            }
            ws.once("open", openEvent)
            ws.on("error", errorEvent)
        })
        // We are connected
        ws.on("close", () => {
            this.ws = null
            this.emit("close")
            clearTimeout(this.pingTimeout)

            setTimeout(() => {
                this.connect().catch(()=>{})
            }, 2000)
        })
    }
    get state(){
        if(!this.ws || this.ws.readyState === 3)return WebsocketConnection.States.CLOSED
        return [
            WebsocketConnection.States.CONNECTING,
            WebsocketConnection.States.CONNECTED,
            WebsocketConnection.States.CLOSING
        ][this.ws.readyState]
    }
    static States = States

    onMessage(data:any){
        switch(data.action){
            case "ping": {
                this.resetPingTimeout()
                this.ws?.send(JSON.stringify({
                    action: "pong",
                    d: Date.now()
                }))
                break
            }
            default: {
                this.emit(data.action, data)
                break
            }
        }
    }

    resetPingTimeout(){
        clearTimeout(this.pingTimeout)
        this.pingTimeout = setTimeout(() => {
            console.log("[WS]: Ping Timeout. Closing connection and reopening.")
            this.ws.terminate()
            this.connect().catch(console.error)
        }, 45000)
    }
}