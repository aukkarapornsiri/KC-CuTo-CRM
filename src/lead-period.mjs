// Calendar periods use Bangkok dates; weeks run Monday–Sunday (ISO 8601).
const DAY=86400000;
const iso=d=>d.toISOString().slice(0,10);
const date=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))?new Date(s+'T00:00:00Z'):null;
export function bangkokDay(value=new Date()){
 if(!value)return '';
 const d=new Date(value);return Number.isFinite(d.getTime())?iso(new Date(d.getTime()+7*3600000)):'';
}
export function periodInput(mode,anchor){
 const d=date(anchor);if(!d)return '';
 if(mode==='year')return anchor.slice(0,4);
 if(mode==='month')return anchor.slice(0,7);
 if(mode==='week'){const t=new Date(d);t.setUTCDate(t.getUTCDate()+4-(t.getUTCDay()||7));const year=t.getUTCFullYear(),week=Math.ceil(((t-Date.UTC(year,0,1))/DAY+1)/7);return year+'-W'+String(week).padStart(2,'0');}
 return anchor;
}
export function periodAnchor(mode,value){
 if(mode==='year')return /^\d{4}$/.test(value)&&Number(value)>0?value+'-01-01':'';
 if(mode==='month')return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)?value+'-01':'';
 if(mode==='week'){
  const m=/^(\d{4})-W(\d{2})$/.exec(value);if(!m||+m[2]<1||+m[2]>53)return '';
  const d=new Date(Date.UTC(+m[1],0,4));d.setUTCDate(d.getUTCDate()-(d.getUTCDay()||7)+1+(+m[2]-1)*7);
  return periodInput('week',iso(d))===value?iso(d):'';
 }
 const d=date(value);return d&&iso(d)===value?value:'';
}
export function periodBounds(mode,anchor){
 const d=date(anchor);if(mode==='all'||!d)return null;
 const start=new Date(d),end=new Date(d);
 if(mode==='week'){start.setUTCDate(d.getUTCDate()-(d.getUTCDay()||7)+1);end.setTime(start.getTime()+6*DAY);}
 else if(mode==='month'){start.setUTCDate(1);end.setUTCMonth(end.getUTCMonth()+1,0);}
 else if(mode==='year'){start.setUTCMonth(0,1);end.setUTCMonth(11,31);}
 return {from:iso(start),to:iso(end)};
}
export function filterLeadPeriod(rows,mode,anchor){const bounds=periodBounds(mode,anchor);return bounds?rows.filter(r=>{const day=bangkokDay(r.created_at);return day&&day>=bounds.from&&day<=bounds.to;}):rows;}
