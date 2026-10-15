const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

class Element extends EventTarget {
 constructor(){
  super();this.attributes=new Map();this.classes=new Set();this.paused=true;this.currentTime=0;
  this.classList={add:(...names)=>names.forEach(n=>this.classes.add(n)),remove:(...names)=>names.forEach(n=>this.classes.delete(n)),contains:name=>this.classes.has(name)};
 }
 setAttribute(name,value){this.attributes.set(name,String(value))}
 removeAttribute(name){this.attributes.delete(name)}
 focus(){}
 setPointerCapture(){}
 play(){this.paused=false;return this.pending||Promise.resolve()}
 pause(){this.paused=true}
 load(){this.loaded=true}
}
function setup(reduced=false){
 const window=new Element(), document=new Element();
 window.matchMedia=()=>({matches:reduced});
 const elements=Object.fromEntries(['host','image','video','playButton','soundButton','status'].map(name=>[name,new Element()]));
 const context=vm.createContext({window,document,AbortController});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../live-photo.js'),'utf8'),context);
 const controller=window.createLivePhotoPlayer(elements);
 const send=(target,type,properties={})=>target.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),properties));
 return {...elements,window,document,controller,send};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('hover plays and leaving restores the still',async()=>{
 const s=setup();s.send(s.host,'pointerenter',{pointerType:'mouse'});await settle();
 assert.equal(s.host.classList.contains('is-playing'),true);
 s.send(s.host,'pointerleave');assert.equal(s.video.paused,true);
 assert.equal(s.host.classList.contains('is-playing'),false);
});
test('release while loading cannot reveal a late video',async()=>{
 const s=setup();let resolve;s.video.pending=new Promise(r=>resolve=r);
 s.send(s.host,'pointerdown',{button:0,pointerId:7});
 s.send(s.host,'pointerup',{pointerId:7});resolve();await settle();
 assert.equal(s.video.paused,true);assert.equal(s.host.classList.contains('is-playing'),false);
});
test('click playback survives pointerleave and supports sound and replay',async()=>{
 const s=setup();s.send(s.playButton,'click');await settle();
 s.send(s.host,'pointerleave');assert.equal(s.video.paused,false);
 s.send(s.soundButton,'click');assert.equal(s.video.muted,false);
 assert.match(s.status.textContent,/声音已开启/);
 s.send(s.video,'ended');assert.equal(s.host.classList.contains('is-playing'),false);
 s.send(s.playButton,'click');await settle();assert.equal(s.video.paused,false);
 s.send(s.playButton,'click');assert.equal(s.video.paused,true);
});
test('reduced motion disables hover but permits explicit keyboard playback',async()=>{
 const s=setup(true);s.send(s.host,'pointerenter',{pointerType:'mouse'});await settle();
 assert.equal(s.video.paused,true);
 s.send(s.host,'keydown',{key:' ',repeat:false});await settle();assert.equal(s.video.paused,false);
 s.send(s.host,'keyup',{key:' '});assert.equal(s.video.paused,true);
});
test('backgrounding and pointer cancellation stop playback',async()=>{
 const s=setup();s.send(s.host,'pointerdown',{button:0,pointerId:1});await settle();
 s.send(s.host,'pointercancel',{pointerId:1});assert.equal(s.video.paused,true);
 s.send(s.playButton,'click');await settle();s.document.hidden=true;
 s.send(s.document,'visibilitychange');assert.equal(s.video.paused,true);
});
test('video failure preserves the still and disables broken controls',async()=>{
 const s=setup();s.send(s.playButton,'click');await settle();s.send(s.video,'error');
 assert.equal(s.playButton.disabled,true);assert.equal(s.video.paused,true);
 assert.equal(s.host.classList.contains('is-playing'),false);
 assert.match(s.status.textContent,/静态照片/);
});
test('closing releases video, pending requests, accessibility and listeners',async()=>{
 const s=setup();let resolve;s.video.pending=new Promise(r=>resolve=r);
 s.send(s.playButton,'click');s.controller.destroy();resolve();await settle();
 assert.equal(s.video.paused,true);assert.equal(s.video.loaded,true);
 assert.equal(s.host.classList.contains('is-playing'),false);assert.equal(s.host.attributes.has('role'),false);
 s.send(s.playButton,'click');s.send(s.host,'pointerdown',{button:0,pointerId:1});
 assert.equal(s.video.paused,true);
});
