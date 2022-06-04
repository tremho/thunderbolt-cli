
import * as ac from "ansi-colors";
import fs from "fs";
import path from "path"
import {doBuild} from "./build";
import {executeCommand} from "./execCmd";

// import * as imageConversion from 'conversion_cargo';

const spinner = require('text-spinner')({
    interval: 100,
    prefix: '\x1B[10G'
})

export function doDist(args:string[]) {

    console.log(ac.bold.blue('Creating distributable installer...'))

    process.argv.push('--clean') // force a clean build first
    return doBuild().then(() => {

        // read package.json
        const pkgJson = readPackageJSON()
        // append build info
        appendBuildInfo(pkgJson)
        // rename package.json app-package.json
        fs.renameSync('package.json', 'app-package.json')
        // write out build appended data as package.json
        fs.writeFileSync('package.json', JSON.stringify(pkgJson, null, 2))

        // copy icons and other resources
        prepareIcons()
        copyAdditional()
        copyCertificates(pkgJson)

        // execute electron builder
        return makeDistribution().then((retcode) => {
            try {
                // rename package.json dist-package.json
                fs.renameSync('package.json', 'dist-package.json')
                // rename app-package.json package.json
                fs.renameSync('app-package.json', 'package.json')
            } catch(e) {
                // @ts-ignore
                console.error(ac.bold.red('problem renaming package files'), e)
            }
            if(!retcode) {
                // now we can use a transporter app to put to appstore
                transportApp()
            }
        })
    })
}

function readPackageJSON() {
    if(!fs.existsSync('package.json')) {
        console.error('NO package.json File!!')
        throw Error()
    }
    const str = fs.readFileSync('package.json').toString()
    return JSON.parse(str)
}

const electronVersion = "12.0.5"

const macTargets = [{
    target:"mas",
    arch:"universal"
}] // maybe we can specify others later

function appendBuildInfo(pkgJson:any):any {
    const build = {
        appId: pkgJson.projId,
        productName: pkgJson.displayName,
        copyright: pkgJson.copyright,
        electronVersion: electronVersion,
        // note that in former versions, we copied this from
        // pkgJSON.mac, so this is hardcoded for the MAS context
        mac: {
            "category": pkgJson.macOS?.category ?? "public.app-category.developer-tools",
            "hardenedRuntime": true,
            "gatekeeperAssess": false,
            "entitlements": "build/entitlements.mac.plist",
            "entitlementsInherit": "build/entitlements.mac.plist",
            "icon": "build/icon.png",
            "target": macTargets,
            asarUnpack: [
                "**/*"
            ]
        },
        mas: {
            "type": "distribution",
            "hardenedRuntime": false,
            "provisioningProfile": "embedded.provisionprofile",
            "entitlements": "build/entitlements.mas.plist",
            "entitlementsInherit": "build/entitlements.mas.inherit.plist",
            "entitlementsLoginHelper": "build/entitlements.mas.loginhelper.plist",
            // asarUnpack: [
            //     "**/*"
            // ]
        },
        directories: {
            output: "dist",
            buildResources: "build"
        },
        asar: true,
        win: {
          "target": "nsis",
          "asarUnpack": [
            "build/front/assets/**/*"
           ]
        },
        nsis: pkgJson.nsis,
        // dmg: pkgJson.dmg,

        files: [
            {
                filter: "package.json",
                from: ".",
                to: "."
            }
        ],
        extraMetadata: {
            main: "joveAppBack.js"
        }
    }
    const win = pkgJson.win || {
        asarUnpack: [
            "**/*"
        ]
    }
    // build.mac = Object.assign(mac, pkgJson.mac || {})
    build.win = Object.assign(win, pkgJson.win || {})
    const buildFiles = fs.readdirSync('build')
    for(let f of buildFiles) {
        if(f !== pkgJson.name && f !== pkgJson.name+".bat") {
            const st = fs.lstatSync(path.join('build', f))
            const entry = {filter: '', from:'', to: ''}
            if(st.isDirectory()) {
                entry.filter = '**/*'
                entry.from = "build/"+f
                entry.to = f
            } else {
                entry.filter = f
                entry.from = 'build'
                entry.to = '.'
            }
            build.files.push(entry)
        }
        build.files.push({
            filter: 'embedded.provisionprofile',
            from: 'build',
            to: '.'
        })
    }
    pkgJson.build = build
    const scripts = pkgJson.scripts || {}
    scripts.release = 'electron-builder'
    pkgJson.scripts = scripts
}

