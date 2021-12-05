import * as fs from 'fs'
import * as path from 'path'
import * as ac from 'ansi-colors'

import {executeCommand} from "./execCmd";
import {gatherInfo} from "./gatherInfo";
import * as componentReader from './tbFiles/ComponentReader'
import * as pageReader from "./tbFiles/PageReader";
import {translateScss} from "./tbFiles/MigrateScss";
import {iconPrepNS} from "./tbFiles/IconPrepNS";
import {metaMigrateNS} from "./tbFiles/MetadataMover"

const spinner = require('text-spinner')({
    interval: 100,
    prefix: '\x1B[10G'
})

let trace = true;


let nsRoot:string
let nsVersion:string

let outPath:string, appId:string, projName:string, projPath:string, pkgInfo:any, jovePath:string
let wantClean = false;
let runCmd = ''
let platform = ''
let device = ''

function readCommandOptions() {
    const opts = process.argv.slice(3)
    let i = 0
    while(i < opts.length) {
        const opt = opts[i].toLowerCase()
        if(opt === '--outpath') {
            outPath = opts[++i]
            if(outPath) outPath = path.resolve(outPath)
        }
        if(opt === '--appid') {
            appId = opts[++i]
        }
        if(opt === '--clean') {
            wantClean = true;
        }
        if(opt === 'run' || opt === 'debug') {
            runCmd = opt
            platform = opts[++i]
        }
        if(opt === 'device') {
            device = opts[++i]
        }
        i++
    }
}

function collectInfo() {
    const info = gatherInfo()
    readCommandOptions()
    if(!outPath) {
        outPath = path.resolve(info.projPath, '..', 'nativescript')
    }
    if(!appId) {
        appId = info.projId || `jove.ns.${info.projName}`
    }
    projName = info.projName
    projPath = info.projPath
    jovePath = path.resolve(info.packPath, '..', '..', '..', '@tremho/jove-cli','src')
}


export function doNativeScript() {
    console.log(ac.bold('Exporting to a mobile project under Nativescript...'))
    collectInfo()
    readProjPackage()
    return createNSProjectIfNotExist().then(() => {
        if(trace) console.log('copySources')
        copySources()
        if(trace) console.log('migrateAppBack')
        migrateAppBack()
        if(trace) console.log('makeNativeScriptComponents')
        makeNativeScriptComponents()
        if(trace) console.log('migrateScss')
        migrateScss()
        if(trace)  console.log('migrateLaunch')
        migrateLaunch()
        if(trace)  console.log('unify project identifier')
        unifyProjectId()

        // migrate metadata
        metaMigrateNS(path.join(outPath, projName))
        // make icons
        return iconPrepNS(projPath, path.join(outPath, projName)).then(() => {
            if(trace)  console.log('npm install')
            return npmInstall().then(() => {
                console.log(ac.bold.green('Project '+ projName+' exported to Nativescript project at '+path.join(outPath, projName)))

                if(runCmd) {
                    let opts = []
                    opts.push(runCmd)
                    opts.push(platform)
                    if(device) {
                        opts.push('--device')
                        opts.push(device)
                    }
                    executeCommand('ns', opts, nsRoot, true)
                }

            })
        })
    })
}

let nscwd = ''
function ns(...args:any) {
    if(trace) console.log('ns', ...args)
    return executeCommand('ns', args, nscwd, trace)
}

