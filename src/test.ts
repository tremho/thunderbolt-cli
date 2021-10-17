
import {gatherInfo} from './gatherInfo'
import {doCheckIsBuildNeeded} from "./makecheck";
import {doBuild} from "./build"
import {executeCommand} from "./execCmd"
import * as path from 'path'
import * as fs from 'fs'
import * as ac from 'ansi-colors'

export function doTest() {
    console.log('setting up for test...')
    let p:any
    console.log('running tests...')
    let {projPath, projName, buildFlags} = gatherInfo()
    if(buildFlags.clean || doCheckIsBuildNeeded(projPath, projName)) {
        console.log('build first...')
        p = doBuild()
    }
    Promise.resolve(p).then(() => {
        p = executeCommand('npm', ['test']).then((rt:any) => {
            if(rt.code) {
                console.log(ac.bold.red('Error'), ac.blue(rt.errStr))
            } else {
                console.log(ac.bold.green('>>>>>>>>>>>> TEST RESULTS <<<<<<<<<<<<<<<<\n\n'))
                let lines = rt.stdStr.split('\n')
                for(let ln of lines) {
                    ln = ln.trim()
                    if(ln.charAt(0) === '>') continue
                    if(ln.substring(0,7) === './build') {
                        console.log(ac.black.italic(ln))
                    }
                    if(ln.charAt(0) === '✓') {
                        console.log(ac.bold.green('    ✓'), ac.green(ln.substring(1)))
                    } else {
                        console.log(ac.bold.black(ln))
                    }
                }
            }
        })
        // write the ~dotest file out to signal a test
        const dtFile = path.resolve('build', '~dotest')
        const contents = 'exit' // disposition; exit after disconnect.  TODO: pull from cli args and implement in test runner.
        fs.writeFileSync(dtFile,contents)
    })


    console.log('waiting...')
    // Launch client
    return Promise.resolve(p).then(() => {
        setTimeout(() => {
            executeCommand('.'+path.sep+projName, [], path.join(projPath, 'build'),true).then(()=> {})

        }, (p !== undefined ? 5000: 1)) // wait 5 seconds if we did a build to allow shell to clear out
        console.log('')
    })
}