function prepareIcons() {
    const buildDir = path.resolve('build')
    let splash = path.join('launch-icons','splash.jpg')
    let commonIcon = path.join('launch-icons','icon.png')
    // let dmgBackground = path.join('launch-icons', 'dmgBackground.png')
    if(!fs.existsSync(commonIcon)) {
        convertToPng(splash, commonIcon)
    }
    if(fs.existsSync(commonIcon)) {
        console.log('preparing icon')
        fs.copyFileSync(commonIcon, path.join(buildDir, 'icon.png'))
    }
    // todo: enable this only if we are supporting dmg targets again
    // if(fs.existsSync(dmgBackground)) {
    //     console.log('preparing dmg background')
    //     fs.copyFileSync(dmgBackground, path.join(buildDir, 'background.png'))
    // }
}
function copyAdditional() {
    const buildDir = path.resolve('build')
    const extras = path.resolve('additional dist resources')
    if(fs.existsSync(extras)) {
        console.log('copying additional resources')
        const fileList = fs.readdirSync(extras)
        for(let f of fileList) {
            fs.copyFileSync(path.join(extras, f), path.join(buildDir, f))
        }
    }
}

function copyCertificates(pkgJson:any) {
    const buildDir = path.resolve('build')
    const certfolder = pkgJson.certificateFolder
    if(!certfolder) {
        console.error(ac.bold.red('\npackage.json must define a certificatesfolder property'))
        console.error(ac.gray('this absolute system path contains the Certificates.p12 and the named entitlements and provision files'))
        throw Error('no cert folder')
    }
    fs.copyFileSync(path.join(certfolder, 'Certificates.p12'), path.join(buildDir, 'Certificates.p12'))
    fs.copyFileSync(path.join(certfolder, `${pkgJson.name}.entitlements.mac.plist`), path.join(buildDir, 'entitlements.mac.plist'))
    fs.copyFileSync(path.join(certfolder, `${pkgJson.name}.entitlements.mas.plist`), path.join(buildDir, 'entitlements.mas.plist'))
    fs.copyFileSync(path.join(certfolder, `entitlements.mas.inherit.plist`), path.join(buildDir, 'entitlements.mas.inherit.plist'))
    fs.copyFileSync(path.join(certfolder, `entitlements.mas.loginhelper.plist`), path.join(buildDir, 'entitlements.mas.loginhelper.plist'))
    fs.copyFileSync(path.join(certfolder, `${pkgJson.name.replace(/-/g, '')}MacOS.provisionprofile`), path.join(buildDir, 'embedded.provisionprofile'))
    fs.copyFileSync(path.join(certfolder, `${pkgJson.name.replace(/-/g, '')}MacOS.provisionprofile`), 'embedded.provisionprofile') // also put at root, because I'm confused which is used now
}

function convertToPng(imagePath:string, pngOutPath:string) {
    // TODO: still need to find a decent utility for this
    // read image and convert it to PNG, ideally converting background (pixel 0,0) to transparency
    // imageConversion.compressAccurately(imagePath, {
    //
    // })
}

function makeDistribution() {
    return new Promise((resolve:any) => {
        spinner.start()
        executeCommand('npm run release',[]).then((rt:any)=> {
            setTimeout(() => {
                spinner.stop()
                if(rt.stdStr) {
                    if(rt.retcode) {
                        console.log(ac.red(rt.stdStr))
                    } else {
                        console.log(ac.green.dim(rt.stdStr))
                    }
                }
                if(rt.errStr) {
                    console.log(ac.red(rt.errStr))
                }
                if(rt.retcode) {
                    console.log(ac.bold.red('Electron Builder failed with code '+rt.retcode))
                } else {
                    console.log(ac.bold.green('Electron Builder reports success'))
                }
                resolve(rt.retcode)
            }, 500)
        })

    })
}

function transportApp() {
    console.log(ac.bold.green('Cool!\nNow get Transport going and send to app store!'))
}