function createNSProjectIfNotExist() {
    nsRoot = path.join(outPath, projName)

    // start by verifying ns exists
    if (trace) console.log('checking ns version')
    return executeCommand('ns --version', []).then(ret=> {

        if(ret.retcode) {
            console.log(ac.bold.red('Error: Nativescript is not installed!'))
            process.exit(1)
        }
        if(ret.stdStr) {
            const lines = ret.stdStr.split('\n')
            for(let ln of lines) {
                if(ln) {
                    let t = Number(ln.charAt(0))
                    if (isFinite(t)) {
                        nsVersion = ln
                        console.log('>>>>>> Detected NS version ', nsVersion)
                        if (t < 8) {
                            console.log(ac.bold.red(`Error: NativeScript version ${nsVersion} is not supported.  Please use NativeScript 8 or higher`))
                            process.exit(1)
                        }
                    } else {
                        console.log(ln)
                    }
                }
            }
        }

        // if we don't have the outpath root, we must create it
        if(!fs.existsSync(outPath)) {
            fs.mkdirSync(outPath, {recursive: true})
        }

        // see if we have an existing folder
        console.log(ac.italic('checking for existing nativescript project ...'))
        let existing = false;
        if(fs.existsSync(nsRoot)) {
            if(wantClean) {
                fs.rmSync(nsRoot, {recursive:true})
            } else {
                // verify nativescript.config.ts, package.json, app/joveAppBack.ts
                let okay = fs.existsSync(path.join(nsRoot, 'nativescript.config.ts'))
                okay = okay && fs.existsSync(path.join(nsRoot, 'package.json'))
                let joveAppSrcPath = pkgInfo.backMain || 'src/joveAppBack.ts'
                joveAppSrcPath = joveAppSrcPath.substring(joveAppSrcPath.indexOf('/') + 1)
                okay = okay && fs.existsSync(path.join(nsRoot, 'app', joveAppSrcPath))

                if (!okay) {
                    console.log(ac.bold.red('Error') + ': ' + nsRoot + ' exists but does not appear to be a prior export')
                    console.log('use the ' + ac.italic('--clean') + ' option to force overwrite if desired')
                    throw Error()
                }
                existing = true
            }
        }

        let p
        if(!existing) {
            let templatePath = path.resolve(projPath, 'node_modules', '@tremho', 'jove-cli','ns-template.tgz')
            console.log(ac.bold.green('Creating new nativescript project export at '+nsRoot))
            p =  ns(`create ${projName} --appid ${appId} --template ${templatePath} --path ${outPath}`).then(ret => {
                if(ret.retcode) {
                    console.log(ac.bold.red('Error') + ': Unable to create Nativescript export')
                    console.log(ret.errStr || ret.stdStr)
                    throw Error()
                }
                nscwd = nsRoot
                return ns('doctor').then(ret => {
                    if(ret.errcode) {
                        console.log(ac.bold.red('Error ')+ ret.errStr)
                        process.exit(ret.errcode)
                    }
                    const docstat = ret.stdStr
                    const lines = docstat.split('\n')
                    for(let i=0; i<lines.length; i++) {
                        const ln = lines[i]
                        console.log(ac.green(ln))
                    }
                })
            })
        } else {
            console.log(ac.green('Updating existing nativescript export at '+nsRoot))
        }

        spinner.start()
        return Promise.resolve(p).then(() => {
            if(trace) console.log('npm install')
            executeCommand('npm', ['install'], nsRoot).then((rt:any)=> {
                spinner.stop()
                if(rt.code) {
                    console.error(ac.bold.red('Error Finalizing Nativescript export'))
                    console.log(ac.magenta(rt.errStr))
                    process.exit(rt.code)
                }
            })
            if(trace)  console.log('exporting...')
        }).catch(e => {
            spinner.stop()
            console.error(ac.bold.red('Error Creating Nativescript'))
            process.exit(-1)
        })
    }).catch(e => {
        console.error(ac.bold.red('Error Locating Nativescript'))
        process.exit(-1)

    })

}

function readProjPackage() {
    let pkgjson = path.join(projPath, 'package.json')
    if(trace)  console.log('reading package.json at '+pkgjson)
    try {
        const contents = fs.readFileSync(pkgjson).toString()
        pkgInfo = JSON.parse(contents)
    } catch(e) {
        // @ts-ignore
        console.log(ac.bold(ac.red('Error')+ `: No "package.json" file for project ${projName}`))
        throw Error()
    }

}

