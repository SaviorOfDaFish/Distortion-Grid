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
      throw new Error('VITE_DISCORD_CLIENT_ID is not configured.');
    }

    discordSdk=new DiscordSDK(id);
    await discordSdk.ready();

    let authorization;

    try{
      // Silent authorization works for players who have already approved the app.
      authorization=await discordSdk.commands.authorize({
        client_id:id,
        response_type:'code',
        state:'',
        prompt:'none',
        scope:['identify']
      });
    }catch(silentError){
      console.warn('Silent Discord authorization failed; requesting consent.',silentError);

      // First-time players may need Discord's authorization prompt.
      authorization=await discordSdk.commands.authorize({
        client_id:id,
        response_type:'code',
        state:'',
        prompt:'consent',
        scope:['identify']
      });
    }

    const code=authorization?.code;

    if(!code){
      throw new Error('Discord did not return an authorization code.');
    }

    const response=await fetch('/api/token',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({code})
    });

    const tokenData=await response.json().catch(()=>({}));

    if(!response.ok || !tokenData.access_token){
      throw new Error(tokenData.error || 'Discord token exchange failed.');
    }

    const authenticated=await discordSdk.commands.authenticate({
      access_token:tokenData.access_token
    });

    if(!authenticated?.user){
      throw new Error('Discord authenticate command did not return a user.');
    }

    // IMPORTANT:
    // authenticate() returns the Discord user/session data, but not the OAuth
    // token we need for our authenticated server request. Keep both together.
    auth={
      ...authenticated,
      access_token:tokenData.access_token
    };

    console.log(
      'Discord authenticated as',
      auth.user.global_name || auth.user.username || auth.user.id
    );

    return auth;
  })();

  try{
    return await initPromise;
  }catch(error){
    // Allow a later retry instead of permanently caching a failed auth promise.
    initPromise=null;
    throw error;
  }
}

