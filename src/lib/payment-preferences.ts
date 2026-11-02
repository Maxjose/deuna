import type {SupabaseClient} from '@supabase/supabase-js';
export async function loadPaymentPreferences(client:SupabaseClient){
 const {data:{user},error:authError}=await client.auth.getUser();
 if(authError||!user)throw Error('Inicia sesión');
 const {data,error}=await client.from('passenger_payment_preferences').select('bank,phone').eq('user_id',user.id).maybeSingle();
 if(error)throw error;
 return {userId:user.id,bank:typeof data?.bank==='string'?data.bank:'',phone:typeof data?.phone==='string'?data.phone:typeof user.user_metadata?.contact_phone==='string'?user.user_metadata.contact_phone:''};
}
