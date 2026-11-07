import test from 'node:test';import assert from 'node:assert/strict';
import {imagePDF,pdfFilename,PDF_PICKER_ID,saveReviewPDF} from '../src/pdf-file-save.mjs';
test('opens Save As synchronously, remembers the picker directory id and writes a PDF',async()=>{
 const calls=[],blob=new Blob(['%PDF-1.4'],{type:'application/pdf'}),paper={};
 const targetWindow={showSaveFilePicker:opts=>{calls.push(['picker',opts]);return Promise.resolve({createWritable:async()=>({write:async b=>{assert.equal(b,blob);calls.push(['write']);},close:async()=>calls.push(['close'])})});}};
 const work=saveReviewPDF(paper,{targetWindow,filename:'SO-1',render:async()=>{calls.push(['render']);return blob;}});
 assert.equal(calls[0][0],'picker');assert.equal(calls.length,1);assert.deepEqual(await work,{status:'saved'});assert.deepEqual(calls.map(x=>x[0]),['picker','render','write','close']);assert.equal(calls[0][1].id,PDF_PICKER_ID);assert.equal(calls[0][1].suggestedName,'SO-1.pdf');assert.ok(!Object.hasOwn(calls[0][1],'startIn'),'Do not override the browser remembered directory');
});
test('picker cancellation creates no PDF and performs no write or download',async()=>{
 let render=0;const result=await saveReviewPDF({}, {targetWindow:{showSaveFilePicker:()=>Promise.reject(Object.assign(Error('Cancelled'),{name:'AbortError'}))},render:async()=>{render++;}});assert.equal(result.status,'cancelled');assert.equal(render,0);
});
test('failed writes abort the transaction and remain retryable',async()=>{
 let aborted=false;const targetWindow={showSaveFilePicker:async()=>({createWritable:async()=>({write:async()=>{throw Error('Disk full');},abort:async()=>{aborted=true;}})})};await assert.rejects(saveReviewPDF({}, {targetWindow,render:async()=>new Blob(['PDF'])}),/Disk full/);assert.ok(aborted);
});
test('PDF has one A4 landscape page, binary-safe image offsets and a safe filename',async()=>{
 const bytes=new Uint8Array(await imagePDF(new Uint8Array([255,216,255,217]),100,100).arrayBuffer()),text=new TextDecoder().decode(bytes);assert.ok(text.startsWith('%PDF-1.4'));assert.match(text,/\/Count 1/);assert.match(text,/\/MediaBox \[0 0 841\.889764 595\.275591\]/);const offset=Number(text.match(/startxref\n(\d+)/)[1]);assert.equal(new TextDecoder().decode(bytes.slice(offset,offset+4)),'xref');assert.equal(pdfFilename('SO:1/2.pdf'),'SO-1-2.pdf');
});
