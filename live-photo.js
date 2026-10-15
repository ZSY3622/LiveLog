/* Local photo/video pair player. No remote library or media service required. */
(() => {
 'use strict';
 window.createLivePhotoPlayer = ({host, image, video, playButton, soundButton, status}) => {
  const events=new AbortController();
  const options={signal:events.signal};
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let mode=null, request=0, disposed=false, failed=false, heldPointer=null;
  image.draggable=false;
  host.classList.add('live-photo-stage');
  host.tabIndex=0;
  host.setAttribute('role','button');
  host.setAttribute('aria-label','实况照片，按住或按空格播放');
  host.setAttribute('aria-pressed','false');
  video.muted=true;video.playsInline=true;video.controls=false;video.preload='none';
  video.setAttribute('aria-hidden','true');
  const hint='鼠标悬停或按住照片播放；也可点击播放按钮。';
  function sync(){
   const active=mode!==null;
   host.setAttribute('aria-pressed',String(active));
   playButton.setAttribute('aria-pressed',String(active));
   playButton.textContent=active?'■ 停止实况':'◉ 播放实况';
   soundButton.textContent=video.muted?'开启声音':'关闭声音';
   soundButton.setAttribute('aria-pressed',String(!video.muted));
  }
  function stop(){
   request++;mode=null;video.pause();
   host.classList.remove('is-playing');
   // The high-resolution still stays underneath until the video really plays.
   try{video.currentTime=0}catch{}
   if(!disposed&&!failed)status.textContent=hint;
   sync();
  }
  async function start(nextMode){
   if(disposed||failed)return;
   const wasActive=mode!==null;
   mode=nextMode;sync();
   if(wasActive)return;
   const token=++request;
   status.textContent='正在加载实况…';
   try{
    video.currentTime=0;
    await video.play();
    if(disposed||token!==request||mode===null)return;
    host.classList.add('is-playing');
    status.textContent='实况播放中 · '+(video.muted?'静音':'声音已开启');
   }catch(error){
    if(disposed||token!==request)return;
    stop();
    status.textContent=failed?'动态部分无法加载，仍可查看静态照片。':'播放未能开始，请点击「播放实况」重试。';
   }
  }
  host.addEventListener('pointerenter',event=>{
   if(event.pointerType==='mouse'&&!reduced.matches&&video.muted&&mode===null)void start('hover');
  },options);
  host.addEventListener('pointerleave',()=>{if(mode==='hover')stop()},options);
  host.addEventListener('pointerdown',event=>{
   if(event.button!==0)return;
   event.preventDefault();heldPointer=event.pointerId;
   host.focus({preventScroll:true});
   host.setPointerCapture?.(event.pointerId);
   void start('hold');
  },options);
  const release=event=>{
   if(event.pointerId!==heldPointer)return;
   heldPointer=null;if(mode==='hold')stop();
  };
  host.addEventListener('pointerup',release,options);
  host.addEventListener('pointercancel',release,options);
  host.addEventListener('lostpointercapture',release,options);
  host.addEventListener('contextmenu',event=>event.preventDefault(),options);
  host.addEventListener('keydown',event=>{
   if(event.key!==' '&&event.key!=='Enter')return;
   event.preventDefault();if(!event.repeat)void start('keyboard');
  },options);
  host.addEventListener('keyup',event=>{
   if(event.key!==' '&&event.key!=='Enter')return;
   event.preventDefault();if(mode==='keyboard')stop();
  },options);
  host.addEventListener('blur',()=>{if(mode==='keyboard')stop()},options);
  playButton.addEventListener('click',()=>{if(mode!==null)stop();else void start('button')},options);
  soundButton.addEventListener('click',()=>{
   video.muted=!video.muted;sync();
   if(host.classList.contains('is-playing'))status.textContent='实况播放中 · '+(video.muted?'静音':'声音已开启');
  },options);
  video.addEventListener('ended',stop,options);
  video.addEventListener('error',()=>{
   failed=true;stop();playButton.disabled=true;soundButton.disabled=true;
   host.setAttribute('aria-disabled','true');
   status.textContent='动态部分无法加载，仍可查看静态照片。';
  },options);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()},options);
  window.addEventListener('blur',stop,options);
  status.textContent=hint;sync();
  return {
   destroy(){
    disposed=true;stop();events.abort();
    video.removeAttribute('src');video.load();
    host.classList.remove('live-photo-stage');
    for(const attribute of ['tabindex','role','aria-label','aria-pressed','aria-disabled'])host.removeAttribute(attribute);
   }
  };
 };
})();
