import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {join} from 'node:path';
import {Store} from './store.mjs';
import {Problem} from './model.mjs';
export const digest=s=>createHash('sha256').update(String(s)).digest('hex');
const password=v=>{if(typeof v!=='string'||!/^\d{6}$/.test(v))throw new Problem('密码需6位数字');const salt=randomBytes(16).toString('hex');return {salt,key:scryptSync(v,salt,64).toString('hex')};};
const matches=(v,p)=>typeof v==='string'&&v.length<=200&&!!p&&timingSafeEqual(scryptSync(v,p.salt,64),Buffer.from(p.key,'hex'));
const username=v=>{if(typeof v!=='string'||! /^[a-zA-Z0-9_-]{3,32}$/.test(v))throw new Problem('账号名需3至32位字母、数字、下划线或短横线');return v.toLowerCase();};
export class Accounts {
 constructor(owner,dir,backupDir){this.owner=owner;this.db=owner.db;this.dir=dir;this.backupDir=backupDir;this.stores=new Map([['owner',owner]]);}
 async init(){
  if(!this.db.prepare("SELECT name FROM sqlite_master WHERE name='users'").get())await this.owner.snapshot();
  this.db.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL, created TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS invitations(token TEXT PRIMARY KEY, expires INTEGER NOT NULL, target TEXT);
   CREATE TABLE IF NOT EXISTS login_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL);`);
  if(!this.db.prepare('PRAGMA table_info(sessions)').all().some(c=>c.name==='user_id'))this.db.exec("ALTER TABLE sessions ADD COLUMN user_id TEXT NOT NULL DEFAULT 'owner'");
  if(!this.byId('owner')&&this.owner.get('password'))this.db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('owner','owner',JSON.stringify(this.owner.get('password')),'admin',new Date().toISOString());
 }
 byId(id){return this.db.prepare('SELECT * FROM users WHERE id=?').get(id);}
 public(u){return u?{id:u.id,username:u.username,role:u.role}:null;}
 current(t){return this.public(this.db.prepare('SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token=? AND s.expires>?').get(digest(t),Date.now()));}
 setup(b){if(this.byId('owner'))throw new Problem('已设置账号',409);const name=username(b.username||'owner'),p=password(b.password);this.db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('owner',name,JSON.stringify(p),'admin',new Date().toISOString());this.owner.set('password',p);return this.public(this.byId('owner'));}
 session(id){const token=randomBytes(32).toString('hex');this.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());this.db.prepare('INSERT INTO sessions(token,expires,user_id) VALUES(?,?,?)').run(digest(token),Date.now()+30*86400000,id);return token;}
 limit(keys){this.db.prepare('DELETE FROM login_limits WHERE until<?').run(Date.now());for(const key of keys){const r=this.db.prepare('SELECT * FROM login_limits WHERE key=?').get(key);if(r?.count>=10)throw new Problem('尝试次数过多，请15分钟后再试',429);}for(const key of keys)this.db.prepare('INSERT INTO login_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,Date.now()+15*60000);}
 login(b,ip){const name=typeof b.username==='string'?b.username.toLowerCase():'owner';this.limit(['ip:'+ip,'user:'+name]);const u=this.db.prepare('SELECT * FROM users WHERE username=?').get(name);if(!matches(b.password,u?JSON.parse(u.password):null))throw new Problem('账号或密码不正确',401);this.db.prepare('DELETE FROM login_limits WHERE key=?').run('user:'+name);return this.public(u);}
 invite(target){if(target&&!this.byId(target))throw new Problem('账号不存在',404);this.db.prepare('DELETE FROM invitations WHERE expires<?').run(Date.now());if(target)this.db.prepare('DELETE FROM invitations WHERE target=?').run(target);const code=randomBytes(24).toString('hex'),expires=Date.now()+24*3600000;this.db.prepare('INSERT INTO invitations VALUES(?,?,?)').run(digest(code),expires,target||null);return {code,expires};}
 redeem(b,ip){this.limit(['redeem:'+ip]);const p=password(b.password);this.db.exec('BEGIN IMMEDIATE');try{
  const invite=this.db.prepare('SELECT * FROM invitations WHERE token=? AND expires>?').get(digest(b.code),Date.now());if(!invite)throw new Problem('邀请或重置码无效、已使用或已过期');
  let id=invite.target;
  if(id){this.db.prepare('UPDATE users SET password=? WHERE id=?').run(JSON.stringify(p),id);this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);if(id==='owner')this.owner.set('password',p);}
  else {const name=username(b.username);if(name==='owner')throw new Problem('此账号名为管理员保留');if(this.db.prepare('SELECT 1 FROM users WHERE username=?').get(name))throw new Problem('账号名已被使用',409);if(this.db.prepare('SELECT count(*) AS n FROM users').get().n>=100)throw new Problem('账号数量已达上限');id=randomUUID();this.db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id,name,JSON.stringify(p),'member',new Date().toISOString());}
  this.db.prepare('DELETE FROM invitations WHERE token=?').run(invite.token);this.db.exec('COMMIT');return this.public(this.byId(id));
 }catch(e){this.db.exec('ROLLBACK');throw e;}}
 change(u,b,ip){this.limit(['password:'+u.id+':'+ip]);if(!matches(b.currentPassword,JSON.parse(this.byId(u.id).password)))throw new Problem('原密码不正确',401);const p=password(b.password);this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('UPDATE users SET password=? WHERE id=?').run(JSON.stringify(p),u.id);if(u.id==='owner')this.owner.set('password',p);this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);this.db.prepare('DELETE FROM invitations WHERE target=?').run(u.id);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
 store(u){if(!this.byId(u.id))throw new Problem('请重新登录',401);if(!this.stores.has(u.id))this.stores.set(u.id,new Store(join(this.dir,'users',u.id),join(this.backupDir,'users',u.id)));return this.stores.get(u.id);}
 list(){return this.db.prepare('SELECT id,username,role,created FROM users ORDER BY created').all();}
 async backup(){for(const u of this.list()){const s=this.store(u),last=s.get('lastBackup');if(!last||Date.now()-Date.parse(last)>24*3600000)await s.snapshot();}}
 async close(){for(const s of this.stores.values()){if(s.backing)await s.backing;s.close();}}
}