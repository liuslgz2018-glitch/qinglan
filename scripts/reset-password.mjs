import {Store} from '../lib/store.mjs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
if(!process.argv.includes('--confirm'))throw new Error('先停止服务，再运行 node --env-file-if-exists=.env scripts/reset-password.mjs --confirm。会重置管理员登录密码和管理员会话（成员账号不变），保留训练记录。');
if(process.env.APP_INITIAL_PASSWORD)throw new Error('请先清空.env中的APP_INITIAL_PASSWORD，以免下次启动再次设置旧密码。');
const store=new Store(resolve(process.env.DATA_DIR||root+'/data'),resolve(process.env.BACKUP_DIR||root+'/backups'));
await store.snapshot();store.db.prepare('DELETE FROM meta WHERE key=?').run('password');if(store.db.prepare("SELECT name FROM sqlite_master WHERE name='users'").get()){store.db.prepare("DELETE FROM users WHERE id='owner'").run();store.db.prepare("DELETE FROM sessions WHERE user_id='owner'").run();store.db.prepare("DELETE FROM invitations WHERE target='owner'").run();}else store.db.exec('DELETE FROM sessions');store.close();console.log('密码已重置。重新启动服务后，在本机网页设置新密码。');
