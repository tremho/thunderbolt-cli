import * as process from "process";
import * as ac from "ansi-colors";
import * as path from "path";
import * as fs from "fs";
import * as os from "os"

// Variables resolved and used in build functions
let jovePath:string,  // path to the jove script itself. This establishes where framework is within project node_modules space.
    packPath:string, // path to directory in framework that holds the sources for the app bootstrap
    projPath:string, // path to the project
    buildPath:string, // path to the project build directory space
    modulesPath:string, // path to the node_modules of the framework in the project
    fwCommonPath:string, // path to framework module in node_modules
    fwDesktopPath:string, // path to desktop framework module in node_modules
    fwMobilePath:string, // path to mobile framework module in node_modules
    fwCliPath:string, // path to jove command line module
    tbBuildSrc:string, // path to the framework 'src' folder
    fwcomp:string,  // path to the framework components folder tree
    appPages:string, // path to the app's pages folder
    riotMain:string, // path where app.riot is found
    electronExecPath:string, // execution path for electron, relative to project
    projName:string, // name of project from project package.json file
    projVersion:string, // version of project from project package.json file
    projDesc:string, // description of project from project package.json file
    projId:string, // the appid reverse dot.com format identifier for app publication
    displayName:string,
    copyright: string,
    author: string,
    frontMain:string, // name of entry module for the app Renderer code, from project package.json file or default (joveAppFront.ts)
    backMain:string,  // name of entry module for the app Back (node) process code, fom project package.json file or default (joveAppBack.ts)
    clean: boolean, // true if we should remove any intermediate artifacts first
    prepare:boolean, // true if we should create intermediate files from sources
    compile: boolean, // true if we should compile and bundle with webpack
    verbose:boolean = false

/**
 * Determine values of the path variables
 */
