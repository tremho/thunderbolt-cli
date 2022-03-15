
import * as fs from 'fs'

const splashRiot =
`
<splash-page>
<grid-layout class="splash-back">
    <stack-layout class="splash-content"/>
</grid-layout>

    <script>
      import pageComp from 'Framework/app-core/PageComp'
      const pc =  Object.assign({
        onMounted() {
          console.log('splash riot starting')
          cm.app.splashDance(this)      
      }, pageComp)
      const cm = pc.cm
      export default pc
    </script>
    
</splash-page>
`

export function copySplashPage(toPageFile:string) {
    fs.writeFileSync(toPageFile, splashRiot)
}

