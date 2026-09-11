import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const files=['server.mjs','lib/model.mjs','lib/store.mjs','lib/accounts.mjs','lib/dashboard.mjs','public/app.js','public/sw.js'];
for(const f of files)execFileSync(process.execPath,['--check',join(root,f)]);
const c=JSON.parse(readFileSync(join(root,'public/catalog.json'),'utf8'));
if(c.length!==6||c.some(a=>a.steps.length!==10))throw new Error('Expected six arts with ten steps each');
for(const a of c){if(!existsSync(join(root,'public',a.chart)))throw new Error('Missing chart');for(const s of a.steps){if(s.standards.length!==3||s.photos.length<2)throw new Error('Incomplete exercise');for(const p of s.photos)if(!existsSync(join(root,'public',p.src)))throw new Error(p.src);}}
const total=readdirSync(join(root,'public/images')).length;
console.log(`通过：JavaScript语法、60式资料、${total}项图片资源、六张长图。`);
