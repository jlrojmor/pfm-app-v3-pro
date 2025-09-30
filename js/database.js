// database.js — simple storage (IndexedDB + fallback)
const PFMDB = (function(){
  const DB_NAME='pfmdb-v5';
  const STORE='kv';
  let _db=null;

  function lsGet(key){ try{ return JSON.parse(localStorage.getItem(key)||'null'); }catch(e){ return null; } }
  function lsSet(key,val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){} }
  function lsDel(key){ try{ localStorage.removeItem(key); }catch(e){} }

  function open(){
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)){ _db=null; resolve(null); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e)=>{
        const db = e.target.result;
        if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> resolve(null);
    }).then(db=>{ _db=db; return db; });
  }
  async function get(key){
    if(!_db){ const v=lsGet(key); return v; }
    return new Promise((resolve,reject)=>{
      const tx=_db.transaction(STORE,'readonly'); const os=tx.objectStore(STORE); const r=os.get(key);
      r.onsuccess=()=> resolve(r.result? JSON.parse(r.result):null);
      r.onerror=()=> resolve(null);
    });
  }
  async function set(key, val){
    if(!_db){ lsSet(key,val); return; }
    return new Promise((resolve,reject)=>{
      const tx=_db.transaction(STORE,'readwrite'); const os=tx.objectStore(STORE); const r=os.put(JSON.stringify(val), key);
      r.onsuccess=()=> resolve(true); r.onerror=()=> resolve(false);
    });
  }
  async function del(key){
    if(!_db){ lsDel(key); return; }
    return new Promise((resolve,reject)=>{
      const tx=_db.transaction(STORE,'readwrite'); const os=tx.objectStore(STORE); const r=os.delete(key);
      r.onsuccess=()=> resolve(true); r.onerror=()=> resolve(false);
    });
  }
  async function clearAll(){
    if(!_db){
      Object.keys(localStorage).forEach(k=>{ if(k.startsWith('pfm-')||k===DB_NAME||k===STORE||k==='app-state') localStorage.removeItem(k); });
      ['accounts','transactions','categories','budgets','snapshots','fxRates','settings'].forEach(k=> lsDel('pfm:'+k));
      return;
    }
    return new Promise((resolve,reject)=>{
      const tx=_db.transaction(STORE,'readwrite'); const os=tx.objectStore(STORE); const r=os.clear();
      r.onsuccess=()=> resolve(true); r.onerror=()=> resolve(false);
    });
  }
  async function init(){ await open(); }
  return { dbInit:init, get, set, del, dbClearAll: clearAll };
})();
window.PFMDB = PFMDB;
