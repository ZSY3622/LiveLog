const test=require('node:test');
const assert=require('node:assert/strict');
const {posterPose,mount}=require('../hero-space.js');

test('wraps adjacent posters and keeps at most five accessible positions',()=>{
 for(const count of [1,2,3,4,5,10])for(let current=0;current<count;current++){
  const poses=Array.from({length:count},(_,i)=>posterPose(i,current,count,1280));
  assert.equal(poses.filter(p=>p.visible).length,Math.min(5,count));
  assert.equal(poses.filter(p=>p.offset===0).length,1);
  assert.equal(poses[current].x,0);assert.equal(poses[current].opacity,1);
  assert.ok(poses.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.depth)));
 }
 assert.equal(posterPose(9,0,10,1280).offset,-1);
 assert.equal(posterPose(0,9,10,1280).offset,1);
});
test('phone positions retain depth without exceeding the stage half-width',()=>{
 const poses=[0,1,2].map(i=>posterPose(i,0,10,390));
 assert.ok(poses[2].x<195);
 assert.ok(poses[0].scale>poses[1].scale&&poses[1].scale>poses[2].scale);
 assert.ok(poses[0].depth>poses[1].depth&&poses[1].depth>poses[2].depth);
});
function fixture(){
 class Target{constructor(){this.events=new Map()}addEventListener(name,fn){if(!this.events.has(name))this.events.set(name,new Set());this.events.get(name).add(fn)}removeEventListener(name,fn){this.events.get(name)?.delete(fn)}emit(name,event={}){for(const fn of this.events.get(name)||[])fn(event)}}
 const win=new Target(),doc=new Target(),host=new Target(),reduced=new Target(),fine=new Target();
 const frames=new Map(),styles=new Map();let id=0,observer;
 reduced.matches=false;fine.matches=true;doc.hidden=false;
 win.matchMedia=q=>q.includes('reduced')?reduced:fine;
 win.requestAnimationFrame=fn=>{frames.set(++id,fn);return id};win.cancelAnimationFrame=id=>frames.delete(id);
 win.IntersectionObserver=class{constructor(fn){this.fn=fn;observer=this}observe(){}disconnect(){this.disconnected=true}};
 host.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:400});
 const stage={style:{setProperty:(k,v)=>styles.set(k,v)}},hero={getBoundingClientRect:()=>({top:-100,height:800})};
 const api=mount({host,stage,root:hero,win,doc});
 const flush=()=>{const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn())};
 return {win,doc,host,reduced,fine,frames,styles,api,flush,get observer(){return observer}};
}
test('pointer events share one frame and do not create an idle loop',()=>{
 const f=fixture();for(let i=0;i<10;i++)f.host.emit('pointermove',{pointerType:'mouse',clientX:1000,clientY:400});
 assert.equal(f.frames.size,1);f.flush();assert.equal(f.frames.size,0);
 assert.equal(f.styles.get('--parallax-x'),'32px');
 assert.equal(f.styles.get('--parallax-rx'),'-4deg');assert.equal(f.styles.get('--parallax-ry'),'6deg');
 f.host.emit('pointermove',{pointerType:'mouse',clientX:2000,clientY:800});f.flush();
 assert.equal(f.styles.get('--parallax-x'),'32px');assert.equal(f.styles.get('--parallax-ry'),'6deg');
 f.host.emit('pointerleave');f.flush();assert.equal(f.styles.get('--parallax-x'),'0px');
});
test('modal/manual pauses compose and cancel queued work',()=>{
 const f=fixture();f.win.emit('scroll');assert.equal(f.frames.size,1);
 f.api.setPaused('modal',true);assert.equal(f.frames.size,0);
 f.api.setPaused('manual',true);f.api.setPaused('modal',false);f.win.emit('scroll');assert.equal(f.frames.size,0);
 f.api.setPaused('manual',false);assert.equal(f.frames.size,1);f.flush();
});
test('hidden, offscreen, reduced-motion and pagehide stop and reset motion',()=>{
 const f=fixture();f.win.emit('scroll');f.doc.hidden=true;f.doc.emit('visibilitychange');assert.equal(f.frames.size,0);
 f.doc.hidden=false;f.doc.emit('visibilitychange');f.observer.fn([{isIntersecting:false}]);assert.equal(f.frames.size,0);
 f.observer.fn([{isIntersecting:true}]);f.reduced.matches=true;f.reduced.emit('change');assert.equal(f.frames.size,0);assert.equal(f.styles.get('--scene-opacity'),'1');
 f.reduced.matches=false;f.reduced.emit('change');f.win.emit('pagehide');assert.equal(f.frames.size,0);
 f.win.emit('pageshow');assert.equal(f.frames.size,1);
});
test('touch/coarse pointers have no pointer motion and destroy removes callbacks',()=>{
 const f=fixture();f.host.emit('pointermove',{pointerType:'touch',clientX:900,clientY:100});assert.equal(f.frames.size,0);
 f.fine.matches=false;f.host.emit('pointermove',{pointerType:'mouse',clientX:900,clientY:100});assert.equal(f.frames.size,0);
 f.win.emit('scroll');f.api.destroy();assert.equal(f.frames.size,0);assert.ok(f.observer.disconnected);
 f.win.emit('scroll');f.host.emit('pointermove',{pointerType:'mouse',clientX:900,clientY:100});assert.equal(f.frames.size,0);
});
