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
import {TsconfigPathsPlugin} from "tsconfig-paths-webpack-plugin"
const ForkTsCheckerNotifierWebpackPlugin = require('fork-ts-checker-notifier-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
// const HtmlWebpackPlugin = require('html-webpack-plugin');

// import UglifyJsPlugin from "uglifyjs-webpack-plugin"; // TODO: Look into TerserPlugin instead
// @ts-ignore
// import * as tsc from 'node-typescript-compiler' // REMOVED: Doesn't work on Windows
import {executeCommand} from "./execCmd";

import * as sass from 'sass'
import {mkdirSync} from "fs";

import * as riot from 'riot'
// @ts-ignore
import * as AppFront from 'Project/joveAppFront'
// @ts-ignore
import App from 'RiotMain/app.riot'

import {copySplashPage} from "./splashPage";
import {makeWorkers} from "./makeWorkers";


// Variables resolved and used in build functions
let jovePath:string,  // path to the jove script itself. This establishes where framework is within project node_modules space.
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
    frontMain:string, // name of entry module for the app Renderer code, from project package.json file or default (joveAppFront.ts)
    backMain:string  // name of entry module for the app Back (node) process code, fom project package.json file or default (joveAppBack.ts)

let verbose:boolean = false

// TODO: Import from gatherInfo rather than repeat here
function readPackageInfoAtPath(directory:string):any {
    trace('readPackageInfoAtPath')
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
    trace('doWebpackBuild')
    // console.log('Framework mapped to ', tbBuildSrc)
    return new Promise(resolve => {
        console.log('prepare to pack...')
        const genDir = path.join(projPath, '.gen')
        const srcDir = path.join(projPath, 'src')
        /*
        TODO:
        cmd option for production/development
        also a command option for source maps (devtool option below)
         */
        //@ts-ignore
        const wpconf:any = {
            // bail: true, // die on first sign of trouble
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
                //     plugins: [new TsconfigPathsPlugin({
                //         baseUrl: path.resolve(projPath),
                //         configFile: `${projPath}/tsconfig.json`
                //     })],
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
                extensions: ['.ts', '.js', '.riot', 'css'],
            },
            // these don't seem to be doing anything for me.
            plugins: [
                new ForkTsCheckerWebpackPlugin({
                    typescript: {
                        context: projPath
                    }
                }),
                new ForkTsCheckerNotifierWebpackPlugin({title: 'TypeScript', excludeWarnings: false}),
                // new HtmlWebpackPlugin({
                //     inject: true,
                //     template: 'src/index.html'
                // }),
            ],
            module: {
                rules: [
                    {
                        test: /\.riot$/,
                        use: '@riotjs/webpack-loader'
                    },
                    {
                        test: /\.tsx?$/,
                        // loader: 'ts-loader', // ts loader is not working right
                        loader: 'ts-loader',
                        // options: {
                        //     baseUrl: path.resolve(s),
                        //     transpileOnly: true
                        // }
                    }
                    // {
                    //     test:/\.(txt|png|jpg)$/i,
                    //     use: 'raw-loader'
                    //     // type: 'asset/resource'
                    // }
                ]
            }
        }
        // console.log('webpack config = ', wpconf)
        console.log('webpack...')
        webpack(wpconf).run((err:any, stats:any) => {
            console.log('webpack process complete')
            if(err) {
                console.error('Webpack error', err)
            }
            stats?.compilation?.errors?.forEach((err:any) => {
                console.error(ac.bold.red('Error:'), err.message)
            })
            stats?.compilation?.warnings?.forEach((warn:any) => {
                const msg = warn.message
                if(msg.indexOf('Module not found') === -1) {
                    console.warn(ac.blue('Warning:'), warn.message)
                }
            })

            console.log('webpack stats', stats.toString('summary'))
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

export function tscCompile(options:any, files:string[]) {

    trace('tscCompile')
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
    trace('mainAndExec')
    let p
    try {
        if (!fs.existsSync(buildPath)) {
            fs.mkdirSync(buildPath, {recursive: true})
        }
    } catch (e) {
        console.error(`failed to find or create build path ${buildPath}`)
        throw Error()
    }
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
            fs.copyFileSync(path.join(packPath, 'index.html'), path.join(buildPath, 'index.html'))
        } catch (e) {
            console.error(`failed to copy index.html from ${packPath} to ${buildPath}`)
            throw Error()
        }

        // write out an execution script in the name of the app
        // electron joveAppBack.js

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
            const exePath = path.resolve(path.join(buildPath, '..', scriptFile))
            console.log(`Creating executable to ${exePath}`)
            fs.writeFileSync(exePath, script,  {mode: '777'})

            let verified = fs.existsSync(exePath)
            console.log('script written: ', verified)

        } catch (e) {
            console.error(`failed to create executable ${scriptFile} from ${index} using ${electronExecPath}`)
            throw Error()
        }
    })
    // make workers as last step
    return p.then(() => {
        return makeWorkers()
    })
}

function generateBuildEnvironment() {
    trace('generateBuldEnvironment')
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
    trace('makeAppScss')
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
    trace('isDesktopPrefix')
    return (pfx === 'desktop'
    || pfx === 'macos'
    || pfx === 'windows'
    || pfx === 'linux')
}

function compileScss() {
    trace('compileScss')

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
    trace('makeRiotComponents')
    const componentsDir = path.join(projPath, 'src', 'components')
    if(fs.existsSync(componentsDir)) {
        componentReader.enumerateAndConvert(componentsDir, 'riot', componentsDir)
    }

    trace('converting pages to riot')
    const pageDir = path.join(projPath, 'src', 'pages')
    pageReader.enumerateAndConvert(pageDir, 'riot', pageDir)
}

function summary() {
    trace('summary')
    console.log('')
    console.log(`${displayName} (${projName} ${projVersion})`)
    console.log(projDesc)
    console.log(copyright)
}

export function doBuild() {
    trace('doBuild')
    console.log('building...')
    let p;
    try {
        const info = gatherInfo()
        verbose = info.buildFlags.verbose || false
        jovePath = info.jovePath
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

        trace('info gathered ', info)

        if(info.buildFlags.clean) {
            console.log('cleaning...')
            doClean()
        }

        if(info.buildFlags.prepare) {
            console.log('preparing...')
            generateBuildEnvironment()
            enumerateFonts()
            compileScss()
            copyAssets()
            makeRiotComponents()
            makePageList()
        }
        if(info.buildFlags.compile) {
            p = npmInstall().then(() => {
                return doWebpackBuild().then(() => {
                    console.log('completing build...')
                    createSMX()
                    return mainAndExec().then(() => {
                        return summary()
                    })
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
 * do an npm install if package.json is newer than node_modules, or node_modules does not exist
 */
function npmInstall() {
    trace('npmInstall')
    const pkgStat = fs.lstatSync('package.json')
    let ptime = pkgStat.mtimeMs
    let mtime = 0
    if(fs.existsSync('node_modules')) {
        const modStat = fs.lstatSync('node_modules')
        mtime = modStat.mtimeMs
    }
    // trace(`package.json time ${ptime} node_modules time ${mtime}`)
    if(ptime > mtime) {
        return executeCommand('npm', ['install']).then(rt => {
            if(rt.code) {
                console.error(rt.errStr)
                throw Error()
            }
            return executeCommand('touch', ['node_modules'])
        })
    } else {
        return Promise.resolve()
    }
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
    trace('copyAssets')
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
    // if we have a splash, copy the background and content files to the ./build/front (buildPath, web root)
    src = path.join(projPath, 'launch-icons')
    dest = buildPath
    let splashExpected = false
    let sb = path.join(src, 'splash-background.png')
    if(fs.existsSync(sb)) {
        trace('copying '+sb)
        splashExpected = true // we will use splash.jpg as content if splash-content.png is not there
        fs.copyFileSync(sb, path.join(dest, 'splash-background.png'))
    }
    let sc = path.join(src, 'splash-content.png')
    if(!fs.existsSync(sc) && splashExpected) sc = path.join(src, 'splash.jpg')
    if(fs.existsSync(sc)) {
        splashExpected = true
        trace('copying '+sc)
        fs.copyFileSync(sc, path.join(dest, 'splash-content.png')) // even if we copy the jpg, we use this name. Ext doesn't matter to browser.
    }

    if(splashExpected) {
        let dirpath = path.join(projPath, '.gen')
        if(fs.existsSync(path.join(dirpath, 'pages', 'splash-page.riot'))) {
            copySplashPage(path.join(dirpath, 'pages', 'splash-page.riot'))
        }
    }
}


//------------------

function doClean() {
    trace('cleaning .gen')
    let dirpath = path.join(projPath, '.gen')
    fs.rmSync(dirpath, {recursive:true})
    trace('cleaning build')
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
    trace('enumerateFonts')
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

let firstTrace = 0
function trace(message:string, ...args:any) {
    let now = Date.now()
    if(!firstTrace) firstTrace = now
    let time = firstTrace - now
    if(verbose) console.log(ac.blue(time+' ms ')+ac.gray(message), ...args)
}