function resolvePaths() {
    // console.log('paths = ', process.argv)
    clean = false
    prepare = compile = true
    jovePath = process.argv[1]
    let cmd = process.argv[2]
    if(cmd === 'build' || cmd === 'run') {
        let i = 3
        while(process.argv[i]) {
            let val = process.argv[i].trim()
            if(val === '--prepare') {
                compile = false
            }
            else if(val === '--compile') {
                prepare = false
            }
            else if(val === '--clean') {
                clean = true
            }
            else if(val === '--clean-only') {
                clean = true
                compile = prepare = false
            }
            else if(val) {
                projPath = val
            }
            i++
        }
        if(!compile && !prepare && !clean) {
            compile = prepare = true
        }
    }

    projPath = path.resolve(projPath || '.')

    modulesPath = path.resolve(path.join(projPath, 'node_modules'))
    fwCommonPath = path.resolve(path.join(modulesPath, '@tremho', 'jove-common'))
    fwDesktopPath = path.resolve(path.join(modulesPath, '@tremho', 'jove-desktop'))
    fwMobilePath = path.resolve(path.join(modulesPath, '@tremho', 'jove-mobile'))
    fwCliPath = path.resolve(path.join(modulesPath, '@tremho', 'jove-cli'))

    // console.log('jovePath', jovePath)
    // console.log('cmd', cmd)
    // console.log('projPath',projPath)
    //
    // console.log('modulesPath', modulesPath)
    // console.log('fwCommonPath', fwCommonPath)
    // console.log('fwDesktopPath', fwDesktopPath)
    // console.log('fwMobilePath', fwMobilePath)
    // console.log('fwCliPath', fwCliPath)

    if(!fs.existsSync(fwCommonPath)) {
        console.warn('fwCommonPath', fwCommonPath)
        fwCommonPath = ''
    }
    if(!fs.existsSync(fwDesktopPath)) {
        console.warn('fwDesktopPath', fwDesktopPath)
        fwDesktopPath = ''
    }
    if(!fs.existsSync(fwMobilePath)) {
        // console.log('fwMobilePath', fwMobilePath)
        fwMobilePath = ''
    }
    if(!fs.existsSync(fwCliPath)) {
        console.log('fwCliPath', fwCliPath)
        fwCliPath = ''
    }

    if(!fwCommonPath || !fwDesktopPath || !fwCliPath) {
        let line1 = ac.red('missing Jove framework modules\n')
        let line2 = ac.blue('@tremho/jove-common ')+ac.gray(', ')+ac.blue('@tremho/jove-desktop ')+ac.gray('and ')+ac.blue('@tremho/jove-cli\n')
        let line3 = 'all three must be installed\n'
        let line4 = `try ${ac.bold('npm install')} to re-install standard set, or\n`
        let line5 = `use ${ac.bold('npm install @tremho/jove-common @tremho/jove-desktop @tremho/jove-cli')} to install these dependencies.`
        console.error(line1+line2+line3+line4+line5)
        throw Error('import error')
    }

    packPath = path.resolve(path.join(fwDesktopPath, 'buildPack'))

    buildPath = path.resolve(path.join(projPath, 'build', 'front'))
    // distPath = path.join(projPath, 'dist', 'front')

    tbBuildSrc = path.resolve(path.join(fwCommonPath, 'build'))
    fwcomp = path.resolve(path.join(fwDesktopPath, 'src', 'components'))
    appPages = path.resolve(path.join(projPath, 'src', 'pages'))
    riotMain = path.resolve(path.join(projPath, '.gen')) // now in the .gen folder

    if(os.platform() === 'darwin') {
        electronExecPath = path.join(fwDesktopPath, 'node_modules', 'electron',
            'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
    }
    else if(os.platform() === 'win32') {
        electronExecPath = path.join(fwDesktopPath, 'node_modules', 'electron', 'dist', 'electron.exe')
    } else {
        // assume linux-like
        electronExecPath = path.join(fwDesktopPath, 'node_modules', 'electron', 'dist', 'electron')
    }


    if(verbose) {
        console.log('jovePath = ', jovePath)
        console.log('projPath = ', projPath)
        console.log('modulesPath = ', modulesPath)
        console.log('fwCommonPath', fwCommonPath)
        console.log('fwDesktopPath', fwDesktopPath)
        console.log('packPath = ', packPath)
        console.log('buildPath = ', buildPath)
        console.log('tbBuildSrc = ', tbBuildSrc)
        console.log('appPages = ', appPages)
        console.log('riotMain = ', riotMain)
        console.log('fwcomp = ', fwcomp)
    }
}

function readPackageInfoAtPath(directory:string):any {
    const pkgFile = path.join(directory, 'package.json')
    if(!fs.existsSync(pkgFile)) {
        console.error(ac.red(`no package.json info found at ${pkgFile}`))
        throw Error()
    }
    const contents = fs.readFileSync(pkgFile).toString()
    const pkgJson = JSON.parse(contents)

    // TODO: validate key aspects of the package.json file
    // including existence of referenced files (appback, front)

    return pkgJson
}

/**
 * Get key info from project package.json
 * including custom tags
 */
function getPackageJSONInfo() {
    const pkgJson = readPackageInfoAtPath(projPath)
    projName = pkgJson.name || 'jove-app'
    projVersion = pkgJson.version || "1.0.0"
    backMain = pkgJson.backMain || 'backMain.js'
    frontMain = pkgJson.frontMain || 'frontMain.js'
    projDesc = pkgJson.description || ''
    projId = pkgJson.projId || (pkgJson.build && pkgJson.build.appId) || ''
    displayName = pkgJson.displayName || projName
    copyright = pkgJson.copyright || (pkgJson.build && pkgJson.build.copyright) || ''
    author = pkgJson.author || ''

    backMain = backMain.replace(/\//g, path.sep).replace(/\\/g, path.sep)
    frontMain = frontMain.replace(/\//g, path.sep).replace(/\\/g, path.sep)

    // console.log('project name = ', projName)
    // console.log('version = ', projVersion)
    // console.log('backMain = ', backMain)
    // console.log('frontMain = ', frontMain)
}

export function gatherInfo() {
    resolvePaths()
    getPackageJSONInfo()

    return {
        jovePath,  // path to the jove script itself. This establishes where framework is within project node_modules space.
        packPath, // path to directory in framework that holds the sources for the app bootstrap
        projPath, // path to the project
        buildPath, // path to the project build directory space
        fwCommonPath,
        fwDesktopPath,
        fwMobilePath,
        // distPath,  // path to the project build space for publishing NOT CURRENTL USED
        modulesPath, // path to the node_modules of the framework in the project
        tbBuildSrc, // path to the framework 'src' folder
        fwcomp,  // path to the framework components folder tree
        appPages, // path to the app's pages folder
        riotMain, // path where app.riot is found
        electronExecPath, // execution path for electron, relative to project
        projName, // name of project from project package.json file
        projVersion, // version of project from project package.json file
        projDesc, // description of project from project package.json file
        projId, // the appid reverse dot.com format identifier for app publication
        displayName,
        copyright,
        author,
        frontMain, // name of entry module for the app Renderer code, from project package.json file or default (joveAppFront.ts)
        backMain,  // name of entry module for the app Back (node) process code, fom project package.json file or default (joveAppBack.ts)
        buildFlags: {
            clean,
            prepare,
            compile
        }
    }
}