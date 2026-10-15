/* LiveLog lifecycle/accessibility adapter for vendored @thun888/live-photo 1.2.0. */
(() => {
 'use strict';
 const decodedPhotos=new Map();
 const escapeHTML=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 class ConcertLivePhoto extends window.LivePhoto.Player {
  constructor(host,{imageSrc,videoSrc,alt,preview=false,onStatus=()=>{},onState=()=>{}}){
   super(host,{imageSrc,videoSrc,alt:escapeHTML(alt),mute:true});
   this.preview=preview;this.onStatus=onStatus;this.onState=onState;
   this.disposed=false;this.wantsPlayback=false;this.generation=0;
   this.events=new AbortController();
   this.container.classList.add('thun-live-host');
   this.container.classList.toggle('thun-live-preview',preview);
  }
  init(){if(!this.disposed)super.init()}
  render(){
   const videoSrc=this.options.videoSrc;
   if(this.preview)this.options.videoSrc='';
   try{super.render()}finally{this.options.videoSrc=videoSrc}
   this.elements.video.preload='none';
   if(this.preview)this.elements.video.removeAttribute('src');
  }
  async decodeHeic(buffer){
   const key=this.options.imageSrc;
   if(!decodedPhotos.has(key)){
    const pending=super.decodeHeic(buffer);
    decodedPhotos.set(key,pending);
    pending.catch(()=>{if(decodedPhotos.get(key)===pending)decodedPhotos.delete(key)});
    if(decodedPhotos.size>8)decodedPhotos.delete(decodedPhotos.keys().next().value);
   }
   return decodedPhotos.get(key);
  }
  trackLoad(promise){
   const tracked=super.trackLoad(promise);
   const finish=()=>{
    if(this.disposed)this.releaseMedia();
    else if(!this.elements.image.getAttribute('src'))this.onStatus('原始照片加载失败，请检查 HEIC 文件。');
   };
   tracked.then(finish,finish);
   return tracked;
  }
  bindEvents(){
   super.bindEvents();
   const listen=(target,name,handler)=>target.addEventListener(name,handler,{signal:this.events.signal});
   listen(this.elements.image,'load',()=>{if(!this.disposed)this.onStatus('悬停 LIVE 图标或按住它播放；也可点击播放按钮。')});
   listen(this.elements.image,'error',()=>{if(!this.disposed)this.onStatus('原始照片无法显示，请检查 HEIC 文件。')});
   if(this.preview)return;
   const {icon,volumeControl,video}=this.elements;
   icon.setAttribute('role','button');icon.tabIndex=0;icon.setAttribute('aria-label','播放实况');
   volumeControl.setAttribute('role','button');volumeControl.tabIndex=0;volumeControl.setAttribute('aria-label','开启声音');
   listen(icon,'click',event=>{if(video.paused)void this.handleStart(event)});
   listen(icon,'keydown',event=>{
    if([' ','Enter'].includes(event.key)){event.preventDefault();if(!event.repeat)void this.handleStart(event)}
   });
   listen(icon,'keyup',event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();this.handleStop()}});
   listen(icon,'blur',()=>this.handleStop());
   listen(volumeControl,'keydown',event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();volumeControl.click()}});
   listen(volumeControl,'click',()=>this.reportState());
   listen(this.elements.wrapper,'touchcancel',()=>this.handleStop());
   listen(video,'playing',()=>{if(this.disposed||!this.wantsPlayback)this.handleStop();else this.reportState()});
   listen(video,'pause',()=>this.reportState());
   listen(video,'ended',()=>this.handleStop());
   listen(video,'error',()=>{
    if(this.disposed)return;
    this.handleStop();
    const message='当前浏览器无法播放这段原始视频，仍可查看实况照片。';
    this.showWarning(message);this.onStatus(message);this.reportState(true);
   });
   listen(document,'visibilitychange',()=>{if(document.hidden)this.handleStop()});
   listen(window,'blur',()=>this.handleStop());
   this.reportState();
  }
  reportState(failed=false){
   if(this.disposed||this.preview)return;
   const playing=!this.elements.video.paused;
   this.elements.icon.setAttribute('aria-pressed',String(playing));
   this.elements.volumeControl.setAttribute('aria-label',this.isMuted?'开启声音':'关闭声音');
   this.elements.volumeControl.setAttribute('aria-pressed',String(!this.isMuted));
   this.onState({playing,muted:this.isMuted,failed});
   if(!failed&&playing)this.onStatus('实况播放中 · '+(this.isMuted?'静音':'声音已开启'));
  }
  async handleStart(event={cancelable:false}){
   if(this.disposed||this.preview)return;
   if(event.type==='mouseenter'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
   const generation=++this.generation;this.wantsPlayback=true;
   this.onStatus('正在加载原始实况…');
   await super.handleStart(event);
   if(this.disposed){this.releaseMedia();return}
   if(generation!==this.generation){if(!this.wantsPlayback)super.handleStop();return}
   if(this.elements.video.paused){this.wantsPlayback=false;this.onStatus('播放未能开始，请点击播放按钮重试。')}
   this.reportState();
  }
  handleStop(){
   this.generation++;this.wantsPlayback=false;
   if(this.elements)super.handleStop();
   if(!this.disposed&&!this.preview){this.reportState();this.onStatus('悬停 LIVE 图标或按住它播放；也可点击播放按钮。')}
  }
  toggle(){if(!this.elements)return;if(this.elements.video.paused)void this.handleStart();else this.handleStop()}
  toggleSound(){this.elements?.volumeControl.click()}
  releaseMedia(){
   if(!this.elements)return;
   const {video,image}=this.elements;
   video.pause();
   for(const element of [image,video]){
    const src=element.getAttribute('src');
    if(src?.startsWith('blob:'))URL.revokeObjectURL(src);
    element.removeAttribute('src');
   }
   video.load();this.elements.wrapper.classList.remove('zoom');
  }
  destroy(){
   this.disposed=true;this.handleStop();this.observer?.disconnect();this.events.abort();
   this.releaseMedia();this.container.replaceChildren();
   this.container.classList.remove('thun-live-host','thun-live-preview');
  }
 }
 window.mountConcertLivePhoto=(options)=>new ConcertLivePhoto(options.host,options);
})();
