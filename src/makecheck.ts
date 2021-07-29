
import * as path from "path";
import * as fs from "fs";
import * as os from "os"

// check for an execcutable and record the date/time
// then check all the project sources and check for a later date/time
// and build only if sources are newer

let exeStats:any

function checkExecutable(projPath:string, projName:string) {
    const script = os.platform() === 'win32' ? projName+'.bat' : projName
    const exePath = path.join(projPath, 'build', script)
    // console.log('checking executable at ', exePath)
     if(!fs.existsSync(exePath)) {
         return true; // definitely need to build if it doesn't exist
     }
     exeStats = fs.statSync(exePath)
    // console.log(exeStats)
    return false
}

function checkProjFiles(projPath:string) {
    let dirents = fs.readdirSync(projPath, {withFileTypes:true})
    let result = false;
    dirents.forEach(f => {
        if(!result) {
            const filePath = path.join(projPath, f.name)
            if (f.isDirectory()) {
                if (f.name !== 'build') {
                    result = checkProjFiles(filePath)
                }
            } else {
                const fi = fs.statSync(filePath)
                result = (fi.mtimeMs >= exeStats.ctimeMs)
            }
            // console.log(`${filePath}  ${result}`)
        } else {
            // console.log('...skip...')
        }

    })
    return result
}


export function doCheckIsBuildNeeded(projPath:string, projName:string) {
    let buildNeeded = checkExecutable(projPath, projName)
    if(!buildNeeded) buildNeeded = checkProjFiles(projPath)
    // console.log('build needed = ', buildNeeded)
    return buildNeeded
}