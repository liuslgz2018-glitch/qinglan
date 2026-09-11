import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scoreEntry,dashboardData,dashboardSVG} from '../lib/dashboard.mjs';
const catalog=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url)));
test('飞书阶段加权计算、同艺多式取最高、七日窗口边界',()=>{
 assert.equal(scoreEntry({id:'pushup',step:1,sets:[50,50,50]}),10);
 assert.equal(scoreEntry({id:'pushup',step:2,sets:[10]}),13.33);
 const logs=[{date:'2026-09-04',kind:'training',entries:[{id:'pushup',step:10,sets:[100]}]},{date:'2026-09-05',kind:'training',entries:[{id:'pushup',step:1,sets:[50,50,50]},{id:'pushup',step:2,sets:[10]}]}];
 const d=dashboardData(logs,catalog,'2026-09-11');assert.equal(d.arts[0].score,13.33);assert.equal(d.overall,2.22);assert.equal(d.windowDays,1);assert.equal(d.arts[1].score,0);
});
test('分享SVG不包含身体状态、备注及账号字段，空记录可导出',()=>{
 const logs=[{date:'2026-09-11',kind:'training',pain:'明显不适',note:'PRIVATE_NOTE',entries:[{id:'squat',step:2,sets:[25,20]}]}];
 const svg=dashboardSVG(dashboardData(logs,catalog,'2026-09-11'),catalog);assert.match(svg,/25 \/ 20/);assert.doesNotMatch(svg,/明显不适|PRIVATE_NOTE|password|session/);
 assert.match(dashboardSVG(dashboardData([],catalog,'2026-09-11'),catalog),/当日没有已保存的训练/);
});
