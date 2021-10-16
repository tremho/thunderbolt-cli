
import {gatherInfo} from './gatherInfo'
import {doCheckIsBuildNeeded} from "./makecheck";
import {doBuild} from "./build"
import {executeCommand} from "./execCmd"
import * as path from 'path'
import * as fs from 'fs'

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
        p = executeCommand('npm', ['test'], '', true)
        // write the ~dotest file out to signal a test
        const dtFile = path.resolve('build', '~dotest')
        const contents = projName // just for something to write. really just need a touch.
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
