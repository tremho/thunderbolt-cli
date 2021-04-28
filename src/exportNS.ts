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
    tbxPath = path.resolve(info.packPath, '..', 'tbx')
}


export function doNativeScript() {
    console.log('Exporting to a mobile project under Nativescript...')
    collectInfo()
    readProjPackage()
    createNSProjectIfNotExist().then(() => {
        copySources()
        migrateAppBack()
        makeNativeScriptComponents()
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
    console.log('reading package.json at '+pkgjson)
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
    // find "thunderbolt-framework" in either an import or require line
    let lines = source.split('\n')
    for(let i=0; i<lines.length; i++) {
        const ln = lines[i]
        let n = ln.indexOf('thunderbolt-framework')
        if(n !== -1) {
            if(ln.indexOf('import') !== -1 || ln.indexOf('require') !== -1) {
                // change to "thunderbolt-framework/mobile"
                lines[i] = ln.replace('thunderbolt-framework', 'thunderbolt-framework/mobile')
            }
        }
    }
    // write to dest
    source = lines.join('\n')
    let dest = path.join(outPath, projName, 'app', 'tbAppBack.ts')
    try {
        if(testForUpdate(source, dest)) {
            console.log('migrating ', source)
            if (fs.existsSync(dest)) {
                fs.unlinkSync(dest)
            }
            fs.writeFileSync(dest, source)
        }
    } catch(e) {
        console.error('Unable to write '+dest)
        throw e
    }
    console.log('... okay')
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
