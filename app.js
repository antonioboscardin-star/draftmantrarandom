import {firebaseConfig} from './firebase-config.js';
const $=id=>document.getElementById(id);
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const rnd=m=>crypto.getRandomValues(new Uint32Array(1))[0]%m;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const seq=k=>Array.from({length:k},(_,i)=>i);
const clone=o=>JSON.parse(JSON.stringify(o));
const fresh=(n,names,name,owner)=>({name,owner,n,names,freePos:seq(n).map(i=>i+1),freeTeams:seq(n),result:{},last:null,created:Date.now()});
// Firebase non conserva array/oggetti vuoti: si normalizza ad ogni lettura.
const norm=d=>({...d,names:Array.from({length:14},(_,i)=>(d.names&&d.names[i])||''),
  freePos:Object.values(d.freePos||{}),freeTeams:Object.values(d.freeTeams||{}),
  result:Object.fromEntries(Object.entries(d.result||{}).filter(([,v])=>v!=null)),last:d.last||null});
const cnt=s=>Object.keys(s.result).length;

/* ---------- Archivio dati: Firebase (condiviso) oppure localStorage (solo questo browser) ---------- */
function makeLocal(){
  const K='fanta-draws',subs=new Set();
  const read=()=>{try{return JSON.parse(localStorage.getItem(K))||{}}catch(e){return{}}};
  const emit=()=>subs.forEach(f=>f());
  addEventListener('storage',e=>{if(e.key===K)emit()});
  const on=f=>{subs.add(f);f();return()=>subs.delete(f)};
  return{cloud:false,uid:'locale',list:cb=>on(()=>cb(read())),watch:(id,cb)=>on(()=>cb(read()[id]||null)),
    async set(id,d){const a=read();a[id]=clone(d);localStorage.setItem(K,JSON.stringify(a));emit()},
    async remove(id){const a=read();delete a[id];localStorage.setItem(K,JSON.stringify(a));emit()}};
}
async function makeStore(){
  if(!firebaseConfig)return makeLocal();
  const B='https://www.gstatic.com/firebasejs/10.12.2/';
  const [A,Au,D]=await Promise.all([import(B+'firebase-app.js'),import(B+'firebase-auth.js'),import(B+'firebase-database.js')]);
  const app=A.initializeApp(firebaseConfig),auth=Au.getAuth(app),db=D.getDatabase(app);
  await auth.authStateReady();
  if(!auth.currentUser)await Au.signInAnonymously(auth);
  return{cloud:true,uid:auth.currentUser.uid,
    list:cb=>D.onValue(D.ref(db,'draws'),s=>cb(s.val()||{})),
    watch:(id,cb)=>D.onValue(D.ref(db,'draws/'+id),s=>cb(s.val())),
    set:(id,d)=>D.set(D.ref(db,'draws/'+id),clone(d)),
    remove:id=>D.remove(D.ref(db,'draws/'+id))};
}

/* ---------- Stato ---------- */
let store,S=null,curId=null,org=false,unsub=null,seen=false,booted=false,draws={},pending=null,
busy=false,playing=false,incoming=null,lastId=null,waiter=null,saveT=null,delArm=false;
const tname=i=>(S.names[i]&&S.names[i].trim())||('Squadra '+(i+1));
const started=()=>S&&(cnt(S)>0||pending!==null);
const say=t=>{$('msg').textContent=t};
function setView(v){document.body.dataset.v=v;$('home').hidden=v==='home';if(v!=='draw')document.body.classList.remove('org')}
function resetStage(){['pos','team'].forEach(k=>{$(k).textContent='?';$(k).classList.remove('done','spin')});say('')}

