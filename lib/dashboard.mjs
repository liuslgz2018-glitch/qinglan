import {readFileSync} from 'node:fs';
const standards=JSON.parse(readFileSync(new URL('./dashboard-standards.json',import.meta.url),'utf8'));
const colors=['#c65224','#2971b0','#18846e','#8a56a6','#aa7926','#516478'];
const round=n=>Math.round(n*100)/100;
const clamp=n=>Math.max(0,Math.min(1,n));
const add=(d,n)=>{const t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);};
export function trendAxisMax(values){
 const peak=Math.max(0,...values.filter(Number.isFinite));
 if(peak===0)return 1;
 const unit=10**(Math.floor(Math.log10(peak))-1);
 return Number((Math.ceil(peak*1.1/unit-1e-9)*unit).toPrecision(12));
}
export function scoreEntry(e){
 const bounds=standards[e.id+'-'+e.step],count=e.sets.length,min=Math.min(...e.sets);if(!bounds||!count)return 0;
 let stage=0;bounds.forEach(([sets,reps],i)=>{if(count>=sets&&min>=reps)stage=i+1;});
 let progress=0;if(stage===0)progress=(clamp(count/bounds[0][0])+clamp(min/bounds[0][1]))/2;
 else if(stage<3){const lo=bounds[stage-1],hi=bounds[stage];progress=([count,min].map((v,i)=>hi[i]===lo[i]?1:clamp((v-lo[i])/(hi[i]-lo[i]))).reduce((a,b)=>a+b,0))/2;}
 return round(((e.step-1)*3+stage+progress)/30*100);
}
export function dashboardData(logs,catalog,date){
 const scored=logs.filter(l=>l.date<=date&&l.kind==='training').map(l=>({...l,entries:l.entries.map(e=>({...e,score:scoreEntry(e)}))}));
 function at(d){const recent=scored.filter(l=>l.date>=add(d,-6)&&l.date<=d);const arts=catalog.map(a=>{const all=recent.flatMap(l=>l.entries.filter(e=>e.id===a.id).map(e=>({...e,date:l.date}))).sort((a,b)=>b.score-a.score||b.date.localeCompare(a.date));return {id:a.id,name:a.name,score:all[0]?.score||0,best:all[0]||null};});return {date:d,arts,overall:round(arts.reduce((n,a)=>n+a.score,0)/6)};}
 const current=at(date),start=scored.length?scored.map(l=>l.date).sort()[0]:date;let from=start>add(date,-29)?start:add(date,-29);const trend=[];for(let d=from;d<=date;d=add(d,1))trend.push(at(d));
 const entries=scored.find(l=>l.date===date)?.entries||[];
 return {...current,trend,entries,trainingDays:scored.length,totalSets:scored.flatMap(l=>l.entries).reduce((n,e)=>n+e.sets.length,0),windowDays:scored.filter(l=>l.date>=add(date,-6)).length};
}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function dashboardSVG(data,catalog){
 const W=1200,rows=Math.max(1,data.entries.length),tableY=1240,H=tableY+105+rows*43+110;
 let out=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="六艺训练进展仪表盘"><rect width="${W}" height="${H}" fill="#f3f5f7"/><g font-family="Microsoft YaHei, PingFang SC, sans-serif">`;
 const text=(x,y,t,size=20,fill='#182c40',weight=400,anchor='start')=>out+=`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}">${escape(t)}</text>`;
 const rect=(x,y,w,h,fill='#fff')=>out+=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}"/>`;
 const line=(x1,y1,x2,y2,color='#dce4ec')=>out+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}"/>`;
 out+='<g data-panel="header" data-box="0 0 1200 175">';rect(0,0,1200,175,'#182c40');text(48,65,'六艺日课 · 我的训练进展',38,'#fff',700);text(48,112,'截至 '+data.date+'   /   最近7日验证水平',22,'#c4d4e1');text(1152,112,'一步一步，练出自己的进步。',20,'#c4d4e1',400,'end');
 out+='</g>';
 const stats=[['综合强度',data.overall.toFixed(2),'满分100'],['累计训练',data.trainingDays,'天'],['累计完成',data.totalSets,'组'],['近7日训练',data.windowDays,'天']];stats.forEach(([t,v,u],i)=>{const x=40+i*285;out+=`<g data-panel="stat" data-box="${x} 205 265 145">`;rect(x,205,265,145);text(x+23,243,t,20,'#657587');text(x+23,308,v,42,'#182c40',700);text(x+230,308,u,17,'#657587',400,'end');out+='</g>';});
 out+='<g data-panel="radar" data-box="40 375 550 465">';rect(40,375,550,465);text(65,415,'六艺当前水平',26,'#182c40',700);text(65,448,'近7日各艺最高得分 · 满分100',17,'#657587');
 const cx=315,cy=650,r=125,point=(i,f)=>[cx+Math.sin(i*Math.PI/3)*r*f,cy-Math.cos(i*Math.PI/3)*r*f];
 for(const f of [.25,.5,.75,1])out+=`<polygon points="${data.arts.map((_,i)=>point(i,f).join(',')).join(' ')}" fill="none" stroke="#dce4ec"/>`;
 data.arts.forEach((a,i)=>{const [x,y]=point(i,1);line(cx,cy,x,y);const [tx,ty]=point(i,1.25);text(tx,ty,a.name+' '+a.score.toFixed(2),17,colors[i],600,'middle');});
 out+=`<polygon points="${data.arts.map((a,i)=>point(i,a.score/100).join(',')).join(' ')}" fill="#e8794250" stroke="#c65224" stroke-width="3"/>`;
 out+='</g><g data-panel="scores" data-box="610 375 550 465">';rect(610,375,550,465);text(635,415,'各艺今日训练得分',26,'#182c40',700);
 data.arts.forEach((a,i)=>{const y=475+i*55;text(635,y,a.name,19,colors[i],600);text(760,y,a.best?catalog[i].steps[a.best.step-1].name:'近7日无训练记录',18,'#657587');text(1130,y,a.score.toFixed(2),23,colors[i],600,'end');});
 out+='</g>';
 function plot(x,y,w,h,series){
  const axisMax=trendAxisMax(series.flatMap(s=>s.values));
  [0,.25,.5,.75,1].forEach(f=>{const yy=y+h-h*f;line(x,yy,x+w,yy);text(x-10,yy+5,Number((axisMax*f).toPrecision(4)),14,'#657587',400,'end');});
  series.forEach(({values,color})=>{out+=`<polyline points="${values.map((v,i)=>[x+(values.length===1?w/2:i*w/(values.length-1)),y+h-v/axisMax*h].join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="3"/>`;values.forEach((v,i)=>{out+=`<circle cx="${x+(values.length===1?w/2:i*w/(values.length-1))}" cy="${y+h-v/axisMax*h}" r="3" fill="${color}"/>`;});});
  const indices=[...new Set([0,Math.floor((data.trend.length-1)/2),data.trend.length-1])];indices.forEach(i=>text(x+(data.trend.length===1?w/2:i*w/(data.trend.length-1)),y+h+28,data.trend[i].date.slice(5),15,'#657587',400,'middle'));
 }
 out+='<g data-panel="trend" data-box="40 865 550 345">';rect(40,865,550,345);text(65,905,'综合强度趋势',26,'#182c40',700);plot(95,942,450,200,[{values:data.trend.map(d=>d.overall),color:'#c65224'}]);
 out+='</g><g data-panel="growth" data-box="610 865 550 345">';rect(610,865,550,345);text(635,905,'六艺水平增长曲线',26,'#182c40',700);plot(665,942,450,165,data.arts.map((a,i)=>({values:data.trend.map(d=>d.arts[i].score),color:colors[i]})));data.arts.forEach((a,i)=>text(645+(i%3)*160,1163+Math.floor(i/3)*25,a.name,16,colors[i]));
 out+=`</g><g data-panel="entries" data-box="40 ${tableY} 1120 ${105+rows*43}">`;rect(40,tableY,1120,105+rows*43);text(65,tableY+40,'当日训练汇总',26,'#182c40',700);text(65,tableY+77,'动作',18,'#657587');text(520,tableY+77,'各组完成',18,'#657587');text(930,tableY+77,'组数',18,'#657587');text(1130,tableY+77,'合计',18,'#657587',400,'end');
 if(!data.entries.length)text(65,tableY+120,'当日没有已保存的训练。',19,'#657587');
 data.entries.forEach((e,i)=>{const a=catalog.find(a=>a.id===e.id),s=a.steps[e.step-1],y=tableY+119+i*43;line(65,y-28,1130,y-28);text(65,y,s.name,19);text(520,y,e.sets.length>8?e.sets.slice(0,8).join(' / ')+' …':e.sets.join(' / '),17);text(948,y,e.sets.length,19);text(1130,y,e.sets.reduce((a,b)=>a+b,0)+' '+s.unit,19,'#182c40',400,'end');});
 out+=`</g><g data-panel="footer" data-box="40 ${H-85} 1120 70">`;text(45,H-63,'算法：同日同式累计组数，以最低组量匹配阶段；各艺取近7日最高值，六艺平均。',17,'#657587');text(45,H-33,'沿用飞书标准快照（2026-09-11）。无记录计0；此分数用于训练进展对比，不是医学评估。',17,'#657587');
 return out+'</g></g></svg>';
}
