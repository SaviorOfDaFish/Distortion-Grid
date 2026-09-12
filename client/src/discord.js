import { DiscordSDK } from '@discord/embedded-app-sdk';

let discordSdk = null;
let auth = null;
let initPromise = null;

function clientId(){
  return import.meta.env.VITE_DISCORD_CLIENT_ID;
}

export function getDiscordSdk(){
  return discordSdk;
}

export function getDiscordAuth(){
  return auth;
}

export async function initDiscord(){
  if(initPromise) return initPromise;

  initPromise=(async()=>{
    const id=clientId();

    if(!id){
      console.warn('VITE_DISCORD_CLIENT_ID is not configured.');
      return null;
    }

    discordSdk=new DiscordSDK(id);
    await discordSdk.ready();

    const {code}=await discordSdk.commands.authorize({
      client_id:id,
      response_type:'code',
      state:'',
      prompt:'none',
      scope:['identify']
    });

    const response=await fetch('/api/token',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({code})
    });

    const tokenData=await response.json().catch(()=>({}));

    if(!response.ok || !tokenData.access_token){
      throw new Error(tokenData.error || 'Discord token exchange failed.');
    }

    auth=await discordSdk.commands.authenticate({
      access_token:tokenData.access_token
    });

    if(!auth?.user){
      throw new Error('Discord authenticate command did not return a user.');
    }

    return auth;
  })();

  return initPromise;
}
