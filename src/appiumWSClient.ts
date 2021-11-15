
import WebSocket from 'ws'
export type ClientEventHandler = (data:any) => void

export class WSClient {
    ws:WebSocket = (null as unknown as WebSocket)
    eventMap:any = {}

    connect(serviceUrl:string) {
        this.ws = new WebSocket(serviceUrl)
        this.ws.on('open', () => {
            // console.log('opened -- connected')
            this.handleEvent('connect', serviceUrl)
        })
        this.ws.on('message', (message:string) => {
            this.handleEvent('data', message)
        })
    }
    send(data:any) {
        this.ws.send(data)
    }

    end(code:number = 1000) {
        this.ws?.close(code)
    }

    on(event:string, handler:ClientEventHandler) {
        this.eventMap[event] = handler
    }
    handleEvent(event:string, data:any) {
        const fn = this.eventMap[event]
        if(fn) {
            fn(data)
        }
    }
}

export async function connectClient(service:string):Promise<WSClient> {
    // console.log('connecting to', service)
    const client = new WSClient()
    return new Promise(resolve => {
        client.on('connect', (data:any) => {
            // console.log('connected to ', service)
            resolve(client)
        })
        client.connect(service)
    })
}

let rcount = 1
let code = 1000
export function clientAppium(service:string):Promise<number> {
    return new Promise(resolve => {
        // console.log('starting client test')
        connectClient(service).then((client:any) => {
            client.on('close', (data:any) => {
                if(data.code === 1000) {// normal close
                    // console.log('client closed normally', data.reason)
                } else {
                    console.warn('client closed abnormally', code, data.reason)
                }
            })
            client.on('data', (data:any) => {
                let directive = data.toString()
                if(directive.substring(0,7) !== 'appium:') {
                    return
                } else {
                    directive = directive.substring(8)
                }
                // console.log('received directive', directive)
                const reply = executeDirective(directive)
                Promise.resolve(reply).then((res:string) => {
                    const srep = `${rcount}:${directive}=${res}`
                    rcount++
                    //   console.log('replying ', srep)
                    client.send(srep)
                })
            })
        })
    })
}

let registeredHandler:any;

export function registerAppiumHandler(handler:any) {
    registeredHandler = handler
}

function executeDirective(directive:string) {
    return Promise.resolve(registeredHandler && registeredHandler(directive))
}

