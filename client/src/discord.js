import { DiscordSDK } from '@discord/embedded-app-sdk';

let sdk=null;

export async function initDiscord(){
  const clientId=import.meta.env.VITE_DISCORD_CLIENT_ID;
  if(!clientId)return {embedded:false,user:null};

  sdk=new DiscordSDK(clientId);
  await sdk.ready();
  return {embedded:true,sdk,user:null};
}

export function getDiscordSDK(){return sdk;}
