/* Photo-only fades; Live Photo decoding stays in the existing preview adapter. */
(() => {
 'use strict';
 window.mountMemorySlideshow=({host,count,createSlide,isPaused=()=>false,onChange=()=>{}})=>{
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const events=new AbortController(), slides=new Map();
  let current=0, timer=null, visible=!('IntersectionObserver' in window), disposed=false;
  const running=()=>!disposed&&visible&&!document.hidden&&!motion.matches&&!isPaused();
  const stop=()=>{clearTimeout(timer);timer=null};
  const schedule=()=>{
   stop();
   if(count>1&&running()){
    ensure((current+1)%count);
    timer=setTimeout(advance,5000);
   }
  };
  function ensure(index){
   if(slides.has(index))return slides.get(index);
   const layer=document.createElement('div');layer.className='memory-slide';
   layer.classList.toggle('is-active',index===current);
   const state={layer,ready:false};slides.set(index,state);
   // Capture image load events from both plain images and the upstream HEIC decoder.
   layer.addEventListener('load',event=>{
    if(event.target.tagName==='IMG'&&event.target.naturalWidth&&!event.target.closest('.controls'))state.ready=true;
   },{capture:true,signal:events.signal});
   layer.append(createSlide(index));host.append(layer);
   return state;
  }
  function advance(){
   timer=null;
   if(!running())return;
   // Keep the current picture visible while another photo loads or fails to decode.
   for(let offset=1;offset<count;offset++){
    const next=(current+offset)%count, existed=slides.has(next), slide=ensure(next);
    // Local/cached images may finish before they join this layer's event path.
    // Recheck the actual photo when wrapping instead of relying only on load events.
    slide.ready=slide.ready||Array.from(slide.layer.querySelectorAll('img')).some(image=>
     image.complete&&image.naturalWidth>0&&!image.closest('.controls'));
    if(!slide.ready){if(!existed)break;continue}
    slides.get(current).layer.classList.remove('is-active');
    slide.layer.classList.add('is-active');current=next;onChange(current);break;
   }
   schedule();
  }
  host.classList.add('memory-slideshow');host.setAttribute('aria-hidden','true');
  ensure(0);onChange(0);
  const card=host.closest('.memory-card');
  const listen=(target,type,handler)=>target.addEventListener(type,handler,{signal:events.signal});
  listen(document,'visibilitychange',schedule);
  listen(motion,'change',schedule);
  let observer;
  if('IntersectionObserver' in window){
   observer=new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);schedule()});
   observer.observe(card);
  }
  schedule();
  return {refresh:schedule,destroy(){disposed=true;stop();observer?.disconnect();events.abort();host.replaceChildren()}};
 };
})();
