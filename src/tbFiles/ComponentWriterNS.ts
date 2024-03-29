import {ComponentInfo} from "./ComponentInfo";
// import * as convert from 'xml-js'
import * as fs from 'fs'
import * as path from 'path'
import {pascalCase} from "./CaseUtils";
import {translateScss} from "./MigrateScss";
// @ts-ignore
import {executeCommand} from "../execCmd";

let setPropertyBindEntries:any[] = []

/**
 * N.B. 5/24/21 -- COMPACT IS TRUE
 * Originally coded with js/xml convert using option compact:true, but then changed to compact:false because similar
 * treatment for pages was not keeping the correct ordering of multiple mixed elements, so everything got changed to
 * compact:false, which solved the page problem, but caused component conversion (Nativescript) to fail because
 * the code here interprets the format directly.
 * So because of that compact:true is in effect again for components (but not pages)
 */

export function writeNativeScriptFile(info:ComponentInfo, pathname:string) {

    // console.log('write NS component '+info.id)
    // console.log(info)
    // console.log(JSON.stringify(info.layout, null, 2))
    // console.log("-------------")

    let parts = info.id.split('-')
    let name = ''
    const codeBackRel = info.codeBack && info.codeBack.substring(info.codeBack.lastIndexOf(path.sep)+1, info.codeBack.lastIndexOf('.')) // base name only

    setPropertyBindEntries = []

    let i = 0
    while(parts[i]) {
        name += parts[i].charAt(0).toUpperCase()+parts[i++].substring(1).toLowerCase()
    }
    let out = `const {ComponentBase} = require('@tremho/jove-mobile')\n`
    out += `const {makeDiv, makeSpan, makeImg, makeLabel} = require('@tremho/jove-mobile').componentExport\n\n`
    if(codeBackRel) out += `const CCB = require('./${codeBackRel}').default\n`
    else out += `// no code back \n`
    out += `module.exports.${name} = class extends ComponentBase {`
    out += '\n    createControl() {\n        try {\n            '
    if(codeBackRel) {
        out += `this.ccb = new CCB()
            this.ccb.component = this
            this.controlApi = this.ccb
            `
    }
    out += `this.className = "${pascalCase(info.id)}"\n            `
    out += processContainer(info.layout)

    out = out.trim()
    out += '\n        } catch(e) {\n            console.error("Unexpected Error creating '+name+':", e)\n        }\n'
    out += '    }'
    out += insertSetProperties()
    out += `
    preStdOnMounted() {
        try {
            this.ccb && this.ccb.beforeLayout && this.ccb.beforeLayout.call(this.ccb)
        } catch(e) {
            console.error('error in beforeLayout for custom component '+this.tagName, e) 
        }
    }
    postStdOnMounted() {
        try {
            this.ccb && this.ccb.afterLayout && this.ccb.afterLayout.call(this.ccb)
        } catch(e) {
            console.error('error in afterLayout for custom component '+this.tagName, e) 
        }
    }
    preStdOnBeforeUpdate() {
        try {
            this.ccb && this.ccb.beforeUpdate && this.ccb.beforeUpdate.call(this.ccb)
        } catch(e) {
            console.error('error in beforeUpdate for custom component '+this.tagName, e) 
        }
    }
    handleAction(ev) {
        try {    
            if(this.ccb && this.ccb.onAction) {
                 this.ccb.onAction(ev) 
            } else {
                 // default if no special handler is specified in code back
                 this.cm.app.callEventHandler('action', ev)
            } 
        } catch(e) {
            console.error('Error in  "'+this.tagName+' action handler"', e)
        }                
    }
     `
    // out += addMethods(info.methods, info.params)
    out += '\n}\n'

    let destPath = pathname.substring(0, pathname.lastIndexOf(path.sep))
    if(!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, {recursive: true})
    }
    fs.writeFileSync(pathname, out)

    writeAssociatedStyle(pathname, info.id, info.scss)

    writeCodeBackFile(pathname, info.codeBack)
}

