/*
enumerate and read jvc/ jvcm files from 'components' directory into data ready for export
 */

import * as fs from "fs"
import * as path from 'path'
import * as convert from 'xml-js'
import * as ac from 'ansi-colors'
import {ComponentInfo} from "./ComponentInfo";
import {writeRiotFile} from "./ComponentWriterRiot";
import {writeNativeScriptFile} from "./ComponentWriterNS";
import {pascalCase} from "./CaseUtils";


/**
 * N.B. 5/24/21 -- COMPACT IS TRUE
 * Originally coded with js/xml convert using option compact:true, but then changed to compact:false because similar
 * treatment for pages was not keeping the correct ordering of multiple mixed elements, so everything got changed to
 * compact:false, which solved the page problem, but caused component conversion (Nativescript) to fail because
 * the code there interprets the format directly.
 * So because of that compact:true is in effect again for components (but not pages)
 */

enum ParsedState {
    none,
    component,
    bind,
    layout,
    methods,
    beforeLayout,
    afterLayout,
    style,
}

/**
 * Read the component common file and ingest it into an info object
 * @param filepath
 */
function readComponent(filepath:string): ComponentInfo {
    const info = new ComponentInfo()
    let state:ParsedState = ParsedState.none
    let layoutXml = ''
    let bindDeclarations = ''

    let codeBackFile = filepath.substring(0, filepath.lastIndexOf('.'))
    codeBackFile += '.ts'
    if( fs.existsSync(codeBackFile) ) {
        info.codeBack = codeBackFile
    }

    let errLine = 0
    const str = fs.readFileSync(filepath).toString()
    const lines = str.split('\n')

    try {
        for(let i = 0; i<lines.length; i++) {
            errLine = i
            let line = lines[i]
            let cn = line.indexOf('//')
            if(cn !== -1) line = line.substring(0, cn)
            line = line.trim()
            if(!line.length) continue
            if(line.charAt(0) === '#') {
                // changing state
                let n = line.indexOf(' ', 1)
                if (n === -1) n = line.length
                let tag = line.substring(1, n).toLowerCase()
                if(tag.charAt(tag.length-1) === ':') tag = tag.substring(0,tag.length-1)
                let value = line.substring(n).trim()
                if(value.charAt(0) === value.charAt(value.length-1)) {
                    if(value.charAt(0) === "'" || value.charAt(0) === '"') {
                        value = value.substring(1, value.length-1)
                    }
                }
                switch (tag) {
                    case 'component':
                        if (state !== ParsedState.none) {
                            console.error('"#component statement must occur first')
                        } else {
                            info.id = value
                            state = ParsedState.component
                        }
                        break;
                    case 'bind':
                        if (state === ParsedState.none) {
                            console.error('"#component expected as first statement')
                        } else {
                            bindDeclarations = value
                            state = ParsedState.bind
                        }
                        break;
                    case 'layout':
                        if (state === ParsedState.none) {
                            console.error('"#component expected as first statement')
                        } else {
                            state = ParsedState.layout
                        }
                        break
                }
            /*
            } else if(line.substring(0,12) === 'beforeLayout' ||
                      line.substring(0,11) === 'afterLayout'  ||
                      line.substring(0,8) === 'onAction') {
                let en = line.indexOf('(', 1)
                if (en !== -1) {
                    let mtg = line.substring(0, en).trim()
                    let pe = line.indexOf(')', en)
                    let pm = line.substring(en+1, pe)
                    let pos = str.indexOf(mtg)+mtg.length
                    pos = str.indexOf('{', pos)
                    let blkend = str.indexOf('\n$', pos)
                    if (blkend === -1) blkend = str.indexOf('\n#', pos)
                    if (blkend === -1) blkend = str.indexOf('\nbeforeLayout', pos)
                    if (blkend === -1) blkend = str.indexOf('\nafterLayout', pos)
                    if (blkend === -1) blkend = str.indexOf('\nonAction', pos)
                    if (blkend === -1) blkend = str.indexOf('\n<', pos)
                    if (blkend === -1) blkend = str.length
                    blkend = str.lastIndexOf('}', blkend)+1
                    let code = str.substring(pos, blkend).trim()
                    let name = ''
                    if(line.substring(0, 12) === 'beforeLayout') name = 'beforeLayout'
                    if(line.substring(0, 11) === 'afterLayout') name = 'afterLayout'
                    if(line.substring(0, 8) === 'onAction') name = 'onAction'
                    info.methods[name] = code
                    info.params[name] = pm
                    state = ParsedState.methods
                }
             */
            }
            else {
                if(state === ParsedState.layout) {
                    if(line === '<style>') {
                        state = ParsedState.style
                    } else {
                        layoutXml += ' '+line
                    }
                }
                else if(state === ParsedState.bind) {
                    bindDeclarations += line
                }
            }
        }
        let style = ''
        let sn = str.indexOf('<style>')
        // if(sn !== -1) {
            sn += 7;
            let sen = str.lastIndexOf('</style>')
            if (sen === -1) sen = str.length
            sn = str.indexOf('\n', sn)
            style = str.substring(sn + 1, sen).trim()
            // now parse the xml
            const xmlResult = convert.xml2js(layoutXml, {compact: true})
            info.layout = setupAction(xmlResult)
            // for(let i=0; i<actionMethods.length; i++) {
            //     let am = actionMethods[i]
            //     info.methods[am.name] = am.method
            //     info.params[am.name] = 'ev'
            // }
            info.bind = bindDeclarations
        // }
        info.scss = style

    } catch(e) {
        // @ts-ignore
        console.error(ac.bold(ac.red(`Error Reading component at ${filepath} `)), e.message)
        console.error(ac.italic(ac.blue(layoutXml)))
        // @ts-ignore
        let ci = e.message.indexOf('Column:')+7
        // @ts-ignore
        let cs = e.message.substring(ci, e.message.indexOf('\n', ci))
        let c = Number(cs)
        let marker = '-'.repeat(c)+'^'
        console.error(marker)
        process.exit(-1)
    }

    return info
}
let actionMethods:any[] = []
function setupAction(data:any) {
    Object.getOwnPropertyNames(data).forEach(p => {
        if(p.charAt(0) === '_') {
            if (p === '_attributes') {
                let atts = checkAction(data[p])
                Object.getOwnPropertyNames(atts).forEach(ak => {
                    if(ak === 'action') {
                        atts[ak] = '{ this.handleAction }'
                    }
                })
            }
        } else {
            if(typeof data[p] === 'object') setupAction(data[p])
            // else console.log('what is this ', typeof data[p], data[p])
        }
    })
    return data
}
function checkAction(obj:any) {
    if(obj.action) {
        let actMethod = {
            name: 'handleAction',
            method:
`
let action = this.com.getComponentAttribute(null, 'action')
try {
      if(typeof ccb.onAction === 'function') {
          if(ccb.onAction(ev)) {
              return
          }
      }
      this.com.getApp().callPageAction(action, ev)
    } catch(e) {
        // @ts-ignore
      console.error("Error in action handler '"+action+"':", e)
    }
}                
`
        }
        actionMethods.push(actMethod)
        let mapped = mapAction(obj.action)
        obj[mapped] = '{handleAction}'
        delete obj.action
    }
    return obj
}

