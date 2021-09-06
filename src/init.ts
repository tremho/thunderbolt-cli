import * as ac from "ansi-colors";
import fs from 'fs'
import path from 'path'
import {executeCommand} from "./execCmd";
import {hyphenate} from "./tbFiles/CaseUtils"
import {shortFromDisplay} from "./tbFiles/MetadataMover"

const readlineSync = require("readline-sync")

const spinner = require('text-spinner')({
    interval: 100,
    prefix: '\x1B[10G'
})

let dirPath
let pkgJson:any = {}

export function doInit(args:string[]) {
    let dirName = args[0] || ''
    if(dirName) {
        dirPath = path.resolve(dirName)
        console.log('go to or make ', dirPath)
        if ( fs.existsSync(dirPath) ) {
            process.chdir(dirPath)
            if(!readlineSync.keyInYN('init a Jove project at '+dirPath)) {
                console.log('no action taken')
                return;
            }

        } else {
            fs.mkdirSync(dirPath)
        }
    } else {
        dirPath = process.cwd()
        console.log('make in current directory', dirPath)
    }
// read existing package.json
    try {
        const contents = fs.readFileSync('package.json').toString()
        pkgJson = JSON.parse(contents)
        if(!readlineSync.keyInYN('There is an existing project here. Continue?')) {
            console.log('no action taken')
            return;
        }
    } catch(e) {
        console.log('no existing package.json')
    }


    const newPkg = createPackageJSON(pkgJson)
    console.log('\n\n\n');
    pkgJson = Object.assign(pkgJson, newPkg)

// write package.json
    fs.writeFileSync('package.json', JSON.stringify(pkgJson, null, 2))
    createTSConfig()
// make dirs
    fs.mkdirSync('src/pages', {recursive:true})
    fs.mkdirSync('src/assets', {recursive:true})
    fs.mkdirSync('src/scss', {recursive:true})
// stubs for tbAppBack.ts and tbAppFront.ts if they do not exist
    makeAppStubs()
// stub main page?
    makeMainPageStub()

    spinner.start()
    executeCommand('npm install', ['--force']).then((rt:any) => {
        spinner.stop()
        if(rt.code) {
            console.error(ac.bold.red('error '+rt.code))
            console.error(ac.red("Jove Initializaiton failed on NPM Install:"))
            console.error(ac.black.dim(rt.errStr))
            console.error('while...')
            console.error(ac.green.dim(rt.stdStr))
        } else {
            console.log(ac.green.bold(`${pkgJson.displayName} is ready`))
            console.log(ac.blue("type tbx run to run the empty stub project"))
            console.log(ac.gray('then add your own code to complete the app'))
        }
    })

}

function ask(desc:string, query:string, def:string) {
    console.log(ac.dim.blue.italic(desc))
    let answer = readlineSync.question(ac.bold.green(query) + ac.dim.grey(` [${def}] `)+ '? ')
    if(!answer) answer = def
    return answer
}

