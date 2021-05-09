
export function translateScss(scss:string, className:string):string {
    let out = ''
    const lines = scss.split('\n')
    lines.forEach(line => {
        line = line.trim()
        if(line.substring(0, 5) === ':host') {
            line = line.replace(':host', '.'+className)
        }
        if(line.indexOf('px') !== -1) {
            line = line.replace('px', '')
        }
        let emTag
        let emSize = 12; // todo: find a more scientific mapping
        if(line.indexOf('em') !== -1) {
            emTag = 'em'
        }
        if(line.indexOf('rem') !== -1) {
            emTag = 'rem'
        }
        if(emTag) {
            let n = line.indexOf(emTag)
            let s = n;
            let dig0 = '0'.charCodeAt(0)
            let dig9 = '9'.charCodeAt(0)
            let dp = '.'.charCodeAt(0)
            //foo: 1em;
            while(--s) {
                const cc = line.charCodeAt(s)
                if(cc !== dp && (cc<dig0 || cc>dig9)) {
                    break;
                }
            }
            const value = Number(line.substring(s, n))
            line = line.substring(0, s+1) + (value*emSize) + line.substring(n+emTag.length)
        }
        out += line+'\n'
    })
    return out

}