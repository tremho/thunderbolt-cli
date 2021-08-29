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
// import UglifyJsPlugin from "uglifyjs-webpack-plugin"; // TODO: Look into TerserPlugin instead
// @ts-ignore
// import * as tsc from 'node-typescript-compiler' // REMOVED: Doesn't work on Windows
import {executeCommand} from "./execCmd";

import * as sass from 'sass'
import {mkdirSync} from "fs";

import * as riot from 'riot'
// @ts-ignore
import * as AppFront from 'Project/tbAppFront'
// @ts-ignore
import App from 'RiotMain/app.riot'
import {exec} from "child_process";
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
    displayName:string,
    copyright:string,
    author: string,
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
            // optimization: {
            //     minimizer: [
            //         new UglifyJsPlugin({sourceMap:true})
            //     ]
            // },
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
                extensions: [ '.ts', '.js', '.riot', 'css' ],
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
                    }
                    // {
                    //     test:/\.(txt|png|jpg)$/i,
                    //     use: 'raw-loader'
                    //     // type: 'asset/resource'
                    // }
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
    }).catch(e => {
        console.error('FAILED WEBPACK Bundling:', e)
    })
}

function tscCompile(options:any, files:string[]) {

    const argList:string[] = []
    if(options.outdir) { argList.push('--outDir '+options.outdir)}
    if(options.target) { argList.push('--target '+options.target) }
    if(options.lib) {
        const libs = options.lib.split(',')
        libs.forEach((lib: string) => {
            argList.push('--lib ' + lib)
        })
    }
    let f
    while((f=files.pop())) argList.push(f)
    return executeCommand('tsc', argList, '', true)
}

/**
 * Final steps:
 * - compile our main node module
 * - copy the index.html file
 * - create an executable in the name of the app that runs electron and points to our main module
 */
function mainAndExec() {
    let p
    try {
        console.log(ac.bold(`Compiling ${projName} ${projVersion}`))
        p = tscCompile(
            {
                target: 'es5',
                lib: 'es2015,dom',
                outdir: 'build'
             },[backMain]).catch((e:Error) => {throw e}).then(() =>{
                 console.log(ac.italic(`${projName} successfully compiled`))
             })
    } catch(e) {
        console.error(ac.red(`Failed to compile ${backMain}`))
        throw Error()
    }
    p.then(() => {
        try {
            if (!fs.existsSync(buildPath)) {
                fs.mkdirSync(buildPath, {recursive: true})
            }
        } catch (e) {
            console.error(`failed to find or create build path ${buildPath}`)
            throw Error()
        }
        try {
            fs.copyFileSync(path.join(packPath, 'index.html'), path.join(buildPath, 'index.html'))
        } catch (e) {
            console.error(`failed to copy index.html from ${packPath} to ${buildPath}`)
            throw Error()
        }


        // write out an execution script in the name of the app
        // electron tbAppBack.js

        let n = backMain.lastIndexOf('.')
        const backMainJS = backMain.substring(0, n) + ".js"

        const index = backMainJS.substring(backMainJS.lastIndexOf(path.sep) + 1)
        let scriptFile = projName
        try {
            let script = ''
            if(os.platform() === 'win32') {
                scriptFile += '.bat'
                script += '@echo off\n'
            } else {
                script += '#!/bin/bash\n\n'
            }
            script += `${electronExecPath} ${index}\n`
            fs.writeFileSync(path.join(buildPath, '..', scriptFile), script, {mode: '777'})
        } catch (e) {
            console.error(`failed to create executable ${scriptFile} from ${index} using ${electronExecPath}`)
            throw Error()
        }
    })
    return p
}

