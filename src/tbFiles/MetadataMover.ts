/*
Move the metadata to the destination target
Things like version, name, etc.

from items found in package.json

# These go into BuildEnvironment and into the runtime representation that way
  "name": "sm-dow",     #project internal name, executable name source
  "version": "0.1.0-pre-release.3",   # will become transmogrified for Android version code and version ids Android/iOS
  "projId": "com.stormmason.dow",  # appID, bundle identifier
  "displayName": "Dragons of Winter",
  "description": "the heroic tale of Sir Minimus\n\nA Bill Hennes original animated story",

# new info:
    "copyright": "©2021 Tremho Berserker Development, LLC",
    "shortDisplayName": "Drgns of Wntr" # App Icon label (on ios change spaces to &#x2007;) CFBundleDisplayName / android if display name is very long

# unique for iOS/build.xcconfig
    "ios" : {
         "teamId": "..."  # becomes DEVELOPMENT_TEAM = NHB2D83788;
         "provisioning": "..." # becomes PROVISIONING_PROFILE = com.wanwandog.wanwan;
         "codeSignFor": "distribution" # becomes CODE_SIGN_IDENTITY = iPhone Distribution
    }
# unique for macos dist build -> moves to build.mac for dist
    "macos": {
      "category": "public.app-category.games",
      "target": "dmg",
      "type": "development"
    },
# for android
    "android" : {
        minSdkVersion: null
        targetSdkVersion: null
    }

# projId should be used as appID in "build" section for publish builder, and copyright should go there too
*/
//   "build": {
//     "appId": "com.tremho.tbtest",
//     "copyright": "©2021 Tremho Berserker Development, LLC",
//     "electronVersion": "12.0.5",
//     "mac": {
//       "category": "public.app-category.games",
//       "target": "dmg",
//       "type": "development"
//     },
//     "directories": {
//       "output": "dist",
//       "buildResources": "build"
//     },
//     "asar": true,
//     "win": {
//       "target": "nsis",
//       "asarUnpack": [
//         "build/front/assets/**/*"
// ]
// },
// "files": [
//     {
//         "filter": "joveAppBack.js",
//         "from": "build",
//         "to": "."
//     },
//     {
//         "filter": "package.json",
//         "from": ".",
//         "to": "."
//     },
//     {
//         "filter": "**/*",
//         "from": "build/datapump",
//         "to": "datapump"
//     },
//     {
//         "filter": "**/*",
//         "from": "build/front",
//         "to": "front"
//     },
//     {
//         "filter": "**/*",
//         "from": "node_modules",
//         "to": "node_modules"
//     }
// ],
//     "extraMetadata": {
//     "main": "joveAppBack.js"
// }
// }

/*
So what we want to do here
jove nativescript -- move all the metadata to NS targets when we export NS
jove publish -- (new) copy all to publish staging folder with build section added to package.json
               and execute equivalent of     "dist": "jove build --clean && electron-builder",

also: on publish run IconPrepElectron to make icon for that side of things.

*/

import * as path from 'path'
import * as fs from 'fs'
import * as ac from 'ansi-colors'

