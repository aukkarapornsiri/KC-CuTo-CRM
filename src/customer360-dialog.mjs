// Keep the complete customer workspace inside one native modal, including child dialogs.
export function createCustomer360Dialog(React){
 const h=React.createElement;
 return function Customer360Dialog({lang,onClose,children}){
  const ref=React.useRef(null);
  React.useEffect(()=>{
   const opener=document.activeElement,dialog=ref.current;
   const overflow=document.body.style.overflow;
   document.body.style.overflow='hidden';
   if(!dialog.open)dialog.showModal();
   return()=>{if(dialog.open)dialog.close();document.body.style.overflow=overflow;if(opener?.isConnected)opener.focus({preventScroll:true});};
  },[]);
  return h('dialog',{ref,className:'crm-customer360-dialog','aria-label':'Customer Intelligence / 360',onCancel:e=>{if(e.target===e.currentTarget){e.preventDefault();onClose();}}},
   h('header',{className:'crm-customer360-dialog-head'},h('h2',null,'CUSTOMER INTELLIGENCE / 360'),h('button',{type:'button',onClick:onClose,'aria-label':lang==='th'?'ปิดหน้าต่าง Customer 360':'Close Customer 360',autoFocus:true},'×')),
   h('div',{className:'crm-customer360-dialog-body'},children));
 };
}
