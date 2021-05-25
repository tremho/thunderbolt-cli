
const emSize = 15;

export function translateScss(scss:string, className:string):string {
    let out = ''
    const lines = scss.split('\n')
    lines.forEach(line => {
        line = line.trim()
        if(line.substring(0, 5) === ':host') {
            line = line.replace(':host', '.'+className)
        }
        let di = line.indexOf(':')
        let prop = line.substring(0, di)
        let expression = line.substring(di+1)
        let xexp = translateScssExpression(expression)
        line = prop+': '+xexp
        out += line+'\n'
    })
    return out
}

export function translateScssExpression(expression:string):string {
    let out = ''
    const parts = expression.split(' ')
    parts.forEach(exp => {
        let digs = ''
        let unit = ''
        let i = 0;
        const cc0 = '0'.charCodeAt(0)
        const cc9 = '9'.charCodeAt(0)
        while (i < exp.length) {
            if (exp.charCodeAt(i) >= cc0 && exp.charCodeAt(i) <= cc9) digs += exp.charAt(i)
            else break;
        }
        unit = exp.substring(i)
        let value = Number(digs)
        if (unit === 'px') unit = ''
        else if (unit === 'em' || unit === 'rem') {
            value *= emSize
            unit = ''
        } else if (unit === 'in') {
            value *= 96 // pixels per inch per CSS
            unit = ''
        } else if (unit === 'pt') {
            value *= 96 / 72 // one point is 1/72 inch
            unit = ''
        } else if (unit === 'pc') {
            // pica is 12 points
            value *= 12 * 96 / 72
            unit = ''
        } else if (unit === 'cm') {
            // cm to inch to pixel
            value *= 0.39370079 * 96
            unit = ''
        } else if (unit === 'mm') {
            // mm to inch to pixel
            value *= 0.039370079 * 96
            unit = ''
        }
        if (out) out += ' '
        out += value + unit
    })
    return out
}