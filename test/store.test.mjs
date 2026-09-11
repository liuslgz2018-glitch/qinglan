import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Store} from '../lib/store.mjs';
import {validateLog,validateSettings,defaults,exportCsv} from '../lib/model.mjs';
const catalog=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url),'utf8'));
const log=()=>({date:'2026-09-01',kind:'training',pain:'舒适',note:'',entries:[{id:'pushup',step:1,sets:[30,28]}]});
test('同日同艺多式分别保留，未填写状态不当作舒适',()=>{
 const v={...log(),pain:'未记录',entries:[{id:'pullup',step:1,sets:[40]},{id:'pullup',step:2,sets:[7]}]};
 const result=validateLog(v);assert.equal(result.entries.length,2);assert.deepEqual(result.entries[1].sets,[7]);assert.equal(result.pain,'未记录');
 assert.throws(()=>validateLog({...v,entries:[v.entries[0],v.entries[0]]}));
});
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'six-arts-test-'));const store=new Store(join(dir,'data'),join(dir,'backups'));t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return {dir,store};}
test('拒绝无效日期、空训练、重复动作、小数、负数、未来记录',()=>{
 for(const l of [{...log(),date:'2026-02-30'},{...log(),date:'2999-01-01'},{...log(),entries:[]},{...log(),entries:[log().entries[0],log().entries[0]]},...[-1,0,2.5,NaN,'30'].map(n=>({...log(),entries:[{id:'pushup',step:1,sets:[n]}]}))])assert.throws(()=>validateLog(l));
 assert.deepEqual(validateLog({...log(),kind:'rest',entries:[]}).entries,[]);
});
test('初始等级、桥倒立锁定与计划校验',()=>{const s=defaults();assert.equal(s.plans[1].step,2);assert.equal(s.plans[3].reps,2);s.plans[4].enabled=true;assert.throws(()=>validateSettings(s));s.plans.slice(0,4).forEach(p=>p.step=6);assert.doesNotThrow(()=>validateSettings(s));assert.throws(()=>validateSettings({...s,days:[]}));});
test('保存修改乐观锁、动作历史快照、数据库重启持久化',t=>{const {store,dir}=fixture(t);const l=store.saveLog(log(),0);assert.equal(l.revision,1);assert.throws(()=>store.saveLog(log(),0),{status:409});assert.equal(store.saveLog({...log(),entries:[{id:'pushup',step:2,sets:[15]}]},1).revision,2);const s=defaults();s.plans[0].step=3;store.saveSettings(s,0);assert.equal(store.log(log().date).entries[0].step,2);assert.equal(store.progress().length,1);assert.throws(()=>store.saveSettings(s,0),{status:409});const reopened=new DatabaseSync(join(dir,'data/fitness.sqlite'));assert.equal(reopened.prepare('SELECT COUNT(*) as n FROM logs').get().n,1);reopened.close();});
test('服务端直接调用也拒绝锁定的桥记录',t=>{const {store}=fixture(t);assert.throws(()=>store.saveLog({...log(),entries:[{id:'bridge',step:1,sets:[10]}]},0));});
test('一致性SQLite备份可恢复，删除有版本检查',async t=>{const {store,dir}=fixture(t);store.saveLog(log(),0);const filename=await store.snapshot();const restored=new DatabaseSync(join(dir,'backups',filename));assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(restored.prepare('SELECT COUNT(*) as n FROM logs').get().n,1);restored.close();assert.throws(()=>store.deleteLog(log().date,0),{status:409});store.deleteLog(log().date,1);assert.equal(store.logs().length,0);});
test('导入先验证全部数据，合并时跳过已有日期且计划恢复可选',async t=>{const {store}=fixture(t);store.saveLog(log(),0);const data={schemaVersion:1,settings:defaults(),logs:[{...log(),note:'不覆盖'},{...log(),date:'2026-09-02'}]};data.settings.plans[0].step=2;assert.deepEqual(await store.import(data),{added:1,skipped:1});assert.equal(store.log(log().date).note,'');assert.equal(store.get('settings').plans[0].step,1);const bad={...data,logs:[{...log(),date:'2026-09-03'},{...log(),date:'bad'}]};await assert.rejects(()=>store.import(bad));assert.equal(store.logs().length,2);await store.import(data,true);assert.equal(store.get('settings').plans[0].step,2);});
test('CSV区分计时和次数且防止表格公式注入',()=>{const rows=[{...log(),note:'=SUM(1,1)'},{...log(),entries:[{id:'handstand',step:1,sets:[30]}]}];const csv=exportCsv(rows,catalog);assert.match(csv,/'=SUM/);assert.match(csv,/"秒"/);assert.match(csv,/"次"/);assert.equal(csv[0],'\ufeff');});
