
import {gatherInfo} from './gatherInfo'
import {doCheckIsBuildNeeded} from "./makecheck";
import {doBuild} from "./build"
import {executeCommand} from "./execCmd"
import * as path from 'path'
import * as fs from 'fs'
import * as ac from 'ansi-colors'

const Application = require('spectron').Application


export function doTest() {
    console.log('setting up for test...')
    let p:any

    const dtFile = path.resolve('build', '~dotest')


    console.log('running tests...', process.cwd())
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
                fs.unlinkSync(dtFile)

                console.log('test done, will exit')
                // process.exit(0)

            }
        })
        // write the ~dotest file out to signal a test
        const contents = process.argv.slice(3).join(' ') // disposition (see app-core test handling)
        fs.writeFileSync(dtFile,contents)
    })

    console.log('>>>>>>>>>>>Determining how to run test build >>>>>>>>>>>>>>')
    const options = process.argv.slice(3)
    console.log('options specified', options)
    const appium = options.indexOf('appium') !== -1

    const workingDirectoryOfOurApp = path.join(process.cwd(), 'build')
    const pathToOurApp = path.join(workingDirectoryOfOurApp, projName)
    if(appium) {

        console.log('path to our app', pathToOurApp)

        // process.chdir(workingDirectoryOfOurApp)

        return Promise.resolve(p).then(() => {
            setTimeout(() => {
                console.log("Running under Spectron...")
                const app = new Application({
                    path: "/Users/sohmert/tbd/jove-test/node_modules/@tremho/jove-desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
                    args: ['joveAppBack.js']
                })
                console.log("About to call app.start")
                spectronRunner(app)

            }, (p !== undefined ? 5000 : 1)) // wait 5 seconds if we did a build to allow shell to clear out
            console.log('')
        })

    } else {

        console.log('waiting...')
        // Launch client
        return Promise.resolve(p).then(() => {
            setTimeout(() => {
                executeCommand(pathToOurApp, [], workingDirectoryOfOurApp, true).then(() => {
                })

            }, (p !== undefined ? 5000 : 1)) // wait 5 seconds if we did a build to allow shell to clear out
            console.log('')
        })
    }
}

async function waitForRunning(app:any) {
    return new Promise(resolve => {
        const it = setInterval(() => {
            console.log('checking...')
            if (app.isRunning()) {
                console.log('RUNNING!')
                clearInterval(it)
                resolve(true)
            }
        }, 1000)
    })
}

async function spectronRunner(app:any) {
    console.log('spectronRunner top')
    app.start()
    await waitForRunning(app)
    console.log('past app start, app reports running')
    const count = app.client.getWindowCount()
    console.log('we have a window count of ', count)
}