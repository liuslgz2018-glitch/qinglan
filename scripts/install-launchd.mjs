import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
if(process.platform!=='darwin')throw new Error('此安装程序仅适用于Mac');
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const xml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const label='local.sixarts.fitness',dir=join(homedir(),'Library/LaunchAgents'),file=join(dir,label+'.plist');
mkdirSync(dir,{recursive:true});mkdirSync(join(root,'data'),{recursive:true});
if(existsSync(file))throw new Error('已有自启动配置。若需重新安装，请先按说明停用并备份已有plist。');
writeFileSync(file,`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>--env-file-if-exists=.env</string><string>server.mjs</string></array>
<key>WorkingDirectory</key><string>${xml(root)}</string><key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>${xml(join(root,'data/service.log'))}</string><key>StandardErrorPath</key><string>${xml(join(root,'data/error.log'))}</string></dict></plist>`);
execFileSync('launchctl',['bootstrap',`gui/${process.getuid()}`,file]);console.log('已配置当前用户登录后自动启动：http://localhost:4177');
