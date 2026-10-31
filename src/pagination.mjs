// Zero-based pages; totals always refer to the same authorized, filtered query.
export function paginationModel(page,total,pageSize=50){
 const known=Number.isFinite(total)&&total>=0;
 const pages=known?Math.ceil(total/pageSize):null;
 const current=Math.max(0,Math.min(Math.floor(page)||0,known?Math.max(0,pages-1):Infinity));
 const numbers=[];
 if(pages){
  const keep=new Set([0,pages-1]);
  for(let n=Math.max(0,current-1);n<=Math.min(pages-1,current+1);n++)keep.add(n);
  if(current<3)for(let n=0;n<Math.min(4,pages);n++)keep.add(n);
  if(current>pages-4)for(let n=Math.max(0,pages-4);n<pages;n++)keep.add(n);
  let last=-1;for(const n of [...keep].sort((a,b)=>a-b)){if(n-last===2)numbers.push(last+1);else if(n-last>2)numbers.push('gap-'+n);numbers.push(n);last=n;}
 }
 return {pages,current,numbers,known};
}
export function createPagination(React){
 const h=React.createElement;
 return function Pagination({page=0,total=null,pageSize=50,onChange,lang='th',busy=false}){
  const {pages,current,numbers,known}=paginationModel(page,total,pageSize),th=lang==='th';
  React.useEffect(()=>{if(known&&!busy&&page!==current)onChange(current);},[page,current,known,busy]);
  const go=n=>{if(!busy&&known&&n>=0&&n<pages&&n!==current)onChange(n);};
  const button=(label,n,disabled,extra={})=>h('button',{type:'button',disabled:busy||disabled,onClick:()=>go(n),...extra},label);
  return h('nav',{className:'kc-pagination','aria-label':th?'เปลี่ยนหน้ารายการ':'List pagination','aria-busy':busy},
   h('span',{className:'kc-pagination-summary',role:'status'},known?(th?`หน้า ${pages?current+1:0} จาก ${pages} หน้า · ${total} รายการ`:`Page ${pages?current+1:0} of ${pages} · ${total} records`):(th?'กำลังนับจำนวนหน้า…':'Counting pages…')),
   h('div',{className:'kc-pagination-controls'},
    button(th?'ก่อนหน้า':'Previous',current-1,!known||current===0,{className:'kc-pagination-direction'}),
    h('div',{className:'kc-pagination-numbers'},numbers.map(n=>typeof n==='string'?h('span',{key:n,className:'kc-pagination-gap','aria-hidden':true},'…'):button(String(n+1),n,false,{key:n,className:'kc-pagination-number','aria-label':th?`ไปหน้า ${n+1}`:`Go to page ${n+1}`,'aria-current':n===current?'page':undefined}))),
    button(th?'ถัดไป':'Next',current+1,!known||current+1>=pages,{className:'kc-pagination-direction'})));
 };
}
