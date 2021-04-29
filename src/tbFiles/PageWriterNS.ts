
import {PageInfo} from "./PageInfo";
import * as convert from 'xml-js'
import * as fs from 'fs'
import * as path from 'path'

export function writeNativeScriptPage(info:PageInfo, srcpath:string, outDir:string) {

    let xml = convert.js2xml(info.content, {compact:true, spaces: 4, ignoreComment:false, fullTagEmptyElement:false})

    let out = `<Page xmlns="http://schemas.nativescript.org/tns.xsd" loaded="onLoaded" navigatedTo="onNavigatedTo"\n`
    out += `      xmlns:tb="~/components/tb-components"\n`
    out += `      actionBarHidden="true"\n`
    out += '>\n'
    if(!info.noTitle) {
        out += `    <tb:TBPage title="${info.title}"`

        if(!info.noBack) out += ' noBack = "true"'
        if(info.menuId) out +=  ` menu-id="${info.menuId}"`
        if(info.toolbarId) out +=  ` toolbar-id="${info.toolbarId}"`
        if(info.indicatorsId) out +=  ` indicators-id="${info.indicatorsId}"`

        out += '>\n'
    }
    out += `        <tb:TBContent>\n`
    out += cleanup(xml)
    out += `        </tb:TBContent>\n`
    out += `    </tb:TBPage>\n`
    out += `</Page>\n`

    if(!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, {recursive: true})
    }

    const id = info.id

    let src = path.join(srcpath, `${id}-page.ts`)
    let dest = path.join(outDir, `${id}-logic.ts`)
    copyUpdate(src,dest)

    const stub = `
    import {AppCore} from 'thunderbolt-common'
    import * as activity from './${id}-logic'
    export function onNavigatedTo() {
        AppCore.getTheApp().launchActivity("${id}",activity) 
    }
    `
    src = path.join(srcpath, `${id}-page.tbpg`)
    dest = path.join(outDir, `${id}-page.ts`)
    if(testForUpdate(src,dest)) {
        console.log(`exporting ${id}-page`)
        fs.writeFileSync(dest, stub)
        dest = path.join(outDir, `${id}-page.xml`)
        fs.writeFileSync(dest, out)
    }
}

// todo: import these

function testForUpdate(src:string, dest:string) {
    if(!fs.existsSync(src)) {
        return false; // source does not exist; no copy
    }
    if(!fs.existsSync(dest)) {
        return true; // destination does not exist; do copy
    }
    const sstat = fs.lstatSync(src)
    const dstat = fs.lstatSync(dest)

    // return trye if source is newer
    return (sstat.mtimeMs > dstat.mtimeMs)
}

function copyUpdate(src:string,dest:string) {
    if(testForUpdate(src,dest)) {
        console.log('copying ', src, dest)
        const destdir = dest.substring(0, dest.lastIndexOf(path.sep))
        if(!fs.existsSync(destdir)) {
            fs.mkdirSync(destdir, {recursive: true})
        }

        fs.copyFileSync(src,dest)
    } else {
        console.log('skipping ', src)
    }
}

// we have converted to xml, but we need to clean up the format and tweak the names
function cleanup(xml:string) {
    let out = ''
    xml.split('\n').forEach(line => {
        line = line.trim()
        if(line.charAt(0) === '<') {
            if(line.charAt(1) !== '!') {
                let n = line.indexOf(' ')
                if(n === -1) n = line.indexOf('/>')
                if (n === -1) n = line.length
                let name = pascalCase(line.substring(1, n))
                if(name.charAt(0) === '/') {
                    name = pascalCase(line.substring(2, n))
                    out += ' '.repeat(8)+ `</tb:${name}` + line.substring(n) + '\n'
                } else {
                    out += ' '.repeat(8)+ `<tb:${name}` + line.substring(n) + '\n'
                }
            } else {
                out += ' '.repeat(8)+line+'\n'
            }
        }
    })
    if(out.charAt(out.length-1) !== '\n') out += '\n'
    return out
}

function pascalCase(name:string) {
    let out = ''
    name.split('-').forEach(p => {
       out += p.charAt(0).toUpperCase()+p.substring(1).toLowerCase()
    })
    return out
}
function camelCase(name:string) {
    let pc = pascalCase(name)
    return pc.charAt(0).toLowerCase()+pc.substring(1)
}
function hyphenate(name:string) {
    let out = ''
    let i = 1
    let last = 0
    while(i < name.length) {
        if(name.charAt(i) === name.charAt(i).toUpperCase()) {
            out += name.substring(last, i).toLowerCase()+'-'
            last = i
        }
    }
    return out
}

