import * as fs from 'fs'
import * as path from 'path'
import * as ac from 'ansi-colors'
import * as hjson from 'hjson'

import {executeCommand} from "./execCmd";
import {gatherInfo} from "./gatherInfo";
import * as componentReader from './tbFiles/ComponentReader'
import * as pageReader from "./tbFiles/PageReader";
import {translateScss} from "./tbFiles/MigrateScss";
import {iconPrepNS} from "./tbFiles/IconPrepNS";
import {metaMigrateNS} from "./tbFiles/MetadataMover"

const dotenv = require('dotenv')

const spinner = require('text-spinner')({
    interval: 100,
    prefix: '\x1B[10G'
})

let nsRoot:string
let nsVersion:string

let outPath:string, appId:string, projName:string, projPath:string, pkgInfo:any, nsPkgInfo:any, jovePath:string
let wantClean = false;
let runCmd = ''
let platform = ''
let device = ''
let debugBrk = false
let updateType = 'build' // default.  Pass 'major', 'minor', 'patch', or 'build' along with dist to specify version type, or 'mark' to promote from pre-release.
let verbose = false

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
        if(opt === 'run' || opt === 'debug' || opt === 'dist') {
            runCmd = opt
            platform = opts[++i]
        }
        // support alternative order
        if(opt === 'ios' || opt === 'android' || opt === 'all') {
            platform = opt
        }
        if(opt === 'device') {
            device = opts[++i]
        }
        if(opt === '--debug-brk') {
            debugBrk = true
        }
        if(opt === 'major' || opt === 'minor' || opt === 'patch' || opt === 'mark') {
            updateType = opt
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
    verbose = info.buildFlags.verbose
    projName = info.projName
    projPath = info.projPath
    jovePath = path.resolve(info.packPath, '..', '..', '..', '@tremho/jove-cli','src')
}


export function doNativeScript() {
    console.log(ac.bold('Exporting to a mobile project under Nativescript...'))
    collectInfo()
    readProjPackage()
    return createNSProjectIfNotExist().then(() => {
        copySources()
        migrateAppBack()
        makeNativeScriptComponents()
        migrateScss()
        migrateLaunch()
        unifyProjectId()

        console.log('----- doing additional preps----')
        // migrate metadata
        metaMigrateNS(path.join(outPath, projName))
        // make icons
        return iconPrepNS(projPath, path.join(outPath, projName), pkgInfo.splash?.background).then(() => {
            return migrateExtras().then(()=> {
                return npmInstall().then(() => {
                    console.log(ac.bold.green('Project ' + projName + ' exported to Nativescript project at ' + path.join(outPath, projName)))

                    let release = false
                    if (runCmd) {
                        if(runCmd === 'dist') {
                            runCmd = 'build'
                            release = true
                        }
                        let opts = []
                        opts.push(runCmd)
                        opts.push(platform)
                        if (debugBrk && runCmd === 'debug') {
                            opts.push('--debug-brk')
                        }
                        if (device) {
                            opts.push('--device')
                            opts.push(device)
                        }
                        opts.push('--no-hmr')
                        if(release) {
                            const preVersion = pkgInfo.version
                            const version = versionBump(preVersion, updateType)
                            const syncVersion = makeSyncVersion(version)

                            // console.log(ac.bold.black(`\n -- tagging semantic version ${version} -- \n`))
                            console.log(ac.italic.black.bgYellowBright(`submitting version ${version} to store as a build of ${syncVersion}`))
                            console.log('')
                            // release to main will write the new version, commit it, and merge to main
                            // we'll end up in our original branch in the end
                            return makeFastlane(syncVersion)
                            // return releaseToMain(version).then((success) => {
                            //     if(success) {
                            //         // publish to app store
                            //         return makeFastlane(syncVersion)
                            //     } else {
                            //         console.error(ac.bold.red('\n -- RELEASE ABANDONED -- \n'), ac.black.italic('address errors above and try again'))
                            //     }
                            // })
                        }
                        executeCommand('ns', opts, nsRoot, true)
                    }

                })
            })
        })
    })
}

let nscwd = ''
function ns(...args:any) {
    trace('executing ns', ...args)
    return executeCommand('ns', args, nscwd, verbose)
}

