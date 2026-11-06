export type SupportView='help'|'inbox'|'chat';
export function supportRoute(hash:string):{view:SupportView;id:string}{
 const parts=hash.replace(/^#/,'').split('/');
 if(parts[0]!=='account'||parts[1]!=='support')return {view:'help',id:''};
 if(parts[2]==='chat'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parts[3]||''))return {view:'chat',id:parts[3]};
 return {view:parts[2]?'inbox':'help',id:''};
}
export function supportHash(view:SupportView,id=''){
 return view==='help'?'account/support':view==='chat'&&supportRoute(`#account/support/chat/${id}`).view==='chat'?`account/support/chat/${id}`:'account/support/inbox';
}