export function metaMigrateNS(outPath:string) {
    console.log(ac.dim.italic('metaMigrateNS...'))
    const pkgJson = readPackageJSON()
    let {version, displayName, shortDisplayName, projId, android} = pkgJson

    let {minSDK, targetSDK, compileSDK} = (android || {})

    // make version transmogrifications
    if(!version) version = '0.0.1-pre-release.1'
    if(!shortDisplayName) shortDisplayName = shortFromDisplay(displayName)
    if(!displayName) displayName = shortDisplayName
    if(!projId) projId = 'org.jove.'+pkgJson.name

    let n = version.lastIndexOf('-')
    if(n !== -1 && isFinite(Number(version.substring(n+1)))) {
        version = version.substring(0, n)+'.'+version.substring(n+1) // replace - with . for rest of this to work
    }

    let prc = 0 // pre-release
    let vparts:string[] = version.split('.') //'1.2.3-pre-release.x' => [1,2,3-pre-release, x]
    if(vparts.length > 2) {
        let s = vparts[2]
        if(s.indexOf('-') !== -1) {
            let prs = s.substring(s.indexOf('-') + 1)
            vparts[2] = s.substring(0, s.indexOf('-'))
            prs = prs.substring(0, prs.lastIndexOf('.'))
            switch(prs) {
                case 'alpha':
                    prc = 1
                    break
                case 'beta':
                    prc = 2
                    break
                case 'delta':
                    prc = 3
                    break
                case 'gamma':
                    prc = 4
                    break
                default:
                    prc = 0 // pre-release
                    break
            }
        } else {
            prc = 9 // release
        }
    }
    version = vparts.join('.')

    let maj = vparts[0] || 0
    let min = vparts[1] || 0
    let rev = vparts[2] || 0
    let build = vparts[3] || 0
    // console.log('maj,min,rev, build = ', maj, min, rev, build)
    // @ts-ignore
    let avc = maj * 1000000000000 + min * 1000000000 + rev * 1000000 + prc * 1000 + build % 1000

    // console.log('avc = ', avc)

    // update the plist items
    updatePListItems(outPath, version, displayName, shortDisplayName)
    // update settings.json and res/values/strings.xml (can we make this titles.xml?) and AndroidManifest.ml
    updateAndroidMeta(outPath, version, avc, projId, displayName, shortDisplayName, minSDK, targetSDK, compileSDK)

    // write build.xcconfig if we have data for it and there is an ios platform
    makeXCBuildSettings(outPath, pkgJson.ios)

}

function readPackageJSON() {
    if(!fs.existsSync('package.json')) {
        console.error('NO package.json File!!')
        throw Error()
    }
    const str = fs.readFileSync('package.json').toString()
    return JSON.parse(str)
}

function updatePListItems(outPath:string, version:string, displayName:string, shortName?:string) {
    if(!shortName) shortName = shortFromDisplay(displayName)


    // common function to replace a string value in the plist
    const replaceSpot = (plist:string, keySpot:number, value:string):string => {
        if(keySpot !== -1) {
            const rspot = plist.indexOf('\n', keySpot) +1
            const bspot = plist.indexOf('\n', rspot)
            const front = plist.substring(0, rspot)
            const back = plist.substring(bspot)
            const insert = `    <string>${value}</string>`
            return front+insert+back
        }
        return plist
    }

    // read the plist contents
    try {
        const plistPath = path.join(outPath, 'App_Resources', 'iOS', 'info.plist')
        let plist = fs.readFileSync(plistPath).toString()
        let keySpot = plist.indexOf('<key>CFBundleDisplayName</key>')
        plist = replaceSpot(plist, keySpot, shortName)
        // CFBundleName comes from NS project; leave as is
        keySpot = plist.indexOf('<key>CFBundleShortVersionString</key>')
        plist = replaceSpot(plist, keySpot, version)
        console.log(ac.green.italic(`plist CFBundleShortVersionString -> ${version}`))
        keySpot = plist.indexOf('<key>CFBundleVersion</key>')
        plist = replaceSpot(plist, keySpot, version)
        console.log(ac.green.italic(`plist CFBundleVersion -> ${version}`))
        fs.writeFileSync(plistPath, plist)
    } catch(e) {
        // @ts-ignore
        console.error('Error: unable to update plist', e)
    }

}

