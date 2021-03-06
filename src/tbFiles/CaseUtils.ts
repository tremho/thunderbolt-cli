export function pascalCase(name:string) {
    let out = ''
    name.split('-').forEach(p => {
        out += p.charAt(0).toUpperCase()+p.substring(1).toLowerCase()
    })
    return out
}
export function camelCase(name:string) {
    let pc = pascalCase(name)
    return pc.charAt(0).toLowerCase()+pc.substring(1)
}
export function hyphenate(name:string) {
    let out = ''
    let i = 1
    let last = 0
    while(i < name.length) {
        if(name.charAt(i) === name.charAt(i).toUpperCase()) {
            if (name.charAt(i) !== '-') {
                out += name.substring(last, i).toLowerCase() + '-'
                last = i
            }
        }
        i++
    }
    out += name.substring(last).toLowerCase()
    return out
}
export function dashToCamel(name:string):string {
    if(name.indexOf('-') === -1) return name

    let p = name.toLowerCase().split('-')
    let i = 1
    while(p[i]) {
        p[i] = p[i].charAt(0).toUpperCase()+p[i].substring(1)
        i++;
    }
    let out = p.join('')
    // console.log('dashToCamel', name, out)
    return out
}

export function spaceCase(name:string):string {
    let i = -1;
    let out = ''
    let upper = name.charAt(0) == name.charAt(0).toUpperCase()
    while(++i < name.length) {
        let c = name.charAt(i)
        if( c === '_')  c = ''
        let wasUpper = upper;
        upper = c.toUpperCase() === c
        if(upper && !wasUpper) out += ' '
        out += c
    }
    return out
}