
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
                console.log('\n\n')
                console.log(ac.bold.blue('--------------------------------------------------'))
                console.log(ac.bold.blue('               Test Results'))
                console.log(ac.bold.blue('--------------------------------------------------'))
                let lines = rt.stdStr.split('\n')
                for(let ln of lines) {
                    ln = ln.trim()
                    if(ln.length) {
                        if (ln.charAt(0) === '>') continue
                        if (ln.substring(0, 7) === './build') {
                            console.log(ac.black.italic(ln))
                        } else if (ln.charAt(0) === '✓') {
                            console.log(ac.bold.green('    ✓'), ac.green(ln.substring(1)))
                        } else if (isFinite(Number(ln.charAt(0))) && ln.charAt(1) === ')') {
                            console.log(ac.bold.red('    x'), ac.red(ln))
                        } else {
                            console.log(ac.bold.black(ln))
                        }
                    }
                }
                // remove the test file
                const dtFile = path.resolve('build', '~dotest')
                fs.unlinkSync(dtFile)

            }
        })
        // write the ~dotest file out to signal a test
        const dtFile = path.resolve('build', '~dotest')
        const contents = process.argv.slice(3).join(' ') // disposition (see app-core test handling)
        fs.writeFileSync(dtFile,contents)
    })

    console.log('>>>>>>>>>>>Determining how to run test build >>>>>>>>>>>>>>')
    console.log('argv reminder', process.argv)

    console.log('<<<<<<<<<<<<<<<<<<<<<< That\'s All Folks! >>>>>>>>>>>>>>>>>>>>>>>>>>')
    process.exit(0)

    console.log('waiting...')
    // Launch client
    return Promise.resolve(p).then(() => {
        setTimeout(() => {
            executeCommand('.'+path.sep+projName, [], path.join(projPath, 'build'),true).then(()=> {})

        }, (p !== undefined ? 5000: 1)) // wait 5 seconds if we did a build to allow shell to clear out
        console.log('')
    })
}
