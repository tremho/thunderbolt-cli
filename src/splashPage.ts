
import * as fs from 'fs'

const splashRiot =
`
<splash-page>
<grid-layout class="splash-back">
    <stack-layout class="splash-content"/>
</grid-layout>

    <script>
      import pageComp from 'Framework/app-core/PageComp'
      import {newCommon} from 'Framework/app-core/ComCommon'
      const pc =  Object.assign({}, pageComp)      
      pc.onMounted = () => {
        // note: we have no 'this' when this is called 
          console.log('splash riot starting')
          const com = newCommon() 
          const app = com.app;
            
          app.splashDance()      
      }
      const cm = pc.cm
      export default pc
    </script>
    
</splash-page>
`

export function copySplashPage(toPageFile:string) {
    fs.writeFileSync(toPageFile, splashRiot)
}