function migrateAppBack() {
    // read our joveAppBack source
    const joveAppSrcPath = pkgInfo.backMain || 'src/joveAppBack.ts'
    if(trace)  console.log('migrating '+ joveAppSrcPath+'...')
    let source = ""
    try {
        source = fs.readFileSync(path.join(projPath, joveAppSrcPath)).toString()
    } catch(e) {
        throw Error('Unable to read app file "'+joveAppSrcPath+'"')
    }
    // find "@tremho/jove-desktop" in either an import or require line
    let lines = source.split('\n')
    for(let i=0; i<lines.length; i++) {
        const ln = lines[i]
        let n = ln.indexOf('@tremho/jove-desktop')
        if(n !== -1) {
            if(trace)  console.log('found "@tremho/jove-desktop"')
            if(ln.indexOf('import') !== -1 || ln.indexOf('require') !== -1) {
                // change to "@tremho/jove-mobile"
                if(trace)  console.log('changing to "mobile"')
                lines[i] = ln.replace('@tremho/jove-desktop','@tremho/jove-mobile')
                if(trace)  console.log(lines[i])
            }
        }
    }
    // write to dest
    source = lines.join('\n')
    let dest = path.join(outPath, projName, 'app', 'joveAppBack.ts')
    try {
        if (fs.existsSync(dest)) {
            fs.unlinkSync(dest)
        }
        if(trace) console.log('migrating ', source)
        fs.writeFileSync(dest, source)

    } catch(e) {
        console.error('Unable to write '+dest)
        throw e
    }
    if(trace)  console.log('... okay')
}

function testForUpdate(src:string, dest:string) {
    if(!fs.existsSync(src)) {
        return false; // source does not exist; no copy
    }
    if(!fs.existsSync(dest)) {
        return true; // destination does not exist; do copy
    }
    const sstat = fs.lstatSync(src)
    const dstat = fs.lstatSync(dest)

    // return trye if source is newer
    return (sstat.mtimeMs > dstat.mtimeMs)
}

function copySources() {
    const src = path.join(projPath, 'src')
    const dst = path.join(outPath, projName, 'app')
    copySourceDirectory(src, dst)
}

function copySourceFile(src:string, dest:string) {
    if(testForUpdate(src,dest)) {
        if(trace)  console.log('copying ', src, dest)
        let destdir = dest.substring(0, dest.lastIndexOf(path.sep))
        if(!fs.existsSync(destdir)) {
            fs.mkdirSync(destdir, {recursive: true})
        }
        fs.copyFileSync(src, dest)
    } else {
        if(trace)  console.log('skipping ', src)
    }
}
function copySourceDirectory(src:string, dest:string) {
    const files = fs.readdirSync(src)
    files.forEach(file => {
        const srcpath = path.join(src, file)
        const dstpath = path.join(dest, file)
        const fstat = fs.lstatSync(srcpath)
        if(fstat.isDirectory()) {
            if(file !== 'pages' && file !== 'components') {
                copySourceDirectory(srcpath, dstpath)
            }
        } else {
            copySourceFile(srcpath, dstpath)
        }
    })
}

function migrateLaunch() {
    console.log('writing launch files...')
    let destPath = path.join(outPath, projName, 'app', 'launch')
    if(!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath)
    }
    let srcPath = path.join(jovePath, 'nslaunch')
    if(!fs.existsSync(srcPath)) {
        console.error('CLI launch file templates not available -- check installation', srcPath)
        throw Error
    }
    copySourceFile(path.join(srcPath, 'main.ts.src'), path.join(destPath, 'main.ts'))
    copySourceFile(path.join(srcPath, 'main.xml.src'), path.join(destPath, 'main.xml'))

    console.log('transferring BuildEnvironment')
    const src = path.join(projPath, 'build', 'BuildEnvironment.json')
    const dest = path.join(outPath, projName, 'app', 'BuildEnvironment.json')

    // read current build environment
    try {
        let contents = fs.readFileSync(src).toString()
        let be = JSON.parse(contents)
        // add our nsVersion
        be.platform.nativeScript = nsVersion
        contents = JSON.stringify(be, null, 2)
        // write to destination
        fs.writeFileSync(dest, contents)
    } catch(e) {
        console.error(ac.red('Error migrating build environment '))
        throw e
    }
    //
    // // console.log(src, dest)
    // fs.copyFileSync(src, dest) // copy the file directly over
    // const verify = fs.existsSync(dest)
    // // console.log("copy verified as "+verify)
}

function npmInstall() {
    return Promise.resolve(); // not necessary.
    // console.log('performing npm install...')
    // return executeCommand('npm', ['install'])
}

