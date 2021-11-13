
import {gatherInfo} from './gatherInfo'
import {Dirent} from "fs";
const fs = require('fs')
const path = require('path')

let pages:string, srcpages:string, appRiotFile:string

export function makePageList() {
    const info = gatherInfo()
    pages = path.resolve(path.join(info.projPath, '.gen', 'pages'))
    srcpages = path.resolve(path.join(info.projPath, 'src', 'pages'))
    const gen = path.resolve(path.join(info.projPath, '.gen'))
    if(!fs.existsSync(gen)) {
        fs.mkdirSync(gen)
    }
    appRiotFile = path.join(gen, 'app.riot')
    const list:any[] = enumerateRiotPages()
    createAppRiot(list)
}

// ------------------

const appRiotTemplate =
    `
<app>
    <div bind="!page.navInfo">
$$$PageList$$$
    </div>
    <style>
    </style>
    <script>
      import {newCommon} from 'Framework/app-core/ComCommon'
      let cm;
      export default {
        onMounted(props, state) {
          cm = newCommon(this)
          cm.bindComponent()
        },
        onBeforeUpdate(props, state) {
          // console.log('App Page Context Updating', this.b('navInfo.pageId'))              
        }
      }
    </script>
</app>
  
`

function enumerateRiotPages() {
    const pageOut:string[] = []
    const dirents = fs.readdirSync(pages, {withFileTypes:true})
    dirents.forEach((dirent:Dirent) => {
        const name = dirent.name
        const did = name.lastIndexOf('.')
        if(did !== -1) {
            const ext = name.substring(did)
            if(ext === '.riot') {
                const pageName = name.substring(0, did)
                let di = pageName.indexOf('-page')
                if(di !== -1) {
                    const pageId = pageName.substring(0, di)
                    if(fs.existsSync(path.join(srcpages, pageName+'.ts'))) { // we must have a code page too
                        pageOut.push(pageId)
                    } else {
                        console.error('Missing .ts code file for '+pageName)
                        throw Error()
                    }
                } else {
                    console.warn(`non-page .riot file "${name}" found in "pages" folder`)
                }
            }
        }
    })
    // console.log('pageList:', pageOut)
    return pageOut
}
function createAppRiot(pageList:any[] = []) {
    let pagegen = ''
    pageList.forEach(pageId => {
        pagegen += `        <${pageId}-page if="{((this.bound||{}).navInfo||{}).pageId === '${pageId}'}"/>\n`
    })
    pagegen = pagegen.substring(0, pagegen.length-1) // take off the last \n
    let src = appRiotTemplate.replace('$$$PageList$$$', pagegen)
    fs.writeFileSync(appRiotFile, src)
}

