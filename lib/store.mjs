import {DatabaseSync, backup} from 'node:sqlite';
import {mkdirSync, readdirSync, unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {defaults, Problem, validateLog, validateSettings} from './model.mjs';
export class Store {
 constructor(dir,backupDir){
  mkdirSync(dir,{recursive:true});mkdirSync(backupDir,{recursive:true});this.backupDir=backupDir;
  this.db=new DatabaseSync(join(dir,'fitness.sqlite'));this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
   CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS logs (date TEXT PRIMARY KEY, body TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
   CREATE TABLE IF NOT EXISTS progress (id INTEGER PRIMARY KEY, changed_at TEXT NOT NULL, art TEXT NOT NULL, old_step INTEGER NOT NULL, new_step INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);`);
  if(!this.get('settings'))this.set('settings',defaults());
 }
 get(k){const row=this.db.prepare('SELECT value FROM meta WHERE key=?').get(k);return row?JSON.parse(row.value):null;}
 set(k,v){this.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,JSON.stringify(v));}
 logs(){return this.db.prepare('SELECT body,revision FROM logs ORDER BY date DESC').all().map(r=>({...JSON.parse(r.body),revision:r.revision}));}
 log(date){const r=this.db.prepare('SELECT body,revision FROM logs WHERE date=?').get(date);return r?{...JSON.parse(r.body),revision:r.revision}:null;}
 saveLog(v,revision){const l=validateLog(v);const old=this.log(l.date);if((old?.revision||0)!==revision)throw new Problem('这一天已在其他页面更新，请重新加载后再编辑。',409);
  const settings=this.get('settings');if(l.entries.some(e=>['bridge','handstand'].includes(e.id))&&!settings.plans.slice(0,4).every(p=>p.step>=6))throw new Problem('前四艺达到第六式后才能记录桥和倒立撑');
  this.db.prepare('INSERT INTO logs(date,body,revision) VALUES(?,?,?) ON CONFLICT(date) DO UPDATE SET body=excluded.body, revision=excluded.revision').run(l.date,JSON.stringify(l),revision+1);return this.log(l.date);}
 deleteLog(date,revision){if(this.log(date)?.revision!==revision)throw new Problem('记录已变更，请重新加载',409);this.db.prepare('DELETE FROM logs WHERE date=?').run(date);}
 saveSettings(v,revision){const next=validateSettings(v),old=this.get('settings');if(old.revision!==revision)throw new Problem('计划已在其他页面更新，请重新加载',409);
  this.db.exec('BEGIN IMMEDIATE');try{next.revision=revision+1;this.set('settings',next);next.plans.forEach((p,i)=>{if(p.step!==old.plans[i].step)this.db.prepare('INSERT INTO progress(changed_at,art,old_step,new_step) VALUES(?,?,?,?)').run(new Date().toISOString(),p.id,old.plans[i].step,p.step);});this.db.exec('COMMIT');return next;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 progress(){return this.db.prepare('SELECT * FROM progress ORDER BY id DESC').all();}
 async snapshot(){if(this.backing)return this.backing;this.backing=(async()=>{const name='fitness-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite';await backup(this.db,join(this.backupDir,name));this.set('lastBackup',new Date().toISOString());const files=readdirSync(this.backupDir).filter(n=>/^fitness-.*\.sqlite$/.test(n)).sort();for(const n of files.slice(0,-30))unlinkSync(join(this.backupDir,n));return name;})();try{return await this.backing;}finally{this.backing=null;}}
 export(){return {schemaVersion:1,exportedAt:new Date().toISOString(),settings:this.get('settings'),logs:this.logs(),progress:this.progress()};}
 previewImport(v){if(!v||v.schemaVersion!==1||!Array.isArray(v.logs)||v.logs.length>30000)throw new Problem('请选择本工具导出的备份文件（最多30000天）');const logs=v.logs.map(validateLog);if(new Set(logs.map(l=>l.date)).size!==logs.length)throw new Problem('备份中有重复日期');const existing=new Set(this.logs().map(l=>l.date));const settings=validateSettings(v.settings);return {logs,settings,added:logs.filter(l=>!existing.has(l.date)).length,skipped:logs.filter(l=>existing.has(l.date)).length};}
 async import(v,restoreSettings=false){const parsed=this.previewImport(v);await this.snapshot();this.db.exec('BEGIN IMMEDIATE');try{const insert=this.db.prepare('INSERT OR IGNORE INTO logs(date,body,revision) VALUES(?,?,1)');for(const l of parsed.logs)insert.run(l.date,JSON.stringify(l));if(restoreSettings){const old=this.get('settings');this.set('settings',{...parsed.settings,revision:old.revision+1});parsed.settings.plans.forEach((p,i)=>{if(p.step!==old.plans[i].step)this.db.prepare('INSERT INTO progress(changed_at,art,old_step,new_step) VALUES(?,?,?,?)').run(new Date().toISOString(),p.id,old.plans[i].step,p.step);});}this.db.exec('COMMIT');return {added:parsed.added,skipped:parsed.skipped};}catch(e){this.db.exec('ROLLBACK');throw e;}}
 close(){this.db.close();}
}