function createPackageJSON(oldPkg:any) {
    let modname = process.cwd()
    modname = hyphenate(modname.substring(modname.lastIndexOf(path.sep) + 1))

    let name = ask('Enter a name for this project module (customary to be name of folder, lower-case only', 'name', oldPkg.name || modname)
    let displayName = ask('Enter the displayable full name for this application', 'displayName', oldPkg.displayName || name)
    let shortDisplayName = shortFromDisplay(displayName)
    shortDisplayName = ask('Enter the short version (app icon) name ', 'shortDisplayName', oldPkg.shortDisplayName || shortDisplayName)
    let description = ask('Enter a brief description of this application (about box)', 'description', oldPkg.description || '')
    let randId = Math.floor(Math.random() * 10000)
    let projId = ask('Enter a project Id (reverse domain form, e.g. "com.mydomain.myapp")', 'projId', oldPkg.projId || 'joveapp.'+randId)
    let author = ask('Enter your author name (e.g. github account name) (about box)', 'author', oldPkg.author || '')
    let copyright = ask('Enter any copyright information (about box)', 'copyright', oldPkg.copyright || '')
    let license = ask('Enter a license type code (e.g. MIT)', 'license', oldPkg.licence || 'NONE')


    // TODO: keep jove versions named here in sync with tbns-template also.

    const pkgJson = {
        name,
        projId,
        displayName,
        shortDisplayName,
        description,
        copyright,
        author,
        license,
        backMain: oldPkg.backMain || 'src/tbAppBack.ts',
        frontMain: oldPkg.frontMain || 'src/tbAppFront.ts',
        scripts: {
            postinstall: "npm run initDesktop && npm run initCli",
            initDesktop: "cd node_modules/@tremho/jove-desktop && npm install",
            initCli: "cd node_modules/@tremho/jove-cli && npm install",
            test: "echo \"Error: no test specified\" && exit 1",
            "run": "tsc && node build/index.js" // temp during bootstrapping

        },
        dependencies: {
            "@tremho/jove-common": "^0.6.9-pre-release",
            "@tremho/jove-desktop": "^0.6.9-pre-release",
            "awesome-typescript-loader": "^5.2.1",
            "css-element-queries": "^1.2.3",
            "riot": "^5.3.3",
            "sourcemap-codec": "^1.4.8"
        },
        devDependencies: {
            "@tremho/jove-cli": "^0.6.9-pre-release",
            "electron-builder": "^22.11.7",
            "readline-sync": "^1.4.10",
            "typescript": "^4.3.5",
            "webpack": "^4.46.0"
        }

    }
    return pkgJson
}

function createTSConfig() {
    const tsconf = `
{
  "compilerOptions": {
    "outDir": "./build",
    "allowJs": true,
    "target": "ES2015",  
    "module": "commonjs",
    "sourceMap": true,
    "lib": [
      "dom",
      "es2015",
      "scripthost",
      "es2015.proxy"
    ],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true 
  },
  "exclude": [
    "./node_modules/"
  ],
  "include": [
    "**/*.ts"
  ]
} 
`
    fs.writeFileSync('tsconfig.json', tsconf)
}

function makeAppStubs() {
    let front, back
    let backMain = pkgJson.backMain || 'src/tbAppBack.ts'
    if(fs.existsSync(backMain)) {
        console.log(ac.gray.dim.italic(backMain+' already exists'))
        back = true
    }
    let frontMain = pkgJson.frontMain || 'src/tbAppFront.ts'
    if(fs.existsSync(frontMain)) {
        console.log(ac.gray.dim.italic(frontMain+' already exists'))
        front = true
    }

    if(!front) {
        const appFront = `

/* Render-process application start module */
        
export function appStart(appContext:any) {
    console.log("${pkgJson.displayName} app has started")
    
    // add your startup code here
}        
`
        fs.writeFileSync(frontMain, appFront)
    }
    if(!back) {
        const appBack = `

/* This is the start module that kicks off the double-sided application
In an Electron app, this forms the body of the 'main' Node process of the application.
Any extension APIs that run in the Node process must be registered here.

In a Nativescript export, this will become the startup bootstrap and API extension gateway.

*/

import {targetPlatform} from '@tremho/jove-desktop'
import {registerApp, TBBackApp, FrameworkBackContext} from "@tremho/jove-common"

class TBTestApp implements TBBackApp {

    appStart(context: FrameworkBackContext) {
        console.log('Back App Start called', Date.now())

        // put your back processes startup code here
        // register any extensions at this point
    }

    appExit(context: FrameworkBackContext) {
        console.log('Back App Exit called')
    }
}

const ourApp = new TBTestApp()
registerApp(targetPlatform, ourApp)
`
        fs.writeFileSync(backMain, appBack)
    }
}

function makeMainPageStub() {
    if(fs.existsSync('src/pages/main-page.tbpg')) {
        console.log(ac.gray.dim.italic('main-page exists'))
        return
    }
    const tbpg = `
#page main
title='Main Page'

#content
    <simple-label text="Hello, World!"/>        
`
    const logic = `

/* application code for main-page */
    
export function pageStart(app:any) {
    console.log('main page started')
}        
`
    fs.writeFileSync('src/pages/main-page.tbpg', tbpg)
    fs.writeFileSync('src/pages/main-page.ts', logic)
}


