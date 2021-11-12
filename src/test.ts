
import {gatherInfo} from './gatherInfo'
import {doCheckIsBuildNeeded} from "./makecheck";
import {doBuild} from "./build"
import {doNativeScript} from "./exportNS";
import {executeCommand} from "./execCmd"
import * as path from 'path'
import * as fs from 'fs'
import * as ac from 'ansi-colors'
import { networkInterfaces } from 'os'

export function doTest() {
    console.log('setting up for test...')
    let p:any

    console.log('running tests...')
    let {projPath, projName, buildFlags} = gatherInfo()
    let nsproject = path.resolve('..', 'nativescript', projName)
    const options = process.argv.slice(3)
    let appium = options.indexOf('appium') !== -1
    let android = options.indexOf('android') !== -1
    let ios = options.indexOf('ios') !== -1
    let target = ''
    let ti = options.indexOf('target')
    if(ti !== -1) target = options[ti+1]
    let platform = ''
    if(android) platform = 'android'
    else if(ios) platform = 'ios'

    let nativescript = !!platform

    const dtFile = nativescript ? path.resolve(nsproject, 'app', '~dotest') : path.resolve('build', '~dotest')

    if(buildFlags.clean || nativescript || doCheckIsBuildNeeded(projPath, projName)) {
        console.log('build first...')
        p = doBuild().then(() => {
            if(nativescript) {
                return doNativeScript()
            }
        })
    }

    if(nativescript) {
        // note: the problem with the timing here is that doBuild and doNativesript (above) do not wait
        // until all the output is concluded before resolving, so this message appears prematurely.
        p = Promise.resolve(p).then(() => {
            console.log(ac.bold.green('--------------------------------------------------'))
            console.log(ac.bold.green(`     ${platform} testing will commence shortly...`))
            console.log(ac.bold.green('--------------------------------------------------'))
            return buildNativescript(projName, platform)
        })
    }
    Promise.resolve(p).then(() => {
        console.log('RUNNING TAP TEST SCRIPT (Server)')
        p = executeCommand('npm', ['test'], '', true).then((rt: any) => {
            if (rt.code) {
                console.log(ac.bold.red('Error'), ac.blue(rt.errStr))
            } else {
                console.log('\n\n')
                console.log(ac.bold.blue('--------------------------------------------------'))
                console.log(ac.bold.blue('               Test Results'))
                console.log(ac.bold.blue('--------------------------------------------------'))
                let lines = rt.stdStr.split('\n')
                for (let ln of lines) {
                    ln = ln.trim()
                    if (ln.length) {
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

                process.exit(rt.code || 0)

            }
        })
    })

    // console.log('>>>>>>>>>>>Determining how to run test build >>>>>>>>>>>>>>')
    // console.log('options specified', options)

    let contents = process.argv.slice(3).join(' ') // disposition (see app-core test handling)
    if(nativescript) {
        // write out host as part of dotest
        const host = getHostIP()
        contents += ' host='+host+'\n'
    }
    // write the ~dotest file out to signal a test
    fs.writeFileSync(dtFile,contents)

    // now run the app client we will test against

    const workingDirectoryOfOurApp = path.join(process.cwd(), 'build')
    const pathToOurApp = path.join(workingDirectoryOfOurApp, projName)

    console.log('waiting...')
    // Launch client
    return Promise.resolve(p).then(() => {
        setTimeout(() => {
            if(nativescript) {
                if(appium) {
                  // start appium server
                  p = runAppiumServer()
                  // start appium target runner script
                  p = p.then(() => {
                      p = runAppiumTarget(target, nsproject, projName)
                  })
                } else {
                    // launch via ns
                    p = runNativescript(projName, platform, target)
                }
            } else {
                // run the electron app
                p = executeCommand(pathToOurApp, [], workingDirectoryOfOurApp, true)
            }
            Promise.resolve(p).then(() => {
                console.log(ac.blue.italic('application launched for testing'))
            })

        }, (p !== undefined ? 5000 : 1)) // wait 5 seconds if we did a build to allow shell to clear out
        console.log('')
    })
}

function buildNativescript(projName:string, platform:string) {
    let args = ['build', platform]
    let nsproject = path.resolve('..', 'nativescript', projName)

    console.log('>>>> Building ns '+ args.join(' ') +' from ', nsproject)
    return executeCommand('ns',args, nsproject,false)

}

function runNativescript(projName:string, platform:string, target:string):Promise<void> {

    // -->> Run it manually until we figure this shit out
    // console.log('_______________________')
    // console.log('        HEY!')
    // console.log('                HEY!')
    // console.log('   run ns run android --device medium from the nativescript dir now yourself.')
    // console.log('_______________________')
    // return Promise.resolve()

    return new Promise(resolve => {
        setTimeout(() => {
            let args = ['run', platform, '--no-watch']
            if (target) {
                args.push('--device')
                args.push(target)
            }
            let nsproject = path.resolve('..', 'nativescript', projName)

            console.log('>>>> Running ns ' + args.join(' ') + ' from ', nsproject)
            executeCommand('ns', args, nsproject, true).then(() => {
                resolve()
            })
        }, 1)
    })
}

function runAppiumServer() {
    return executeCommand('appium', [])
}
function runAppiumTarget(target:string, nsproject:string, projName:string) {
    const wdio = require("webdriverio");

// javascript
    const opts = {
        path: '/wd/hub',
        port: 4723,
        capabilities: {
            platformName: "Android",
            platformVersion: "9",
            deviceName: "Android Emulator",
            app: '',
            //appPackage: "io.appium.android.apis",
            //appActivity: ".view.TextFields",
            automationName: "UiAutomator2"
        }
    };

    async function delay(ms:number) {
        return new Promise(resolve => {setTimeout(resolve, ms)})
    }

    async function main () {
        const client = await wdio.remote(opts);

        let status = await client.status()
        console.log('start status', status)

        // now, if we're going to do any fancy interop, we do that now
    }

    //app: "/Users/sohmert/tbd/puppet-test-ws/nativescript/platforms/android/app/build/outputs/apk/debug/app-debug.apk",
    // /Users/sohmert/tbd/nativescript/jove-test/platforms/ios/build/Debug-iphonesimulator/jovetest.app
    const apkPath = path.resolve(nsproject, 'platforms', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
    const iosname = projName.split('-').join('') + '.app'
    const iosPath = path.resolve(nsproject, 'platforms', 'ios', 'build', 'Debug-iphonesimulator', iosname)
    if(opts.capabilities.platformName === "Android") {
        opts.capabilities.app = apkPath
    }
    if(opts.capabilities.platformName === 'iOS') {
        opts.capabilities.app = iosPath
    }


    return main();

}

function getHostIP() {

    const nets = networkInterfaces()
    const results = Object.create(null); // Or just '{}', an empty object

    for (const name of Object.keys(nets)) {
        // @ts-ignore
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                if (!results[name]) {
                    results[name] = [];
                }
                results[name].push(net.address);
            }
        }
    }
// console.log('interfaces', results)

    let iface
    for (let nm of Object.getOwnPropertyNames(results)) {
        iface = results[nm]
        break;
    }
    const ipAddr = (iface && iface[0]) || 'localhost'
    return ipAddr
}