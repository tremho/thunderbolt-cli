
import * as ac from "ansi-colors";
import fs from "fs";

export function doDist(args:string[]) {
    console.log('doing dist with args', args)

    // read package.json
    const pkgJson = readPackageJSON()
    // append build info
    appendBuildInfo(pkgJson)
    // rename package.json app-package.json
    fs.renameSync('package.json', 'app-package.json')
    // write out data as package.json
    fs.writeFileSync('package.json', JSON.stringify(pkgJson, null, 2))
    // execute electron builder
    makeDistribution().then(() => {
        // rename package.json dist-package.json
        fs.renameSync('package.json', 'dist-package.json')
        // rename app-package.json package.json
        fs.renameSync('app-package.json', 'package.json')

        console.log(ac.bold.green('dist package created'))
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

function appendBuildInfo(pkgJson:any):any {
    const build = {
        appId: pkgJson.projId,
        copyright: pkgJson.copyright,
        electronVersion: electronVersion,
        mac: pkgJson.macOS,
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
        files: [
            {
                filter: "package.json",
                from: ".",
                to: "."
            }
        ],
        extraMetadata: {
            main: "tbAppBack.js"
        }
    }
    const buildFiles = fs.readdirSync('build')
    for(let f of buildFiles) {
        if(f !== pkgJson.name) {
            const st = fs.lstatSync(f)
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
}

function makeDistribution() {
    return new Promise(resolve => {
        console.log('pretending to make distribution...')
        setTimeout(resolve, 1000)
    })
}