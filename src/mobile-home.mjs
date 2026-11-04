import {filterModules} from './role-access.mjs';
import {getNavigationModules,railEntries} from './context-navigation.mjs';
export function createMobileHome({React,useAccess}){
 const h=React.createElement,icons={dashboard:'dashboard',leads:'leads',contacts:'contacts',customers:'customers',sales:'opportunities',service:'tickets',activities:'activities',documents:'documents',insights:'reports'};
 return function MobileHome({lang='th',activeModule,modules=getNavigationModules(),onNavigate,renderContent}){
  const access=useAccess(),t=(th,en)=>lang==='th'?th:en;
  const [mobile,Mobile]=React.useState(()=>window.matchMedia('(max-width:640px)').matches),[home,Home]=React.useState(true);
  React.useEffect(()=>{const m=window.matchMedia('(max-width:640px)'),update=()=>Mobile(m.matches);m.addEventListener('change',update);return()=>m.removeEventListener('change',update);},[]);
  React.useEffect(()=>{if(activeModule==='dashboard')Home(true);},[activeModule]);
  if(!mobile)return renderContent();
  const entries=railEntries(filterModules(modules,access)).filter(x=>x.id!=='settings'),isHome=activeModule==='dashboard'&&home;
  const approval=()=>document.querySelector('.kc-header-approval')?.click();
  function goHome(){Home(true);const target=entries.find(x=>x.id==='dashboard')?.target;if(target)onNavigate(target.moduleId,target.pageId);}
  function open(entry){if(entry.id==='dashboard'){Home(false);return;}onNavigate(entry.target.moduleId,entry.target.pageId);}
  return h(React.Fragment,null,isHome?h('section',{className:'kc-mobile-home','aria-label':t('เมนูหลักบนมือถือ','Mobile home')},
   h('div',{className:'kc-mobile-home-logo'},h('svg',{viewBox:'135 76 1265 383',role:'img','aria-label':'KC CuTo CRM'},h('image',{href:'./kc-cuto-logo.png',width:1500,height:500}))),
   h('h1',null,t('ทุกความสัมพันธ์ ทุกโอกาส','Every relationship. Every opportunity.'),h('br'),t('เติบโตไปด้วยกัน','Grow together.')),
   h('p',null,t('เชื่อมโยงลูกค้า งานขาย และงานบริการในพื้นที่เดียว','Connect customers, sales and service in one workspace.')),
   access.loading?h('p',{role:'status'},t('กำลังโหลดเมนู…','Loading menus…')):h('nav',{className:'kc-mobile-home-grid','aria-label':t('เมนูใช้งาน','Workspace menus')},entries.map(entry=>h('button',{key:entry.id,type:'button','data-menu':entry.id,onClick:()=>open(entry)},h('img',{src:'./assets/login-menu/'+icons[entry.id]+'.svg',alt:'',width:28,height:28}),h('span',null,entry.id==='dashboard'?t('หน้าหลัก','Home'):entry.label[lang]||entry.label.en))),access.can('quotations','view')&&h('button',{type:'button','data-menu':'approvals',onClick:approval},h('img',{src:'./assets/login-menu/approvals.svg',alt:'',width:28,height:28}),h('span',null,t('งานอนุมัติ','Approvals')))),
   h('p',{className:'kc-mobile-home-tagline'},t('พื้นที่ทำงานเดียว สำหรับทุกทีมของคุณ','One workspace for every team.')),
   h('footer',null,'© '+new Date().getFullYear()+' KAI-COM')):h('div',{className:'kc-mobile-page'},renderContent()),
   h('nav',{className:'kc-mobile-bottom-nav','aria-label':t('ทางลัดมือถือ','Mobile shortcuts')},h('button',{type:'button',onClick:goHome,'aria-current':isHome?'page':undefined},h('img',{src:'./assets/login-menu/dashboard.svg',alt:'',width:22,height:22}),t('หน้าหลัก','Home')),access.can('quotations','view')&&h('button',{type:'button',onClick:approval},h('img',{src:'./assets/login-menu/approvals.svg',alt:'',width:22,height:22}),t('งานอนุมัติ','Approvals')),h('button',{type:'button',onClick:()=>onNavigate('settings','set-notifications')},h('img',{src:'./src/header-bell.svg',alt:'',width:22,height:22}),t('แจ้งเตือน','Notifications'))));
 };
}
