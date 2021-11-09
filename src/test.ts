
import {gatherInfo} from './gatherInfo'
import {doCheckIsBuildNeeded} from "./makecheck";
import {doBuild} from "./build"
import {executeCommand} from "./execCmd"
import * as path from 'path'
import * as fs from 'fs'
import * as ac from 'ansi-colors'
import { networkInterfaces } from 'os'

import {Builder, By, Key, until, Options, Capabilities} from "selenium-webdriver"
import * as chrome from "selenium-webdriver/chrome"
import {Options as ChromeOptions} from "selenium-webdriver/chrome"

export function doTest() {
    console.log('setting up for test...')
    let p:any

    const dtFile = path.resolve('build', '~dotest')

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
                fs.unlinkSync(dtFile)

                process.exit(rt.code || 0)

            }
        })
    })

    console.log('>>>>>>>>>>>Determining how to run test build >>>>>>>>>>>>>>')
    const options = process.argv.slice(3)
    console.log('options specified', options)
    let appium = options.indexOf('appium') !== -1
    let android = options.indexOf('android') !== -1
    let ios = options.indexOf('android') !== -1


    let target = ''
    let ti = options.indexOf('target')
    if(ti !== -1) target = options[ti+1]

    let platform = ''
    if(android) platform = 'android'
    if(ios) platform = 'ios'

    let nativescript = !!platform

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
                // launch via ns
                p  = runNativescript(projName, platform, target)
            } else {
                // run the electron app
                p = executeCommand(pathToOurApp, [], workingDirectoryOfOurApp, true)
            }
            Promise.resolve(p).then(() => {

            })

        }, (p !== undefined ? 5000 : 1)) // wait 5 seconds if we did a build to allow shell to clear out
        console.log('')
    })
}

function runNativescript(projName:string, platform:string, target:string) {
    let args = ['run', platform]
    if(target) {
        args.push('--device')
        args.push(target)
    }
    let nsproject = path.resolve('..', 'nativescript', projName)

    console.log('running ns from ', nsproject)
    return executeCommand('ns',args, nsproject)
}


async function example() {
    let driver = await new Builder().forBrowser('chrome').build();
    try {
        await driver.get('http://www.google.com/ncr');
        await driver.findElement(By.name('q')).sendKeys('webdriver', Key.RETURN);
        await driver.wait(until.titleIs('webdriver - Google Search'), 1000);
    } finally {
        await driver.quit();
    }
}

async function appDriver(copts:any) {
    let driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(copts)
        .build()

    try {
        let rt = await driver.getCurrentUrl()
        console.log('currentUrl=', rt)
    } finally {
        await driver.quit();
    }
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