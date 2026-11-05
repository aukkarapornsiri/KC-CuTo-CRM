// Presentation only: consume existing fields and action elements, retaining their
// permissions, disabled states and event handlers from the quotation workspace.
export function createQuotationDetailLayout(React){
 const h=React.createElement,children=n=>React.Children.toArray(n?.props?.children),classHas=(n,c)=>String(n?.props?.className||'').split(' ').includes(c),caption=n=>children(n).filter(x=>typeof x==='string').join('');
 return function QuotationDetailLayout({record:r,lang='th',ItemDetail,ReviewShortcut,children:content,...attrs}){
  const [current,Current]=React.useState('overview');
  const t=(a,b)=>lang==='th'?a:b,sections=React.useRef({}),nodes=React.Children.toArray(content),actionsNode=nodes.find(n=>classHas(n,'crm-actions')),actions=children(actionsNode),grid=nodes.find(n=>classHas(n,'crm-grid'));
  const fields=new Map(children(grid).map(n=>[n.props['data-record-field'],n]));
  const take=keys=>keys.map(k=>{const n=fields.get(k);fields.delete(k);return n;}).filter(Boolean);
  const find=(th,en)=>actions.find(n=>caption(n)===t(th,en)),close=find('ปิดรายละเอียด','Close details'),edit=find('แก้ไข','Edit'),convert=find('Convert Sales Order','Convert Sales Order'),print=find('พิมพ์ / บันทึก PDF','Print / Save PDF'),copy=find('สร้างฉบับใหม่จากรายการนี้','Create new draft from this'),del=find('ลบใบเสนอราคา','Delete quotation');
  const workflow=actions.filter(n=>n?.type==='button'&&![close,edit,convert,print,copy,del].includes(n)),integration=actions.filter(n=>n?.type!=='button');
  const rest=nodes.filter(n=>n!==actionsNode&&n!==grid&&n?.type!=='h2');
  const reviews=rest.filter(n=>n.type===ReviewShortcut),items=rest.filter(n=>n.type===ItemDetail),approval=rest.filter(n=>classHas(n,'kc-quote-approval')||classHas(n,'crm-actions'));
  const links=rest.filter(n=>classHas(n,'crm-profile-links')),status=rest.filter(n=>n.type==='p'&&(classHas(n,'crm-notice')||classHas(n,'crm-error')));
  const related=rest.filter(n=>![...reviews,...items,...approval,...links,...status].includes(n));
  const date=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return '—';const d=new Date(v+'T12:00:00Z');return Number.isNaN(+d)?'—':new Intl.DateTimeFormat(lang==='th'?'th-TH':'en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Bangkok'}).format(d);};
  const metric=(name,value,hint)=>h('article',{className:'kc-quote-metric',key:name},h('span',null,name),h('strong',null,value),h('small',null,hint||'—'));
  const card=(name,body,extra='')=>h('section',{className:'kc-quote-card '+extra,key:name},h('h3',null,name),body);
  const customer=take(['counterparty_tax_id','counterparty_address']),preparer=take(['prepared_by_email','prepared_by_phone']);take(['prepared_by']);
  const payment=take(['payment_term_code','tax_rate','wht_rate','currency']),terms=take(['payment_instructions']),document=take(['project_name','document_language','document_discount','reference_document','note']),reviewers=take(['reviewed_by','approved_by']);take(['issue_date','valid_until','payment_terms']);
  const scroll=id=>{Current(id);sections.current[id]?.scrollIntoView({behavior:'smooth',block:'start'});};
  const approvalNode=approval.find(n=>classHas(n,'kc-quote-approval')),approvalChildren=children(approvalNode),approvalActions=children(approvalChildren.find(n=>classHas(n,'crm-actions'))),commentField=approvalChildren.find(n=>n.type==='textarea');
  const statusLabel=({pending:t('รออนุมัติ','Pending approval'),approved:t('อนุมัติแล้ว','Approved'),rejected:t('ไม่อนุมัติ','Rejected'),cancelled:t('ถอนคำขอแล้ว','Withdrawn')})[r.approval_status]||t('ยังไม่ส่งอนุมัติ','Not submitted');
  const linkedButtons=links.flatMap(children),account=linkedButtons.find(n=>caption(n)===t('เปิดลูกค้า','Open Account')),contact=linkedButtons.find(n=>caption(n)===t('เปิดผู้ติดต่อ','Open Contact'));
  const decorate=(node,kind)=>node&&React.cloneElement(node,{className:(node.props.className||'')+' kc-approval-action kc-approval-'+kind,'data-approval-action':kind},h('img',{src:'./assets/quotation-approval/'+kind+'.svg',width:18,height:18,alt:'','aria-hidden':true}),h('span',null,node.props.children));
  const history=approvalChildren.filter(n=>n.type!=='h3'&&n!==commentField&&!classHas(n,'crm-actions')&&n!==approvalChildren.find(x=>x.type==='p'));
  const kindFor=node=>({[t('ส่งอนุมัติ','Submit for approval')]:'submit',[t('อนุมัติขั้นนี้','Approve this step')]:'approve',[t('ปฏิเสธ','Reject')]:'reject',[t('ถอนคำขอ','Withdraw request')]:'withdraw'})[caption(node)];
  const extraLinks=linkedButtons.filter(n=>n!==account&&n!==contact),extraApproval=approval.filter(n=>n!==approvalNode);
  const approvalPanel=h('section',{className:'kc-quote-extra-section kc-quote-priority-approval kc-approval-compact',ref:n=>sections.current.approval=n},
   h('header',{className:'kc-approval-heading'},h('h3',null,t('การอนุมัติและดำเนินการต่อ','Approval and next actions')),h('span',{className:'kc-approval-status','data-status':r.approval_status||'none'},statusLabel)),
   h('div',{className:'kc-approval-actions'},decorate(account,'customer'),decorate(contact,'contact'),...approvalActions.map(n=>decorate(n,kindFor(n)))),
   h('div',{className:'kc-approval-fields'},commentField&&h('label',{className:'kc-approval-note'},h('span',null,t('หมายเหตุ','Note')),React.cloneElement(commentField,{rows:1,placeholder:t('เพิ่มหมายเหตุการอนุมัติ…','Add an approval note…')})),...reviewers),
   (workflow.length>0||extraLinks.length>0||extraApproval.length>0)&&h('div',{className:'kc-approval-extra-actions'},workflow,extraLinks,extraApproval),
   history.length>0&&h('details',{className:'kc-approval-history'},h('summary',null,t('ประวัติการอนุมัติ','Approval history')),history));
  const initials=String(r.prepared_by||r.owner_name||'').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'—';
  return h('section',{...attrs,className:'crm-record-detail kc-quote-detail'},
   h('header',{className:'kc-quote-hero'},h('div',{className:'kc-quote-detail-identity'},h('div',null,h('small',null,'QUOTATION / KC CUTO CRM'),h('h2',null,r.code||'—'),h('p',null,[r.customer_name,r.prepared_by].filter(Boolean).join(' · '))),h('div',{className:'kc-quote-header-actions'},h('span',{className:'kc-quote-detail-status'},({pending:t('รออนุมัติ','Pending approval'),approved:t('อนุมัติแล้ว','Approved'),rejected:t('ไม่อนุมัติ','Rejected')})[r.approval_status]||r.status||'—'),edit&&React.cloneElement(edit,{className:'kc-quote-edit-action'},t('แก้ไขข้อมูล','Edit details')))),h('div',{className:'crm-actions kc-quote-primary-actions'},convert,print,copy,del&&h('details',{className:'kc-quote-more'},h('summary',null,t('เพิ่มเติม ···','More ···')),h('div',null,del)))),
   h('div',{className:'kc-quote-body'},h('div',{className:'kc-quote-metrics'},metric(t('วันที่เอกสาร','Issue date'),date(r.issue_date),r.issue_date),metric(t('วันหมดอายุ','Valid until'),date(r.valid_until),r.valid_until),metric(t('เครดิต / การชำระ','Credit / payment'),(r.payment_terms??0)+t(' วัน',' days'),r.payment_term_code)),
    h('nav',{className:'kc-quote-nav','aria-label':t('ส่วนของใบเสนอราคา','Quotation sections')},[['overview','ภาพรวม','Overview'],['items','สินค้าและบริการ','Items and services'],['approval','การอนุมัติ','Approval'],['related','เอกสารที่เกี่ยวข้อง','Related documents']].map(([id,th,en])=>h('button',{type:'button',key:id,'aria-current':current===id?'location':undefined,onClick:()=>scroll(id)},t(th,en)))),
    reviews.length>0&&h('div',{className:'kc-quote-review-shortcut'},reviews),
    approvalPanel,
    h('section',{className:'kc-quote-extra-section',ref:n=>sections.current.items=n},h('h3',null,t('สินค้าและบริการ','Items and services')),items.map(n=>React.cloneElement(n,{compact:true}))),
    h('div',{className:'kc-quote-card-grid',ref:n=>sections.current.overview=n},
     card(t('ข้อมูลลูกค้า','Customer information'),h(React.Fragment,null,r.customer_name&&h('strong',{className:'kc-quote-customer-name'},r.customer_name),h('div',{className:'kc-quote-customer-fields'},customer))),
     card(t('ผู้จัดทำเอกสาร','Document preparer'),h(React.Fragment,null,h('div',{className:'kc-quote-preparer'},h('span',{className:'kc-quote-avatar','aria-hidden':true},initials),h('div',null,h('strong',null,r.prepared_by||'—'),h('small',null,r.project_name||'—'))),h('div',{className:'kc-quote-contact-fields'},preparer))),
     card(t('เงื่อนไขและการชำระเงิน','Commercial terms'),h(React.Fragment,null,h('div',{className:'kc-quote-payment-fields'},payment),h('div',{className:'kc-quote-divider'},terms))),
     card(t('ข้อมูลเอกสารเพิ่มเติม','Document details'),h('div',{className:'kc-quote-document-fields'},document,...fields.values()))),
    h('section',{className:'kc-quote-extra-section',ref:n=>sections.current.related=n},h('h3',null,t('เอกสารที่เกี่ยวข้อง','Related documents')),related,integration,status)),
   h('footer',{className:'kc-quote-footer'},h('small',null,t('แก้ไขได้ตามสิทธิ์และสถานะเอกสาร','Editing follows your permissions and document status')),h('div',{className:'crm-actions'},close)));
 };
}