function updateAndroidMeta(outPath:string, version:string, avc:number, appId:string, displayName:string, shortName?:string, minSDK?:string, targetSDK?:string, compileSDK?:string) {
    if(!shortName) shortName = shortFromDisplay(displayName)

    let error = false

    // update values in AndroidManifest.xml
    try {
        const xmlPath = path.join(outPath, 'App_Resources', 'Android', 'src', 'main', 'AndroidManifest.xml')
        let xmlData = fs.readFileSync(xmlPath).toString()
        let spot = xmlData.indexOf('android:versionCode')
        if(spot !== -1) {
            let endspot = xmlData.indexOf('>', spot)
            let front = xmlData.substring(0, spot)
            let back = xmlData.substring(endspot)
            let insert = `android:versionCode="${avc}"\n    android:versionName="${version}"`
            console.log(ac.green.italic(insert))
            xmlData = front+insert+back
        }
        fs.writeFileSync(xmlPath, xmlData)

    } catch(e) {
        // @ts-ignore
        console.error('Error: unable to update AndroidManifest.xml', e)
        error = true
    }
    // write out settings.json
    try {
        const settingsFile = path.join(outPath, 'App_Resources', 'Android', 'settings.json')
        const set = {appId: appId, minSdkVersion: minSDK || null, targetSdkVersion: targetSDK || null, compileSdkVersion: compileSDK || null}
        const setstr = JSON.stringify(set)+'\n'
        fs.writeFileSync(settingsFile, setstr)
    } catch(e) {
        // @ts-ignore
        console.error('Error: unable to write settings.json', e)
        error = true
    }
    // write out strings.xml (titles.xml?)
    const stringsFile = path.join(outPath, 'App_Resources', 'Android', 'src', 'main', 'res', 'values', 'strings.xml')
    const v21stringsFile = path.join(outPath, 'App_Resources', 'Android', 'src', 'main', 'res', 'values-v21', 'strings.xml')
    const xml =`

<resources>
    <string name="app_name">${shortName}</string>
    <string name="title_activity_kimera">${shortName}</string>
</resources>
`
    try {
        fs.writeFileSync(stringsFile, xml)
        fs.writeFileSync(v21stringsFile, xml)
    } catch(e) {
        // @ts-ignore
        console.error('Error: unable to write '+stringsFile, e)
        error = true
    }

    if(error) {
        throw Error()
    }
}

function makeXCBuildSettings(outPath:string, options:any) {
    let teamId
    let provisioning
    let codeSignFor
    if(options) {
        teamId = options.teamId
        provisioning = options.provisioning
        codeSignFor = options.codeSignFor
    }
    const devTeamLine = teamId ? `    DEVELOPMENT_TEAM = ${teamId};\n` : ''
    const provisionLine = provisioning ? `    PROVISIONING_PROFILE = ${provisioning};\n` : ''
    const codeSignLine = codeSignFor ? `    CODE_SIGN_IDENTITY = ${codeSignFor}\n` : ''
    const config = `    
// Generated by Jove during Nativescript export
// using values found in the Jove app's package.json under "ios"
// all values are optional.
// "ios": {
//   "teamId":  --> becomes DEVELOPMENT_TEAM
//   "provisioning": --> becomes PROVISIONING_PROFILE
//   "codeSignFor": --> becomes CODE_SIGN_IDENTITY
// }    
// always generated:    
//    ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
    
${devTeamLine}${provisionLine}${codeSignLine}
    ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
`
    const fileName = path.join(outPath, 'App_Resources', 'iOS', 'build.xcconfig')
    try {
        fs.writeFileSync(fileName, config)
    } catch(e) {
        // @ts-ignore
        console.error('Error: unable to write '+fileName, e)
        throw Error()
    }
}

/**
 * Shorten name by removing vowels, then spaces, until we are 12 characters or less
 * @param name
 */
export function shortFromDisplay(name:string) {
     const vowels = 'aeiou'
     let shortName = ''
    if(name.length <= 12) return name // okay as it is
    for(let i=0; i<name.length; i++) {
        const c = name.charAt(i)
        if (vowels.indexOf(c) === -1) shortName += c // no vowels
    }
    if(shortName.length > 12) {// more to do: remove spaces
         shortName = shortName.replace(/ /g, '')
    }
    return shortName; // best we can do
}

/*
Related to-do:
- update template for gradle changes

version transmogrify:

release versions have 3 numbers
pre-release have 4 numbers, with last being a code:
    pre-release: 0
    alpha: 1
    beta: 2
    delta: 3
    gamma: 4
    release:9
and the build number, which comes from the pre-release revision. (0 for releases)

Android version code is a number
<major><minor><revision><pre><build>
001002003000789 // (1002003000789)

release:
version 1.2.3
001002003900000 // (1002003900000)

version (with phase code, but without build number) eg. 1.2.3.0 // pre-release
// eg. 1.2.3 // release

NB: this allows a release to be made without incrementing the rev, because the build number is not communicated.
beware of this.

use build number for publish (how? where is this set?)
otherwise, publish with xcode and set build number manually

 */