import * as process from "process";
import * as ac from "ansi-colors";
import * as path from "path";
import * as fs from "fs";
import {Stats} from 'fs'
import {gatherInfo} from './gatherInfo'
import {createSMX} from './smx'
import {makePageList} from "./mainPageList";
import * as componentReader from './tbFiles/ComponentReader'
import * as pageReader from './tbFiles/PageReader'
import {spaceCase} from "./tbFiles/CaseUtils";
import * as os from "os"
import webpack from "webpack";
import UglifyJsPlugin from "uglifyjs-webpack-plugin";
// @ts-ignore
import * as tsc from 'node-typescript-compiler'
import * as sass from 'sass'
import {mkdirSync} from "fs";

import * as riot from 'riot'
// @ts-ignore
import * as AppFront from 'Project/tbAppFront'
// @ts-ignore
import App from 'RiotMain/app.riot'
// import {AppCore, setTheApp} from 'Framework/app-core/AppCore'
// import registerGlobalComponents from 'BuildPack/register-global-components'


// Variables resolved and used in build functions
let tbxPath:string,  // path to the tbx script itself. This establishes where framework is within project node_modules space.
    packPath:string, // path to directory in framework that holds the sources for the app bootstrap
    projPath:string, // path to the project
    buildPath:string, // path to the project build directory space
    // distPath:string,  // path to the project build space for publishing NOT CURRENTLY USED
    modulesPath:string, // path to the node_modules of the framework in the project
    fwCommonPath:string,
    fwDesktopPath:string,
    tbBuildSrc:string, // path to the framework 'src' folder
    fwcomp:string,  // path to the framework components folder tree
    appPages:string, // path to the app's pages folder
    riotMain:string, // path where app.riot is found
    electronExecPath:string, // execution path for electron, relative to project
    projName:string, // name of project from project package.json file
    projVersion:string, // version of project from project package.json file
    projDesc:string, // description of project from project package.json file
    frontMain:string, // name of entry module for the app Renderer code, from project package.json file or default (tbAppFront.ts)
    backMain:string  // name of entry module for the app Back (node) process code, fom project package.json file or default (tbAppBack.ts)

// TODO: Import from gatherInfo rather than repeat here
function readPackageInfoAtPath(directory:string):any {
    const pkgFile = path.join(directory, 'package.json')
    if(!fs.existsSync(pkgFile)) {
        console.error(ac.red(`no package.json info found at ${pkgFile}`))
        throw Error()
    }
    const contents = fs.readFileSync(pkgFile).toString()
    return JSON.parse(contents)
}

/**
 * Use webpack to build the
 * renderer bundle
 */
function doWebpackBuild() {
    // console.log('Framework mapped to ', tbBuildSrc)
    return new Promise(resolve => {
        console.log('packing...')
        const genDir = path.join(projPath, '.gen')
        const srcDir = path.join(projPath, 'src')
        /*
        TODO:
        cmd option for production/development
        also a command option for source maps (devtool option below)
         */
        //@ts-ignore
        webpack({
            mode: 'none', // or development or production TODO: cmd option
            context: packPath,
            entry: './appMain.js',
            output: {
                path: buildPath,
                publicPath: buildPath,
                filename: 'bundle.js'
            },
            optimization: {
                minimizer: [
                    new UglifyJsPlugin({sourceMap:true})
                ]
            },
            // devtool: 'eval-source-map',
            devtool: 'source-map',
            resolve: {
                alias: {
                    Project: srcDir,
                    Generated: genDir,
                    Assets: path.join(srcDir, 'assets'),
                    Framework: tbBuildSrc,
                    BuildPack: packPath,
                    FrameworkComponents: fwcomp,
                    RiotMain: riotMain
                },
                fallback: {fs: false, path: false, os: false},
                modules: [modulesPath, appPages, genDir],
                extensions: [ '.ts', '.js', '.riot', 'css', 'txt' ],
            },
            module: {
                rules: [
                    {
                        test: /\.riot$/,
                        use: '@riotjs/webpack-loader'
                    },
                    {
                        test: /\.tsx?$/,
                        // loader: 'ts-loader', // ts loader is not working right
                        loader: 'awesome-typescript-loader',
                        options: {
                            configFileName: `${packPath}/tsconfig.json`,
                            transpileOnly: true // skip type checks
                        }
                    },
                    {
                        test:/\.(txt|png|jpg)$/i,
                        type: 'asset/resource'
                    }
                ]
            }

        }).run((err:any, stats:any) => {
            if(err) {
                console.error('Webpack error', err)
            }
            stats.compilation.errors.forEach((err:any) => {
                console.error(ac.bold.red('Error:'), err.message)
            })
            stats.compilation.warnings.forEach((warn:any) => {
                const msg = warn.message
                if(msg.indexOf('Module not found') === -1) {
                    console.warn(ac.blue('Warning:'), warn.message)
                }
            })

            // console.log('webpack stats', stats.toString('summary'))
            if(err || stats.hasErrors()) {
                process.exit(-1)
            }
            console.log('bundle.js creation complete')
            resolve(undefined)
        })
    })
}

