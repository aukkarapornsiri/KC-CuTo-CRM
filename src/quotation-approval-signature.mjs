import {downloadQuotationAsset} from './quotation-assets.mjs';
export function createApprovalSignature({React,client}){
 const h=React.createElement;
 return function ApprovalSignature({event,lang}){
  const [state,setState]=React.useState({}),key=event.signature_storage_key;
  React.useEffect(()=>{let active=true;if(!key)return;downloadQuotationAsset(client,key).then(src=>{if(active)setState({key,src});}).catch(()=>{if(active)setState({key,error:true});});return()=>{active=false;};},[key]);
  if(!key)return null;
  const t=(th,en)=>lang==='th'?th:en;
  return h('span',{style:{display:'block'}},event.reviewer_name&&h('span',null,t('ผู้อนุมัติ: ','Approved by: ')+event.reviewer_name),state.key===key&&state.src&&h('img',{src:state.src,alt:t('ลายเซ็นผู้อนุมัติ','Approver signature'),style:{display:'block',width:160,height:55,objectFit:'contain',objectPosition:'left'}}),state.key===key&&state.error&&h('small',{role:'status'},t('โหลดรูปลายเซ็นไม่สำเร็จ','Signature image could not be loaded')));
 };
}
