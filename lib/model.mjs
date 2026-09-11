export const ids = ['pushup', 'squat', 'pullup', 'legraise', 'bridge', 'handstand'];
export const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const defaults = () => ({revision:0, days:[0,1,2,3,4,5,6], plans:ids.map((id,i)=>({id,step:i===1?2:1,sets:[2,1,2,1,1,1][i],reps:[30,10,20,2,10,30][i],enabled:i<4})), standards:{}});
export class Problem extends Error { constructor(message,status=400){super(message);this.status=status;} }
const need = (ok,msg) => {if(!ok) throw new Problem(msg);};
const integer = (n,min,max) => Number.isInteger(n)&&n>=min&&n<=max;
export function dateValid(d){return typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;}
export function validateLog(v){
  need(v&&typeof v==='object','记录格式不正确');
  need(dateValid(v.date)&&v.date<=''+today()&&v.date>='2000-01-01','请选择有效日期，不能记录未来训练');
  need(['training','rest'].includes(v.kind),'请选择训练或休息');
  need(['舒适','轻微不适','明显不适','未记录'].includes(v.pain),'身体状态不正确');
  need(typeof v.note==='string'&&v.note.length<=1000,'备注最多1000字');
  need(Array.isArray(v.entries)&&v.entries.length<=60,'动作最多六十式');
  need(v.kind==='rest'?v.entries.length===0:v.entries.length>0,'请记录至少一组，或选择休息日');
  const seen=new Set();
  const entries=v.entries.map(e=>{
    need(e&&ids.includes(e.id)&&!seen.has(e.id+'-'+e.step),'动作重复或不正确');seen.add(e.id+'-'+e.step);
    need(integer(e.step,1,10),'动作等级必须为1至10式');
    need(Array.isArray(e.sets)&&e.sets.length>0&&e.sets.length<=20&&e.sets.every(n=>integer(n,1,3600)),'每组填写1至3600的整数，最多20组');
    return {id:e.id,step:e.step,sets:e.sets};
  });
  return {date:v.date,kind:v.kind,pain:v.pain,note:v.note,entries};
}
export function validateSettings(v){
  need(v&&Array.isArray(v.days)&&v.days.length>0&&v.days.length<=7&&new Set(v.days).size===v.days.length&&v.days.every(d=>integer(d,0,6)),'请选择每周训练日');
  need(Array.isArray(v.plans)&&v.plans.length===6,'需要六艺计划');
  const plans=ids.map(id=>{const p=v.plans.find(x=>x.id===id);need(p&&v.plans.filter(x=>x.id===id).length===1&&integer(p.step,1,10)&&integer(p.sets,1,20)&&integer(p.reps,1,3600)&&typeof p.enabled==='boolean','计划格式不正确');return {id,step:p.step,sets:p.sets,reps:p.reps,enabled:p.enabled};});
  need(plans.slice(0,4).every(p=>p.step>=6)||plans.slice(4).every(p=>!p.enabled),'前四艺达到第六式后才能开启桥和倒立撑');
  need(v.standards&&typeof v.standards==='object'&&!Array.isArray(v.standards),'标准格式不正确');
  const standards={};for(const [key,values] of Object.entries(v.standards)){
    need(ids.some(id=>new RegExp('^'+id+'-(10|[1-9])$').test(key))&&Array.isArray(values)&&values.length===3&&values.every(x=>typeof x==='string'&&x.length<=40),'自定义标准格式不正确');standards[key]=values;
  }
  return {days:v.days,plans,standards};
}
export function exportCsv(logs,catalog){
  const q=v=>'"'+String(v).replaceAll('"','""')+'"';
  const rows=[['日期','类型','六艺','式','动作','组序号','数量','单位','身体状态','备注']];
  for(const l of logs){if(!l.entries.length)rows.push([l.date,'休息','','','','','','',l.pain,l.note]);
    for(const e of l.entries){const a=catalog.find(a=>a.id===e.id),s=a.steps[e.step-1];e.sets.forEach((n,i)=>rows.push([l.date,'训练',a.name,e.step,s.name,i+1,n,s.unit,l.pain,l.note]));}}
  return '\ufeff'+rows.map(r=>r.map(v=>q(/^[=+@\-\t\r]/.test(String(v))?"'"+v:v)).join(',')).join('\r\n');
}