/**
 * Final steps:
 * - compile our main node module
 * - copy the index.html file
 * - create an executable in the name of the app that runs electron and points to our main module
 */
function mainAndExec() {
    try {
        tsc.compile({
                target: 'es5',
                lib: 'es2015,dom',
                outdir: 'build'
            }, [`${backMain}`],
            {banner: `Compiling ${projName} ${projVersion}`}
        )
    } catch(e) {
        console.error(`Failed to compile ${backMain}`)
        throw Error()
    }
    try {
        if (!fs.existsSync(buildPath)) {
            fs.mkdirSync(buildPath, {recursive: true})
        }
    } catch(e) {
        console.error(`failed to find or create build path ${buildPath}`)
        throw Error()
    }
    try {
        fs.copyFileSync(path.join(packPath, 'index.html'), path.join(buildPath, 'index.html'))
    } catch(e) {
        console.error(`failed to copy index.html from ${packPath} to ${buildPath}`)
        throw Error()
    }

    /* Not needed ...
    // write out a package.json
    const ourPkg = {
      name: projName,
      version: projVersion,
      description: projDesc,
      main: 'tbAppBack.js'
    }
    fs.writeFileSync(path.join(buildPath, '..', 'package.json'), JSON.stringify(ourPkg))
     */

    // write out an execution script in the name of the app
    // electron tbAppBack.js

    let n = backMain.lastIndexOf('.')
    const backMainJS = backMain.substring(0, n)+".js"

    const index = backMainJS.substring(backMainJS.lastIndexOf('/')+1)
    try {
        fs.writeFileSync(path.join(buildPath, '..', projName), `#!/bin/bash\n\n${electronExecPath} ${index}\n`, {mode: '777'})
    } catch(e) {
        console.error(`failed to create executable ${projName} from ${index} using ${electronExecPath}`)
        throw Error()
    }

}

function generateBuildEnvironment() {
    const genDir = path.join(projPath, '.gen')
    if(!fs.existsSync(genDir)) {
        fs.mkdirSync(genDir)
    }

    // read version of Thunderbolt we are using from its package.json
    // const tbDir = path.resolve(path.join(modulesPath, 'thunderb'))
    let pkg = readPackageInfoAtPath(fwDesktopPath)
    const tbVersion = pkg.version
    // read version of electron from its package.json
    const electronDir = path.resolve(path.join(fwDesktopPath, 'node_modules', 'electron'))
    pkg = readPackageInfoAtPath(electronDir)
    const electronVersion = pkg.version


    const environment = {
        framework: {
            name: 'ThunderBolt/Desktop',
            version: tbVersion,
        },
        platform: {
            name: os.platform(),
            version: os.release()
        },
        node: {
            version: process.versions.node
        },
        host: {
            electron: electronVersion
            // nativescript // TODO: In export or during mobile build
        },
        app: {
            name: projName,
            version: projVersion,
            description: projDesc,
            buildTime: Date.now()
        }
    }

    try {
        const str = '\n' + JSON.stringify(environment, null, 2) + '\n'
        const outPath = path.normalize(path.join(genDir, 'BuildEnvironment.json'))
        // console.log('writing to ', outPath)
        fs.writeFileSync(outPath, str)
    } catch(e) {
        console.error(`failed to create environment info`)
        throw e
    }
}

