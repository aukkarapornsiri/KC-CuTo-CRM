export const LEAD_RULE_FIELDS=['company_name','tax_id','salutation','first_name','last_name','position','phone','mobile','email','website','line_id','source','product_interest','budget','lead_assigner_id','mailing_country','mailing_street','mailing_city','mailing_state','mailing_postal_code','next_action','note'];
export const DEFAULT_LEAD_RULES={Company:['company_name','last_name'],Individual:['last_name']};
export const demoLeadRules={value:structuredClone(DEFAULT_LEAD_RULES),version:1};
export function requiredLeadFields(rules,type='Company'){return (rules||DEFAULT_LEAD_RULES)[type==='Individual'?'Individual':'Company']||[];}
export function missingLeadFields(input,rules){return requiredLeadFields(rules,input.lead_type).filter(key=>!String(key==='mailing_street'?(input.mailing_street_th||input.mailing_street_en||input.mailing_street||''):(input[key]??'')).trim());}
export async function loadLeadRules(client,demoMode){if(demoMode)return {rules:structuredClone(demoLeadRules.value),version:demoLeadRules.version};const {data,error}=await client.from('crm_lead_field_rules').select('rules,version').eq('id',1).single();if(error)throw error;return data;}
