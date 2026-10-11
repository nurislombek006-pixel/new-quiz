import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const compact=readFileSync('public/admin/compact.js','utf8');
const adminHtml=readFileSync('public/admin/index.html','utf8');
const adminStyle=readFileSync('public/admin/motion.css','utf8');
const home=readFileSync('public/index.html','utf8');
const motion=readFileSync('public/motion.css','utf8');

function setup(){
  const state={rendered:[],query:[],more:false,detailNodes:[]};
  const root={
    innerHTML:'',
    querySelectorAll(selector){
      state.query.push(selector);
      if(selector==='.person-details'){
        state.detailNodes=[...this.innerHTML.matchAll(/<details class="person-details" data-person-id="([^"]+)"( open)?>/g)]
          .map(m=>({
            dataset:{personId:m[1]},
            open:!!m[2],
            addEventListener(event,fn){this[event]=fn}
          }));
        return state.detailNodes;
      }
      return [];
    }
  };
  const count={textContent:''};
  const more={classList:{toggle(name,val){assert.equal(name,'hidden');state.more=val}}};
  const elements={
    userList:root,userCountNote:count,usersMore:more,
    userSearch:{value:''},userFilter:{value:'all'}
  };
  const document={
    readyState:'loading',
    getElementById:k=>elements[k]||null,
    addEventListener(){}
  };
  const context={document,Date,Number,Math,Array,Object,String,Set,console,Promise,
    escapeHtml:s=>String(s??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])),
    cleanId:s=>String(s||'').replace(/\D/g,''),
    toast(){},showPane(){},window:{scrollTo(){}}
  };
  vm.createContext(context);
  vm.runInContext(compact+'\nglobalThis.people={setUsers(data){visitedUsers=data},renderUsers,expandedPeopleIds};',context);
  return {root,count,more,state,people:context.people};
}

const alice={
  id:'5305261101',username:'owner_acc',first_name:'Алиса',last_name:'Иванова',
  premium:true,banned:false,opens:6,
  first_seen:'2026-10-01T10:00:00.000Z',
  last_opened:'2026-10-11T07:00:00.000Z',
  last_seen:'2026-10-11T07:05:00.000Z'
};
const bob={
  id:'6543349748',username:'',first_name:'Боб',last_name:'',
  premium:false,banned:true,opens:1,
  first_seen:'2026-10-10T05:00:00.000Z',
  last_opened:'2026-10-10T05:00:00.000Z',
  last_seen:'2026-10-10T05:00:00.000Z'
};
test('Compact people card keeps user identity, Telegram ID, Premium and ban actions visible',()=>{
  const t=setup();
  t.people.setUsers([alice,bob]);
  t.people.renderUsers();
  const markup=t.root.innerHTML;
  assert.equal((markup.match(/class="person-details"/g)||[]).length,2);
  assert.equal((markup.match(/class="person-controls"/g)||[]).length,2);
  const aliceCard=markup.slice(markup.indexOf('<article class="person">'),markup.indexOf('</article>')+10);
  assert.match(aliceCard,/Алиса Иванова/);
  assert.match(aliceCard,/@owner_acc/);
  assert.match(aliceCard,/Telegram ID: 5305261101/);
  assert.match(aliceCard,/💎 Premium/);
  assert.match(aliceCard,/data-user-action="remove"/);
  assert.match(aliceCard,/data-user-action="ban"/);
  assert.match(aliceCard,/<\/details><div class="person-controls">/,'Buttons remain outside disclosure');
  assert.match(aliceCard,/class="person-extra"/);
  assert.match(aliceCard,/Последний вход:/);
  assert.match(aliceCard,/Последняя активность:/);
  assert.match(aliceCard,/data-manage-user="5305261101"/);
  const bobCard=markup.slice(markup.lastIndexOf('<article class="person">'));
  assert.match(bobCard,/Обычный|🚫 Бан/);
  assert.match(bobCard,/data-user-action="premium"/);
  assert.match(bobCard,/data-user-action="unban"/);
  assert.equal(t.count.textContent.includes('2 из 2'),true);
});
test('Expanded user persists after a list refresh (e.g. Premium action)',()=>{
  const t=setup();
  t.people.setUsers([alice,bob]);
  t.people.renderUsers();
  const detail=t.state.detailNodes[0];
  assert.equal(detail.open,false);
  detail.open=true;
  detail.toggle();
  assert.equal(t.people.expandedPeopleIds.has('5305261101'),true);
  t.people.renderUsers();
  assert.match(t.root.innerHTML,/data-person-id="5305261101" open/);
  t.state.detailNodes[0].open=false;
  t.state.detailNodes[0].toggle();
  assert.equal(t.people.expandedPeopleIds.has('5305261101'),false);
  t.people.renderUsers();
  assert.doesNotMatch(t.root.innerHTML,/data-person-id="5305261101" open/);
});
test('No full Telegram online status; details are only local QuizBot activity',()=>{
  const t=setup();
  t.people.setUsers([alice]);
  t.people.renderUsers();
  assert.match(t.root.innerHTML,/Последняя активность:/);
  assert.match(t.root.innerHTML,/Последний вход:/);
  assert.doesNotMatch(t.root.innerHTML,/Telegram онлайн/i);
  assert.match(t.count.textContent,/Активность только внутри QuizBot/);
});
test('Both app and admin motion CSS are loaded with respectful durations',()=>{
  assert.match(home,/motion\.css\?v=1/);
  assert.match(adminHtml,/motion\.css\?v=1/);
  assert.match(adminHtml,/compact\.js\?v=2/);
  assert.match(home,/admin-embed\.js\?v=8/);
  assert.match(motion,/@keyframes qb-screen-in/);
  assert.match(adminStyle,/@keyframes qb-detail-in/);
  assert.match(adminStyle,/#userCountNote/);
  assert.match(motion,/prefers-reduced-motion: reduce/);
  assert.match(adminStyle,/prefers-reduced-motion:reduce/);
  assert.doesNotThrow(()=>new vm.Script(compact));
});