function makeAppScss(appScss:string) {
    // enumerate the scss file for .scss files
    // (non-recursive.  folders may be used to import from by top-level scss files here.
    // although prefix selection is not supported at that level)
    const scssFolder = path.join(projPath, 'src', 'scss')

    const imports:string[] = []
    const files = fs.readdirSync(scssFolder)
    for(let i=0; i<files.length; i++) {
        const file = files[i]
        if(file.substring(file.lastIndexOf('.')).toLowerCase().trim() === '.scss') {
            const pfx = file.substring(file.indexOf('.') + 1, file.lastIndexOf('.'))
            if (pfx === '.' || isDesktopPrefix(pfx)) {
                imports.push('@import "../src/scss/' + file + '";')
            }
        }
    }

    const varSrc = path.join(modulesPath, 'thunderbolt-cli', 'src', 'tbFiles', 'theme-vars.scss')
    const varDest = path.join(projPath, '.gen', 'tb-vars.scss')
    fs.copyFileSync(varSrc, varDest)

    const themeSrc = path.join(modulesPath, 'thunderbolt-cli', 'src', 'tbFiles', 'theme-desktop.scss')
    const themeDest = path.join(projPath, '.gen', 'tb-theme.scss')
    fs.copyFileSync(themeSrc, themeDest)

    const theme = `
    // Thunderbolt default styles
    
    @import "./tb-vars";
    @import "./tb-theme";
    
    `
    + imports.join('\n')+fontLoad
    // console.log('writing '+appScss, theme)
    fs.writeFileSync(appScss, theme)

}
function isDesktopPrefix(pfx:string):boolean {
    return (pfx === 'desktop'
    || pfx === 'macos'
    || pfx === 'windows'
    || pfx === 'linux')
}

function compileScss() {
    // console.log('compileScss')
    const mainScss = 'app.scss'
    const appScss = path.join(projPath, '.gen', mainScss)
    makeAppScss(appScss)
    if(!fs.existsSync(appScss)) {
        console.warn(`${ac.bgYellow('WARNING:')} missing ${ac.bold('app.scss')} file - no css will be generated.`)
        return;
    }
    const appCss = path.join(buildPath, 'app.css')
    // console.log('execute Sass from '+appScss+' to '+appCss)
    if(!fs.existsSync(buildPath)) {
        mkdirSync(buildPath, {recursive: true})
    }
    try {
        const result = sass.renderSync({file: appScss})
        console.log(`${result.stats.includedFiles.length} files compiled to css in ${result.stats.duration} ms`)
        const cssContent = result.css.toString()
        fs.writeFileSync(appCss, cssContent)
    } catch(e) {
        console.error('Sass error', e)
        throw Error()
    }
}

function makeRiotComponents() {
    const componentsDir = path.join(projPath, 'src', 'components')
    componentReader.enumerateAndConvert(componentsDir, 'riot', componentsDir)

    console.log('converting pages to riot')
    const pageDir = path.join(projPath, 'src', 'pages')
    pageReader.enumerateAndConvert(pageDir, 'riot', pageDir)
}

function summary() {
    console.log('')
    console.log(`${projName} ${projVersion}`)
    console.log(projDesc)
}

