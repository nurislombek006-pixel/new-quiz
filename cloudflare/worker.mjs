import {apiHandler} from './backend.mjs';
import {ASSETS} from './assets.mjs';

// Full QuizBot original user-facing site, now served by Cloudflare.
const EXT={
  '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
  '.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8',
  '.txt':'text/plain; charset=utf-8','.svg':'image/svg+xml',
  '.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'
};
function securityHeaders(request,route){
  const headers={
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'strict-origin-when-cross-origin',
    'Cache-Control':'no-store',
    'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
  };
  if(route.startsWith('/admin/'))headers['X-Frame-Options']='SAMEORIGIN';
  return headers;
}
export default {
  async fetch(request,env,context){
    const url=new URL(request.url);
    let route=url.pathname;
    if(request.method==='OPTIONS' && route.startsWith('/api/'))return apiHandler(request,env);
    if(route.startsWith('/api/')){
      try{return await apiHandler(request,env)}
      catch(e){
        console.error('API error:',String(e?.message||e));
        return Response.json({ok:false,error:'SERVER_ERROR'},{status:500,headers:{'Cache-Control':'no-store'}});
      }
    }
    if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});
    if(route==='/'||route==='/admin')route=route==='/'?'/index.html':'/admin/index.html';
    const content=ASSETS[route];
    if(content===undefined)return new Response('404 Not Found',{status:404});
    const suffix=route.slice(route.lastIndexOf('.'));
    const headers={'Content-Type':EXT[suffix]||'application/octet-stream',...securityHeaders(request,route)};
    return new Response(request.method==='HEAD'?null:content,{status:200,headers});
  }
};
