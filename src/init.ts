import * as ac from "ansi-colors";
import fs from 'fs'
import path from 'path'
import {executeCommand} from "./execCmd";
import {hyphenate} from "./tbFiles/CaseUtils"
import {shortFromDisplay} from "./tbFiles/MetadataMover"
import is from "@sindresorhus/is";

const readlineSync = require("readline-sync")

const spinner = require('text-spinner')({
    interval: 100,
    prefix: '\x1B[10G'
})

let dirPath:string
let pkgJson:any = {}

let repoName: string
let isRepoPrivate:any // boolean

export async function doInit(args:string[]) {
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
            process.chdir(dirPath)
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

    const newPkg = await createPackageJSON(pkgJson)
    console.log('\n\n\n');
    pkgJson = Object.assign(pkgJson, newPkg)

// write package.json
    fs.writeFileSync('package.json', JSON.stringify(pkgJson, null, 2))
    createTSConfig()
// make dirs
    fs.mkdirSync('src/pages', {recursive:true})
    fs.mkdirSync('src/assets', {recursive:true})
    fs.mkdirSync('src/scss', {recursive:true})
// stubs for joveAppBack.ts and joveAppFront.ts if they do not exist
    makeAppStubs()
// stub main page?
    makeMainPageStub()

    spinner.start()
    executeCommand('npm install', ['--force']).then((rt:any) => {
        spinner.stop()
        if(rt.code) {
            console.error(ac.bold.red('error '+rt.code))
            console.error(ac.red("Jove Initialization failed on NPM Install:"))
            console.error(ac.black.dim(rt.errStr))
            console.error('while...')
            console.error(ac.green.dim(rt.stdStr))
        } else {
            let p
            if(repoName) {
                console.log(">> going to make repo named", repoName)
                p = checkGH().then((haveGH:boolean) => {
                    console.log('>> haveGH', haveGH)
                    if(!haveGH) {
                        console.error(ac.red.bold('Unable to create repository -- gh command is not available'))
                        console.log(ac.blue('please visit https://cli.github.com and install this GitHub command line utility to allow this feature in the future'))
                        console.log(ac.green('for this project, please create the repository on GitHub and add the files manually'))
                        return;
                    }
                    return makeProjectRepository(repoName, isRepoPrivate)
                })
            }
            Promise.resolve(p).then(() => {
                console.log(">> all that is done, and here we are...")
                console.log(ac.green.bold(`${pkgJson.displayName} is ready`))
                console.log(ac.blue("go to the directory")+' '+ac.gray(dirPath))
                console.log(ac.blue("type jove run to run the empty stub project"))
                console.log(ac.gray('then add your own code to complete the app'))
            })
        }
    })

}

function ask(desc:string, query:string, def:string) {
    console.log(ac.dim.blue.italic(desc))
    let answer = readlineSync.question(ac.bold.green(query) + ac.dim.grey(` [${def}] `)+ '? ')
    if(!answer) answer = def
    return answer
}

function gitName() {
    return executeCommand('git', ['config', '--get', 'user.name']).then(rt => {
        let name = ''
        if(rt.code) {
            console.error('Error '+rt.code, rt.errStr)
        } else {
            name = rt.stdStr.trim().toLowerCase()
        }
        return name
    })
}