/* ---------- Elenchi (home e "guarda") ---------- */
function renderLists(){
  const arr=Object.entries(draws).map(([id,d])=>({id,...norm(d)})).sort((a,b)=>(b.created||0)-(a.created||0));
  const btn=(d,href,label)=>{const b=document.createElement('button');b.className='pick';
    const t=document.createElement('b');t.textContent=d.name||'Senza nome';
    const s=document.createElement('span');const k=cnt(d);
    s.textContent=d.n+' squadre · '+(k>=d.n?'completata':k+' di '+d.n+' posizioni estratte')+(label?' · '+label:'');
    b.append(t,s);b.onclick=()=>{location.hash=href+d.id};return b};
  const pl=$('pickList');pl.innerHTML='';
  if(!arr.length)pl.textContent='Nessuna estrazione disponibile.';
  arr.forEach(d=>pl.appendChild(btn(d,'#/guarda/')));
  const mine=arr.filter(d=>d.owner===store.uid),m=$('mine');m.innerHTML='';
  if(mine.length){const h=document.createElement('h2');h.textContent='Le tue estrazioni';m.appendChild(h);
    mine.forEach(d=>m.appendChild(btn(d,'#/gestisci/','gestisci')))}
}

/* ---------- Vista estrazione ---------- */
function render(){
  if(!S)return;
  document.body.classList.toggle('org',org);
  $('curName').textContent=S.name||'';$('n').textContent=S.n;
  const box=$('teams');box.innerHTML='';
  for(let i=0;i<S.n;i++){
    const inp=document.createElement('input');inp.placeholder='Squadra '+(i+1);inp.value=S.names[i]||'';inp.maxLength=24;
    inp.setAttribute('aria-label','Nome squadra '+(i+1));inp.disabled=started()||busy;
    inp.oninput=()=>{S.names[i]=inp.value;queueSave()};box.appendChild(inp);
  }
  const l=$('list');l.innerHTML='';
  for(let p=1;p<=S.n;p++){
    const li=document.createElement('li'),b=document.createElement('b'),s=document.createElement('span');b.textContent=p;
    if(S.result[p]!==undefined){li.className='on';s.textContent=tname(S.result[p])}
    else if(pending===p){li.className='wait';s.textContent='Estrazione in corso…'}
    else{s.textContent='—';s.style.opacity='.5'}
    li.append(b,s);l.appendChild(li);
  }
  const fin=S.freePos.length===0&&!pending;
  $('draw').disabled=busy||fin;$('auto').disabled=busy||fin;$('reset').disabled=busy;$('del').disabled=busy;$('copy').disabled=!fin;
  $('minus').disabled=busy||started()||S.n<=6;$('plus').disabled=busy||started()||S.n>=14;
  $('draw').textContent=fin?'Sorteggio completo':(started()?'Estrai prossima posizione':'Estrai posizione');
}
function queueSave(){clearTimeout(saveT);saveT=setTimeout(()=>{if(org)store.set(curId,S).catch(()=>say('Salvataggio non riuscito.'))},600)}
async function cycle(el,pool,fmt){
  el.classList.remove('done');el.classList.add('spin');
  const t=reduce?150:1500,step=80;
  for(let e=0;e<t;e+=step){el.textContent=fmt(pool[rnd(pool.length)]);await sleep(step)}
  el.classList.remove('spin');
}
async function show(d){
  if(!booted){booted=true;lastId=d.last?d.last.id:null;S=d;render();
    if(!cnt(d))say(org?'':'Il sorteggio non è ancora iniziato.');return}
  const grows=d.last&&d.last.id!==lastId&&cnt(d)>cnt(S);
  if(!grows){if(org)return;S=d;lastId=d.last?d.last.id:lastId;if(!cnt(d))resetStage();render();return}
  lastId=d.last.id;const p=d.last.pos,t=d.last.team;
  S={...S,names:d.names,n:d.n};busy=true;resetStage();render();
  say('Estrazione della posizione…');
  await cycle($('pos'),S.freePos,x=>x);
  $('pos').textContent=p;$('pos').classList.add('done');pending=p;render();
  say('Posizione '+p+': quale squadra?');
  await sleep(reduce?100:1000);
  await cycle($('team'),S.freeTeams,tname);
  S=d;pending=null;busy=false;
  $('team').textContent=tname(t);$('team').classList.add('done');
  say(tname(t)+' chiama in posizione '+p+'.'+(d.freePos.length?'':' Sorteggio completo!'));
  render();if(waiter){waiter();waiter=null}
}
async function pump(){if(playing)return;playing=true;while(incoming){const d=incoming;incoming=null;await show(d)}playing=false}
const receive=d=>{incoming=d;pump()};

