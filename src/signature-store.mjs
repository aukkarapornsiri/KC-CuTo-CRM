export const demoSignatureDefaults=new Map();
export async function loadProfileSignature(client,owner,demoMode=false){
 if(demoMode)return demoSignatureDefaults.get(owner)||{};
 const {data,error}=await client.from('crm_sales_signature_defaults').select('storage_key').eq('user_id',owner).maybeSingle();
 if(error)throw error;
 return {seller_signature_storage_key:data?.storage_key||'',seller_signature_owner_id:owner};
}
