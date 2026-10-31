export function installPlatform(userAgent:string,touchPoints:number):'ios'|'android'|'desktop'{
 if(/iPhone|iPad|iPod/i.test(userAgent)||(/Macintosh/i.test(userAgent)&&touchPoints>1))return 'ios';
 if(/Android|Mobi/i.test(userAgent))return 'android';
 return 'desktop';
}
export function requiresInstallation(platform:string,standalone:boolean,twa:boolean){
 return platform!=='desktop'&&!standalone&&!twa;
}
