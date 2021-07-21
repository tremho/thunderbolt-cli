
import {ComponentInfo} from "./ComponentInfo";
import * as convert from 'xml-js'
import * as fs from 'fs'
import * as path from 'path'


/**
 * N.B. 5/24/21 -- COMPACT IS TRUE
 * Originally coded with js/xml convert using option compact:true, but then changed to compact:false because similar
 * treatment for pages was not keeping the correct ordering of multiple mixed elements, so everything got changed to
 * compact:false, which solved the page problem, but caused component conversion (Nativescript) to fail because
 * the code there interprets the format directly.
 * So because of that compact:true is in effect again for components (but not pages)
 */

let actMethods = {}

export function writeRiotFile(info:ComponentInfo, pathname:string) {

    const layin = Object.assign({}, info.layout)
    const xml = convert.js2xml(layin, {
        compact:true,
        spaces: 4,
        attributeValueFn:riotProp,
        textFn:riotProp
    })
    // Object.getOwnPropertyNames(actMethods).forEach(p => {
    //     // @ts-ignore
    //     info.methods[p] = actMethods[p]
    //     info.params[p] = 'ev'
    // })

    let page = `<${info.id} bind="${info.bind}">\n`
    page += xml
    page += '\n<style>\n'
    page += info.scss
    page += '\n</style>\n'
    page += `<script>`
    page += scriptInnards(info.codeBack)
    page += `</script>`
    page += `\n</${info.id}>\n`

    // New per ticket: https://github.com/tremho/thunderbolt-common/projects/1#card-60937753
    let srcDir = pathname.substring(0, pathname.lastIndexOf(path.sep))
    pathname = pathname.replace('src'+path.sep, '.gen'+path.sep)
    let dir = pathname.substring(0,pathname.lastIndexOf(path.sep))
    if(!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {recursive:true})
    }

    fs.writeFileSync(pathname, page)

    // copy code-back file
    if(info.codeBack) {
        const relPath = info.codeBack.substring(info.codeBack.lastIndexOf(path.sep) + 1) // relative
        let src = path.join(srcDir, relPath)
        let dest = path.join(dir, relPath)
        fs.copyFileSync(src, dest)
    }
}

function scriptInnards(codeBackFile:string) {
    let tagCode = ''
    // Object.getOwnPropertyNames(methods).forEach(key => {
    //     let prm = params[key]
    //     let code = methods[key]
    //     let lines = code.split('\n')
    //     code = lines.join('\n            ').trim()
    //     let value = ''
    //     if(key === 'handleAction') {
    //         value = '{\n        ' +lines.join('\n      ').trim()
    //     } else {
    //         value = '{\n        try ' + code + ' catch(e) {\n                console.error("error executing \'' + key + '\':",e)\n          }\n    }'
    //     }
    //     tagCode += `${key}(${prm}) ${value},\n    `
    // })
    let script
    if(codeBackFile) {
        const baseName = codeBackFile.substring(codeBackFile.lastIndexOf(path.sep)+1, codeBackFile.lastIndexOf('.'))
        script = `\nimport CCB from "./${baseName}"\n`
        script += `let ccb = null`
    } else {
        script = `\nconst ccb = {}`
    }
    script += `
      import StdComp from 'Framework/app-core/StdComp'
      const sc =  Object.assign({
        postStdOnBeforeMount() {
            try {
                if(!ccb) {
                    ccb = new CCB()
                    ccb.component = this
                }
                
            } catch(e) {
              console.error('error in constructor for custom component '+this.root.tagName, e)
            } 
        },
        preStdOnMounted() {
            try {
                ccb.beforeLayout && ccb.beforeLayout.call(ccb)
            } catch(e) {
                console.error('error in beforeLayout for custom component '+this.root.tagName, e) 
            }
        },
        postStdOnMounted() {
            try {
                ccb.afterLayout && ccb.afterLayout.call(ccb)
            } catch(e) {
                console.error('error in afterLayout for custom component '+this.root.tagName, e) 
            }
        },
        handleAction(ev) {
            try {    
                ccb.onAction && ccb.onAction(ev)
            } catch(e) {
                console.error('Error in  "'+this.root.tagName+' action handler"', e)
            }                
        }        
      }, StdComp)
      console.log(sc)
      export default sc
`
    return script
}

function riotProp(val:string) {
    if(val.charAt(0) === val.charAt(val.length-1) && val.charAt(0) === '"' || val.charAt(0) === "'") {
        val = val.substring(1, val.length-1)
    }
    if(val.charAt(0) === '$') {
        if(val.charAt(1) === '$') {
            let name = val.substring(2)
            val = `{b('data.${name}')}`
        } else {
            let name = val.substring(1)
            val = `{b('${name}')}`
        }
    }
    return val
}

function mapAction(tag: string) {
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

