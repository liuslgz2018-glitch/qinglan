import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve,extname} from 'node:path';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {Store} from './lib/store.mjs';
import {Accounts} from './lib/accounts.mjs';
import {dashboardData,dashboardSVG} from './lib/dashboard.mjs';
import {Problem,dateValid,today,exportCsv} from './lib/model.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const catalog=JSON.parse(readFileSync(join(root,'public/catalog.json'),'utf8'));
const store=new Store(resolve(process.env.DATA_DIR||join(root,'data')),resolve(process.env.BACKUP_DIR||join(root,'backups')));
if(!store.get('password')&&process.env.APP_INITIAL_PASSWORD){
 if(!/^\d{6}$/.test(process.env.APP_INITIAL_PASSWORD))throw new Error('APP_INITIAL_PASSWORD需6位数字');
 const salt=randomBytes(16).toString('hex');store.set('password',{salt,key:scryptSync(process.env.APP_INITIAL_PASSWORD,salt,64).toString('hex')});
}
const accounts=new Accounts(store,resolve(process.env.DATA_DIR||join(root,'data')),resolve(process.env.BACKUP_DIR||join(root,'backups')));
await accounts.init();
const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||4177);
const allowedOrigin=process.env.APP_ORIGIN||'';
const hash=s=>createHash('sha256').update(s).digest('hex');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8'};

function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function isLocal(req){return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host||'')&&!req.headers['x-forwarded-for']&&!req.headers['x-forwarded-host'];}
function token(req){return (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('fitness_session='))?.slice(16)||'';}