export function doBuild() {
    console.log('building...')
    let p;
    try {
        const info = gatherInfo()
        tbxPath = info.tbxPath
        packPath = info.packPath
        projPath = info.projPath
        buildPath = info.buildPath
        // distPath = info.distPath
        modulesPath = info.modulesPath
        fwCommonPath = info.fwCommonPath
        fwDesktopPath = info.fwDesktopPath
        tbBuildSrc = info.tbBuildSrc
        fwcomp = info.fwcomp
        appPages = info.appPages
        riotMain = info.riotMain
        electronExecPath = info.electronExecPath
        projName = info.projName
        projVersion = info.projVersion
        projDesc = info.projDesc
        frontMain = info.frontMain
        backMain = info.backMain

        if(info.buildFlags.clean) {
            console.log('cleaning...')
            doClean()
        }

        if(info.buildFlags.prepare) {
            console.log('preparing...')
            generateBuildEnvironment()
            enumerateFonts()
            compileScss()
            makeRiotComponents()
            makePageList()
        }
        if(info.buildFlags.compile) {
            p =  doWebpackBuild().then(() => {
                createSMX()
                copyAssets()
                mainAndExec()
                summary()
            })
        }

        return Promise.resolve(p)

    } catch(e) {
        console.error(e)
        process.exit(-1)
    }

    console.log('')
}

/**
 * Copy all the files from src/assets to build/front/assets
 *
 * The assets are not going into the webpack bundle, which I suppose would be preferable, but
 * with the exception of menudef.txt, it doesn't appear to be working. Not sure how to dynamically
 * associate whatever webpack loader it has to the url.
 * So this just moves it all under the webroot, where it will look for it the old-school way.
 */
function copyAssets() {
    let src = path.join(projPath, 'src', 'assets')
    let dest = path.join(buildPath, 'assets')
    recurseDirectory(src, (filepath:string, stats:Stats) => {
        if(stats.isDirectory()) {
            let test = '/src/assets'
            let fpb = filepath.substring(filepath.indexOf(test) + test.length)
            dest = path.join(dest, fpb)
        }
        if(stats.isFile()) {
            let base = filepath.substring(filepath.lastIndexOf('/') + 1)
            let df = path.join(dest, base)
            if(!fs.existsSync(dest)) fs.mkdirSync(dest, {recursive:true})
            fs.copyFileSync(filepath, df)
        }
    })
    // do same thing for fonts
    src = path.join(projPath, 'src', 'fonts')
    dest = path.join(buildPath, 'fonts')
    recurseDirectory(src, (filepath:string, stats:Stats) => {
        if(stats.isDirectory()) {
            let test = '/src/fonts'
            let fpb = filepath.substring(filepath.indexOf(test) + test.length)
            dest = path.join(dest, fpb)
        }
        if(stats.isFile()) {
            let base = filepath.substring(filepath.lastIndexOf('/') + 1)
            let df = path.join(dest, base)
            if(!fs.existsSync(dest)) fs.mkdirSync(dest, {recursive:true})
            fs.copyFileSync(filepath, df)
        }
    })
}

function doClean() {
    // get rid of all .riot (components and pages), get rid of .gen and build
    // let dirpath = path.join(projPath, 'src', 'components')
    // recurseDirectory(dirpath, (filepath, stats) => {
    //     if(stats.isFile()) {
    //         let ext = filepath.substring(filepath.lastIndexOf('.'))
    //         if(ext === '.riot') {
    //             fs.unlinkSync(filepath)
    //         }
    //     }
    // })
    // dirpath = path.join(projPath, 'src', 'pages')
    // recurseDirectory(dirpath, (filepath, stats) => {
    //     if(stats.isFile()) {
    //         let ext = filepath.substring(filepath.lastIndexOf('.'))
    //         if(ext === '.riot') {
    //             fs.unlinkSync(filepath)
    //         }
    //     }
    // })
    let dirpath = path.join(projPath, '.gen')
    fs.rmdirSync(dirpath, {recursive:true})
    dirpath = path.join(projPath, 'build')
    fs.rmdirSync(dirpath, {recursive:true})
}
interface RecurseCB {
    (filepath: string, stats: Stats): boolean|void;
}
function recurseDirectory(dirpath:string, callback:RecurseCB) {
    fs.readdirSync(dirpath).forEach((file:string) => {
        const fpath = path.join(dirpath, file)
        const stat = fs.lstatSync(fpath)
        if(callback && !callback(fpath, stat)) {
            if (stat.isDirectory()) {
                recurseDirectory(fpath, callback)
            }
        }
    })
}

