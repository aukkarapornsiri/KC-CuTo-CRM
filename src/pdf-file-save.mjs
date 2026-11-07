export const PDF_PICKER_ID='kc-cuto-pdf-save';
const encode=value=>new TextEncoder().encode(value);
export function imagePDF(jpeg,width,height){
 if(!(jpeg instanceof Uint8Array)||jpeg[0]!==255||jpeg[1]!==216||!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0)throw Error('Invalid PDF image');
 const pageWidth=841.889764,pageHeight=595.275591,parts=[encode('%PDF-1.4\n'),new Uint8Array([37,226,227,207,211,10])],offsets=[0];let length=parts.reduce((n,p)=>n+p.length,0);
 const add=part=>{const bytes=typeof part==='string'?encode(part):part;parts.push(bytes);length+=bytes.length;};
 const object=(id,body)=>{offsets[id]=length;add(id+' 0 obj\n');for(const part of body)add(part);add('\nendobj\n');};
 object(1,['<< /Type /Catalog /Pages 2 0 R >>']);
 object(2,['<< /Type /Pages /Kids [3 0 R] /Count 1 >>']);
 object(3,['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+pageWidth+' '+pageHeight+'] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>']);
 object(4,['<< /Type /XObject /Subtype /Image /Width '+width+' /Height '+height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n',jpeg,'\nendstream']);
 const drawing='q\n'+pageWidth+' 0 0 '+pageHeight+' 0 0 cm\n/Im0 Do\nQ\n';object(5,['<< /Length '+encode(drawing).length+' >>\nstream\n',drawing,'endstream']);
 const xref=length;add('xref\n0 6\n0000000000 65535 f \n');for(let i=1;i<=5;i++)add(String(offsets[i]).padStart(10,'0')+' 00000 n \n');add('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
 return new Blob(parts,{type:'application/pdf'});
}
export const pdfFilename=value=>(String(value||'Sales Order').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/\.pdf$/i,'')||'Sales Order')+'.pdf';
export async function captureReviewPDF(paper){
 const {default:html2canvas}=await import('./vendor/html2canvas-1.4.1.mjs');
 const doc=paper.ownerDocument;
 await doc.fonts?.ready;
 await Promise.all([...paper.querySelectorAll('img')].map(image=>image.decode()));
 // Capture at full A4 size, independently of the review window's screen zoom.
 const canvas=await html2canvas(paper,{backgroundColor:'#ffffff',scale:3,width:1123,height:794,windowWidth:1440,windowHeight:1000,useCORS:true,logging:false,scrollX:0,scrollY:0,
  onclone:async cloned=>{for(const face of doc.fonts)cloned.fonts.add(face);await cloned.fonts.ready;const target=cloned.querySelector('.kc-review-paper');target.style.zoom='1';target.style.margin='0';target.style.boxShadow='none';cloned.querySelector('.kc-review-viewer').style.padding='0';}
 });
 try{const jpeg=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PDF image unavailable')),'image/jpeg',.98));return imagePDF(new Uint8Array(await jpeg.arrayBuffer()),canvas.width,canvas.height);}finally{canvas.width=0;canvas.height=0;}
}
export async function saveReviewPDF(paper,{targetWindow=paper.ownerDocument.defaultView,filename='Sales Order',render=captureReviewPDF}={}){
 const name=pdfFilename(filename);let handle;
 // Invoke the picker before any await so the click's user activation is retained.
 // A stable picker id lets the browser remember the last selected directory.
 if(typeof targetWindow.showSaveFilePicker==='function'){
  try{handle=await targetWindow.showSaveFilePicker({id:PDF_PICKER_ID,suggestedName:name,types:[{description:'PDF',accept:{'application/pdf':['.pdf']}}],excludeAcceptAllOption:true});}
  catch(error){if(error.name==='AbortError')return {status:'cancelled'};throw error;}
 }
 const blob=await render(paper);
 if(handle){let writable;try{writable=await handle.createWritable();await writable.write(blob);await writable.close();return {status:'saved'};}catch(error){try{await writable?.abort();}catch{}throw error;}}
 // Unsupported browsers use their normal file download flow, never printing.
 const doc=paper.ownerDocument,url=URL.createObjectURL(blob),link=doc.createElement('a');link.href=url;link.download=name;doc.body.append(link);link.click();link.remove();targetWindow.setTimeout(()=>URL.revokeObjectURL(url),60000);return {status:'downloaded'};
}