async function body(req){let length=0,chunks=[];for await(const chunk of req){length+=chunk.length;if(length>5*1024*1024)throw new Problem('文件超过5MB',413);chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Problem('无法读取JSON数据');}}
function cookie(req,t,age){const secure=allowedOrigin.startsWith('https://');return `fitness_session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure?'; Secure':''}`;}
function allowHost(req){const h=req.headers.host||'';return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(h)||!!allowedOrigin&&h===new URL(allowedOrigin).host;}
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
 try{
  if(!allowHost(req))throw new Problem('访问地址未配置，请设置 APP_ORIGIN',403);
  const url=new URL(req.url,'http://localhost'),path=url.pathname,method=req.method;
  if(path==='/api/health')return json(res,200,{ok:true});
  if(!['GET','HEAD'].includes(method)){
   const origin=req.headers.origin;const expected=allowedOrigin||'http://'+req.headers.host;
   if(origin&&origin!==expected&&!(isLocal(req)&&origin==='http://'+req.headers.host))throw new Problem('请求来源不正确',403);
   if(req.headers['x-fitness-request']!=='1'||!String(req.headers['content-type']).startsWith('application/json'))throw new Problem('请求格式不正确',403);
  }
  const user=accounts.current(token(req));
  const signedIn=u=>{const t=accounts.session(u.id);res.setHeader('Set-Cookie',cookie(req,t,30*86400));return json(res,200,{ok:true,user:u});};
  if(path==='/api/auth'&&method==='GET')return json(res,200,{authenticated:!!user,user,needsSetup:!accounts.byId('owner'),canSetup:isLocal(req)});
  if(path==='/api/setup'&&method==='POST'){
   if(accounts.byId('owner'))throw new Problem('已设置账号',409);
   if(!isLocal(req))throw new Problem('首次设置请在服务器本机打开 http://localhost:4177',403);
   return signedIn(accounts.setup(await body(req)));
  }
  if(path==='/api/login'&&method==='POST')return signedIn(accounts.login(await body(req),req.socket.remoteAddress));
  if(path==='/api/register'&&method==='POST')return signedIn(accounts.redeem(await body(req),req.socket.remoteAddress));
  if(path.startsWith('/api/')){
   if(!user)throw new Problem('请先登录',401);
   const expected=req.headers['x-fitness-user']||url.searchParams.get('user');
   if((expected&&expected!==user.id)||(!['GET','HEAD'].includes(method)&&expected!==user.id))throw new Problem('账号已切换，请刷新页面后重试',409);
   if(path==='/api/logout'&&method==='POST'){accounts.db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token(req)));res.setHeader('Set-Cookie',cookie(req,'',0));return json(res,200,{ok:true});}
   if(path==='/api/account/password'&&method==='POST'){accounts.change(user,await body(req),req.socket.remoteAddress);return signedIn(user);}
   if(path==='/api/accounts'&&method==='GET'){if(user.role!=='admin')throw new Problem('仅管理员可管理账号',403);return json(res,200,{users:accounts.list()});}
   if(path==='/api/invites'&&method==='POST'){if(user.role!=='admin')throw new Problem('仅管理员可邀请或重置账号',403);const b=await body(req);return json(res,200,accounts.invite(b.userId));}
   const store=accounts.store(user);
   if(path==='/api/dashboard'&&method==='GET'){const date=url.searchParams.get('date')||today();if(!dateValid(date)||date>today()||date<'2000-01-01')throw new Problem('请选择有效日期');const data=dashboardData(store.logs(),catalog,date);return json(res,200,{svg:dashboardSVG(data,catalog),entries:data.entries});}
   if(path==='/api/state'&&method==='GET')return json(res,200,{settings:store.get('settings'),logs:store.logs(),progress:store.progress(),lastBackup:store.get('lastBackup')});
   if(path==='/api/log'&&method==='PUT'){const b=await body(req);return json(res,200,store.saveLog(b,b.revision));}
   if(path==='/api/log'&&method==='DELETE'){const b=await body(req);await store.snapshot();store.deleteLog(b.date,b.revision);return json(res,200,{ok:true});}
   if(path==='/api/settings'&&method==='PUT'){const b=await body(req);return json(res,200,store.saveSettings(b,b.revision));}
   if(path==='/api/backup'&&method==='POST'){const filename=await store.snapshot();return json(res,200,{filename});}
   if(path==='/api/export'&&method==='GET'){
    const csv=url.searchParams.get('format')==='csv';res.writeHead(200,{'Content-Type':csv?'text/csv; charset=utf-8':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="six-arts-${new Date().toISOString().slice(0,10)}.${csv?'csv':'json'}"`,'Cache-Control':'no-store'});return res.end(csv?exportCsv(store.logs(),catalog):JSON.stringify(store.export(),null,2));
   }
   if(path==='/api/import/preview'&&method==='POST'){const p=store.previewImport(await body(req));return json(res,200,{added:p.added,skipped:p.skipped});}
   if(path==='/api/import'&&method==='POST'){const b=await body(req);return json(res,200,await store.import(b.data,b.restoreSettings===true));}
   throw new Problem('接口不存在',404);
  }
  if(!['GET','HEAD'].includes(method))throw new Problem('不支持此操作',405);
  const relative=decodeURIComponent(path==='/'?'/index.html':path),file=resolve(root,'public','.'+relative);
  if(!file.startsWith(join(root,'public')+ (process.platform==='win32'?'\\':'/')))throw new Problem('路径不正确',403);
  const info=await stat(file).catch(()=>null);if(!info?.isFile())throw new Problem('文件不存在',404);
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':path.startsWith('/images/')?'public, max-age=86400':'no-cache','Content-Length':info.size});if(method==='HEAD')return res.end();res.end(await readFile(file));
 }catch(e){json(res,e.status||500,{error:e.status?e.message:'服务暂时出错，请稍后重试'});if(!e.status)console.error(e);}
});
server.listen(port,host,()=>console.log(`六艺日课已启动 http://localhost:${server.address().port}`));
async function autoBackup(){try{await accounts.backup();}catch(e){console.error('备份失败',e.message);}}
autoBackup();const timer=setInterval(autoBackup,3600000);timer.unref();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);server.close(async()=>{await accounts.close();process.exit(0);});});
