
/**
 Collect source map info from bundle.js.map and re-write it as smx-info.js so we can use it in our source mapping
 */

import * as ac from "ansi-colors";
import * as path from 'path'
import * as fs from 'fs'
import {gatherInfo} from "./gatherInfo";
// import * as smCodec from 'sourcemap-codec'
// import * as base64 from 'base-64'

// all I really need from here is mappings

export function createSMX() {
    // const smxData = {}
    const info = gatherInfo()
    const mapPath = path.resolve(path.join(info.buildPath, 'bundle.js.map'))
    if(!fs.existsSync(mapPath)) {
        console.error(ac.red('No bundle source map exists!'))
        throw Error()
    }
    let mapInfo
    try {
        const content = fs.readFileSync(mapPath).toString()
        mapInfo = JSON.parse(content)
    } catch(e) {
        console.error(ac.red('Unable to read bundle map data'))
        throw e
    }
    // const sources = mapInfo.sources
    // const decoded = smCodec.decode(mapInfo.mappings)
    // // console.log('decoded', decoded)
    // for(let n=0; n< decoded.length; n++) {
    //     const mappings = decoded[n]
    //     for(let i=0; i<mappings.length; i++) {
    //         const map = mappings[i]
    //         let cfile = sources[map[1]]
    //         if(cfile) {
    //             cfile = cfile.substring(cfile.lastIndexOf('/') + 1)
    //             // if (!smxData[cfile]) {
    //             //     smxData[cfile] = mapInfo.mappings
    //             // }
    //         }
    //     }
    // }
    try {
        const smxData = { "bundle.js": {mappings: mapInfo.mappings, sources:mapInfo.sources} }

        const contents = '_smxInfo = ' + JSON.stringify(smxData)
        const smxInfoPath = path.resolve(path.join(info.buildPath, 'smx-info.js'))
        fs.writeFileSync(smxInfoPath, contents)
    } catch(e) {
        console.error(ac.red('Unable to write source map info'))
        throw e
    }
    console.log('smx-info created')

}