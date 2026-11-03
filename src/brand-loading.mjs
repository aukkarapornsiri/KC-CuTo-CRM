/** Shared startup indicator; status remains available to assistive technology. */
export function renderBrandLoading(React,lang='th'){
 const h=React.createElement;
 return h('section',{className:'kc-brand-loading',role:'status','aria-busy':true,'aria-label':lang==='th'?'กำลังโหลดระบบ':'Loading application'},
  h('img',{className:'kc-brand-loading__logo',src:'./kc-cuto-logo.png',alt:'KC CuTo CRM',width:1500,height:500,fetchPriority:'high'}),
  h('span',{className:'kc-brand-loading__track','aria-hidden':true},h('span',null)));
}
