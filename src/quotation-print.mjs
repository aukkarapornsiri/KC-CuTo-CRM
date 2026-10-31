export const quotationHeaderCSS=`
.kc-rental-step{padding:12px 0;border-bottom:1px solid #d4e5eb;min-width:0}.kc-rental-step h3{display:flex;align-items:center;gap:10px;margin:0 0 12px;font-size:17px}.kc-rental-step-number{border-radius:50%;background:#eaf6f9;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;flex-shrink:0}.kc-rental-periods{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.kc-rental-periods button{padding:8px 12px;border:1px solid #b9d2df;border-radius:6px;background:#fff;color:#153451}.kc-rental-periods button[aria-pressed=true]{background:#009da8;color:white;border-color:#009da8}.kc-rental-radio{display:flex;align-items:center;gap:10px;margin:10px 0}.kc-rental-radio input{width:18px!important;height:18px;accent-color:#009da8}.kc-rental-price-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}.kc-rental-price-row>strong{grid-column:1/-1}.kc-rental-gp{padding:10px;background:#eff9fa;color:#007b8a;border-radius:6px;margin-top:10px;font-weight:700}.kc-rental-settings small{color:#607c91}.kc-rental-settings input{max-width:100%;min-width:0}.kc-rental-band{display:flex;justify-content:space-between;gap:3mm;background:#eaf8fa;border-radius:4px;padding:2mm 3mm;margin:2mm 0;font-size:9px}.kc-rental-payment-box{border:1px solid #b8ccd6;border-radius:4px;padding:2mm;margin-top:2mm;break-inside:avoid}.kc-rental-payment-box>strong{font-size:10px}.kc-rental-payment-box .net{font-size:10px!important;color:#008491}.kc-quote-summary-amounts{min-width:0;break-inside:avoid}@media(max-width:600px){.kc-rental-price-row{grid-template-columns:1fr}.kc-rental-band{flex-wrap:wrap}}

/* Shared quotation header for preview, print and Save as PDF. */
:is(.kc-quotation-preview,.kc-print-root) .kc-print-header,.kc-quotation-preview>header{display:grid;grid-template-columns:1.2fr 1fr;gap:4mm;align-items:start;padding-bottom:0}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-preview-company{gap:1px;color:#0b203b;font-size:calc(var(--document-size,12px) * .833333);line-height:1.3}
:is(.kc-quotation-preview,.kc-print-root) .kc-company-logo{width:30mm;height:11mm;margin:0;object-position:left center}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-preview-company strong{font-size:15px;font-weight:400;color:#233b55}
.kc-company-name-th{font-size:12px;margin:0}.kc-company-contact{display:flex;align-items:flex-start;gap:5px}.kc-company-contact svg{width:12px;height:12px;flex:none;color:var(--document-accent,#0aada9)}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-brand-ribbon{height:12mm;min-height:12mm;margin:0;padding:0 2mm}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-brand-ribbon img.kc-quote-ribbon-logo{height:12mm;width:calc(var(--document-logo-size,140px) * .864)}
.kc-quote-title-row{display:flex;align-items:center;justify-content:space-between;gap:2mm}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-preview-id h2{margin:0;padding:0;border:0;color:#11263f;font-size:23px;font-weight:600;text-align:left!important}
.kc-quote-print-status{background:var(--document-accent,#0aada9);color:white;border-radius:30px;padding:3px 9px;font-size:9px}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-preview-id dl{display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;margin:4px 0 0}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-preview-id dl>div{display:flex;flex-direction:column;gap:2px;padding:3px 7px;border:1px solid #e1e9ec;border-radius:7px;font-size:9px;min-width:0}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-preview-id dl>div:first-child{grid-column:1/-1;display:grid;grid-template-columns:1fr 1.7fr;align-items:center;gap:8px;background:#edf5f8;border:0;padding:4px 7px;font-size:calc(var(--document-size,12px) * .833333)}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-preview-id dt{color:#4d647a}.kc-quote-preview-id dd{overflow-wrap:anywhere}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-preview-id dd{font-weight:400;text-align:left}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-preview-party{display:grid;grid-template-columns:1.15fr 1fr;gap:3mm;padding:0;margin:2mm 0 1mm}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-preview-party>section{border:1px solid #d7e5e8;border-radius:6px;padding:2mm 2.5mm;display:flex;flex-direction:column;gap:.6mm;font-size:9px;min-width:0}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-preview-party>section:nth-child(2){background:linear-gradient(120deg,#f4fdfd,white)}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-preview-party h3{font-size:12px;font-weight:400;color:var(--document-accent,#0aada9);margin:0 0 3px;padding-bottom:3px}
.kc-quote-customer-fields,.kc-quote-prepared-fields{margin:0}.kc-quote-customer-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 8px;padding-top:1px}
.kc-quote-customer-fields dt{color:var(--document-accent,#0aada9)}.kc-quote-customer-fields dd,.kc-quote-prepared-fields dd{margin:.3mm 0 0;overflow-wrap:anywhere}
.kc-quote-prepared-fields{border-top:1px solid #a4e0df;padding-top:1mm}.kc-quote-prepared-fields>div{display:grid;grid-template-columns:1fr 1.35fr;gap:4px;padding:1px 0;font-size:calc(var(--document-size,12px) * .833333);line-height:1.5}.kc-quote-prepared-fields dt{color:#738796}.kc-quote-prepared-fields dd{margin:0}
:is(.kc-quotation-preview,.kc-print-root)[data-design-prepared=false] .kc-quote-preview-party{grid-template-columns:1fr}

.kc-quote-brand-ribbon img.kc-quote-ribbon-logo{position:relative;z-index:1}
/* Account 360 quotation geometry; keep the divider and four customer fields. */
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-preview-id dl>div:first-child dd{border-left:1px solid #adc8d1;padding-left:8px;font-size:12px}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-preview-company>small{font-size:9px}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-customer-fields>div{min-width:0}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-customer-fields dt,:is(.kc-quotation-preview,.kc-print-root) .kc-quote-customer-fields dd{font-size:calc(var(--document-size,12px) * .833333);font-weight:400}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-preview-party>section:first-child>strong{font-size:11px;font-weight:400}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-preview-party>section:nth-child(2) h3{border-bottom:1px solid #a4e0df;padding-bottom:3px}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-prepared-fields{border-top:0;display:grid;gap:1px;padding-top:0}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-prepared-fields dt,:is(.kc-quotation-preview,.kc-print-root) .kc-quote-prepared-fields dd{font-size:calc(var(--document-size,12px) * .833333);font-weight:400}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-brand-ribbon{background:transparent}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-brand-stripe{background:none;width:100%;height:100%;position:absolute;inset:0;z-index:0;pointer-events:none}
:is(.kc-quotation-preview,.kc-print-root)[data-design-header=line] .kc-quote-brand-ribbon,:is(.kc-quotation-preview,.kc-print-root)[data-design-header=plain] .kc-quote-brand-ribbon{background:transparent}

:is(.kc-quotation-preview,.kc-print-root)[data-design-borders=false] .kc-quote-preview-party>section{border-color:transparent}
.kc-print-root .kc-quote-preview-line{font-size:var(--document-size,12px);padding-top:var(--print-row-space,2.2mm);padding-bottom:var(--print-row-space,2.2mm)}
.kc-print-root[data-design-spacing=compact]{--print-row-space:1.2mm}.kc-print-root[data-design-spacing=airy]{--print-row-space:3.2mm}

/* Approved compact layout shared by the central template, every user preview and PDF. */
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-preview-summary{grid-template-columns:minmax(0,1fr) 36%;gap:5mm;margin-top:2mm;padding:2mm 0}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-preview-terms p{margin:1mm 0 2mm;line-height:1.35}
:is(.kc-quotation-preview,.kc-print-root) .kc-quote-preview-summary dl>div{padding:1mm 0}
.kc-quotation-preview>footer{margin-top:3mm;gap:6mm}
.kc-quotation-preview>footer>div{padding-top:12mm}
.kc-quotation-preview>footer .kc-quote-seller-signature{height:11mm}
.kc-print-root .kc-print-signatures{padding-top:2mm}
.kc-print-root .kc-print-footer footer>div{padding-top:12mm}
.kc-print-root .kc-quote-seller-signature{height:11mm}

`;
/** Isolated A4 print document: no dialog clipping or mobile layout rules. */
export const quotationPrintCSS=`
.kc-recurring-summary{background:#eff9f9;padding:3mm;margin-bottom:3mm;border-radius:2mm;break-inside:avoid}.kc-recurring-summary small{display:block;font-size:8pt}.kc-recurring-line-summary{color:#008e91}

@page{size:A4 portrait;margin:10mm 10mm 10mm}
*{box-sizing:border-box}html,body{width:190mm;margin:0;padding:0;background:white;color:#182b3b;font-family:Tahoma,Arial,sans-serif;font-size:10pt;line-height:1.4;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.kc-print-document{font-family:var(--document-font,Tahoma,Arial,sans-serif);width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tfoot{display:table-footer-group}tbody{display:table-row-group}td{padding:0;vertical-align:top}tr{break-inside:avoid}tr.long-content{break-inside:auto}
.kc-print-header{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6mm;padding-bottom:3mm;align-items:start}
.kc-quote-preview-company{display:flex;min-width:0;flex-direction:column;align-items:flex-start;gap:.5mm;color:#60717d;font-size:var(--document-size,9pt);line-height:1.55;overflow-wrap:anywhere}.kc-quote-preview-company strong{color:#172033;font-size:14pt}.kc-company-logo{width:210px;max-width:100%;height:70px;object-fit:contain;object-position:left center;margin-bottom:8px}
.kc-quote-preview-id{min-width:0}.kc-quote-preview-id h2{font-size:27px;font-weight:400;text-align:right;margin:18px 0 10px;padding-bottom:9px;border-bottom:2px solid var(--document-accent,#0aada9)}.kc-quote-preview-id dl{margin:0}.kc-quote-preview-id dl>div{display:grid;grid-template-columns:1fr 1.6fr;gap:3mm;padding:1mm 0;font-size:9pt}.kc-quote-preview-id dt{color:var(--document-accent,#0aada9)}.kc-quote-preview-id dd{margin:0;text-align:right;font-weight:600}
.kc-quote-brand-ribbon{position:relative;isolation:isolate;display:flex;align-items:center;justify-content:flex-end;width:100%;height:78px;min-height:78px;overflow:hidden;grid-column:1/-1;margin:0 0 12px;padding:8px 22px;background:linear-gradient(135deg,transparent 0 12%,color-mix(in srgb,var(--quote-brand-accent) 8%,white) 12% 100%);print-color-adjust:exact;-webkit-print-color-adjust:exact}
.kc-quote-brand-stripe{position:absolute;inset:0;z-index:-1;background:linear-gradient(135deg,transparent 0 12%,color-mix(in srgb,var(--quote-brand-accent) 14%,white) 12% 21%,white 21% 26%,color-mix(in srgb,var(--quote-brand-accent) 66%,white) 26% 42%,color-mix(in srgb,var(--quote-brand-accent) 20%,white) 42% 49%,transparent 49%)}
.kc-quote-brand-ribbon img.kc-quote-ribbon-logo{display:block;width:140px;max-width:37%;height:60px;margin:0;object-fit:contain;object-position:center;background:transparent;border:0;padding:0;border-radius:0}
.kc-quote-brand-ribbon{justify-content:var(--document-logo-align,flex-end)}.kc-quote-brand-ribbon img.kc-quote-ribbon-logo{width:var(--document-logo-size,140px);max-width:65%}
[data-design-header=line] .kc-quote-brand-ribbon{background:transparent;border-bottom:3px solid var(--document-accent)}
[data-design-header=plain] .kc-quote-brand-ribbon{background:transparent}
:is([data-design-header=line],[data-design-header=plain]) .kc-quote-brand-stripe{display:none}
.kc-quote-preview-party{display:grid;grid-template-columns:1.3fr 1fr;gap:5mm;padding:3mm 0}.kc-quote-preview-party section{display:flex;flex-direction:column;gap:.8mm;font-size:9pt;overflow-wrap:anywhere}.kc-quote-preview-party h3{margin:0 0 1mm;font-size:10pt}
.kc-quote-preview-line{display:grid;grid-template-columns:var(--print-columns);gap:2mm;padding:2.2mm 1mm;border-bottom:.2mm solid #dce4e7;font-size:9pt;align-items:start;overflow-wrap:anywhere}.kc-quote-preview-line>*{min-width:0}.kc-quote-preview-line small{display:block;white-space:pre-wrap;font-size:8pt;font-weight:normal}.kc-quote-preview-line.header{background:var(--document-accent,#0aada9);color:white;font-weight:bold;font-size:8pt;margin-top:2mm;padding:2mm 1mm}.kc-quote-preview-line>:nth-last-child(-n+4){text-align:right}.kc-quote-preview-line strong{font-weight:600}
.kc-quote-preview-summary{display:grid;grid-template-columns:minmax(0,1fr) 65mm;gap:7mm;padding:4mm 0;font-size:9pt;overflow-wrap:anywhere}.kc-quote-preview-terms p{white-space:pre-wrap;margin:1mm 0 3mm}.kc-quote-preview-summary dl{margin:0;break-inside:avoid}.kc-quote-preview-summary dl>div{display:flex;justify-content:space-between;gap:3mm;padding:1.5mm 0}.kc-quote-preview-summary dd{margin:0;text-align:right}.kc-quote-preview-summary .net{font-size:12pt;font-weight:bold;border-top:.5mm solid}
.kc-print-footer{padding-top:3mm;border-top:.3mm solid var(--document-accent,#0aada9);margin-top:3mm}.kc-print-footer footer{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6mm;text-align:center;font-size:8pt}.kc-print-footer footer>div{position:relative;padding-top:14mm}.kc-print-footer i{display:block;border-top:.2mm solid;margin:0 2mm 1mm}.kc-print-footer span,.kc-print-footer small{display:block}.kc-quote-seller-signature{position:absolute;top:0;left:50%;transform:translateX(-50%);max-width:40mm;height:13mm;object-fit:contain}.kc-quote-preview-footer{font-size:8pt;text-align:center;white-space:pre-wrap;margin:2mm 0 0}.kc-print-reference{text-align:right;font-size:7pt;color:#536471;margin:2mm 0 0}
[data-design-prepared=false] .kc-quote-preview-party>section:nth-child(2),[data-design-signatures=false] .kc-print-footer footer,[data-design-notes=false] .kc-quote-preview-terms,[data-design-address=false] .kc-quote-preview-company>span:first-of-type,[data-design-contact=false] .kc-quote-preview-company>span:not(:first-of-type),[data-design-tax=false] .kc-quote-preview-company>small{display:none}
thead,tfoot{break-inside:avoid}
/* Leave 1mm below the 277mm A4 content area for browser/printer rounding. */
.kc-print-root{display:flow-root;font-family:var(--document-font,Tahoma,Arial,sans-serif)}.kc-print-page{width:190mm;height:276mm;display:flex;flex-direction:column;break-after:page}.kc-print-page:last-child{break-after:auto}.kc-print-page-header,.kc-print-page-footer{flex:none}.kc-print-page-header{padding-bottom:2mm}.kc-print-page-body{flex:1;min-height:0;display:flex;flex-direction:column}.kc-print-page-body>*{flex:none}.kc-print-page-body>.kc-print-signatures{margin-top:3mm}.kc-print-page-footer{margin-top:2mm}.kc-print-long-text{white-space:pre-wrap;font-size:9pt;line-height:1.4;overflow-wrap:anywhere}.kc-print-measure{position:absolute;left:-10000px;width:190mm}
.kc-print-root[data-watermark]:not([data-watermark=""]):before{content:attr(data-watermark);position:fixed;top:40%;left:0;right:0;text-align:center;transform:rotate(-28deg);font-size:48pt;opacity:.075;color:var(--document-accent);pointer-events:none}
[data-design-prepared=false] .kc-quote-preview-party{grid-template-columns:1fr}
${quotationHeaderCSS}
@media print{html,body{margin:0!important;padding:0!important;height:auto!important;min-height:0!important}.kc-print-page:last-child{break-after:auto;page-break-after:auto}}
@media screen{body{width:190mm;margin:10mm auto}}
`;
export function buildQuotationPrint(source,doc){
 const table=doc.createElement('table');table.className='kc-print-document';
 for(const a of source.attributes)if(a.name.startsWith('data-')||a.name==='style')table.setAttribute(a.name,a.value);
 const rows=[...source.querySelectorAll('.kc-quote-preview-line')];const hasCode=rows[0]?.children.length===7;
 table.style.setProperty('--print-columns',source.querySelector('[data-recurring="true"]')?'6mm minmax(0,1fr) 14mm 23mm 20mm 14mm 25mm':hasCode?'6mm 19mm minmax(0,1fr) 12mm 12mm 24mm 27mm':'6mm minmax(0,1fr) 12mm 12mm 24mm 27mm');
 const add=(section,node,long=false)=>{if(!node)return;const row=section.insertRow();if(long)row.className='long-content';row.insertCell().append(node);};
 const clone=selector=>source.querySelector(selector)?.cloneNode(true);
 const head=doc.createElement('div'),header=clone(':scope > header');head.className='kc-print-fixed-header';if(header){header.className='kc-print-header';head.append(header);}const party=clone('.kc-quote-preview-party');if(party)head.append(party);const rentalBand=clone('.kc-rental-band');if(rentalBand)head.append(rentalBand);if(rows[0])head.append(rows[0].cloneNode(true));
 const tbody=table.createTBody();
 for(const row of rows.slice(1))add(tbody,row.cloneNode(true),row.textContent.length>1400);
 add(tbody,clone('.kc-quote-preview-summary'),true);
 const foot=doc.createElement('div');foot.className='kc-print-footer';for(const selector of [':scope > footer','.kc-quote-preview-footer']){const n=clone(selector);if(n)foot.append(n);}
 const reference=doc.createElement('p');reference.className='kc-print-reference';reference.textContent=source.querySelector('.kc-quote-preview-id h2')?.textContent+' · '+(source.querySelector('.kc-quote-preview-id dd')?.textContent||'');foot.append(reference);foot.classList.add('kc-print-fixed-footer');
 const root=doc.createElement('div');root.className='kc-print-root';for(const a of source.attributes)if(a.name.startsWith('data-')||a.name==='style')root.setAttribute(a.name,a.value);
 root.style.setProperty('--print-columns',table.style.getPropertyValue('--print-columns'));root.append(head,table,foot);return root;
}
/** Paginate measured blocks rather than relying on browser table-header heuristics. */
export async function prepareQuotationPrint(root,doc){
 await Promise.all([...root.querySelectorAll('img')].map(img=>img.decode().catch(()=>{})));await doc.fonts.ready;
 const header=root.querySelector('.kc-print-fixed-header'),footer=root.querySelector('.kc-print-fixed-footer');
 const blocks=[...root.querySelectorAll('tbody > tr > td')].map(cell=>cell.firstElementChild);
 // Keep the reference/footer text on every sheet, but paginate signatures once.
 const signatures=footer.querySelector('footer');
 if(signatures&&root.dataset.designSignatures!=='false'){
  const signatureBlock=doc.createElement('div');signatureBlock.className='kc-print-footer kc-print-signatures';
  signatureBlock.append(signatures);blocks.push(signatureBlock);
 }else signatures?.remove();
 root.replaceChildren();
 let body;
 const newPage=()=>{
  const page=doc.createElement('section');page.className='kc-print-page';
  const head=header.cloneNode(true),foot=footer.cloneNode(true);head.className='kc-print-page-header';foot.classList.remove('kc-print-fixed-footer');foot.classList.add('kc-print-page-footer');
  body=doc.createElement('div');body.className='kc-print-page-body';page.append(head,body,foot);root.append(page);
  if(body.clientHeight<80)throw Error('หัวและท้ายเอกสารยาวเกินพื้นที่ A4 กรุณาย่อข้อมูลในแม่แบบ');
 };
 const fits=()=>body.scrollHeight<=body.clientHeight+1;
 const splitText=(block,target,text)=>{
  const characters=Array.from(text);let offset=0;
  while(offset<characters.length){
   if(body.childElementCount)newPage();
   const part=block.cloneNode(true),cell=target(part);cell.replaceChildren();cell.classList.add('kc-print-long-text');body.append(part);
   // Repeat only the text continuation; quantities and amounts stay on the first part.
   if(offset&&part.classList.contains('kc-quote-preview-line'))for(const child of part.children)if(child!==cell)child.textContent='';
   let low=0,high=characters.length-offset;
   while(low<high){const mid=Math.ceil((low+high)/2);cell.textContent=characters.slice(offset,offset+mid).join('');if(fits())low=mid;else high=mid-1;}
   if(!low)throw Error('ไม่สามารถจัดรายละเอียดลงกระดาษ A4 ได้ กรุณาตรวจสอบแม่แบบ');
   // Prefer a word/line boundary without dropping any characters.
   let end=low;if(low<characters.length-offset){for(let i=low-1;i>low*.8;i--)if(/\s/.test(characters[offset+i])){end=i+1;break;}}
   cell.textContent=characters.slice(offset,offset+end).join('');offset+=end;
  }
 };
 const append=block=>{
  body.append(block);if(fits())return;block.remove();
  if(body.childElementCount){newPage();body.append(block);if(fits())return;block.remove();}
  if(block.classList.contains('kc-quote-preview-line')){
   const index=block.children.length===7?2:1,cell=block.children[index];
   const text=[...cell.children].map(node=>node.textContent).join('\n')||cell.textContent;
   splitText(block,part=>part.children[index],text);return;
  }
  if(block.classList.contains('kc-quote-preview-summary')){
   const terms=block.querySelector('.kc-quote-preview-terms');
   if(terms?.textContent){
    const note=doc.createElement('div');note.className='kc-quote-preview-terms kc-print-long-text';
    const text=[...terms.children].map(node=>node.textContent).join('\n');
    if(root.dataset.designNotes!=='false')splitText(note,part=>part,text);
   }
   if(!terms?.textContent)throw Error('ยอดรวมยาวเกินพื้นที่พิมพ์ A4');
   const totals=block.cloneNode(true);totals.querySelector('.kc-quote-preview-terms')?.replaceChildren();append(totals);return;
  }
  throw Error('เนื้อหาบางส่วนยาวเกินพื้นที่พิมพ์ A4');
 };
 newPage();for(const block of blocks)append(block);
 const pages=[...root.children];pages.forEach((page,index)=>{const label=page.querySelector('.kc-print-reference');label.textContent+=` · ${index+1} / ${pages.length}`;});
}
export async function printQuotation(source,quotationNumber){
 if(!source)throw Error('ไม่พบใบเสนอราคาสำหรับพิมพ์');
 const frame=document.createElement('iframe');frame.title='Quotation A4 print';frame.style.cssText='position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0';document.body.append(frame);
 let previousTitle,printTitle;let timer;
 const cleanup=()=>{clearTimeout(timer);if(previousTitle!==undefined&&document.title===printTitle)document.title=previousTitle;frame.remove();};
 try{const doc=frame.contentDocument;doc.open();doc.write('<!doctype html><html><head><meta charset="utf-8"><title>Quotation</title></head><body></body></html>');doc.close();
 for(const face of document.fonts)doc.fonts.add(face);
 const style=doc.createElement('style');style.textContent=quotationPrintCSS;doc.head.append(style);const root=buildQuotationPrint(source,doc);doc.body.append(root);await prepareQuotationPrint(root,doc);
 await new Promise(resolve=>frame.contentWindow.requestAnimationFrame(()=>frame.contentWindow.requestAnimationFrame(resolve)));
 // Chromium uses the parent document title for Save as PDF from an iframe.
 printTitle=String(quotationNumber||'Quotation').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'-')||'Quotation';
 previousTitle=document.title;doc.title=printTitle;document.title=printTitle;
 frame.contentWindow.addEventListener('afterprint',cleanup,{once:true});timer=setTimeout(cleanup,300000);frame.contentWindow.focus();frame.contentWindow.print();
 }catch(error){cleanup();throw error;}
}
