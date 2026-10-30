/* Perspective layout and event-driven motion; no continuous animation loop. */
(function(root){
 'use strict';
 function posterPose(index,current,total,width){
  let offset=index-current;
  if(offset>total/2)offset-=total;
  if(offset<-total/2)offset+=total;
  const distance=Math.abs(offset), sign=Math.sign(offset), compact=width<=600;
  const near=width*(compact?.31:.245), far=width*(compact?.48:.41);
  return {offset,visible:distance<=2,x:distance===0?0:sign*(distance===1?near:far),
   y:distance===0?0:distance===1?(sign<0?-24:22):(sign<0?24:-18),
   depth:distance===0?0:distance===1?-65:-150,
   scale:distance===0?1:distance===1?.78:.57,
   rotate:distance===0?0:sign*(distance===1?7:-9),
   rotateY:distance===0?0:-sign*(distance===1?17:25),
   opacity:distance===0?1:distance===1?.86:distance===2?.55:0,z:30-distance};
 }
 function mount({host,stage,root:hero,win=root,doc=root.document}){
  const reduced=win.matchMedia('(prefers-reduced-motion: reduce)');
  const fine=win.matchMedia('(hover: hover) and (pointer: fine)');
  const pauses=new Set();
  const listeners=[];
  let frame=null,disposed=false,visible=true,x=0,y=0;
  const on=(target,event,handler,options)=>{target.addEventListener(event,handler,options);listeners.push(()=>target.removeEventListener(event,handler,options))};
  const allowed=()=>!disposed&&visible&&!doc.hidden&&!reduced.matches&&!pauses.size;
  const reset=()=>{for(const [key,value] of [['--parallax-x','0px'],['--parallax-y','0px'],['--parallax-rx','0deg'],['--parallax-ry','0deg'],['--scene-opacity','1']])stage.style.setProperty(key,value)};
  function stop(){if(frame!==null)win.cancelAnimationFrame(frame);frame=null;reset()}
  function render(){
   frame=null;
   if(!allowed()){reset();return}
   const rect=hero.getBoundingClientRect();
   const progress=Math.max(0,Math.min(1,-rect.top/Math.max(1,rect.height)));
   const px=fine.matches?x:0,py=fine.matches?y:0;
   stage.style.setProperty('--parallax-x',`${px*32}px`);
   stage.style.setProperty('--parallax-y',`${py*22-progress*18}px`);
   stage.style.setProperty('--parallax-rx',`${-py*4}deg`);
   stage.style.setProperty('--parallax-ry',`${px*6}deg`);
   stage.style.setProperty('--scene-opacity',String(1-progress*.22));
  }
  function schedule(){if(!allowed()){stop();return}if(frame===null)frame=win.requestAnimationFrame(render)}
  on(host,'pointermove',event=>{
   if(event.pointerType!=='mouse'||!fine.matches||!allowed())return;
   const rect=host.getBoundingClientRect();
   x=Math.max(-1,Math.min(1,(event.clientX-rect.left)/Math.max(1,rect.width)*2-1));
   y=Math.max(-1,Math.min(1,(event.clientY-rect.top)/Math.max(1,rect.height)*2-1));schedule();
  },{passive:true});
  on(host,'pointerleave',()=>{x=0;y=0;schedule()});
  on(win,'scroll',schedule,{passive:true});
  on(doc,'visibilitychange',()=>{x=0;y=0;schedule()});
  on(reduced,'change',schedule);on(fine,'change',()=>{x=0;y=0;schedule()});
  let observer=null;
  if(win.IntersectionObserver){observer=new win.IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);schedule()});observer.observe(host)}
  on(win,'pagehide',()=>{pauses.add('page');stop()});
  on(win,'pageshow',()=>{pauses.delete('page');schedule()});
  reset();
  return {setPaused(reason,value){if(value)pauses.add(reason);else pauses.delete(reason);x=0;y=0;schedule()},destroy(){if(disposed)return;disposed=true;stop();observer?.disconnect();listeners.forEach(remove=>remove())}};
 }
 const api={posterPose,mount};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.LiveLogHeroSpace=api;
})(typeof window==='undefined'?globalThis:window);