function makeNativeScriptComponents() {
    if(trace)  console.log('ready to makeNativeScriptComponents', projPath, jovePath)
    const componentsDir = path.join(projPath, 'src', 'components')
    let dest = path.join(outPath, projName, 'app', 'components')

    console.log('. components...')
    componentReader.enumerateAndConvert(componentsDir, 'nativescript', dest)

    const pageDir = path.join(projPath, 'src', 'pages')
    dest = path.join(outPath, projName, 'app', 'pages')
    console.log('. pages...')
    pageReader.enumerateAndConvert(pageDir, 'nativescript', dest)
}

function migrateScss() {
    // translate from mobile-qualified scss files to the app/scss directory
    // collect the imports into app.scss and write to app/app.scss
    const scssSource = path.join(projPath, 'src', 'scss')
    const scssDest = path.join(outPath, projName, 'app', 'scss')
    const appScss = path.join(outPath, projName, 'app', 'app.scss')
    const imports:string[] = []
    if(trace) console.log('migrate Scss', scssSource, scssDest)
    importScss(scssSource, imports, scssDest)
    importScss(path.join(outPath, projName, 'app', 'components'), imports)

    const varSrc = path.join(jovePath, 'tbFiles', 'theme-vars.scss')
    const varDest = path.join(outPath, projName, 'tb-vars.scss')
    fs.copyFileSync(varSrc, varDest)

    const themeSrc = path.join(jovePath, 'tbFiles', 'theme-nativescript.scss')
    const themeDest = path.join(outPath, projName, 'tb-theme.scss')
    fs.copyFileSync(themeSrc, themeDest)

    const theme = `
        @import '@nativescript/theme/css/core.css';
        @import '@nativescript/theme/css/default.css';
    
        @import "../tb-vars";    
        @import "../tb-theme";
    
        `
        +imports.join('\n        ')
    fs.writeFileSync(appScss, theme)

}
function isMobilePrefix(pfx:string):boolean {
    return (pfx === 'mobile'
        || pfx === 'ios'
        || pfx === 'android')
}

function importScss(dirPath:string, imports:string[], destDir:string = dirPath) {
    if(trace) console.log('importScss', dirPath)
    const files = fs.readdirSync(dirPath) || []
    for(let i=0; i<files.length; i++) {
        const file = files[i]
        const fstat = fs.lstatSync(path.join(dirPath, file))
        if(fstat.isDirectory()) {
            importScss(path.join(dirPath, file), imports, path.join(destDir, file))
        } else {
            let lcd = 'app/'
            let n = dirPath.indexOf(lcd)
            if(n === -1) {
                lcd = 'src/'
                n = dirPath.indexOf(lcd)
            }
            if(n === -1) {
                console.error('can\'t find common path in importScss', dirPath)
                return
            }
            const relPath = dirPath.substring(n+lcd.length)

            if (file.substring(file.lastIndexOf('.')).toLowerCase().trim() === '.scss') {
                const pfx = file.substring(file.indexOf('.') + 1, file.lastIndexOf('.'))
                if (pfx === '.' || isMobilePrefix(pfx)) {
                    imports.push('@import "./'+relPath+'/' + file + '";')

                    let srcScss = path.join(dirPath, file)
                    // console.log('read from '+srcScss)
                    try {
                        const contents = fs.readFileSync(srcScss).toString()
                        let converted = translateScss(contents, ':host')
                        // console.log('converted scss', converted)
                        let dest = path.join(destDir, file)
                        // console.log('write to ', dest)
                        fs.writeFileSync(dest, converted)
                    } catch(e) {
                        // @ts-ignore
                        console.error(ac.bold.red('Error migrating '+srcScss), e)
                        process.exit(-1)

                    }

                }
            }
        }
    }
}

/**
 * Copy appId into place for NS
 */
function unifyProjectId () {
const configTemplate = `
import { NativeScriptConfig } from '@nativescript/core';

export default {
  id: '${appId}',
  appPath: 'app',
  appResourcesPath: 'App_Resources',
  android: {
    v8Flags: '--expose_gc',
    markingMode: 'none'
  }
} as NativeScriptConfig;
`
    try {
        const configDest = path.join(outPath, projName, 'nativescript.config.ts')
        fs.writeFileSync(configDest, configTemplate)
    } catch(e) {
        // @ts-ignore
        console.error(ac.bold.red('ERROR updating Nativescript config'), ac.red(e))
    }

    console.log('project id written as ', appId)

}
