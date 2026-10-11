import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const code=readFileSync('public/admin-embed.js','utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function launchAs(id,serverAllows=false){
  const root=[];
  function node(tag){
    const obj={tag,id:'',className:'',textContent:'',children:[],attributes:{},listeners:{},style:{},
      append(...parts){this.children.push(...parts)},
      appendChild(part){this.children.push(part)},
      setAttribute(name,value){this.attributes[name]=value},
      getAttribute(name){return this.attributes[name]||null},
      addEventListener(name,fn){this.listeners[name]=fn},
      remove(){this.wasRemoved=true},
    };
    const classes=new Set();
    Object.defineProperty(obj,'classList',{value:{
      contains(cls){return classes.has(cls)||String(obj.className||'').split(/\s+/).includes(cls)},
      add(cls){classes.add(cls)},
      remove(cls){classes.delete(cls);obj.className=obj.className.split(' ').filter(x=>x!==cls).join(' ')},
      toggle(cls,enable){if(enable){classes.add(cls)}else classes.delete(cls);return !!enable}
    }});
    return obj;
  }
  const app=node('div'),drawer=node('div'),head=node('head'),body=node('body');
  root.push(app,drawer,head,body);
  const find=(id,nodes=root)=>{
    for(const n of nodes){
      if(n.id===id)return n;
      const match=find(id,n.children);if(match)return match;
    }
    return null;
  };
  const doc={
    head,body,hidden:false,
    querySelector(selector){
      if(selector==='.app')return app;
      if(selector==='#side-drawer .drawer-list')return drawer;
      if(selector==='.owner-admin-group')return null;
      return null;
    },
    getElementById:id=>find(id),
    createElement:node,
    addEventListener(){}
  };
  const win={
    Telegram:{WebApp:{initData:'auth_date=2000000000&hash=placeholder',initDataUnsafe:{user:{id}}}},
    showScreen(id){
      this.lastScreen=id;
      if(find('admin-screen'))find('admin-screen').classList.remove('hidden');
    },
    addEventListener(){},
  };
  const calls=[];
  const timers=[];
  const sandbox={window:win,document:doc,URLSearchParams,JSON,console,
    setInterval(fn){timers.push(fn);return timers.length},clearInterval(){},
    fetch:async(url,options)=>{
      calls.push({url,options});
      return {ok:serverAllows,status:serverAllows?200:403,json:async()=>serverAllows?{ok:true,admin:true}:{ok:false,admin:false}};
    },
    MutationObserver:undefined
  };
  vm.runInNewContext(code,sandbox);
  return {window:win,document:doc,timers,calls};
}

test('Owner sees admin button only AFTER signed server permission',async()=>{
  const instance=launchAs(5305261101,true);
  assert.equal(instance.document.getElementById('owner-admin-link'),null);
  await tick();
  const button=instance.document.getElementById('owner-admin-link');
  assert.ok(button,'signed owner must receive menu button');
  assert.ok(instance.calls.some(c=>c.url==='/api/admin/me'));
  assert.equal(instance.calls[0].options.headers['X-Telegram-Init-Data'],'auth_date=2000000000&hash=placeholder');
  assert.match(button.children[1].textContent,/Панель администратора/);
  button.listeners.click();
  assert.equal(instance.window.lastScreen,'admin-screen');
  assert.equal(instance.document.getElementById('owner-admin-frame').src,'/admin/index.html?embedded=1&v=6');
  assert.equal(instance.document.body.classList.contains('owner-admin-active'),true);
});

test('Owner sees a safe diagnostic instead of admin UI when Netlify rejects login',async()=>{
  const instance=launchAs(5305261101,false);
  await tick();
  const diag=instance.document.getElementById('owner-auth-diagnostic');
  assert.ok(diag,'Owner must see access troubleshooting diagnostics');
  assert.match(instance.document.getElementById('owner-auth-error-text').textContent,/HTTP_403/);
  assert.equal(instance.document.getElementById('owner-admin-link'),null);
  assert.equal(instance.document.getElementById('admin-screen'),null);
});

test('Even forged client-side owner ID never exposes admin when server rejects',async()=>{
  const instance=launchAs(5305261101,false);
  await tick();
  assert.equal(instance.document.getElementById('owner-admin-link'),null);
  assert.equal(instance.document.getElementById('admin-screen'),null);
  assert.equal(instance.calls.length,1);
});

test('Normal user sees regular unchanged drawer, even with a hypothetically permitting backend',async()=>{
  const instance=launchAs(123456789,true);
  await tick();
  assert.equal(instance.document.getElementById('owner-admin-link'),null);
  assert.equal(instance.document.getElementById('admin-screen'),null);
  assert.equal(instance.document.getElementById('owner-auth-diagnostic'),null);
  assert.equal(instance.calls.length,0);
});

test('Late Telegram user startup waits until signed backend checks owner',async()=>{
  const instance=launchAs(123456789,true);
  await tick();
  instance.window.Telegram.WebApp.initDataUnsafe.user.id=5305261101;
  instance.timers[0]();
  await tick();
  assert.ok(instance.document.getElementById('owner-admin-link'));
});
