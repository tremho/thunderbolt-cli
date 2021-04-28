import * as process from "process";
import * as ac from "ansi-colors";
import * as path from "path";
import * as fs from "fs";

// Variables resolved and used in build functions
let tbxPath:string,  // path to the tbx script itself. This establishes where framework is within project node_modules space.
    packPath:string, // path to directory in framework that holds the sources for the app bootstrap
    projPath:string, // path to the project
    buildPath:string, // path to the project build directory space
    modulesPath:string, // path to the node_modules of the framework in the project
    fwCommonPath:string, // path to framework module in node_modules
    fwDesktopPath:string, // path to desktop framework module in node_modules
    fwMobilePath:string, // path to mobile framework module in node_modules
    tbBuildSrc:string, // path to the framework 'src' folder
    fwcomp:string,  // path to the framework components folder tree
    appPages:string, // path to the app's pages folder
    riotMain:string, // path where app.riot is found
    electronExecPath:string, // execution path for electron, relative to project
    projName:string, // name of project from project package.json file
    projVersion:string, // version of project from project package.json file
    projDesc:string, // description of project from project package.json file
    projId:string, // the appid reverse dot.com format identifier for app publication
    frontMain:string, // name of entry module for the app Renderer code, from project package.json file or default (tbAppFront.ts)
    backMain:string  // name of entry module for the app Back (node) process code, fom project package.json file or default (tbAppBack.ts)


/**
 * Determine values of the path variables
 */
function resolvePaths() {
    console.log('paths = ', process.argv)
    tbxPath = process.argv[1]
    let cmd = process.argv[2]
    projPath = path.resolve(process.argv[3])

    modulesPath = path.join(projPath, 'node_modules')
    fwCommonPath = path.join(modulesPath, 'thunderbolt-common')
    fwDesktopPath = path.join(modulesPath, 'thunderbolt-desktop')
    fwMobilePath = path.join(modulesPath, 'thunderbolt-mobile')

    console.log('tbxPath', tbxPath)
    console.log('cmd', cmd)
    console.log('projPath',projPath)

    console.log('modulesPath', modulesPath)
    console.log('fwCommonPath', fwCommonPath)
    console.log('fwDesktopPath', fwDesktopPath)
    console.log('fwMobilePath', fwMobilePath)

    if(!fs.existsSync(fwCommonPath)) fwCommonPath = ''
    if(!fs.existsSync(fwDesktopPath)) fwDesktopPath = ''
    if(!fs.existsSync(fwMobilePath)) fwMobilePath = ''

    // TODO: read package.info and validate we have an id.
    // also validate we have an appback file and a pages directory

    if(!fwCommonPath || !fwDesktopPath) {
        let line1 = ac.red('mising framework modules\n')
        let line2 = ac.blue('thunderbolt-common ')+ac.gray('and/or ')+ac.blue('thunderbolt-desktop\n')
        let line3 = 'both must be installed\n'
        let line4 = `use ${ac.bold('npm install thunderbolt-common thunderbolt-desktop')} to install these dependencies.`
        console.error(line1+line2+line3+line4)
        throw Error('import error')
    }

    packPath = path.join(fwDesktopPath, 'buildPack')

    buildPath = path.join(projPath, 'build', 'front')
    // distPath = path.join(projPath, 'dist', 'front')

    tbBuildSrc = path.resolve(path.join(packPath, '..', 'build', 'src'))
    fwcomp = path.resolve(path.join(packPath, '..', 'src', 'components'))
    appPages = path.resolve(path.join(projPath, 'src', 'pages'))
    riotMain = path.resolve(path.join(fwcomp, 'global', 'main'))

    electronExecPath = path.join(fwDesktopPath, 'node_modules', 'electron',
        'dist', 'Electron.app', 'Contents','MacOS', 'Electron')


    console.log('tbxPath = ', tbxPath)
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

function readPackageInfoAtPath(directory:string):any {
    const pkgFile = path.join(directory, 'package.json')
    if(!fs.existsSync(pkgFile)) {
        console.error(ac.red(`no package.json info found at ${pkgFile}`))
        throw Error()
    }
    const contents = fs.readFileSync(pkgFile).toString()
    const pkgJson = JSON.parse(contents)
    return pkgJson
}

/**
 * Get key info from project package.json
 * including custom tags
 */
function getPackageJSONInfo() {
    const pkgJson = readPackageInfoAtPath(projPath)
    projName = pkgJson.name || 'tbApp'
    projVersion = pkgJson.version || "1.0.0"
    backMain = pkgJson.backMain || 'backMain.js'
    frontMain = pkgJson.frontMain || 'frontMain.js'
    projDesc = pkgJson.description || ''
    projId = pkgJson.projId || ''

    console.log('project name = ', projName)
    console.log('version = ', projVersion)
    console.log('backMain = ', backMain)
    console.log('frontMain = ', frontMain)
}

export function gatherInfo() {
    resolvePaths()
    getPackageJSONInfo()

    return {
        tbxPath,  // path to the tbx script itself. This establishes where framework is within project node_modules space.
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
        frontMain, // name of entry module for the app Renderer code, from project package.json file or default (tbAppFront.ts)
        backMain  // name of entry module for the app Back (node) process code, fom project package.json file or default (tbAppBack.ts)
    }
}