function generateBuildEnvironment() {
    const genDir = path.join(buildPath, '..')  // generate it at runtime cwd, not front
    if(!fs.existsSync(genDir)) {
        fs.mkdirSync(genDir, {recursive:true})
    }

    // read version of Jove we are using from its package.json
    // const tbDir = path.resolve(path.join(modulesPath, 'thunderb'))
    let pkg = readPackageInfoAtPath(fwDesktopPath)
    const tbVersion = pkg.version
    // read version of electron from its package.json
    const electronDir = path.resolve(path.join(fwDesktopPath, 'node_modules', 'electron'))
    pkg = readPackageInfoAtPath(electronDir)
    const electronVersion = pkg.version

    const environment = {
        framework: {
            name: 'Jove/Desktop',
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
            displayName: displayName,
            copyright: copyright,
            author: author,
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
        // @ts-ignore
        throw e
    }
}

function makeAppScss(appScss:string) {
    // enumerate the scss file for .scss files
    // (non-recursive.  folders may be used to import from by top-level scss files here.
    // although prefix selection is not supported at that level)
    const scssFolder = path.join(projPath, 'src', 'scss')

    const imports:string[] = []
    if(!fs.existsSync(scssFolder)) return

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

    const genDir = path.join(projPath, '.gen')
    if(!fs.existsSync(genDir)) {
        fs.mkdirSync(genDir)
    }

    const varSrc = path.join(modulesPath, '@tremho/jove-cli', 'src', 'tbFiles', 'theme-vars.scss')
    const varDest = path.join(genDir, 'tb-vars.scss')
    fs.copyFileSync(varSrc, varDest)

    const fontSrc = path.join(modulesPath, '@tremho/jove-cli', 'src', 'tbFiles', 'theme-fonts.scss')
    const fontDest = path.join(genDir, 'tb-fonts.scss')
    fs.copyFileSync(fontSrc, fontDest)
    
    const themeSrc = path.join(modulesPath, '@tremho/jove-cli', 'src', 'tbFiles', 'theme-desktop.scss')
    const themeDest = path.join(genDir, 'tb-theme.scss')
    fs.copyFileSync(themeSrc, themeDest)

    const theme = `
    // Jove default styles
    
    @import "./tb-vars";
    @import "./tb-fonts";
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
    if(fs.existsSync(appScss)) {
        fs.unlinkSync(appScss)
    }
    makeAppScss(appScss)
    if(!fs.existsSync(appScss)) {
        console.warn(`${ac.bgYellow('WARNING:')} ${ac.bold('no scss folder')} - no css will be generated.`)
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
        // @ts-ignore
        console.error('Sass error', e)
        throw Error()
    }
}

function makeRiotComponents() {
    const componentsDir = path.join(projPath, 'src', 'components')
    if(fs.existsSync(componentsDir)) {
        componentReader.enumerateAndConvert(componentsDir, 'riot', componentsDir)
    }

    console.log('converting pages to riot')
    const pageDir = path.join(projPath, 'src', 'pages')
    pageReader.enumerateAndConvert(pageDir, 'riot', pageDir)
}

function summary() {
    console.log('')
    console.log(`${displayName} (${projName} ${projVersion})`)
    console.log(projDesc)
    console.log(copyright)
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
        displayName = info.displayName
        copyright = info.copyright
        author = info.author
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
                console.log('completing build...')
                createSMX()
                copyAssets()
                mainAndExec().then(() => {
                    summary()
                })
            })
        }

        return Promise.resolve(p)

    } catch(e) {
        // @ts-ignore
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
    let rdest = path.join(buildPath, 'assets')
    let dest = rdest
    let test = path.sep+'src'+path.sep+'assets'
    if(!fs.existsSync(src)) return;
    recurseDirectory(src, (filepath:string, stats:Stats) => {
        let fpb = filepath.substring(filepath.indexOf(test) + test.length)
        if(stats.isDirectory()) {
            dest = path.join(rdest, fpb)
            // console.log('dest changes to ', dest)
        }
        if(stats.isFile()) {
            let df = path.join(rdest, fpb)
            let pd = df.substring(0, df.lastIndexOf(path.sep))
            if(!fs.existsSync(pd)) {
                fs.mkdirSync(pd, {recursive:true})
            }
            try {
                fs.copyFileSync(filepath, df)
            } catch(e) {
                // @ts-ignore
                console.error('Error copying asset', filepath, e.message)
                process.exit(-1)
            }
        }
    })
    // do same thing for fonts
    src = path.join(projPath, 'src', 'fonts')
    dest = path.join(buildPath, 'fonts')
    if(fs.existsSync(src)) {
        recurseDirectory(src, (filepath: string, stats: Stats) => {
            if (stats.isDirectory()) {
                let test = '/src/fonts'.replace(/\//g, path.sep)
                let fpb = filepath.substring(filepath.indexOf(test) + test.length)
                dest = path.join(dest, fpb)
            }
            if (stats.isFile()) {
                let base = filepath.substring(filepath.lastIndexOf(path.sep) + 1)
                let df = path.join(dest, base)
                if (!fs.existsSync(dest)) fs.mkdirSync(dest, {recursive: true})
                fs.copyFileSync(filepath, df)
            }
        })
    }

}

function doClean() {
    // get rid of all .riot (components and pages), get rid of .gen and build
    // let dirpath = path.join(projPath, 'src', 'components')
    // recurseDirectory(dirpath, (filepath, stats) => {
    //     if(stats.isFile()) {
    //         let ext = filepath.substring(filepath.lastIndexOf('.'))tsc
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
    fs.rmSync(dirpath, {recursive:true})
    dirpath = path.join(projPath, 'build')
    fs.rmSync(dirpath, {recursive:true})
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

function enumerateFonts() {
    fontLoad = ''
    let fontsPath = path.join(projPath, 'src', 'fonts')
    if (fs.existsSync(fontsPath)) {
        recurseDirectory(fontsPath, (filePath: string, stats: Stats) => {
            // console.log(filePath)
            let file = filePath.substring(filePath.lastIndexOf('/') + 1)
            let dot = file.lastIndexOf('.')
            let ext = file.substring(dot)
            let base = file.substring(0, dot)
            // console.log(base, ext)
            if (stats.isFile() && base.charAt(0) !== '.') {
                let familyName = spaceCase(base)

                let assetPath = './fonts/' + base + ext
                let fmt
                ext = ext.toLowerCase()
                if (ext === '.woff') fmt = 'woff'
                if (ext === '.woff2') fmt = 'woff2'
                if (ext == '.ttf') fmt = 'truetype'
                if (ext === '.otf') fmt = 'opentype'
                if (ext === '.eot') fmt = 'embedded-opentype'
                if (ext === '.svg' || ext === 'svgz') fmt = 'svg'
                if (fmt && familyName) {
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

    }
}