function openDraw(id,wantOrg){
  if(unsub){unsub();unsub=null}
  curId=id;S=null;seen=false;booted=false;org=false;pending=null;busy=false;incoming=null;lastId=null;
  setView('draw');resetStage();say('Caricamento…');
  unsub=store.watch(id,d=>{
    if(!d){if(seen){location.hash='#/guarda'}else say('Estrazione non trovata.');return}
    seen=true;org=wantOrg&&d.owner===store.uid;receive(norm(d));
  });
}
async function drawOne(){
  if(!org||busy||!S.freePos.length)return;
  busy=true;render();
  const pi=rnd(S.freePos.length),ti=rnd(S.freeTeams.length),p=S.freePos[pi],t=S.freeTeams[ti];
  const nx=clone(S);nx.freePos.splice(pi,1);nx.freeTeams.splice(ti,1);nx.result[p]=t;
  nx.last={id:Date.now()+'-'+rnd(1e6),pos:p,team:t};
  const done=new Promise(r=>{waiter=r});
  try{await store.set(curId,nx)}catch(e){busy=false;waiter=null;say('Scrittura non riuscita: riprova.');render();return}
  await done;
}
async function drawAll(){while(org&&S.freePos.length){await drawOne();await sleep(reduce?50:1200)}}
const copyText=async(txt,ok)=>{try{await navigator.clipboard.writeText(txt);say(ok)}catch(e){say('Copia non disponibile: '+txt)}};

/* ---------- Eventi ---------- */
$('draw').onclick=drawOne;$('auto').onclick=drawAll;
$('minus').onclick=()=>setN(-1);$('plus').onclick=()=>setN(1);
function setN(k){if(!org||started()||busy)return;const n=S.n+k;if(n<6||n>14)return;
  S={...fresh(n,S.names,S.name,S.owner),created:S.created};render();queueSave()}
$('reset').onclick=()=>{if(!org||busy)return;S={...fresh(S.n,S.names,S.name,S.owner),created:S.created};lastId=null;resetStage();render();store.set(curId,S).catch(()=>say('Salvataggio non riuscito.'))};
$('copy').onclick=()=>copyText(Object.keys(S.result).map(Number).sort((a,b)=>a-b).map(p=>p+'. '+tname(S.result[p])).join('\n'),'Ordine copiato negli appunti.');
$('link').onclick=()=>copyText(location.href.split('#')[0]+'#/guarda/'+curId,'Link spettatori copiato.');
$('del').onclick=async()=>{
  if(!org||busy)return;
  if(!delArm){delArm=true;$('del').textContent='Conferma eliminazione';setTimeout(()=>{delArm=false;$('del').textContent='Elimina estrazione'},4000);return}
  delArm=false;$('del').textContent='Elimina estrazione';
  try{await store.remove(curId);location.hash='#/'}catch(e){say('Eliminazione non riuscita.')}
};
$('create').onclick=async()=>{
  const name=$('newName').value.trim();if(!name){$('newName').focus();return}
  const id='e'+Date.now().toString(36)+rnd(1296).toString(36);
  try{await store.set(id,fresh(10,Array(14).fill(''),name,store.uid));$('newName').value='';location.hash='#/gestisci/'+id}
  catch(e){alert('Creazione non riuscita: '+e.message)}
};
$('watch').onclick=()=>{location.hash='#/guarda'};
$('home').onclick=()=>{location.hash='#/'};

function route(){
  const [,a,id]=location.hash.split('/');
  if(unsub){unsub();unsub=null}
  if(a==='gestisci'&&id)openDraw(id,true);
  else if(a==='guarda'&&id)openDraw(id,false);
  else if(a==='guarda')setView('list');
  else setView('home');
}
(async()=>{
  try{store=await makeStore()}
  catch(e){console.error(e);store=makeLocal();$('banner').textContent='Connessione a Firebase non riuscita ('+e.message+'): modalità locale.'}
  if(!store.cloud&&!$('banner').textContent)$('banner').textContent='Modalità locale: i dati restano in questo browser. Configura Firebase per condividere (vedi README).';
  store.list(o=>{draws=o;renderLists()});
  addEventListener('hashchange',route);route();
})();
