import {gatherInfo} from './gatherInfo'
import {doCheckIsBuildNeeded} from "./makecheck";
import {doBuild} from "./build"
import {executeCommand} from "./execCmd"
import * as path from 'path'

export function doRun() {
    console.log('do run...')
    let p:any
    let {projPath, projName, buildFlags} = gatherInfo()
    if(buildFlags.clean || doCheckIsBuildNeeded(projPath, projName)) {
        console.log('build first...')
        p = doBuild()
    }
    console.log('waiting...')
    return Promise.resolve(p).then(() => {
        setTimeout(() => {
            executeCommand('.'+path.sep+projName, [], path.join(projPath, 'build'),true)

        }, (p !== undefined ? 5000: 1)) // wait 5 seconds if we did a build to allow shell to clear out
    })
    console.log('')
}
