import {addressProvince,addressDistrict,isThaiCountry,ADDRESS_PROVINCES} from './thai-address.mjs';
export function streetValue(record,key,lang){
 const explicit=record?.[key+'_'+lang];if(explicit)return explicit;
 const legacy=String(record?.[key]||'');
 return legacy;
}
export function streetInputValue(record,key,lang){
 if(record?.[key+'_'+lang]!=null)return record[key+'_'+lang];
 const legacy=String(record?.[key]||'');return (/[ก-๙]/.test(legacy)?'th':'en')===lang?legacy:'';
}
export function localizeAddressText(value,lang='th'){
 return String(value||'').split(',').map(part=>{const v=part.trim();if(!v)return '';
 if(isThaiCountry(v))return lang==='th'?'ประเทศไทย':'Thailand';
 const countries=[['United States','สหรัฐอเมริกา'],['United Kingdom','สหราชอาณาจักร'],['Singapore','สิงคโปร์'],['Malaysia','มาเลเซีย'],['Vietnam','เวียดนาม'],['China','จีน'],['Japan','ญี่ปุ่น'],['Australia','ออสเตรเลีย']];const country=countries.find(c=>c.includes(v));if(country)return country[lang==='th'?1:0];
 const province=addressProvince(v);if(province)return province[lang==='th'?'th':'en'];
 const districts=ADDRESS_PROVINCES.flatMap(p=>p.districts).filter(d=>d.th===v||d.en.toLowerCase()===v.toLowerCase());
 return districts.length?districts[0][lang==='th'?'th':'en']:v;
 }).filter(Boolean).join(', ');
}
// No language argument retains the legacy formatting contract for integrations.
export function formatCustomerAddress(customer={},lang) {
 customer=customer||{};const p=addressProvince(customer.province),d=addressDistrict(p,customer.billing_city);
 return [...new Set([lang?streetValue(customer,'address',lang):customer.address,
 lang&&d?d[lang==='th'?'th':'en']:customer.billing_city,lang&&p?p[lang==='th'?'th':'en']:customer.province,
 customer.billing_postal_code,lang&&isThaiCountry(customer.billing_country)?(lang==='th'?'ประเทศไทย':'Thailand'):customer.billing_country]
 .flatMap(value=>String(value||'').split(',')).map(value=>value.trim()).filter(Boolean))].join(', ');
}
export function quotationAddressPatch(quotation,customer) {
 if(!customer||quotation.id&&(quotation.status!=='draft'||['pending','approved'].includes(quotation.approval_status)))return {};
 if(quotation.address_source==='custom')return {};
 const address=formatCustomerAddress(customer,quotation.document_language),current=String(quotation.counterparty_address||'').trim();
 if(quotation.address_source==='customer'||!current||['thailand','ไทย','ประเทศไทย'].includes(current.toLowerCase())||current===address)
  return {counterparty_address:address,address_source:'customer'};
 return {};
}

export function addressInputValue(value,lang){const localized=localizeAddressText(value,lang);return localized===String(value||'').trim()?value:localized;}
