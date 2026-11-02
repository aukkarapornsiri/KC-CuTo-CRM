import test from 'node:test';
import assert from 'node:assert/strict';
import {microsoftSettingsPayload,saveMicrosoftSettings} from '../src/microsoft-integration-settings.mjs';
test('blank values preserve credentials; supplied values are trimmed and allowlisted',()=>{
 assert.deepEqual(microsoftSettingsPayload('microsoft_intune',{MS365_CLIENT_SECRET:'  replacement  ',MS365_CLIENT_ID:' ',unknown:'ignored'}),{provider:'microsoft_intune',secrets:{MS365_CLIENT_SECRET:'replacement'},config:{}});
 assert.throws(()=>microsoftSettingsPayload('stripe',{}),/Unsupported/);
 assert.throws(()=>microsoftSettingsPayload('microsoft_calendar',{MS365_TENANT_ID:'wrong'}),/Tenant ID/);
});
test('save uses authenticated configure endpoint and distinguishes saved provider failure from save rejection',async()=>{
 let request;const client={functions:{invoke:async(endpoint,options)=>{request={endpoint,...options};return {data:{ok:true,connected:false,error:'Intune Graph check failed (401)'},error:null};}}};
 const result=await saveMicrosoftSettings(client,'microsoft_intune',{});
 assert.equal(result.ok,true);assert.equal(result.connected,false);assert.equal(request.endpoint,'server/make-server-04da8244/integrations/configure');assert.deepEqual(request.body.secrets,{});
 await assert.rejects(saveMicrosoftSettings({functions:{invoke:async()=>({error:{message:'Forbidden'}})}},'microsoft_calendar',{}),/administrator/);
 await assert.rejects(saveMicrosoftSettings({functions:{invoke:async()=>({data:{},error:null})}},'microsoft_calendar',{}),/confirm saving/);
});