function writeAssociatedStyle(compPath:string, compName:string, scss:string) {
    // translate the scss file
    // console.log('translating component ', compName)
    const className = pascalCase(compName)
    const out = translateScss(scss, className)
    const scssPath = compPath.substring(0, compPath.lastIndexOf('.'))+ '.scss'
    fs.writeFileSync(scssPath, out)
}

function tscCompile(options:any, files:string[]) {
    let argList:string[] = []
    // argList.push('--version')
    if(options.target) { argList.push('--target '+options.target) }
    if(options.lib) { argList.push('--lib '+options.lib)}
    if(options.outdir) { argList.push('--outDir '+options.outdir)}
    argList = argList.concat(files)
    console.log('tsc '+ argList.join(' '))
    return executeCommand('tsc', argList)
}

function writeCodeBackFile(pathname:string, codeBack:string) {

    // code back file is typescript so we need to compile it, so we'll do the copy this way
    if(!codeBack) return Promise.resolve()
    const relPath = codeBack.substring(codeBack.lastIndexOf(path.sep)+1) // relative
    const srcDir = codeBack.substring(0, codeBack.lastIndexOf(path.sep))
    const destDir = pathname.substring(0, pathname.lastIndexOf(path.sep))
    try {
        console.log(`Compiling component ${codeBack} to ${destDir}`)
        return tscCompile({
                    target: 'es5',
                    lib: 'es2015,dom',
                    outdir: destDir
                }, [`${codeBack}`]).catch((e:Error) => {
                    throw e
                })
    } catch(e) {
        console.error(`Failed to compile ${relPath}`)
        throw Error()
    }
}

function mappedComponent(tag: string) {
    let type
    if(tag === 'div' || tag === 'slot') type = 'Div'
    else if(tag === 'span') type = 'Span'
    else if(tag === 'img') type = 'Img'
    else type = tag

    return type
}

// find attributes and text
// find child (make and add)
// loop with child

// container: fat=none, child = div
// div: fat=action, child = span
// span: fat=none, text="$Text", child= none

class Attribute {
    key:string = ''
    value:string = ''
}
function findAttributesAndText(obj:any) {
    const atts:Attribute[] = []
    let text = obj._text

    const atObj = obj._attributes
    if(atObj) {
        Object.getOwnPropertyNames(atObj).forEach(k => {
            let ar = new Attribute()
            ar.key = k
            ar.value = atObj[k]
            atts.push(ar)
        })
    }
    return {atts, text}
}
function findChildren(obj:any) {
    const children:any[] = []
    Object.getOwnPropertyNames(obj).forEach(p => {
        let c = obj[p]
        children.push({name: p, data: c})
    })
    return children
}

