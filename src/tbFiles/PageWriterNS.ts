
import {PageInfo} from "./PageInfo";
import * as convert from 'xml-js'
import * as fs from 'fs'
import * as path from 'path'
import {pascalCase, dashToCamel} from './CaseUtils'
import {translateScssExpression} from "./MigrateScss";

function valueFix(value:string):string {

    let cleaned
    if(value.indexOf('&') !== -1) {
        // console.log('cleaning', value)
        cleaned = value.replace(/&quot;/g, '"')  // convert quote back before converting amp
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;')
        // console.log('result:', cleaned)
        return cleaned
    }
    return translateScssExpression(value)
}

export function writeNativeScriptPage(info:PageInfo, srcpath:string, outDir:string) {

    // console.log('writing page from info', JSON.stringify(info, null, 2))

    let xml = convert.js2xml(info.content, {compact:false, spaces: 4, ignoreComment:false, fullTagEmptyElement:false,
                                                    attributeNameFn: dashToCamel,
                                                    attributeValueFn: valueFix})

    // console.log('converted to xml', xml)

    let out = `<Page xmlns="http://schemas.nativescript.org/tns.xsd" loaded="onLoaded" navigatedTo="onNavigatedTo"\n`
    out += `      xmlns:tb="~/components/tb-components"\n`
    out += `      actionBarHidden="true"\n`
    out += '>\n'
    if(!info.noTitle || info.menuId || info.toolbarId || info.indicatorsId || info.orientationReload) {
        out += `    <tb:TBPage id="${info.id}" title="${info.title}"`
        if(info.noBack) out += ' noBack = "true"'
        if(info.menuId) out +=  ` menu-id="${info.menuId}"`
        if(info.toolbarId) out +=  ` toolbar-id="${info.toolbarId}"`
        if(info.indicatorsId) out +=  ` indicators-id="${info.indicatorsId}"`
        if(info.orientationReload) out += ' reloadOnOrientationChange="true"'
        out += '>\n'
    }

    out += `        <tb:TBContent>\n`
    out += cleanup(xml)
    out += `        </tb:TBContent>\n`
    if(!info.noTitle) out += `    </tb:TBPage>\n`
    out += `</Page>\n`

    if(!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, {recursive: true})
    }

    const id = info.id

    let src = path.join(srcpath, `${id}-page.ts`)
    let dest = path.join(outDir, `${id}-logic.ts`)
    copyUpdate(src,dest)

/*
    import {Observable} from '@tremho/jove-mobile'
    import {AppCore} from '@tremho/jove-common'
    import * as activity from './stack-test-logic'

    const pageMethods = {
        isVertical() {return this.bound.navInfo.context.type === 'vertical'},
        isHorizontal() {return this.bound.navInfo.context.type === 'horizontal'}
    }

    export function onNavigatedTo() {
        this.bindingContext = Observable.fromObject(AppCore.getTheApp().launchActivity("stack-test",activity, pageMethods))
    }
 */
    let pageMethods = `
    const pageMethods = {
    `
    let i = 0
    const meths = Object.getOwnPropertyNames(info.methods)
    meths.forEach(p => {
        let code = info.methods[p]
        if(i) pageMethods += '        '
        pageMethods += `${p}() ${code}`
        if(++i < meths.length) pageMethods += ','
        pageMethods += '\n'
    })
    if(i) pageMethods += '    '
    pageMethods += '}\n'

    const stub = `
    import {Observable} from '@tremho/jove-mobile'
    import {AppCore} from '@tremho/jove-common'
    import * as activity from './${id}-logic' 
    ${pageMethods}
    export function onLoaded(args) {
        const page = args.object
        page.bindingContext = Observable.fromObject(AppCore.getTheApp().setPageBindings("${id}",activity, pageMethods)) 
    }
    export function onNavigatedTo() {
        AppCore.getTheApp().launchActivity("${id}",activity)
    }
    `
    src = path.join(srcpath, `${id}-page.jvpg`)
    dest = path.join(outDir, `${id}-page.ts`)
    if(testForUpdate(src,dest)) {
        // console.log(`exporting ${id}-page`)
        fs.writeFileSync(dest, stub)
        dest = path.join(outDir, `${id}-page.xml`)
        fs.writeFileSync(dest, out)
    } else {
        // console.log(`skipping ${id}-page`)
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
        // console.log('copying ', src, dest)
        const destdir = dest.substring(0, dest.lastIndexOf(path.sep))
        if(!fs.existsSync(destdir)) {
            fs.mkdirSync(destdir, {recursive: true})
        }

        fs.copyFileSync(src,dest)
    } else {
        // console.log('skipping ', src)
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
                if (n === -1) n = line.indexOf('>')
                if(n === -1) n = line.length
                let name = pascalCase(line.substring(1, n))
                // console.log(name, line)
                let lnout
                if(name.charAt(0) === '/') {
                    name = pascalCase(line.substring(2, n))
                    if(name === 'ScrollView') {
                        lnout = ' '.repeat(8)+ `</StackLayout></tb:${name}` + line.substring(n) + '\n'
                        // console.log("!!!!!!!!!!!!!-", lnout)
                    } else {
                        lnout = ' '.repeat(8)+ `</tb:${name}` + line.substring(n) + '\n'
                    }
                } else {
                    if(name === 'ScrollView') {
                        lnout = ' '.repeat(8) + `<tb:ScrollView` + line.substring(n) + '<StackLayout>\n'
                        // console.log("!!!!!!!!!!!!!+", lnout)
                    } else {
                        lnout = ' '.repeat(8) + `<tb:${name}` + line.substring(n) + '\n'
                    }
                }
                out += lnout
            } else {
                out += ' '.repeat(8)+line+'\n'
            }
        }
    })
    if(out.charAt(out.length-1) !== '\n') out += '\n'
    return out
}


