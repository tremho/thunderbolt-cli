
import {PageInfo} from "./PageInfo";
import * as convert from 'xml-js'
import * as fs from 'fs'

export function writeRiotPage(info:PageInfo, pathname:string) {

    const layin = Object.assign({}, info.content)
    const xml = convert.js2xml(layin, {
        compact:false,
        spaces: 4,
        attributeValueFn:riotProp
    })
    let page = `<${info.id}-page>\n`
    if(!info.noTitle) {
        page += '<action-bar '
        if(info.noBack) page += 'no-back="true" '
        page += `text="${info.title || ''}" `
        if(info.menuId) page += `menu-id="${info.menuId}" `
        if(info.toolbarId) page += `toolbar-id="${info.toolbarId}" `
        if(info.indicatorsId) page += `indicators-id="${info.indicatorsId}"`
        page += '/>\n'
    }
    page += xml
    page += `

    <script>
      import pageComp from 'Framework/app-core/PageComp'
      import * as activity from '../../src/pages/${info.id}-page'
      const pc =  Object.assign({}, pageComp)
      pc.activity = activity
`
    Object.getOwnPropertyNames(info.methods).forEach(p => {
        let code = info.methods[p]
        code = code.replace(/(\s|;|,|)this/g, '$1_this')
        let param = info.params[p] ? '_this, '+info.params[p] : '_this'
        page += `      pc.${p} = (${param}) => {try ${code} catch(e) {console.error(e)}}\n`
    })
page += `      export default pc
    </script>
    `
    page += `</${info.id}-page>\n`

    // New per ticket: https://github.com/tremho/thunderbolt-common/projects/1#card-60937753
    pathname = pathname.replace('src/pages', '.gen/pages')
    let dir = pathname.substring(0,pathname.lastIndexOf('/'))
    if(!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {recursive:true})
    }
    fs.writeFileSync(pathname, page)
}

function riotProp(val: string) {
    let pos = 0
    while(pos < val.length) {
        pos = val.indexOf('$', pos)
        if(pos === -1) break;
        let endPos = val.indexOf(' ', pos+1)
        if(endPos === -1) endPos = val.length
        if(pos > 0 && val.charAt(pos-1)== '\\') {
            val = val.substring(0, pos-1)+val.substring(pos)
        }
        if (val.charAt(pos) === '$') {
            let isData = false
            if (val.charAt(pos+1) === '$') {
                isData = true
            }
            let name = val.substring(isData ? pos+2 : pos+1, endPos)
            let data = isData ? "data." : ""
            let insert = `{b('${data}${name}')}`
            if(name.indexOf('(') > 0 && name.indexOf(')') === name.length-1) {
                let pn = name.indexOf('(')+1
                let cn = name.indexOf(')', pn)
                let pm = name.substring(pn, cn)
                let comma = pm ? ', ': ''
                name = name.substring(0, pn-1)
                insert = `{${name}(this${comma}${pm})}`
            }
            val = val.substring(0, pos)+insert+val.substring(endPos)
            pos += insert.length
        }
    }
    return val
}