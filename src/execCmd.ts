
import {exec} from 'child_process'

export function executeCommand(cmd:string, args:any[], cwd = '', consolePass = false):Promise<any> {
  const out = {
    stdStr: '',
    errStr: '',
    retcode: 0
  }
  return  new Promise(resolve => {
    let cmdstr = cmd + ' ' + args.join(' ')
    // console.log('executing ', cmdstr, 'at', cwd)
    const proc = exec(cmdstr, {cwd})
    if(proc.stdout) proc.stdout.on('data', data => {
      out.stdStr += data.toString()
      if(consolePass) console.log(data.toString())
    })
    if(proc.stderr) proc.stderr.on('data', data => {
      out.errStr += data.toString()
      if(consolePass) console.error(data.toString())
    })
    proc.on('error', error => {
      console.error(error)
      if(!out.errStr) out.errStr = error.message
      out.retcode = -1
      resolve(out)
    })
    proc.on('close', code => {
      out.retcode = code === null ? -1 : code
      resolve(out)
    })
  })
}