function processContainer(container:any, name='container', level=0) {
    const indent = 12
    let out = ''
    let cname = level ? 'this.'+name : 'this.container'
    let {atts, text} = findAttributesAndText(container)
    const abs = attributesContain(atts,'absolute') ? 'absolute' : ''
    if(name && level) {
        let tag = name
        while(tag.charAt(tag.length-1).match(/[0-9]/)) {
            tag = tag.substring(0, tag.length-1)
        }
        if(tag === 'div' || tag === 'span' || tag === 'img' || tag === 'slot') {
            out += `${cname} = make${mappedComponent(tag)}('${abs}')\n`
        }  else {
            out += `${cname} = new ${mappedComponent(tag)}('${abs}')\n`
        }
        out += ' '.repeat(indent)
    }
    for(let i=0; i<atts.length; i++) {
        let ak = atts[i].key
        if(ak === 'absolute') continue; // skip this in this context; it has no value
        let av = atts[i].value
        let em = checkAction(ak, av)
        if(em) {
            // out += `${cname}.on(\'${em}\', this.handleAction.bind(this))\n`
            out += `this.setActionResponder(${cname}, '${em}', 'action')\n`
        } else {
            out += `${cname}.set('${ak}','${av}')\n`
            if(ak === 'src') {
                if(av.charAt(0) === '$') {
                    const bname = av.substring(1)
                    setPropertyBindEntries.push({tname: cname, bname, btarg: 'src'})
                }
            }
        }

        out += ' '.repeat(indent)
    }
    if(text) {
        text = text.trim()
        if(text.charAt(0) === text.charAt(text.length-1)) {
            if(text.charAt(0) === '"' || text.charAt(0) === "'") {
                text = text.substring(1,text.length-1).trim()
            }
        }
        out += '// processing '+text+'\n'
        out += ' '.repeat(indent)

        let lit
        let bname
        if(text.charAt(0) === '$') {
            bname = text.substring(1)
        } else {
            lit = text
        }
        let tname = `${cname}_text`
        out += `${tname} = makeLabel()\n`
        out += ' '.repeat(indent)
        if(bname) {
            out += `${tname}.set('text', this.get('${bname}'))\n`
            out += ' '.repeat(indent)
            out += `// this.localBinds.push([${tname}, '${bname}', 'text'])\n`
            setPropertyBindEntries.push({tname, bname, btarg:'text'})
            out += ' '.repeat(indent)
        } else if(lit) {
            out += `${tname}.set('text', '${lit}')\n`
            out += ' '.repeat(indent)

        }
        out += `${cname}.addChild(${tname})\n`
        out += ' '.repeat(indent)
    }
    let children = findChildren(container)
    for (let i = 0; i < children.length; i++) {
        let {name, data} = children[i]
        if(""+Number(name) === name) continue;
        if(name.charAt(0) === '_') continue;
        if(Array.isArray(data)) {
            for(let n = 0; n< data.length; n++) {
                const s = data[n]
                let lname = uniqueName(name)
                out += processContainer(s, lname, level)
                out += `${cname}.addChild(this.${lname})\n`
                out += ' '.repeat(indent)
            }
        } else {
            let lname = uniqueName(name)
            out += processContainer(data, lname, level + 1)
            out += `${cname}.addChild(this.${lname})\n`
            out += ' '.repeat(indent)
        }
    }

    return out
}

const unamecounts = {}
function uniqueName(name:string) {
    // @ts-ignore
    unamecounts[name] = (unamecounts[name] || 0) + 1
    // @ts-ignore
    return name + unamecounts[name]
}

// function addMethods(methods:any, params:any) {
//     let out = ''
//     Object.getOwnPropertyNames(methods).forEach(name => {
//         let param = params[name] || ''
//         let code = methods[name] || '{}'
//         // pretty up the code a little
//         code = code.split('\n').join('\n    ').trim()
//
//         if(code.charAt(0) !== '{') code = '{\n        '+code
//         if(code.charAt(code.length-1) !== '}') code += '}'
//
//         out += `${name}(${param}) ${code}\n    `
//     })
//     return out
// }

function checkAction(key:string, value:any) {
    let eventMapped = ''
    switch(key) {
        case 'onclick': // this is what will appear after similar reader conversion
        case 'click':
        case 'tap':
        case 'press':
            eventMapped = 'tap'
            break;
    }
    return eventMapped
}

function insertSetProperties() {
    let out = `
    setProperties() {
        const navInfo = this.cm.model.getAtPath('page.navInfo')
        const pageName = navInfo && navInfo.pageId  && navInfo.pageId + '-page'
        const bindTo = this.bound || this.bindingContext || {}
        try {
            if(pageName) bindTo.data = this.cm.app.getPageData(pageName)
        } catch(e) {}    
        this.bindingContext = this.bound = bindTo
    
    `
    // @ts-ignore
    for(let lbe of setPropertyBindEntries) {
        let {tname, bname, btarg} = lbe
        //        this.setDynamicExpressions(get('value') || '$value', this.span3_text, 'text', 'value')
        out += `
        this.setDynamicExpressions(this.get('${bname}') || '$${bname}', ${tname}, '${btarg}', '${bname}')`
    }
    out += `
    }
    `
    return out
}

function attributesContain(atts:Attribute[], value:string):boolean {
    for(let i=0; i<atts.length; i++) {
        let ak = atts[i].key
        let av = atts[i].value
        if (ak === value) {
            // we can't have an attribute without a value per the XML parser, sp
            // any value other than 'false' or 'no' validates the attribute
            // if false or no, we just ignore it.
            if(av !== 'false' && av !== 'no') return true;
        }
    }
    return false;
}