let fontLoad = ''
// let famToName = new Map<string, string[]>()
// let nameToFam = new Map<string, string[]>()
//
// function mapFamName(famstr:string, fontName:string) {
//     const split = famstr.split(',')
//     split.forEach(fam => {
//         fam = fam.trim()
//         let names = famToName.get(fam) || []
//         names.push(fontName)
//         famToName.set(fam, names)
//         let families = nameToFam.get(fontName) || []
//         families.push(fam)
//
//     })
// }
//
// const systemFontsMac = [
//
// ]
// const systemFontsWindows = [
//
// ]
// const systemFontsAndroid = [
//     "serif",
//     "sans-serif",
//     "sans-serif-light",
//     "sans-serif-medium",
//     "sans-serif-black",
//     "sans-serif-condensed",
//     "monospace",
//     "serif-monospace",
//     "casual",
//     "cursive",
//     "sans-serif-smallcaps"
//
// ]
// const systemFontsIOS = [
//     "AcademyEngragedLetPlain",
//     "AlNile",
//     "AmericanTypewriter",
//     "AppleColorEmoji",
//     "AppleSDGothicNeo",
//     "Arial",
//     "ArialHebrew",
//     "ArialRoundedMTBold",
//     "Avenir",
//     "Avenir Next",
//     "Avenir Next Condensed",
//     "BanglaSangamMN",
//     "Baskerville",
//     "BodoniOrnamentsITCTT",
//     "BodoniSvtyTwoITCTT",
//     "BodoniSvtyTwoOSITCTT",
//     "BodoniSvtyTwoSCCTT",
//     "BradleyHandITCTT",
//     "ChalkboardSE",
//     "Chalkduster",
//     "Cochin",
//     "Copperplate",
//     "Courier",
//     "Courier New",
//     "DBLCDTemp",
//     "DINAlternate",
//     "DINCondensed",
//     "Damascus",
//     "DevanagariSangamMN",
//     "Didot",
//     "DiwanMishafi",
//     "EuphemiaUCAS",
//     "Farah",
//     "Futura",
//     "Geeza Pro",
//     "Georgia",
//     "GillSans",
//     "GujaratiSangamMN",
//     "GurmukhiMN",
//     "STHeitiSC",
//     "STHeitiTC",
//     "Helvetica",
//     "HelveticaNeue",
//     "HiraKakuProN-W3",
//     "HiraKakuProN-W6",
//     "HiraginoSans-W3",
//     "HiraginoSans-W6",
//     "HoeflerText",
//     "IowanOldStyle",
//     "Kailasa",
//     "KannadaSangamMN",
//     "KhmerSangamMN",
//     "KohinoorBangla",
//     "KohinoorDevanagari",
//     "KohinoorTelugu",
//     "LaoSangamMN",
//     "MalayalamSangamMN",
//     "Menlo",
//     "Marion",
//     "MarkerFelt",
//     "Noteworthy",
//     "Optima",
//     "OriyaSangamMN",
//     "Palatino",
//     "Papyrus",
//     "PartyLetPlain",
//     "PingFangHK",
//     "PingFangSC",
//     "PingFangTC",
//     "SanFranciscoDisplay",
//     "SanFranciscoRounded",
//     "SanFranciscoText",
//     "SavoyeLetPlain",
//     "SinhalaSangamMN",
//     "SnellRoundhand",
//     "Superclarendon",
//     "Symbol",
//     "TamilSangamMN",
//     "TeluguSangamMN",
//     "Thonburi",
//     "TimesNewRomanPS",
//     "TrebuchetMS",
//     "Verdana",
//     "ZapfDingbatsITC",
//     "Zapfino"
//
// ]