function mapAction(tag:any) {
    switch(tag.trim().toLowerCase()) {
        case 'onclick':
        case 'click':
        case 'tap':
        case 'press':
            return 'onclick'

        default:
            return tag
    }
}


class PropDef {
    name:string = ''
    value:string = ''
}
class ElementDefinition {
    tag: string = ''
    props:PropDef[]|undefined
    children: ElementDefinition[]|undefined
}

const locals:string[] = []
/**
 * Enumerate all the component files and read them into info blocks
 * then export them as the desired type
 * @param dirpath
 * @param outType
 */
export function enumerateAndConvert(dirpath:string, outType:string, outDir:string) {
    const files = fs.existsSync(dirpath) ? fs.readdirSync(dirpath) : []
    files.forEach(file => {
        if(file.match(/.jvcm?$/)) {
            const info = readComponent(path.join(dirpath, file))
            let fileout = path.join(outDir, file.substring(0, file.lastIndexOf('.')))

            if(outType === 'riot') {
                fileout += '.riot'
                writeRiotFile(info, fileout)
            } else {
                fileout += '-tb.js'
                // console.log("$$$$$ -- pushing to locals", fileout)
                locals.push(fileout)
                writeNativeScriptFile(info, fileout)
            }
        } else {
            let subdir = path.join(dirpath, file)
            let stat = fs.lstatSync(subdir)
            if(stat.isDirectory()) {
                // console.log('recursing...')
                enumerateAndConvert(subdir, outType, path.join(outDir, file))
            }
        }
    })
    if(outType === 'nativescript') {
        let n = outDir.lastIndexOf('components')
        if(n === -1) throw(Error('Unexpected path passed for making tb-components: '+outDir))
        let dest = outDir.substring(0, n-1)
        dest = path.join(dest, 'components')
        const tbcFile = path.join(dest, 'tb-components.ts')
        let tbc = 'const {componentExport} = require(\'@tremho/jove-mobile\')\n'
        tbc += 'module.exports = componentExport\n'
        for(let i=0; i<locals.length; i++) {
            let f = locals[i]
            let act = '/app/components/'
            let acn = f.lastIndexOf(act)
            if(acn !== -1) {
                acn += act.length
                let lf = f.substring(acn)
                let nmi = lf.lastIndexOf('/')+1
                let nm = lf.substring(nmi, lf.lastIndexOf('-tb.js'))
                nm = pascalCase(nm)
                // console.log('>>>>>>>>>> adding local ', nm, lf)
                tbc += `\nmodule.exports.${nm} = require('./${lf}').${nm}`
            }
        }
        tbc += '\n'
        // console.log('-------\n', tbc, '=========\n')
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest)
        }
        fs.writeFileSync(tbcFile, tbc)
    }
}

