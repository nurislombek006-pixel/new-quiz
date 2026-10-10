import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const code=readFileSync('public/admin-embed.js','utf8');

function launchAs(id){
  const rootNodes=[];
  function node(tag){
    const n={tag,id:'',className:'',textContent:'',children:[],attributes:{},listeners:{},
      append(...items){this.children.push(...items)},
      appendChild(item){this.children.push(item)},
      setAttribute(k,v){this.attributes[k]=v},
      getAttribute(k){return this.attributes[k]||null},
      addEventListener(k,fn){this.listeners[k]=fn},
    };
    return n;
  }
  const app=node('div'),drawer=node('div'),head=node('head');
  rootNodes.push(app,drawer,head);
  function findNode(needle,where=rootNodes){
    for(const n of where){
      if(n.id===needle)return n;
      const found=findNode(needle,n.children);if(found)return found;
    }
    return null;
  }
  const doc={
    head,
    hidden:false,
    querySelector(s){return s==='.app'?app:s==='#side-drawer .drawer-list'?drawer:null},
    getElementById:needle=>findNode(needle),
    createElement:node,
    addEventListener(){},
  };
  const window={
    Telegram:{WebApp:{initData:'query_id=mocked-nonsigned',initDataUnsafe:{user:{id}}}},
    showScreen(page){this.lastScreen=page},
    addEventListener(){},
  };
  const timers=[];
  const sandbox={window,document:doc,URLSearchParams,JSON,
    setInterval(fn){timers.push(fn);return timers.length},
    clearInterval(){},
    console,MutationObserver:undefined};
  vm.runInNewContext(code,sandbox);
  return {window,document:doc,timers};
}

test('Owner sees the admin control in the actual grouped drawer',()=>{
  const {window,document}=launchAs(5305261101);
  const button=document.getElementById('owner-admin-link');
  assert.ok(button);
  assert.equal(button.textContent,'');
  assert.match(button.children[1].textContent,/Панель администратора/);
  assert.ok(document.getElementById('admin-screen'));
  button.listeners.click();
  assert.equal(window.lastScreen,'admin-screen');
  assert.equal(document.getElementById('owner-admin-frame').src,'/admin/index.html?embedded=1');
});

test('Regular user sees the unchanged drawer with no admin section',()=>{
  const {document,timers}=launchAs(123456789);
  for(const fn of timers)fn();
  assert.equal(document.getElementById('owner-admin-link'),null);
  assert.equal(document.getElementById('admin-screen'),null);
});

test('Delayed Telegram startup can still show owner control',()=>{
  const {window,document,timers}=launchAs(123456789);
  window.Telegram.WebApp.initDataUnsafe.user.id=5305261101;
  timers[0]();
  assert.ok(document.getElementById('owner-admin-link'));
});
