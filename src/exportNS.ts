import * as fs from 'fs-extra'
import * as path from 'path'
// import * as os from 'os'
import {executeCommand} from "./execCmd";
import {gatherInfo} from "./gatherInfo";
import * as componentReader from './tbFiles/ComponentReader'
import * as pageReader from "./tbFiles/PageReader";

// let tnsPath
let nsRoot:string

/*
TODO: Change argument passing
- take a --outPath argument that declares the container for the exported folder.  Default is (projPath)/../nativescript
- get the gatherInfo values
- include appid in package.json so we can use it here. Default to thunderbolt.ns.(name)

- use doctor for any advisories
- check for identifing files
- we'll do a tns create --ts --appid (appid) --template <our template> --path (outPath)

 */

let outPath:string, appId:string, projName:string, projPath:string, pkgInfo:any, tbxPath:string

function readCommandOptions() {
    const opts = process.argv.slice(3)
    let i = 0
    while(i < opts.length) {
        const opt = opts[i].toLowerCase()
        if(opt === '--outpath') {
            outPath = opts[++i]
        }
        if(opt === '--appid') {
            appId = opts[++i]
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
        appId = info.projId || `thunderbolt.ns.${info.projName}`
    }
    projName = info.projName
    projPath = info.projPath
    tbxPath = path.resolve(info.packPath, '..', '..', 'thunderbolt-cli','src')
}


export function doNativeScript() {
    console.log('Exporting to a mobile project under Nativescript...')
    collectInfo()
    readProjPackage()
    createNSProjectIfNotExist().then(() => {
        copySources()
        migrateAppBack()
        makeNativeScriptComponents()
        migrateScss()
        migrateLaunch()
        npmInstall().then(() => {
            console.log('Project '+ projName+' exported to Nativescript project at '+path.join(outPath, projName))
        })
    })
}

function tns(...args:any) {
    return executeCommand('tns', args, nsRoot)
}

function createNSProjectIfNotExist() {
    nsRoot = path.join(outPath, projName)

    if(!fs.existsSync(nsRoot)) {
        fs.mkdirSync(nsRoot, {recursive: true})
    }
    console.log('checking for Nativescript...')

    return tns('doctor').then(whatever => {
        console.log('doctor command returns', whatever)

        console.log('creating ', projName)

        return tns(`create ${projName} --appid ${appId} --template /Users/sohmert/tbd/tbns-template --path ${outPath}`).then(ret => {
            console.log(ret)
        })
    })
}

function readProjPackage() {
    let pkgjson = path.join(projPath, 'package.json')
    // console.log('reading package.json at '+pkgjson)
    try {
        const contents = fs.readFileSync(pkgjson).toString()
        pkgInfo = JSON.parse(contents)
    } catch(e) {
        throw e //Error(`No "package.json" file found for project "${projName}"`)
    }

}

function migrateAppBack() {
    // read our tbAppBack source
    const tbAppSrcPath = pkgInfo.backMain || 'src/tbAppBack.ts'
    // console.log('migrating '+ tbAppSrcPath+'...')
    let source = ""
    try {
        source = fs.readFileSync(path.join(projPath, tbAppSrcPath)).toString()
    } catch(e) {
        throw Error('Unable to read app file "'+tbAppSrcPath+'"')
    }
    // find "thunderbolt-desktop" in either an import or require line
    let lines = source.split('\n')
    for(let i=0; i<lines.length; i++) {
        const ln = lines[i]
        let n = ln.indexOf('thunderbolt-desktop')
        if(n !== -1) {
            // console.log('found "thunderbolt-desktop"')
            if(ln.indexOf('import') !== -1 || ln.indexOf('require') !== -1) {
                // change to "thunderbolt-mobile"
                // console.log('changing to "mobile"')
                lines[i] = ln.replace('thunderbolt-desktop','thunderbolt-mobile')
                console.log(lines[i])
            }
        }
    }
    // write to dest
    source = lines.join('\n')
    let dest = path.join(outPath, projName, 'app', 'tbAppBack.ts')
    try {
        if (fs.existsSync(dest)) {
            fs.unlinkSync(dest)
        }
        // console.log('migrating ', source)
        fs.writeFileSync(dest, source)

    } catch(e) {
        console.error('Unable to write '+dest)
        throw e
    }
    // console.log('... okay')
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
        console.log('copying ', src, dest)
        let destdir = dest.substring(0, dest.lastIndexOf(path.sep))
        if(!fs.existsSync(destdir)) {
            fs.mkdirSync(destdir, {recursive: true})
        }
        fs.copyFileSync(src, dest)
    } else {
        console.log('skipping ', src)
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
    let srcPath = path.join(tbxPath, 'nslaunch')
    if(!fs.existsSync(srcPath)) {
        console.error('CLI launch file templates not available -- check installation', srcPath)
        throw Error
    }
    copySourceFile(path.join(srcPath, 'main.ts.src'), path.join(destPath, 'main.ts'))
    copySourceFile(path.join(srcPath, 'main.xml.src'), path.join(destPath, 'main.xml'))
}

function npmInstall() {
    console.log('performing npm install...')
    return executeCommand('npm', ['install'])
}

function makeNativeScriptComponents() {
    console.log('ready to makeNativeScriptComponents', projPath, tbxPath)
    const componentsDir = path.join(projPath, 'src', 'components')
    let dest = path.join(outPath, projName, 'app', 'components')

    componentReader.enumerateAndConvert(componentsDir, 'nativescript', dest)

    const pageDir = path.join(projPath, 'src', 'pages')
    dest = path.join(outPath, projName, 'app', 'pages')
    pageReader.enumerateAndConvert(pageDir, 'nativescript', dest)
}

function migrateScss() {
    // translate from mobile-qualified scss files to the app/scss directory
    // collect the imports into app.scss and write to app/app.scss
    const scssSource = path.join(projPath, 'src', 'scss')
    const scssDest = path.join(outPath, projName, 'app', 'scss')
    const appScss = path.join(outPath, projName, 'app', 'app.scss')
    const imports:string[] = []
    console.log('migrate Scss', scssSource, scssDest)
    importScss(scssSource, imports)
    importScss(path.join(outPath, projName, 'app', 'components'), imports)
    const common = `
    // Common theme variables defined by thunderbolt     
    $normal-font:    Helvetica, sans-serif;
    $primary-color: #333;
    `
    const commonScss = path.join(outPath, projName, 'tb-vars.scss')
    fs.writeFileSync(commonScss, common)

    const theme1 = `
        @import "../tb-vars";    

        @import '@nativescript/theme/css/core.css';
        @import '@nativescript/theme/css/default.css';
    
    `
    const theme2 = `
    
    Page {
      font-size: 12; // = 1 em 
      font: $normal-font;
      color: $primary-color;
    }
    .Label {
      font-weight: bold;
    }
    
    `

    const theme = theme1 + '    '+imports.join('\n        ') + theme2
    fs.writeFileSync(appScss, theme)

}
function isMobilePrefix(pfx:string):boolean {
    return (pfx === 'mobile'
        || pfx === 'ios'
        || pfx === 'android')
}

function importScss(dirPath:string, imports:string[]) {
    console.log('importScss', dirPath)
    const files = fs.readdirSync(dirPath) || []
    for(let i=0; i<files.length; i++) {
        const file = files[i]
        const fstat = fs.lstatSync(path.join(dirPath, file))
        if(fstat.isDirectory()) {
            importScss(path.join(dirPath, file), imports)
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
                }
            }
        }
    }
}