function createNSProjectIfNotExist() {
    nsRoot = path.join(outPath, projName)

    // start by verifying ns exists
    trace('checking ns version')
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
            trace('npm install')
            executeCommand('npm', ['install'], nsRoot).then((rt:any)=> {
                spinner.stop()
                if(rt.code) {
                    console.error(ac.bold.red('Error Finalizing Nativescript export'))
                    console.log(ac.magenta(rt.errStr))
                    process.exit(rt.code)
                }
            })
            trace('exporting...')
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
    trace('reading package.json at '+pkgjson)
    try {
        const contents = fs.readFileSync(pkgjson).toString()
        pkgInfo = JSON.parse(contents)
    } catch(e) {
        // @ts-ignore
        console.log(ac.bold(ac.red('Error')+ `: No "package.json" file for project ${projName}`))
        throw Error()
    }
}

function readNSPackage() {
    let pkgjson = path.join(outPath, projName,  'package.json')
    trace('reading package.json at '+pkgjson)
    try {
        const contents = fs.readFileSync(pkgjson).toString()
        nsPkgInfo = JSON.parse(contents)
    } catch(e) {
        // @ts-ignore
        console.log(ac.bold(ac.red('Error')+ `: No "package.json" file for project ${projName}`))
        throw Error()
    }
}



function migrateAppBack() {
    // read our joveAppBack source
    const joveAppSrcPath = pkgInfo.backMain || 'src/joveAppBack.ts'
    trace('migrating '+ joveAppSrcPath+'...')
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
            trace('found "@tremho/jove-desktop"')
            if(ln.indexOf('import') !== -1 || ln.indexOf('require') !== -1) {
                // change to "@tremho/jove-mobile"
                trace('changing to "mobile"')
                lines[i] = ln.replace('@tremho/jove-desktop','@tremho/jove-mobile')
                trace(lines[i])
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
        trace('migrating ', source)
        fs.writeFileSync(dest, source)

    } catch(e) {
        console.error('Unable to write '+dest)
        throw e
    }
    trace('... okay')
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

// Copy if newer
function copySourceFile(src:string, dest:string, always=false) {
    if(always || testForUpdate(src,dest)) {
        trace('copying ', src, dest)
        let destdir = dest.substring(0, dest.lastIndexOf(path.sep))
        if(!fs.existsSync(destdir)) {
            fs.mkdirSync(destdir, {recursive: true})
        }
        fs.copyFileSync(src, dest)
    } else {
        trace('skipping ', src)
    }
}
// copy files in the directory if newer
function copySourceDirectory(src:string, dest:string, always=false) {
    trace('copySourceDirectory')
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
            copySourceFile(srcpath, dstpath, always)
        }
    })
}

