
export class PageInfo {
    id: string = ''
    noTitle: boolean = false
    noBack: boolean = false
    title:string = ''
    menuId:string = ''
    toolbarId:string = ''
    indicatorsId: string = ''
    content:any
    methods: any = new Object()
    params: any = new Object()
    orientationReload:boolean = false
}