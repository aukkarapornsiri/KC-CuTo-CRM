import {bangkokToday} from './sales-order-view.mjs';
import {sortRecordsNewest} from './record-order.mjs';
export function salesJourney({leads=[],opportunities=[],quotations=[],orders=[],activities=[],approvals={},followups=[]},now=new Date()){
 leads=Array.isArray(leads)?leads:[];opportunities=Array.isArray(opportunities)?opportunities:[];quotations=Array.isArray(quotations)?quotations:[];orders=Array.isArray(orders)?orders:[];activities=Array.isArray(activities)?activities:[];
 const opps=new Map(opportunities.map(o=>[o.id,o])),quoteIds=new Set(quotations.map(q=>q.id)),follow=new Map(followups.map(f=>[f.quotation_id,f])),today=bangkokToday(now);
 const card=(q,so)=>{const opportunity=q?.opportunity_id?opps.get(q.opportunity_id):null;
 const lead=opportunity?.lead_id?leads.find(l=>l.id===opportunity.lead_id):null;
 const tasks=sortRecordsNewest(activities.filter(a=>!['completed','cancelled'].includes(a.status)&&((a.related_module==='quotations'&&a.related_id===(q?.id||so?.quotation_id))||(a.related_module==='sales_orders'&&a.related_id===so?.id)))).sort((a,b)=>String(a.scheduled_at||'9999').localeCompare(String(b.scheduled_at||'9999')));
 const approval=so?approvals[so.id]?.status||null:null;
 const next=so?(so.status==='cancelled'?'cancelled':so.status==='completed'?'completed':so.status==='delivered'?'complete':approval==='pending'?'approve':approval==='rejected'?'revise':approval!=='approved'?'request':'deliver'):'followup';
 return {id:so?'so:'+so.id:'quote:'+q.id,quotation:q,order:so,opportunity,lead,tasks,approval,next,followup:follow.get(q?.id||so?.quotation_id)||null,overdue:so?.status==='confirmed'&&!!so.expected_delivery_date&&so.expected_delivery_date<today};};
 const cards=sortRecordsNewest(quotations).flatMap(q=>{const linked=orders.filter(s=>s.quotation_id===q.id);return linked.length?linked.map(s=>card(q,s)):[card(q,null)];});
 // SOs remain visible when quotation access/data is unavailable; never guess a relationship from customer alone.
 for(const so of sortRecordsNewest(orders))if(!quoteIds.has(so.quotation_id))cards.push(card(null,so));
 return cards;
}