function migrateLaunch() {
    trace('migrateLaunch')
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

async function migrateExtras():Promise<any> {
    trace('migrateExtras')
    const extrasManifest = path.resolve(path.join(projPath, 'nativescript-extras.conf'))

    readNSPackage()

    let extras:any = {}
    if(fs.existsSync(extrasManifest)) {
        try {
            extras = hjson.parse(fs.readFileSync(extrasManifest).toString())
        } catch (e) {
            // @ts-ignore
            console.error(ac.bold.red(e))
        }
    }
    let deps:any = nsPkgInfo.dependencies || {}
    for(let p of extras.plugins || []) {
        if(!deps[p]) {
            await addPlugin(p)
        }
    }
    for(let p of extras.npmModules || []) {
        if(!deps[p]) {
            await addModule(p, false)
        }
    }
    let devDeps:any = nsPkgInfo.devDependencies || {}
    for(let p of extras.devModules || []) {
        if(devDeps[p]) {
            await addModule(p, true)
        }
    }
    for(let cmd of extras.scriptActions || []) {
        await runCommand(cmd)
    }
    return Promise.resolve()
}

async function addPlugin(name:string):Promise<any> {
    trace('addPlugin', name)
    const dest = path.resolve(path.join(outPath, projName))
    console.log(ac.bold(`plugin add ${name}`))
    return executeCommand('ns', ['plugin', 'add', name], dest, true)
}
async function addModule(name:string, isDev:boolean):Promise<any> {
    trace('addModule', name, isDev)
    const dest = path.resolve(path.join(outPath, projName))
    let flag = isDev ? '--save-dev ' : ''
    console.log(ac.bold(`npm install ${flag}${name}`))
    let args = ['install']
    if(isDev) args.push('--save-dev')
    args.push(name)
    return executeCommand('npm', args, dest, true)
}
function runCommand(cmd:string) {
    trace('runCommand', cmd)
    const dest = path.resolve(path.join(outPath, projName))
    console.log(ac.blue('executing "'+cmd+'"'))
    return executeCommand(cmd, [], dest, true)
}

function npmInstall() {
    trace('npmInstall')
    return Promise.resolve(); // not necessary.
    // console.log('performing npm install...')
    // return executeCommand('npm', ['install'])
}

function makeNativeScriptComponents() {
    trace('ready to makeNativeScriptComponents', projPath, jovePath)
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
    trace('migrate Scss', scssSource, scssDest)
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
    trace('importScss', dirPath)
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
    trace('unifyProjectId')
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

/**
 * Copy the boilerplate and generate the environment
 * for a Fastlane deployment
 *
 * TODO for this:
 *  - in MatchFile, the git url should be dynamically populated
 */
async function makeFastlane(syncVersion:string) {
    // first, read secrets from .dist.secrets
    const dsFile = path.join(projPath, '.dist.secrets');
    if(fs.existsSync(dsFile)) {
        dotenv.config({path: dsFile})
    } else {
        return false; // can't make fastlane without the secrets file
    }
    // read the release notes
    const rnFile = path.join(projPath, 'Release_Notes.md')
    let mdContent = ''
    try {
        mdContent = fs.readFileSync(rnFile).toString()
    } catch(e) {
        mdContent = ''
    }
    let b = mdContent.indexOf('# Release Notes')
    if(b !== -1) b = mdContent.indexOf('\n', b)
    let n = mdContent.indexOf('#', b)
    if (n === -1) n = mdContent.length;
    const releaseNotes = mdContent.substring(b, n).trim().replace(/"/g, '\\"').replace(/\n/g, '\\n')
    b = mdContent.indexOf('# Reviewer Notes', n)
    if(b !== -1) b = mdContent.indexOf('\n', b)
    n = mdContent.indexOf('#', b)
    if (n === -1) n = mdContent.length;
    let reviewNotes = mdContent.substring(b, n).trim()
    console.log(ac.blue.dim(reviewNotes))
    reviewNotes = reviewNotes.replace(/"/g, '\\"').replace(/\n/g, '\\n')

    const contactLine = process.env['CONTACT_INFO'] ?? ''
    let cparts = contactLine.split(' ')

    const cleanProjName = projName.replace(/[-_ .]/g, '')

    const prepub = await getPreviousPublishedVersion()
    let changeLog = await generateChangelog(prepub)
    console.log(ac.cyan.dim(changeLog))
    changeLog = changeLog.replace(/"/g, '\\"').replace(/\n/g, '\\n')
    // let changeLog = `Contact ${pkgInfo.author} for a changelog for this version`


    const flSrcDir = path.join(jovePath, 'tbFiles', 'fastlane')
    const flDest = path.join(nsRoot, 'fastlane')
    copySourceDirectory(flSrcDir, flDest, true)
    const envFile = path.join(flDest, '.env.default')
    const envData = `
MATCH_REPOSITORY=${process.env['MATCH_REPOSITORY']}    
FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD="${process.env['APPLE_DIST_CI_PASSWORD']}"
FASTLANE_ITC_TEAM_NAME="${process.env['APPLE_TEAM_NAME']}"
APP_BUNDLE_ID="${appId}"
APPLE_ID="${process.env['APPLE_ID']}"
APP_NAME="${process.env['APP_NAME'] || projName}"
XC_WORKSPACE_REL_PATH="./platforms/ios/${cleanProjName}.xcworkspace"
CONTACT_FIRST_NAME="${cparts[0] || ''}"
CONTACT_LAST_NAME="${cparts[1] || ''}"
CONTACT_EMAIL="${cparts[2] || ''}"
CONTACT_PHONE="${cparts[3] || ''}"
BETA_DESCRIPTION="${releaseNotes}"
REVIEW_NOTES="${reviewNotes}"    
CHANGELOG="${changeLog}"

KEY_STORE_FILE=${process.env['KEY_STORE_FILE']}
KEY_STORE_PASSWORD=${process.env['KEY_STORE_PASSWORD']}
KEY_STORE_ALIAS=${process.env['KEY_STORE_ALIAS']}
KEY_STORE_ALIAS_PASSWORD=${process.env['KEY_STORE_ALIAS_PASSWORD']}
PATH_TO_PLAY_STORE_UPLOADER_JSON_KEY=${process.env['PATH_TO_PLAY_STORE_UPLOADER_JSON_KEY']}

`
    console.log('-------------')
    console.log(envData)
    console.log('-------------')
    fs.writeFileSync(envFile, envData)

    console.log('--------------')
    console.log(`running fastlane for ${platform}`)
    console.log('--------------')

    // support isolating a lane, or doing both
    if(!platform || platform === 'ios' || platform === 'all') {
        await executeCommand('fastlane', ['ios', 'certificates'], nsRoot, true)
        await executeCommand('fastlane', ['ios', 'beta'], nsRoot, true)
    }
    if(!platform || platform === 'android' || platform === 'all') {
        await executeCommand('fastlane', ['android', 'build'], nsRoot, true)
        await executeCommand('fastlane', ['android', 'alpha'], nsRoot, true)
    }

}

// previous version
// We use this for changelog references
async function getPreviousPublishedVersion() {
    const ret = await executeCommand('fastlane', ['pilot', 'builds'], nsRoot, true)
    if(!ret.retcode) {
        const lines = ret.stdStr.split('\n')
        let ready = false
        for(let ln of lines) {
            ln = ln.trim()
            if(ln.charAt(0) === '|') {
                if(ready) {
                    ln = ln.substring(1, ln.length-1)
                    const vbi = ln.split('|')
                    const version = (vbi[0] ?? '').trim()
                    const build = (vbi[1] ?? '').trim()
                    // const installs = (vbi[2] ?? '').trim()
                    let ver = version
                    if(build && build !== version) ver += '-pre-release-'+build
                    return ver
                }
                if(ln.indexOf('Version #') !== -1) ready=true
            }
        }
    }
    return ''
}

/**
 * Bump version to next increment of build, patch, minor, or major
 * @param version - existing version string
 * @param type - one of 'build', 'patch', 'minor', or 'major'  default is 'build'
 */
function versionBump(version:string, type= 'build') {
    trace(`bumping version ${version} by ${type} number`)
    let n = version.lastIndexOf('-')
    let build = 0
    if(n !== -1) {
        build = Number(version.substring(n+1))
        n = version.indexOf('-')
        if(n !== -1) {
            version = version.substring(0, n)
        }
    }
    const parts = version.split('.')
    let major = Number(parts[0] ?? 0)
    let minor = Number(parts[1] ?? 0)
    let patch = Number(parts[2] ?? 0)
    if(type === 'major') {
        major++
        minor = 0
        patch = 0
        build = 0
    }
    if(type === 'minor') {
        minor++
        patch = 0
        build = 0
    }
    if(type === 'patch') {
        patch++
        build = 0
    }
    if(type === 'build') build++

    if(type === 'mark') {
        build = 0 // just remove the pre-release stuff
    }
    let pre = ''
    if(build) pre = `-pre-release-${build}`
    const newVer = `${major}.${minor}.${patch}${pre}`
    trace('new version: '+newVer)
    return newVer
}

/**
 * In order to bridge the semantics of a semantic version
 * and the 3-dot + build sensibility of the app store, we need
 * to make any pre-release versions a later build of the former patch.
 *
 * revision 9999 will be used to designate "just before the minor/major update"
 *
 * Effectively this means that a 0.1.1-pre-release.1
 * will be built as 0.1.0
 * and 0.1.1-pre-release.n will be  built as 0.1.0 build next
 * and a 0.2.0-pre-release.1 will be built as 0.1.9999
 * and 0.2.0-pre-release.n will be  built as 0.1.9999 build next
 *
 * A major shift to 2.0.0-pre-release.1 would build as 1.0.9999 and onward
 *
 * @param version
 */
function makeSyncVersion(version:string) {
    let n = version.lastIndexOf('-')
    if(n === -1) {
        // this is a mark version, so our sync version is the same
        return version
    }

    n = version.indexOf('-')
    if(n === -1) n = version.length
    const rootVersion = version.substring(0, n)
    const parts = rootVersion.split('.')
    let major = Number(parts[0] ?? 0)
    let minor = Number(parts[1] ?? 0)
    let patch = Number(parts[2] ?? 0)
    if (patch) patch--
    else if (minor) {
        patch = 9999
        minor--
    }
    else if (major) {
        patch = 9999
        major--
    }

    return `${major}.${minor}.${patch}`  // return the previous semantic version
}

// generate changelog since previous version tag
async function generateChangelog(sinceTag:string) {
    if(!sinceTag) sinceTag = '--since=10.years'
    const ret = await executeCommand('git', ['log', '--pretty="- %s"', sinceTag+'..HEAD'], projPath)
    let log = ''
    if(!ret.retcode) log = ret.stdStr;
    return log
}

// Write version to package.json, commit, tag, and push to master
async function releaseToMain(version:string) {
    const branchName = await getBranchName()
    // console.log('committing and tagging version ',version, 'to main branch, from branch ', branchName)
    console.log('verbosity is', verbose)
    pkgInfo.version = version; // update the version
    fs.writeFileSync(path.join(projPath, 'package.json'), JSON.stringify(pkgInfo, null, 2))
    let ret = await executeCommand('git', ['commit', '-am', `"preparing for release version ${version}"`], projPath, verbose)
    if(ret.retcode) {
        // we can expect this error
        if(ret.stdStr.indexOf('nothing to commit, working tree clean') === -1) {
            console.error(ac.bold.red(`Error (${ret.retcode}) committing project - ` + ret.errStr), '\n', ac.black(ret.stdStr))
            return false
        }
    }
    ret = await executeCommand('git', ['checkout', 'main'], projPath, verbose)
    if(ret.retcode) {
        console.error(ac.bold.red('Error checking out main branch- '+ ret.errStr))
        return false
    }
    ret = await executeCommand('git', ['merge', branchName], projPath, verbose)
    if(ret.retcode) {
        console.error(ac.bold.red('Error merging - '+ ret.errStr))
        return false
    }
    ret = await executeCommand('git', ['commit', '-m', `"merged from branch ${branchName} for version ${version} release"`], projPath, verbose)
    if(ret.retcode) {
        // we can expect this error
        if(ret.stdStr.indexOf('nothing to commit, working tree clean') === -1) {
            console.error(ac.bold.red('Error committing merge - ' + ret.errStr))
            return false
        }
    }
    ret = await executeCommand('git', ['tag', '-f', version], projPath, verbose)
    if(ret.retcode) {
        console.error(ac.bold.red('Error tagging - '+ ret.errStr))
        return false
    }
    ret = await executeCommand('git', ['push', '-u'], projPath, verbose)
    if(ret.retcode) {
        console.error(ac.bold.red('Error pushing - '+ ret.errStr))
        return false
    }
    ret = await executeCommand('git', ['checkout', branchName], projPath, verbose)
    if(ret.retcode) {
        console.error(ac.bold.red('Error returning to branch - '+ ret.errStr))
        return false
    }
    ret = await executeCommand('git', ['merge', 'main'], projPath, verbose)
    if(ret.retcode) {
        console.error(ac.bold.red('Error remerging with main - '+ ret.errStr))
        return false
    }
    ret = await executeCommand('git', ['tag', '-l'], projPath, verbose)
    if(ret.retcode) {
        console.error(ac.bold.red('Error retrieving tag list - '+ ret.errStr))
        return false
    }
    const lines = ret.stdStr.split('\n')
    for(let i=0; i<lines.length; i++) {
        let ln = lines[i].trim()
        if (!i) console.log(ac.bold.green(ln))
        else    console.log(ac.italic.black(ln))
    }
    return true
}

/**
 * get the current branch we are working under in the project
 */
async function getBranchName() {
    const ret = await executeCommand('git', ['branch'], projPath)
    if(ret.retcode) {
        console.error(ac.bold.red('Error getting branch - '+ ret.errStr))
        return ''
    }
    let branch = ''
    const lines = ret.stdStr.split('\n')
    for(let ln of lines) {
        ln = ln.trim()
        if(ln.charAt(0) === '*') {
            branch = ln.substring(1).trim()
        }
    }
    return branch
}

let firstTrace = 0
function trace(message:string, ...args:any) {
    let now = Date.now()
    if(!firstTrace) firstTrace = now
    let time = firstTrace - now
    if(verbose) console.log(ac.blue(time+' ms ')+ac.gray(message), ...args)
}