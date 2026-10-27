import fs from 'node:fs';
const src=fs.readFileSync(process.argv[2],'utf8'),body=src.split('\n').find(l=>l.includes('async function start(row,seed={})'));
let active=0,peak=0,calls=0;const waiting=[];
const delay=async(value=[])=>{if(active>=5)await new Promise(r=>waiting.push(r));active++;peak=Math.max(peak,active);calls++;await new Promise(r=>setTimeout(r,25));active--;waiting.shift()?.();return value;};
const q={select(){return q},eq(){return q},order(){return delay([])}};
const context={run:async fn=>fn(),fieldsFor:()=>['customer_id','contact_id','owner_id','opportunity_id'].map(key=>({type:'relation',key})),RELATIONS:{customer_id:'customers',contact_id:'contacts',owner_id:'profiles',opportunity_id:'opportunities'},entity:'quotations',demoMode:false,all:()=>delay([]),priceCatalog:()=>delay([]),unwrap:async p=>p,client:{from:()=>q},Lookup:()=>{},Masters:()=>{},Edit:()=>{},Select:()=>{},defaults:()=>({}),profileEntity:false,copy:structuredClone,t:(_,en)=>en};
const start=Function(...Object.keys(context),body+';return start;')(...Object.values(context));const times=[];
for(let i=0;i<5;i++){const before=performance.now();await start(null);times.push(performance.now()-before);}
console.log(JSON.stringify({runs:5,latencyPerReadMs:25,calls,peak,medianMs:Math.round(times.sort((a,b)=>a-b)[2]),samples:times.map(Math.round)}));
