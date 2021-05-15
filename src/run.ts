import {gatherInfo} from './gatherInfo'
import {doCheckIsBuildNeeded} from "./makecheck";
import {doBuild} from "./build"
import {executeCommand} from "./execCmd"
import * as path from 'path'

export function doRun() {
    console.log('do run...')
    let {projPath, projName} = gatherInfo()
    if(doCheckIsBuildNeeded(projPath, projName)) {
        console.log('build first...')
        // console.warn('building disabled')
        doBuild()
    }
    console.log('running...')
    executeCommand(path.join(projPath, 'build', projName), [], path.join(projPath, 'build'),true)
    console.log('')
}
