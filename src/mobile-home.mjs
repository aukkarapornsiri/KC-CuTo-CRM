import {filterModules} from './role-access.mjs';
import {getNavigationModules,railEntries} from './context-navigation.mjs';
export function createMobileHome({React,useAccess}){
 const h=React.createElement,icons={dashboard:'dashboard',leads:'leads',contacts:'contacts',customers:'customers',sales:'opportunities',service:'tickets',activities:'activities',documents:'documents',insights:'reports'};
 return function MobileHome({lang='th',activeModule,unreadCount=0,modules=getNavigationModules(),onNavigate,renderContent}){
  const access=useAccess(),t=(th,en)=>lang==='th'?th:en;
  const [mobile,Mobile]=React.useState(()=>window.matchMedia('(max-width:640px)').matches),[home,Home]=React.useState(true);
  React.useEffect(()=>{const m=window.matchMedia('(max-width:640px)'),update=()=>Mobile(m.matches);m.addEventListener('change',update);return()=>m.removeEventListener('change',update);},[]);
  React.useEffect(()=>{if(activeModule==='dashboard')Home(true);},[activeModule]);
  const approval=()=>{const launcher=document.querySelector('.kc-header-approval');if(launcher)launcher.click();else onNavigate('quotations','quot-approval');};
  React.useEffect(()=>{
   if(!mobile)return;
   const open=e=>{if(!e.target?.closest?.('.kc-header-notifications'))return;e.preventDefault();e.stopPropagation();approval();};
   document.addEventListener('click',open,true);
   return()=>document.removeEventListener('click',open,true);
  },[mobile,onNavigate]);
  if(!mobile)return renderContent();
  const entries=railEntries(filterModules(modules,access)).filter(x=>x.id!=='settings'),isHome=activeModule==='dashboard'&&home;
  const openNotifications=approval;
  function goHome(){Home(true);const target=entries.find(x=>x.id==='dashboard')?.target;if(target)onNavigate(target.moduleId,target.pageId);}
  function open(entry){if(entry.id==='dashboard'){Home(false);return;}onNavigate(entry.target.moduleId,entry.target.pageId);}
  return h(React.Fragment,null,isHome?h('section',{className:'kc-mobile-home','aria-label':t('เมนูหลักบนมือถือ','Mobile home')},
   h('header',{className:'kc-mobile-home-header'},h('img',{className:'kc-mobile-home-logo',src:'./assets/mobile-home/logo.png',alt:'KC CuTo CRM',width:148,height:45}),h('button',{type:'button',className:'kc-mobile-language','aria-label':t('เปลี่ยนเป็นภาษาอังกฤษ','Switch to Thai'),onClick:()=>document.querySelector('.kc-app-header .crm-language-toggle:not(.crm-workspace-launcher)')?.click()},h('span',{'aria-current':lang==='th'?'true':undefined},'TH'),h('span',{'aria-hidden':true},'/'),h('span',{'aria-current':lang==='en'?'true':undefined},'EN'))),
   h('div',{className:'kc-mobile-home-content'},h('div',{className:'kc-mobile-home-welcome'},h('h1',null,t('พื้นที่ทำงานของคุณ','Your workspace')),h('p',null,t('เลือกเมนูเพื่อเริ่มงานวันนี้','Choose an app to start your day'))),
   access.loading?h('p',{role:'status'},t('กำลังโหลดเมนู…','Loading menus…')):h('nav',{className:'kc-mobile-home-grid','aria-label':t('เมนูใช้งาน','Workspace menus')},entries.filter(entry=>entry.id!=='dashboard').map(entry=>h('button',{key:entry.id,type:'button','data-menu':entry.id,onClick:()=>open(entry)},h('span',{className:'kc-mobile-app-icon'},h('img',{src:'./assets/mobile-home/'+entry.id+'.svg',alt:'',width:34,height:34})),h('span',null,entry.id==='dashboard'?t('หน้าหลัก','Home'):entry.label[lang]||entry.label.en)))),
   entries.some(entry=>entry.id==='dashboard')&&h('button',{type:'button',className:'kc-mobile-dashboard-link','data-action':'dashboard',onClick:()=>Home(false)},h('span',null,t('ดูแดชบอร์ด','View dashboard')),h('span',{'aria-hidden':true},'›')),
   )):h('div',{className:'kc-mobile-page'},renderContent()),
   h('nav',{className:'kc-mobile-bottom-nav','aria-label':t('ทางลัดมือถือ','Mobile shortcuts')},h('button',{type:'button',onClick:goHome,'aria-current':isHome?'page':undefined},h('img',{src:'./assets/mobile-home/home.svg',alt:'',width:22,height:22}),t('หน้าหลัก','Home')),access.can('quotations','view')&&h('button',{type:'button',onClick:approval},h('img',{src:'./assets/mobile-home/approvals.svg',alt:'',width:22,height:22}),t('งานอนุมัติ','Approvals')),h('button',{type:'button',onClick:openNotifications,'aria-label':t('แจ้งเตือน','Notifications')+(unreadCount>0?' · '+unreadCount:''),'data-action':'mobile-notifications'},h('span',{className:'kc-mobile-bell'},h('img',{src:'./assets/mobile-home/notifications.svg',alt:'',width:22,height:22}),unreadCount>0&&h('span',{className:'kc-mobile-notification-badge','aria-hidden':true},unreadCount>99?'99+':unreadCount)),t('แจ้งเตือน','Notifications'))));
 };
}
