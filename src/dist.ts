
import * as ac from "ansi-colors";
import fs from "fs";
import path from "path"
import {doBuild} from "./build";
import {executeCommand} from "./execCmd";
import {getReleaseNotes} from "./releaseNotes";

const dotenv = require('dotenv')


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
        copyCertificates(pkgJson)
        prepareIcons()
        return packageAndDistribute(pkgJson).then((retcode) => {
            if(!retcode) {
                console.log(ac.green.bold('packaging complete'))
                // now we can use a transporter app to put to appstore
                return transportApp().then((retcode) => {
                    if(!retcode) {
                        console.log(ac.green.bold('distribution complete'))
                    }
                })
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

function prepareIcons() {
    const buildDir = path.resolve('build')
    let splash = path.join('launch-icons','splash.jpg')
    let commonIcon = path.join('launch-icons','icon.png')
    let dmgBackground = path.join('launch-icons', 'dmgBackground.png')
    if(!fs.existsSync(commonIcon)) {
        convertToPng(splash, commonIcon)
    }
    if(fs.existsSync(commonIcon)) {
        console.log(ac.italic.red.dim('preparing icon'))
        fs.copyFileSync(commonIcon, path.join(buildDir, 'icon.png'))
    }
    if(fs.existsSync(dmgBackground)) {
        console.log(ac.italic.red.dim('preparing dmg background'))
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
    console.log(ac.italic.red.dim('preparing certificates'))
    if(process.platform === 'win32') {
        console.log(ac.italic.blue.bold('not applying certficates to Windows dist package'))
        return
    }
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
    fs.copyFileSync(path.join(certfolder, `${pkgJson.name.replace(/-/g, '')}-macos-distribution.provisionprofile`), path.join(buildDir, 'embedded.provisionprofile'))
}

function convertToPng(imagePath:string, pngOutPath:string) {
    // TODO: still need to find a decent utility for this
    // read image and convert it to PNG, ideally converting background (pixel 0,0) to transparency
    // imageConversion.compressAccurately(imagePath, {
    //
    // })
}


// see makeSyncVersion in nativescript dist
function backVersion(version:string) {
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
    else if (minor) minor--
    else if (major) major--

    return `${major}.${minor}.${patch}`  // return the previous semantic version
}

async function packageAndDistribute(pkgJson:any):Promise<number> {
    const buildDir = path.resolve('build')
    console.log(ac.italic.red.dim('creating packages'))

    try {
        const outPath = path.join(buildDir, 'package.json');
        const buildPkg = {
            name: pkgJson.name,
            version: backVersion(pkgJson.version),
            description: pkgJson.description,
            scripts: {
                start: "electron .",
                test: "echo \"Error: no test specified\" && exit 1",
                pack: "electron-builder --dir",
                dist: "electron-builder"
            },
            author: "tremho",
            dependencies: {
                ...pkgJson.dependencies
            },
            devDependencies: {
                ...pkgJson.devDependencies,
                "electron": "^19.0.4",
                "electron-builder": "^24.0.0-alpha.13"
            },
            build: {
                appId: pkgJson.projId,
                productName: pkgJson.displayName,
                copyright: pkgJson.copyright,
                electronVersion: electronVersion,

                mac: {
                    category: pkgJson.macOS?.category ?? "public.app-category.developer-tools",
                    target: ["pkg", "dmg", "mas"],
                    "hardenedRuntime": true,
                    "gatekeeperAssess": false,
                    "icon": "icon.png",
                    "asarUnpack": ["**/*"]
                },
                mas: {
                    type: "distribution",
                    hardenedRuntime: false,
                    provisioningProfile: "embedded.provisionprofile",
                    entitlements: "entitlements.mas.plist",
                    entitlementsInherit: "entitlements.mas.inherit.plist",
                    entitlementsLoginHelper: "entitlements.mas.loginhelper.plist",
                    publish: null
                },
                dmg: {
                    background: "background.png"
                },
                files: [
                    {
                        "filter": "package.json",
                        "from": ".",
                        "to": "."
                    },
                    {
                        "filter": "front/**/*",
                        "from": ".",
                        "to": "."
                    },
                    {
                        "filter": "joveAppBack.js",
                        "from": ".",
                        "to": "."
                    },
                    {
                        "filter": "BuildEnvironment.json",
                        "from": ".",
                        "to": "."
                    }
                ],
                extraMetadata: {
                    main: "joveAppBack.js"
                }
            }
        }
        const contents = JSON.stringify(buildPkg, null, 2)
        fs.writeFileSync(outPath, contents)
    } catch(e) {
        console.error(ac.red.bold('Error setting up for dist'), e)
        return -1
    }
    return executeCommand('npm', ['install'], buildDir, false).then(rt => {
        if(rt.retcode) {
            console.error(ac.red.bold('Error installing dependencies'), rt.errStr)
        } else {
            // nuke electron dist in jove desktop
            try {
                console.log(ac.red.dim('installing node packages for dist...'))
                const edistPath = path.join(buildDir, 'node_modules', '@tremho', 'jove-desktop', 'node_modules', 'electron', 'dist')
                if(fs.existsSync(edistPath)) {
                    fs.rmSync(edistPath, {recursive: true})
                }
                // const bpPath = path.join(buildDir, 'node_modules', '@tremho', 'jove-desktop', 'buildPack')
                // const filelist = fs.readdirSync(bpPath)
                // console.log(ac.red.dim('positioning binding files...'))
                // for(let f of filelist) {
                //     if (f !== 'package.json') {
                //         const spf = path.join(bpPath, f)
                //         const dpf = path.join(buildDir, f)
                //         fs.copyFileSync(spf, dpf)
                //     }
                // }
            } catch(e) {
                console.error(ac.cyan('node install did not create electron dist to remove'), e)
                return -2
            }
            console.log(ac.red.dim('creating distribution packages'))
            return executeCommand('npm', ['run', 'dist'], buildDir, true).then(rt => {
                if(rt.retcode) {
                    console.error(ac.red.bold('Error executing packaging'), rt.errStr)
                    return rt.retcode
                }
            })
        }
        return rt.retcode
    })
    // <<<<<<<<<<<<<<<<<<<<<<<<<<<<

}

async function transportApp() {

    const projPath = path.resolve('.')

    console.log("TransportApp working from projPath=", projPath)

    const pkgPath = path.join(projPath, 'package.json')
    const pkgJson = fs.readFileSync(pkgPath).toString()
    const pkgInfo = JSON.parse(pkgJson)
    const {projName, displayName, version} = pkgInfo
    const backVer = backVersion(version)
    const distDir = path.join(projPath, 'build', 'dist')

    // create a fastlane directory and create a FastFile with our actions
    const fastlane = path.join(distDir, 'fastlane')
    if(!fs.existsSync(fastlane)) {
        fs.mkdirSync(fastlane)
    }
    const fastFile = path.join(fastlane, 'FastFile')

    if(process.platform === 'win32') {
        console.log(ac.blue.bold('Not creating fastFile for Windows'))
        return 0
    }

    fs.writeFileSync(fastFile, `
default_platform(:mac)

platform :mac do
  desc "copy to GitHub Releases"
  lane :github do
    set_github_release(
      repository_name: ENV["GITHUB_RELEASE_REPO"],
      api_token: ENV["GITHUB_TOKEN"],
      name: ENV["GITHUB_MAC_RELEASE_NAME"],
      tag_name: ENV["VERSION_TAG"],
      description: ENV["RELEASE_DESCRIPTION"],
      commitish: "main",
      upload_assets: [ENV["LATEST_DMG"]]
    )
  end
end    
    `)

    // set up the environment
    // first, read secrets from .dist.secrets
    const dsFile = path.join(projPath, '.dist.secrets');
    if(fs.existsSync(dsFile)) {
        dotenv.config({path: dsFile})
    } else {
        console.error('No secrets!')
        return false; // can't make fastlane without the secrets file
    }
    // read the release notes
    const rnFile = path.join(projPath, 'Release_Notes.md')
    const releaseNotes = getReleaseNotes(rnFile)
    const fmtNotes = `
# Release Notes
-------------
#### ${projName} v${version} (MacOS)

${releaseNotes.common}

--------------

${releaseNotes.desktop}

--------------
### Coming Soon:
${releaseNotes.comingSoon}
`
    console.log(ac.blue.dim(fmtNotes))

    const env = {
        GITHUB_RELEASE_REPO: process.env.GITHUB_RELEASE_REPO || 'use package.json',
        GITHUB_TOKEN:process.env.GITHUB_TOKEN,
        GITHUB_MAC_RELEASE_NAME: `MacOS ${displayName} v${version}`,
        VERSION_TAG: `v${version}`,
        RELEASE_DESCRIPTION: fmtNotes,
        LATEST_DMG:`${distDir}/${displayName}-${backVer}.dmg`
    }
    return executeCommand('fastlane', ['mac', 'github'], distDir, true, env).then(rt => {

        console.log('returns retcode', rt.retcode)
        return rt.retcode
    })

}

