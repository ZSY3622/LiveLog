const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

class Element extends EventTarget {
 constructor(){
  super();this.children=[];this.classes=new Set();
  this.classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name),
   toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name),contains:name=>this.classes.has(name)};
 }
 set className(value){this.classes=new Set(value.split(' '))}
 append(child){this.children.push(child);child.parent=this}
 replaceChildren(){this.children=[]}
 setAttribute(){}
 closest(selector){return this.classes.has(selector.slice(1))?this:this.parent?.closest(selector)||null}
 contains(element){return element===this||this.children.some(child=>child.contains(element))}
 querySelectorAll(selector){return this.children.flatMap(child=>[...(selector==='img'&&child.tagName==='IMG'?[child]:[]),...child.querySelectorAll(selector)])}
}
function setup({count=3,reduced=false}={}){
 const document=new EventTarget();document.hidden=false;document.createElement=()=>new Element();
 const motion=new EventTarget();motion.matches=reduced;
 const timers=new Map();let serial=0,observer,paused=false;
 const window={matchMedia:()=>motion,IntersectionObserver:class {}};
 class Observer {
  constructor(callback){this.callback=callback;observer=this}
  observe(){}
  disconnect(){this.disconnected=true}
 }
 const context={window,document,AbortController,IntersectionObserver:Observer,
  setTimeout:fn=>{timers.set(++serial,fn);return serial},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../gallery-slideshow.js'),'utf8'),context);
 const card=new Element(),host=new Element();card.className='memory-card';card.append(host);
 const created=[],changes=[];
 const controller=window.mountMemorySlideshow({host,count,isPaused:()=>paused,onChange:index=>changes.push(index),createSlide:index=>{
  created.push(index);const image=new Element();image.tagName='IMG';image.complete=false;image.naturalWidth=0;return image;
 }});
 const visible=value=>observer.callback([{isIntersecting:value}]);
 const cached=index=>{
  const image=host.children[created.indexOf(index)].querySelectorAll('img')[0];image.complete=true;image.naturalWidth=1200;
 };
 const ready=index=>{
  cached(index);
  const layer=host.children[created.indexOf(index)],event=new Event('load');
  Object.defineProperty(event,'target',{value:{tagName:'IMG',naturalWidth:1200,closest:()=>null}});
  layer.dispatchEvent(event);
 };
 const tick=()=>{assert.equal(timers.size,1);const [id,fn]=timers.entries().next().value;timers.delete(id);fn()};
 const active=()=>created.filter((index,i)=>host.children[i].classList.contains('is-active'));
 const fire=(target,type,properties={})=>{const event=new Event(type);Object.assign(event,properties);target.dispatchEvent(event)};
 return {host,card,motion,document,timers,created,changes,controller,visible,ready,cached,tick,active,fire,
  pause(value){paused=value;controller.refresh()},observer:()=>observer};
}

test('preloads the next photo only when visible, then rotates and wraps',()=>{
 const s=setup();assert.deepEqual(s.created,[0]);assert.equal(s.timers.size,0);
 s.visible(true);assert.deepEqual(s.created,[0,1]);s.ready(0);s.ready(1);
 s.tick();assert.deepEqual(s.active(),[1]);assert.deepEqual(s.created,[0,1,2]);
 s.ready(2);s.tick();assert.deepEqual(s.active(),[2]);s.tick();assert.deepEqual(s.active(),[0]);
 assert.deepEqual(s.changes,[0,1,2,0]);
});
test('retains the current image while loading and skips an unavailable photo',()=>{
 const s=setup();s.visible(true);s.ready(0);s.tick();assert.deepEqual(s.active(),[0]);
 s.ready(2);s.tick();assert.deepEqual(s.active(),[2]);
});
test('wraps from the last photo to cached first photos even when load events were missed',()=>{
 const s=setup();s.visible(true);s.tick();
 s.ready(2);s.tick();assert.deepEqual(s.active(),[2]);
 s.cached(0);s.cached(1);
 s.tick();assert.deepEqual(s.active(),[0]);
 s.tick();assert.deepEqual(s.active(),[1]);
 s.tick();assert.deepEqual(s.active(),[2]);
 s.tick();assert.deepEqual(s.active(),[0]);
});
test('pauses offscreen and in the background while hover and focus preserve rotation',()=>{
 const s=setup();s.visible(true);
 s.visible(false);assert.equal(s.timers.size,0);s.visible(true);
 s.document.hidden=true;s.fire(s.document,'visibilitychange');assert.equal(s.timers.size,0);
 s.document.hidden=false;s.fire(s.document,'visibilitychange');assert.equal(s.timers.size,1);
 s.fire(s.card,'pointerenter',{pointerType:'mouse'});assert.equal(s.timers.size,1);
 s.fire(s.card,'pointerleave');assert.equal(s.timers.size,1);
 s.fire(s.card,'focusin');assert.equal(s.timers.size,1);
 s.ready(1);s.tick();assert.deepEqual(s.active(),[1]);
 s.fire(s.card,'focusout',{relatedTarget:null});assert.equal(s.timers.size,1);
});
test('honors manual/modal pause and live changes to reduced motion',()=>{
 const s=setup({reduced:true});s.visible(true);assert.deepEqual(s.created,[0]);assert.equal(s.timers.size,0);
 s.motion.matches=false;s.fire(s.motion,'change');assert.equal(s.timers.size,1);
 s.pause(true);assert.equal(s.timers.size,0);s.pause(false);assert.equal(s.timers.size,1);
 s.motion.matches=true;s.fire(s.motion,'change');assert.equal(s.timers.size,0);
});
test('single photos do not start timers and destruction cancels all work',()=>{
 const single=setup({count:1});single.visible(true);assert.equal(single.timers.size,0);single.controller.destroy();
 const s=setup();s.visible(true);s.controller.destroy();
 assert.equal(s.timers.size,0);assert.equal(s.host.children.length,0);assert.equal(s.observer().disconnected,true);
 s.fire(s.document,'visibilitychange');s.visible(true);s.controller.refresh();assert.equal(s.timers.size,0);
});
