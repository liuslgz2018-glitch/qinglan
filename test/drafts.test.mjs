import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {defaults} from '../lib/model.mjs';
const catalog=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url),'utf8'));
test('记录页可改式并添加同艺不同式，长期计划不变',()=>{
 const control={dataset:{entryStep:'0'},value:'2'};const context=vm.createContext({Intl,Date,console,confirm:()=>true,document:{querySelector:()=>null,querySelectorAll:s=>s==='[data-entry-step]'?[control]:[]},localStorage:{getItem:()=>null,setItem:()=>{}}});
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8').split("window.addEventListener('beforeinstallprompt'")[0];
 vm.runInContext(source+'\nglobalThis.testDraft={init:(c,s)=>{catalog=c;state=s;},load:loadDraft,get:()=>draft,add:addExercise,bind:()=>{render=()=>{};bind();}};',context);
 const settings=defaults();context.testDraft.init(catalog,{settings,logs:[]});context.testDraft.load('2026-09-11');context.testDraft.bind();control.onchange();assert.equal(context.testDraft.get().entries[0].step,2);assert.equal(settings.plans[0].step,1);context.testDraft.add('pushup');const entries=context.testDraft.get().entries.filter(e=>e.id==='pushup');assert.equal(entries.length,2);assert.equal(entries[1].step,1);assert.equal(entries[1].done[0],false);
});
test('同艺第二式的完成勾选只修改第二式',()=>{
 const control={dataset:{done:'1:0'},checked:true};const context=vm.createContext({Intl,Date,console,document:{querySelector:()=>null,querySelectorAll:s=>s==='[data-done]'?[control]:[]},localStorage:{getItem:()=>null,setItem:()=>{}}});
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8').split("window.addEventListener('beforeinstallprompt'")[0];
 vm.runInContext(source+'\nglobalThis.testDraft={init:(c,s)=>{catalog=c;state=s;},load:loadDraft,get:()=>draft,bind:()=>{render=()=>{};bind();}};',context);
 context.testDraft.init(catalog,{settings:defaults(),logs:[{date:'2026-09-07',kind:'training',pain:'未记录',note:'',revision:1,entries:[{id:'pullup',step:1,sets:[40]},{id:'pullup',step:2,sets:[7]}]}]});
 context.testDraft.load('2026-09-07');context.testDraft.get().entries[0].done[0]=false;context.testDraft.get().entries[1].done[0]=false;context.testDraft.bind();control.onchange();
 assert.equal(context.testDraft.get().entries[0].done[0],false);assert.equal(context.testDraft.get().entries[1].done[0],true);
});
test('部分保存后仍可记录其他动作，已保存历史保留原式数，本机草稿优先恢复',()=>{
 const items=new Map();const context=vm.createContext({Intl,Date,console,localStorage:{getItem:k=>items.get(k)||null,setItem:(k,v)=>items.set(k,v),removeItem:k=>items.delete(k)}});
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8').split("window.addEventListener('beforeinstallprompt'")[0];
 vm.runInContext(source+'\nglobalThis.testDraft={init:(c,s)=>{catalog=c;state=s;},load:loadDraft,get:()=>draft,keep:keepDraft};',context);
 const state={settings:defaults(),logs:[{date:'2026-09-01',kind:'training',pain:'舒适',note:'',revision:1,entries:[{id:'pushup',step:1,sets:[30]}]}]};
 state.settings.plans[0].step=3;context.testDraft.init(catalog,state);context.testDraft.load('2026-09-01');
 let draft=context.testDraft.get();assert.equal(draft.entries.length,4);assert.equal(draft.entries[0].step,1);assert.equal(draft.entries[0].done[0],true);assert.equal(draft.entries[1].done[0],false);
 draft.entries[1].sets[0]=7;context.testDraft.keep();context.testDraft.load('2026-09-02');context.testDraft.load('2026-09-01');assert.equal(context.testDraft.get().entries[1].sets[0],7);
});
