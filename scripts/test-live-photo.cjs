const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
class Element extends EventTarget {
 constructor(){super();this.attributes=new Map();this.classes=new Set();this.dataset={};this.paused=true;this.isConnected=true;this.classList={add:(...names)=>names.forEach(n=>this.classes.add(n)),remove:(...names)=>names.forEach(n=>this.classes.delete(n)),contains:n=>this.classes.has(n),toggle:(n,on)=>on?this.classes.add(n):this.classes.delete(n)}}
 setAttribute(n,v){this.attributes.set(n,String(v))}
 getAttribute(n){return this.attributes.get(n)||null}
 set src(value){this.setAttribute('src',value)}
 get src(){return this.getAttribute('src')||''}
 removeAttribute(n){this.attributes.delete(n)}
 replaceChildren(){this.cleared=true}
 click(){this.dispatchEvent(new Event('click'))}
 play(){this.paused=false;return this.pending||Promise.resolve()}
 pause(){this.paused=true}
 load(){this.loaded=true}
}
function setup({preview=false,reduced=false,imageSrc='https://local/IMG.HEIC'}={}){
 const revoked=[],statuses=[],states=[];
 class UpstreamPlayer {
  constructor(host,options){this.container=host;this.options=options;this.isMuted=options.mute;this.observer={disconnect:()=>this.disconnected=true}}
  init(){this.render();this.bindEvents()}
  render(){this.renderedByUpstream=true;this.elements=Object.fromEntries(['video','image','wrapper','icon','volumeControl'].map(k=>[k,new Element()]));this.elements.video.setAttribute('src',this.options.videoSrc)}
  bindEvents(){this.elements.volumeControl.addEventListener('click',()=>{this.isMuted=!this.isMuted;this.elements.video.muted=this.isMuted})}
  async handleStart(){this.upstreamStarts=(this.upstreamStarts||0)+1;await this.elements.video.play();this.elements.wrapper.classList.add('zoom')}
  handleStop(){this.elements.video.pause();this.elements.wrapper.classList.remove('zoom')}
  showWarning(text){this.warning=text}
  trackLoad(promise){return promise}
  decodeHeic(){this.decodes=(this.decodes||0)+1;return Promise.resolve({decoded:true})}
  loadAndroidLivePhoto(src){this.fallbackSources=(this.fallbackSources||[]).concat(src)}
 }
 const window=new Element(),document=new Element();document.baseURI='https://local/index.html';window.LivePhoto={Player:UpstreamPlayer};window.matchMedia=()=>({matches:reduced});
 class TestURL extends URL {static revokeObjectURL(url){revoked.push(url)}}
 const context=vm.createContext({window,document,AbortController,URL:TestURL});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../live-photo.js'),'utf8'),context);
 const player=window.mountConcertLivePhoto({host:new Element(),imageSrc,videoSrc:'https://local/IMG.MOV',alt:'<title>',preview,onStatus:x=>statuses.push(x),onState:x=>states.push(x)});
 player.init();
 return {player,window,document,revoked,statuses,states};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('uses upstream renderer with original HEIC/MOV and escaped metadata',()=>{
 const {player}=setup();assert.equal(player.renderedByUpstream,true);
 assert.equal(player.options.imageSrc,'https://local/IMG.HEIC');assert.equal(player.options.videoSrc,'https://local/IMG.MOV');assert.equal(player.options.alt,'&lt;title&gt;');
});
test('thumbnail previews do not load or play MOV',async()=>{
 const {player}=setup({preview:true});assert.equal(player.elements.video.getAttribute('src'),null);
 await player.handleStart();assert.equal(player.upstreamStarts,undefined);
});
test('release during a pending upstream play cannot leave video running',async()=>{
 const {player}=setup();let resolve;player.elements.video.pending=new Promise(r=>resolve=r);
 const pending=player.handleStart();player.handleStop();resolve();await pending;
 assert.equal(player.elements.video.paused,true);assert.equal(player.elements.wrapper.classList.contains('zoom'),false);
});
test('explicit playback and sound use upstream methods',async()=>{
 const {player,states}=setup();await player.handleStart();assert.equal(player.upstreamStarts,1);
 assert.equal(player.isMuted,false);
 player.toggleSound();assert.equal(player.isMuted,true);assert.equal(states.at(-1).muted,true);
 player.toggleSound();assert.equal(player.isMuted,false);
 player.toggle();assert.equal(player.elements.video.paused,true);
});
test('reduced motion skips hover while preserving explicit play',async()=>{
 const {player}=setup({reduced:true});await player.handleStart({type:'mouseenter'});assert.equal(player.upstreamStarts,undefined);
 await player.handleStart();assert.equal(player.upstreamStarts,1);
});
test('closing cleans observer and blob URLs including late loads',async()=>{
 const {player,revoked,statuses}=setup();let resolve;
 const pending=new Promise(r=>resolve=r).then(()=>player.elements.image.setAttribute('src','blob:late'));
 const load=player.trackLoad(pending);player.destroy();const count=statuses.length;resolve();await load;await settle();
 assert.equal(player.disconnected,true);assert.equal(player.elements.video.loaded,true);assert.equal(player.elements.video.getAttribute('src'),null);assert.deepEqual(revoked,['blob:late']);assert.equal(statuses.length,count);
});
test('video error keeps the photo and reports a browser compatibility message',()=>{
 const {player,statuses,states}=setup();player.elements.image.setAttribute('src','blob:still');player.elements.video.dispatchEvent(new Event('error'));
 assert.equal(player.elements.image.getAttribute('src'),'blob:still');assert.match(statuses.at(-1),/原始视频/);assert.equal(states.at(-1).failed,true);
});
test('local HEIC uses a native image without fetching or decoding',()=>{
 const src='file:///concert/live/IMG.HEIC', {player}=setup({imageSrc:src});
 player.loadAndroidLivePhoto(src);
 assert.equal(player.elements.image.src,src);
 player.elements.image.dispatchEvent(new Event('load'));
 assert.equal(player.nativeImagePending,false);
 assert.equal(player.decodes,undefined);assert.equal(player.fallbackSources,undefined);
});
test('native HEIC failure falls back to upstream decoding over HTTP once',()=>{
 const {player,statuses}=setup();player.loadAndroidLivePhoto(player.options.imageSrc);
 player.elements.image.dispatchEvent(new Event('error'));
 assert.deepEqual(Array.from(player.fallbackSources),[player.options.imageSrc]);
 assert.equal(player.elements.image.getAttribute('src'),null);
 assert.match(statuses.at(-1),/解码/);
 player.elements.image.dispatchEvent(new Event('error'));
 assert.equal(player.fallbackSources.length,1);assert.match(statuses.at(-1),/无法显示/);
});
test('unsupported file HEIC gives actionable instructions without a blocked fetch',()=>{
 const src='file:///concert/IMG.heif', {player,statuses}=setup({imageSrc:src});
 player.loadAndroidLivePhoto(src);player.elements.image.dispatchEvent(new Event('error'));
 assert.equal(player.fallbackSources,undefined);assert.match(statuses.at(-1),/Safari 17.*HTTP/);
});
test('closing during native loading removes callbacks and never starts a fallback',()=>{
 const {player,statuses}=setup();player.loadAndroidLivePhoto(player.options.imageSrc);player.destroy();
 const count=statuses.length;player.elements.image.dispatchEvent(new Event('error'));
 assert.equal(player.fallbackSources,undefined);assert.equal(statuses.length,count);
});
test('non-HEIC media keeps the upstream loader',()=>{
 const {player}=setup();player.loadAndroidLivePhoto('https://local/still.jpg');
 assert.deepEqual(Array.from(player.fallbackSources),['https://local/still.jpg']);
});
test('viewer attaches the original MOV only when playback is requested',async()=>{
 const {player}=setup();assert.equal(player.elements.video.getAttribute('src'),null);
 await player.handleStart({type:'click',cancelable:false});
 assert.equal(player.elements.video.getAttribute('src'),player.options.videoSrc);
 assert.equal(player.upstreamStarts,1);
});
