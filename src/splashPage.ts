
import {PageInfo} from "./tbFiles/PageInfo";
import {writeRiotPage} from "./tbFiles/PageWriterRiot";

const splashRiot =
`
<splash-page>
<grid-layout class="splash-back">
    <stack-layout class="splash-content"/>
</grid-layout>

    <script>
      import pageComp from 'Framework/app-core/PageComp'
      // import * as activity from '../../src/pages/splash-page'
      const pc =  Object.assign({}, pageComp)
      const cm = pc.cm
      pc.activity = {
        onMounted() {
          console.log('splash riot starting')
          cm.app.splashDance(this)
        }
      }
      export default pc
    </script>
    
</splash-page>
`

export function copySplashPage() {

    let pageInfo = new PageInfo()
    pageInfo.id = 'splash'
    pageInfo.noTitle = true
    pageInfo.content =
`
<grid-layout class="splash-back">
    <stack-layout class="splash-content"/>
</grid-layout>
 `
    writeRiotPage(pageInfo, 'splash')
}