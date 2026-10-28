// A related record is a lead only when its module explicitly says so.
export function activityLeadTarget(record,canViewLeads){
 return canViewLeads&&record?.related_module==='leads'&&record.related_id?record.related_id:null;
}

export function createActivityDetail(React){
 const h=React.createElement;
 return function ActivityDetail({lang,onClose,error,children}){
  const ref=React.useRef(null);
  React.useEffect(()=>{
   const opener=document.activeElement,dialog=ref.current;
   if(!dialog.open)dialog.showModal();
   return()=>{if(dialog.open)dialog.close();if(opener?.isConnected)opener.focus();};
  },[]);
  const title=lang==='th'?'รายละเอียดกิจกรรม':'Activity Details';
  return h('dialog',{ref,className:'crm-record-popup crm-activity-detail','aria-label':title,onCancel:event=>{event.preventDefault();onClose();}},
   h('header',{className:'crm-record-popup-head'},h('h2',null,title),h('button',{type:'button',onClick:onClose,'aria-label':lang==='th'?'ปิดหน้าต่างรายละเอียดกิจกรรม':'Close activity details'},'×')),
   h('div',{className:'crm-record-popup-body'},error&&h('p',{role:'alert'},error),children));
 };
}