async function createPackageJSON(oldPkg:any) {
    let modname = process.cwd()
    modname = hyphenate(modname.substring(modname.lastIndexOf(path.sep) + 1))

    let name = ask('Enter a name for this project module (customary to be name of folder, lower-case only', 'name', oldPkg.name || modname)
    let displayName = ask('Enter the displayable full name for this application', 'displayName', oldPkg.displayName || name)
    let shortDisplayName = shortFromDisplay(displayName)
    shortDisplayName = ask('Enter the short version (app icon) name ', 'shortDisplayName', oldPkg.shortDisplayName || shortDisplayName)
    let description = ask('Enter a brief description of this application (about box)', 'description', oldPkg.description || '')
    let genId = 'app.jove.'+ (shortDisplayName.replace(/[\-_"'!@#\$%\^\&\*\(\):;\+=`~]/g, ''))
    let projId = ask('Enter a project Id (reverse domain form, e.g. "com.mydomain.myapp")', 'projId', oldPkg.projId || genId)
    let gitAuthor = await gitName()
    let author = ask('Enter your author name (e.g. github account name) (about box)', 'author', oldPkg.author || gitAuthor)
    let defCopy = "© "+new Date().getFullYear()+" "+author+". All Rights Reserved"
    let copyright = ask('Enter any copyright information (about box)', 'copyright', oldPkg.copyright || defCopy)
    let license = ask('Enter a license type SPDX code (e.g. MIT)', 'license', oldPkg.licence || 'UNLICENSED')

    if(gitAuthor) {
        let makeRepo = ask(`Create a GitHub repository for this project under user ${gitAuthor}?`, 'y/n', 'yes')
        makeRepo = makeRepo.toLowerCase()
        makeRepo = (makeRepo === 'y' || makeRepo === 'yes')
        if(makeRepo) {
            repoName = ask(`Name for the repository`, `repo name`, name)
            isRepoPrivate = ask('Is this a private repository?', 'y/n', 'no')
            isRepoPrivate = isRepoPrivate.toLowerCase()
            isRepoPrivate = (isRepoPrivate === 'y' || isRepoPrivate === 'yes')
        }
    }


    // TODO: keep jove versions named here in sync with tbns-template also....

    const pkgJson = {
        name,
        projId,
        displayName,
        shortDisplayName,
        description,
        copyright,
        author,
        license,
        backMain: oldPkg.backMain || 'src/joveAppBack.ts',
        frontMain: oldPkg.frontMain || 'src/joveAppFront.ts',
        scripts: {
            postinstall: "npm run initDesktop && npm run initCli && npm run tscinst && mkdir -p src/assets; mkdir -p src/scss",
            tscinst: "run-script-os",
            "tscinst:nix": "which tsc || npm install -g typescript",
            "tscinst:windows": "where.exe tsc || npm install -g typescript",
            initDesktop: "cd node_modules/@tremho/jove-desktop && npm install && cd buildPack && npm install",
            initCli: "cd node_modules/@tremho/jove-cli && npm install",
            test: "echo \"Error: no test specified\" && exit 1"
        },
        dependencies: {
            "@tremho/jove-common": "^0.6.9-pre-release",
            "@tremho/jove-desktop": "^0.6.9-pre-release",
            "css-element-queries": "^1.2.3",
            "riot": "^5.3.3",
            "sourcemap-codec": "^1.4.8"
        },
        devDependencies: {
            "@tremho/jove-cli": "^0.6.9-pre-release",
            "electron-builder": "^22.11.7",
            "readline-sync": "^1.4.10",
            "run-script-os": "^1.1.6",
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
    let backMain = pkgJson.backMain || 'src/joveAppBack.ts'
    if(fs.existsSync(backMain)) {
        console.log(ac.gray.dim.italic(backMain+' already exists'))
        back = true
    }
    let frontMain = pkgJson.frontMain || 'src/joveAppFront.ts'
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
    if(fs.existsSync('src/pages/main-page.jvpg')) {
        console.log(ac.gray.dim.italic('main-page exists'))
        return
    }
    const jvpg = `
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
    fs.writeFileSync('src/pages/main-page.jvpg', jvpg)
    fs.writeFileSync('src/pages/main-page.ts', logic)
}

function checkGH() {
    return executeCommand('gh', ['--version']).then((rt:any) => {
        if(rt.code) {
            console.error(ac.dim.red.italic('gh not not found '+rt.code))
        }
        return true
    })
}

function makeProjectRepository(repoName:string, isPrivate:boolean):Promise<void> {
    return new Promise(resolve => {

        console.log(">> makeProjectRepository...")

        executeCommand('git', ['init']).then((rt:any) => {
            console.log('git init returns', rt.code)
            if(rt.code) {
                console.error(ac.red.bold('Error: Failed to create GitHub repository!'))
                console.error(ac.red('  git init failed with code '+rt.code))
                return resolve()
            }
            try {
                let gitignore = '.gen\n' +
                    'build/\n' +
                    'node_modules/\n' +
                    'package-lock.json\n' +
                    '.nyc_output\n' +
                    '**/.DS_Store\n' +
                    'report/jan-*\n' +
                    'report/feb-*\n' +
                    'report/mar-*\n' +
                    'report/apr-*\n' +
                    'report/may-*\n' +
                    'report/jun-*\n' +
                    'report/jul-*\n' +
                    'report/aug-*\n' +
                    'report/sep-*\n' +
                    'report/oct-*\n' +
                    'report/nov-*\n' +
                    'report/dec-*\n' +
                    'report/latest'

                console.log(">> Writing .gitignore")
                fs.writeFileSync('.gitignore', gitignore)

                let readme = `# ${pkgJson.displayName}\n` +
                    `a [Jove](https://tremho.com) creation by ${pkgJson.author}\n\n ` +
                    `${pkgJson.description}\n` +
                    `${pkgJson.copyright}\n` +
                    `${pkgJson.license}\n`

                console.log(">> Writing README.md")
                fs.writeFileSync('README.md', readme)
            }
            catch(e:any) {
                console.error(ac.red.bold('Error: Failed to create GitHub repository!'))
                console.error(ac.red('  failure to write .gitignore and/or README.md files '+e.toString()))
                return resolve()
            }
            console.log(">> Adding all files")
            executeCommand('git', ['add', '.']).then((rt:any) => {
                console.log(">> return is", rt.code)
                if (rt.code) {
                    console.error(ac.red.bold('Error: Failed to create GitHub repository!'))
                    console.error(ac.red('  git add failed with code ' + rt.code))
                    return resolve()
                }
                console.log(">> making repo at github")
                makeRepoAtGitHub(repoName, isPrivate).then((d:any) => {
                    executeCommand('git', ['push', '-u', 'origin', 'main']).then((rt:any)=> {
                        if (rt.code) {
                            console.error(ac.red.bold('Error: Failed to create GitHub repository!'))
                            console.error(ac.red('  git push failed with code ' + rt.code))
                            return resolve()
                        }

                    })
                    resolve()
                })
            })
        })
    })
}

function makeRepoAtGitHub(repoName:string, isPrivate:boolean) {

    let desc = pkgJson.description || `Jove app ${pkgJson.displayName}`
    let lic = pkgJson.license || 'UNLICENSED'
    let access = isPrivate ? '--private' : '--public'

    console.log('>> ...creating GitHub repository '+repoName)
    return executeCommand('gh', ['repo', 'create', repoName, access, '--description', desc, '--license', lic], '', true)

}