
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
        // write out data as package.json
        fs.writeFileSync('package.json', JSON.stringify(pkgJson, null, 2))

        // copy icons and other resources
        prepareIcons()
        copyAdditional()
        copyCertificates(pkgJson)

        // execute electron builder
        return makeDistribution().then(() => {
            try {
                // rename package.json dist-package.json
                fs.renameSync('package.json', 'dist-package.json')
                // rename app-package.json package.json
                fs.renameSync('app-package.json', 'package.json')
            } catch(e) {
                // @ts-ignore
                console.error(ac.bold.red('problem renaming package files'), e)
            }
            // now we can use fastlane to put to appstore
            runFastlane()
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

const macTargets = ['mas']

function appendBuildInfo(pkgJson:any):any {
    const build = {
        appId: pkgJson.projId,
        productName: pkgJson.displayName,
        copyright: pkgJson.copyright,
        electronVersion: electronVersion,
        mac: {
            "category": pkgJson.macOS.category ?? "public.app-category.developer-tools",
            "entitlements": "build/entitlements.mac.plist",
            "target": macTargets,
            ... pkgJson.macOS
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
        dmg: pkgJson.dmg,

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
    const mac = pkgJson.mac || {
        asarUnpack: [
            "**/*"
        ]
    }
    const win = pkgJson.win || {
        asarUnpack: [
            "**/*"
        ]
    }
    build.mac = Object.assign(mac, pkgJson.mac || {})
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
    let dmgBackground = path.join('launch-icons', 'dmgBackground.png')
    if(!fs.existsSync(commonIcon)) {
        convertToPng(splash, commonIcon)
    }
    if(fs.existsSync(commonIcon)) {
        console.log('preparing icon')
        fs.copyFileSync(commonIcon, path.join(buildDir, 'icon.png'))
    }
    if(fs.existsSync(dmgBackground)) {
        console.log('preparing dmg background')
        fs.copyFileSync(dmgBackground, path.join(buildDir, 'background.png'))
    }
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
    fs.copyFileSync(path.join(certfolder, 'Certificates.p12'), path.join(buildDir, 'Certificates.p12'))
    fs.copyFileSync(path.join(certfolder, `${pkgJson.projName}-entitlements.mac.plist`), path.join(buildDir, 'entitlements.mac.plist'))
    fs.copyFileSync(path.join(certfolder, `${pkgJson.projName}-entitlements.mas.plist`), path.join(buildDir, 'entitlements.mas.plist'))
    fs.copyFileSync(path.join(certfolder, `${pkgJson.projName.replace(/-/g, '')}MacOS.provisionprofile`), path.join(buildDir, 'embedded.provisionprofile'))
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
                    console.log(ac.green.dim(rt.stdStr))
                }
                if(rt.errStr) {
                    console.log(ac.red(rt.errStr))
                }
                if(rt.code) {
                    console.log(ac.bold.red('Electron Builder failed with code '+rt.code))
                } else {
                    console.log(ac.bold.green('Electron Builder reports success'))
                }
                resolve()
            }, 500)
        })

    })
}

function runFastlane() {
    console.log(ac.bold.green('Cool. Now get Fastlane going and send to app store'))
}