import * as fs from "fs"
import * as path from 'path'
import * as convert from 'xml-js'
import {PageInfo} from "./PageInfo";
import {writeRiotPage} from "./PageWriterRiot";
import {writeNativeScriptPage} from "./PageWriterNS";
import * as ac from "ansi-colors";


enum ParsedState {
    none,
    page,
    content,
    methods
}

function readPage(filepath:string):PageInfo {
    const info = new PageInfo()
    let state = ParsedState.none
    let content = ''

    try {
        const str = fs.readFileSync(filepath).toString()
        const lines = str.split('\n')
        for(let i = 0; i<lines.length; i++) {
            let line = lines[i]
            let cn = line.indexOf('//')
            if (cn !== -1) line = line.substring(0, cn)
            line = line.trim()
            if (!line.length) continue

            if(line.charAt(0) === '$') {
                let en = line.indexOf('(', 1)
                if (en !== -1) {
                    let mtg = line.substring(0, ++en).trim()
                    let pe = line.indexOf(')', en)
                    let pm = line.substring(en, pe)
                    let pos = str.lastIndexOf(mtg) + mtg.length
                    pos = str.indexOf('{', pos)
                    let blkend = str.indexOf('\n$', pos)
                    if (blkend === -1) blkend = str.indexOf('\n#', pos)
                    if (blkend === -1) blkend = str.length
                    blkend = str.lastIndexOf('}', blkend) + 1
                    let code = str.substring(pos, blkend).trim()
                    let name = mtg.substring(1, mtg.indexOf('(')).trim()
                    info.methods[name] = code
                    info.params[name] = pm
                    state = ParsedState.methods
                }
            }
            let wb = line.indexOf(' ')
            if(wb === -1) wb = line.length
            const word = line.substring(0, wb).toLowerCase().trim()
            if(word === '#page') {
                info.id = line.substring(wb+1).trim()
                state = ParsedState.page
            }
            else if(word === '#content') {
                state = ParsedState.content
            }
            else if(state === ParsedState.content) {
                content += line.trim()
            }
            else if (state === ParsedState.page) {
                // console.log('@@@@@@@@@@@@@@@@@ parsing word', word)
                if(word === 'no-title') {
                    info.noTitle = true
                }
                else if(word === 'no-back') {
                    info.noBack = true
                    // console.log('%%%%%%%%%%%%% noBack set to true ', info)
                } else {
                    let parts = line.split('=',2)
                    let key = (parts[0] ||'').trim()
                    let value = stripQuotes((parts[1] || '').trim())

                    if(key === 'title') info.title = value
                    if(key === 'menu-id') info.menuId = value
                    if(key === 'toolbar-id') info.toolbarId = value
                    if(key === 'indicators-id') info.indicatorsId = value

                    if(key === "orientationReload") {
                        info.orientationReload = (value === 'true')
                    }
                }
            }
            try {
                info.content = convert.xml2js(content, {compact: false})
            } catch(e) {
                const pageName = filepath.substring(filepath.lastIndexOf('/')+1)
                console.error(ac.bold.red('Error reading page ')+pageName+' at line '+(i+1)+":", e.message)
                console.log(ac.bold.italic('offending line: ')+ac.bold.blue(line[i]))
                throw Error()
            }
        }
    } catch(e) {
        console.error(e)
    }
    return info
}

function stripQuotes(str:string) {
    let q = str.charAt(0)
    if(str.charAt(str.length-1) === q && q === '"' || q === "'") {
        str = str.substring(1, str.length-1)
    }
    return str
}

/**
 * Enumerate all the component files and read them into info blocks
 * then export them as the desired type
 * @param dirpath
 * @param outType
 */
export function enumerateAndConvert(dirpath:string, outType:string, outDir:string) {
    const files = fs.readdirSync(dirpath)
    let errs = 0;
    files.forEach(file => {
        if(file.match(/.tbpg?$/)) {
            // console.log('reading page from ', file)
            const info = readPage(path.join(dirpath, file))
            let fileout = path.join(outDir, file.substring(0, file.lastIndexOf('.')))

            let checkId = file.substring(0, file.indexOf('-page'))
            if(checkId !== info.id) {
                console.warn(ac.bold.yellow.bgBlack(`WARNING:  File name is ${file} but page ID is ${info.id}`))
                errs++
            }

            if(outType === 'riot') {
                fileout += '.riot'
                writeRiotPage(info,fileout)
            } else {
                // console.log('about to write', file, info.id)
                writeNativeScriptPage(info, dirpath, outDir)
            }
        } else {
            let subdir = path.join(dirpath, file)
            let stat = fs.lstatSync(subdir)
            if(stat.isDirectory()) {
                enumerateAndConvert(subdir, outType, path.join(outDir, file))
            }
        }
    })
    if(errs) {
        console.error(ac.bold.red('Please fix errors listed above before continuing'))
        process.exit(-1)
    }
}