function enumerateFonts() {
    fontLoad = ''
    let fontsPath = path.join(projPath, 'src', 'fonts')
    if(fs.existsSync(fontsPath)) {
        recurseDirectory(fontsPath, (filePath:string, stats:Stats) => {
                // console.log(filePath)
                let file = filePath.substring(filePath.lastIndexOf('/') + 1)
                let dot = file.lastIndexOf('.')
                let ext = file.substring(dot)
                let base = file.substring(0, dot)
                // console.log(base, ext)
                if(stats.isFile() && base.charAt(0) !== '.') {
                let familyName = spaceCase(base)

                let assetPath = './fonts/'+base+ext
                let fmt
                ext = ext.toLowerCase()
                // if(ext === '.tbf' || ext === '.tbfi') {
                //     processFontInfo(filePath)
                // }
                if(ext === '.woff') fmt = 'woff'
                if(ext === '.woff2') fmt = 'woff2'
                if (ext == '.ttf') fmt = 'truetype'
                if (ext === '.otf') fmt = 'opentype'
                if (ext === '.eot') fmt = 'embedded-opentype'
                if (ext === '.svg' || ext === 'svgz') fmt = 'svg'
                if(fmt && familyName) {
                    let ff = `
    @font-face {
        font-family: "${familyName}";
        src: url("${assetPath}") format("${fmt}");
    }
    `
                    fontLoad += ff
                    console.log('adding ' + fmt + ' font ' + familyName)
                }
            }
        })

        // list of fontnames defined by font info
        // list of families referenced by font info
        // list of families known
        // list of families added
        // reconcile families referenced to known or added families
        // report if we can't find the link


        // Check the map of family names to see if there are any that are not associated by font info
        // and issue a warning
        // Output the resulting name to font mapping
    }
}

// function processFontInfo(filePath:string) {
//     console.log('Processing font info from ', filePath)
//     let contents = fs.readFileSync(filePath).toString()
//     if(!contents) return
//
//     const badBlock = (lineNum:number) => {
//         console.error('Error in '+filePath+' at line '+lineNum)
//         process.exit(-1)
//     }
//
//     const lines = contents.split('\n')
//     let blockStarted = false;
//     let fontName = '', family = '', appearance = ''
//     for(let i=0; i<lines.length; i++) {
//         let line = lines[i]
//         let cn = line.indexOf('//')
//         if(cn === -1) cn === line.length;
//         // line = line.substring(0, cn)
//         let kv = line.split(':')
//         let key = (kv[0]||'').trim()
//         let value = (kv[1]||'').trim()
//         if(key === 'FontName')  {
//             if(blockStarted) badBlock(i)
//             blockStarted = true
//             fontName = value
//         }
//         else if(key === 'Family') {
//             if(!blockStarted) badBlock(i)
//             family = value
//         }
//         else if(key === 'Appearance') {
//             if(!blockStarted) badBlock(i)
//             appearance = value
//         }
//         if(fontName && family && appearance) {
//             const isWeight = (ap:string) => {
//                 return (ap === 'bold')
//             }
//             const isStyle = (ap:string) => {
//                 return (ap === 'italic')
//             }
//             const isStretch = (ap:string) => {
//                 return (
//                     ap == 'condensed'
//                  || ap == 'expanded'
//                  || ap == 'semi-condensed'
//                  || ap == 'extra-condensed'
//                  || ap == 'ultra-condensed'
//                  || ap == 'semi-expanded'
//                  || ap == 'extra-expanded'
//                  || ap == 'ultra-expanded'
//                 )
//             }
//             // add the fontname and families to the record
//             console.log('mapping font name', fontName, family)
//             mapFamName(family, fontName)
//
//             let apwords = appearance.split(' ')
//             let weight = 'normal', style='normal', stretch = 'none'
//             apwords.forEach(ap => {
//                 if(isWeight(ap)) weight = ap
//                 if(isStyle(ap)) style = ap
//                 if(isStretch(ap)) stretch = ap
//             })
//             let fclass = `  .f-${fontName} {\n    font-family:${family}\n    font-style:${style}\n     font-stretch:${stretch}\n  }`
//
//             console.log(fclass)
//         }
//     }
//}