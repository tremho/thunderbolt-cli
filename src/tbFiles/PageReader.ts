import * as fs from "fs"
import * as path from 'path'
import * as convert from 'xml-js'
import {PageInfo} from "./PageInfo";
import {writeRiotPage} from "./PageWriterRiot";
import {writeNativeScriptPage} from "./PageWriterNS";
import * as ac from "ansi-colors";

let debugOn = false

let inScope = true
let defines:any = {}
let procType: string;

enum ParsedState {
    none,
    page,
    content,
    methods
}

function sleep(secs:number) {
    let ts = Date.now()
    while(Date.now() - ts < secs*1000) {}
    return
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
            while (cn !== -1) {
                let qrs = 0, qre = line.length;
                let qss = -1
                while(qss < line.length) {
                    qrs = line.indexOf('"', qss + 1)
                    if (qrs !== -1) {
                        qre = line.indexOf('"', qrs+1)
                        if(cn > qrs && cn < qre) cn = -1
                        qss = qre
                    } else qss = line.length;
                }
                if(cn !== -1) {
                    let qrs = 0, qre = line.length;
                    let qss = -1
                    while(qss < line.length) {
                        qrs = line.indexOf("'", qss + 1)
                        if (qrs !== -1) {
                            qre = line.indexOf("'", qrs+1)
                            if(qre == -1) {
                                qss = line.length;
                                break;
                            }
                            if(cn > qrs && cn < qre) cn = -1
                            qss = qre
                        } else qss = line.length
                    }
                }
                if(cn !== -1) {
                    line = line.substring(0, cn)
                }
                cn = line.indexOf('//', qss+1)
            }
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

                // console.log('----- processing ', info.id)
                // debugOn = (info.id === 'grid-test-3')
                // if(debugOn) console.log(`${lines.length} lines`)

                state = ParsedState.page
            }
            else if(word === '#content') {
                state = ParsedState.content
            }
            else if(state === ParsedState.content) {
                let emit = preproc(line)
                if(emit) {
                    content += emit.trim() + ' '
                }
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
                // we do this repeatedly because we want to trap an error where it occurs, we do it for real after we get out of the loop
                convert.xml2js(content, {compact: true}) // we can use compact for this fake parse
            } catch(e) {
                const pageName = filepath.substring(filepath.lastIndexOf('/')+1)
                // @ts-ignore
                console.error(ac.bold.red('Error reading page ')+pageName+' at line '+(i+1)+":", e.message)
                // console.log(ac.bold.italic('offending line: ')+ac.bold.blue(lines[i]))
                process.exit(-1)
            }
        }
        try {
            // this is the real conversion, but we can't isolate the line an error occurs on here
            info.content = convert.xml2js(content, {compact: false})
        } catch(e) {
            const pageName = filepath.substring(filepath.lastIndexOf('/')+1)
            // @ts-ignore
            console.error(ac.bold.red('Error processing page ')+pageName+":", e.message)
            process.exit(-1)
        }
    } catch(e) {
        // @ts-ignore
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
        if(file.match(/.jvpg?$/)) {
            // console.log('reading page from ', file)
            inScope = true
            procType = outType
            defines = {}
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
            } else {
                if(outType !== 'riot') {
                    if(file.substring(file.lastIndexOf('-')+1, file.lastIndexOf('.')) !== 'page') {
                        if(!fs.existsSync(outDir)) {
                            fs.mkdirSync(outDir, {recursive:true})
                        }
                        fs.copyFileSync(subdir, path.join(outDir, file))
                    }
                }
            }
        }
    })
    if(errs) {
        console.error(ac.bold.red('Please fix errors listed above before continuing'))
        process.exit(-1)
    }
}

// Handle preprocessing
function preproc(line:string):string {
    let isPreproc = false
    try {
        do {
            let sn = line.indexOf('#{')
            if (sn !== -1) {
                let en = line.indexOf("}", sn)
                if (en !== -1) {
                    let sym = line.substring(sn + 2, en).trim()
                    let val = defines[sym] ||''
                    // console.log(`looking for "${sym}" in`, defines, `got "${val}"`)
                    line = line.substring(0, sn) + val + line.substring(en + 1)
                    // console.log('resulting line is', line)
                }
            } else {
                break
            }
        } while(true)
        if(line.substring(0,4) == "<!--") {
            isPreproc = (line.indexOf('#') !== -1)
            let n = line.indexOf('-->')
            if(n == -1) n = line.length;
            inScope = parsePreproc(line.substring(4, n).trim())
        }
    } catch(e) {
        // @ts-ignore
        console.error(e)
        process.exit(-1)
    }
    return !isPreproc && inScope ? line : ''
}
function parsePreproc(line:string):boolean {
    let iStmt = line.substring(line.indexOf('#') + 1).trim()
    let stmt = iStmt.toUpperCase()
    let ifWhat = ''
    if (stmt.substring(0,6) === 'END IF' || stmt.substring(0,5) === 'ENDIF') {
        inScope = true
    } else if (stmt.substring(0, 2) === 'IF') {
        ifWhat = iStmt.substring(3).trim()
    } else if(stmt.substring(0,4) === 'ELSE') {
        if(!inScope) {
            ifWhat = iStmt.substring(5).trim()
            if (ifWhat.substring(0, 3).toUpperCase() === 'IF ') {
                ifWhat = ifWhat.substring(3).trim()
            }
            if (ifWhat.substring(0, 4).toUpperCase() === ' IF ') {
                ifWhat = ifWhat.substring(4).trim()
            }
        }
        if(!ifWhat) inScope = !inScope
    } else if(stmt.substring(0,6) === 'DEFINE') {
        if(inScope) {
            let def = iStmt.substring(7)
            let eqn = def.indexOf('=')
            if(eqn === -1) {
                console.error('syntax error in preproc statement: no =', iStmt)
            }
            let sym = def.substring(0, eqn).trim()
            if(sym) {
                let val = def.substring(eqn+1).trim()
                defines[sym] = val
                // console.log(`added "${sym}=${val}`)
            }
        }
    }
    if(ifWhat) {
        let operation = ''
        let isWhat = ''
        let eqn = ifWhat.indexOf('==')
        let ieq = ifWhat.indexOf("!=")
        if(eqn !== -1) {
            operation = 'match'
            isWhat = ifWhat.substring(eqn+2).trim()
            ifWhat = ifWhat.substring(0, eqn).trim()
        }
        if(ieq !== -1) {
            operation = 'diff'
            isWhat = ifWhat.substring(ieq+2).trim()
            ifWhat = ifWhat.substring(0, ieq).trim()
        }
        switch(ifWhat) {
            case 'desktop':
            case 'Desktop':
            case 'DESKTOP':
                inScope = procType === 'riot'
                break
            case 'mobile':
            case 'Mobile':
            case 'MOBILE':
                inScope = procType !== 'riot'
                break
            case 'TRUE':
            case 'True':
            case 'true':
                inScope = true
                break;
            case 'FALSE':
            case 'false':
            case 'False':
                inScope = false
                break;
            default: {
                let val = defines[ifWhat] ||''
                let match = val === isWhat
                if(operation === 'match') {
                    inScope = match
                }
                else if(operation === 'diff') {
                    inScope = !match
                }
                else {
                    inScope = val !== ''
                }
                // console.log(`comparing "${val}" to "${isWhat}" (${match}) ${operation}==${inScope}`)
                break
            }
        }
    }
    // console.log(`Evaluated preproc statement "${stmt}", returning ${inScope}`)
    return inScope
}
