(() => {
'use strict';
const defaults = window.CONCERT_DATA || [];
const KEY='livelog-concert-records-v2';
let data, deleted=[], activeYear='全部', search='', currentDetail=null, toastTimer;
try {
 const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
 deleted=Array.isArray(saved.deleted)?saved.deleted:[];
 const custom=Array.isArray(saved.custom)?saved.custom:[];
 data=[...defaults.filter(r=>!deleted.includes(r.id)),...custom.filter(r=>!defaults.some(d=>d.id===r.id))];
} catch {data=defaults.map(r=>({...r}));}
const $=id=>document.getElementById(id);
const safe=str=>String(str??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imageURL = val => {if(!val)return '';try{const u=new URL(val,document.baseURI);return ['https:','http:','file:'].includes(u.protocol)?u.href:''}catch{return ''}};
const year=r=>(r.date||'').slice(0,4);
const ordered=arr=>[...arr].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
const pad=n=>String(n).padStart(2,'0');
const displayDate=d=>String(d||'').replace(/-/g,'.');
const monthDay=d=>String(d||'').slice(5).replace('-','.');
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
const upcoming=r=>r.date>today();
const imgDiv=(r,priority=false,scene=false)=>{
 const el=document.createElement('div');el.className='picture';
 const src=imageURL(scene?(r.media?.[0]?.image||r.poster||r.imageUrl):(r.poster||r.imageUrl));
 if(src){const img=document.createElement('img');img.src=src;img.alt=`${r.artist} · ${r.title}${scene&&r.media?.length?'现场照片':'海报'}`;img.loading=priority?'eager':'lazy';img.decoding='async';img.addEventListener('error',()=>{img.remove();el.classList.add('image-missing')});el.append(img)}
 else el.classList.add('image-missing');
 return el;
};
function persist(){try{localStorage.setItem(KEY,JSON.stringify({deleted,custom:data.filter(r=>!defaults.some(d=>d.id===r.id))}));return true}catch{toast('浏览器禁止存储，建议导出备份');return false}}
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2800)}
function stats(){
 const attended=data.filter(r=>!upcoming(r)), sorted=ordered(attended);
 $('statShows').innerHTML=`${pad(attended.length)}<span>场</span>`;
 $('statCities').innerHTML=`${pad(new Set(attended.map(r=>r.city)).size)}<span>座</span>`;
 $('statArtists').innerHTML=`${pad(new Set(attended.map(r=>r.artist)).size)}<span>组</span>`;
 $('statYears').innerHTML=`${pad(new Set(attended.map(year)).size)}<span>年</span>`;
 $('latestLine').textContent=sorted.length?`${sorted[0].artist} · ${displayDate(sorted[0].date)}`:'等待下一场现场';
 $('sideYear').textContent=sorted.length?year(sorted[0]):'LIVE';
 $('localSummary').textContent=`${attended.length} 场现场 · ${data.filter(upcoming).length} 场待赴 · ${data.reduce((n,r)=>n+(r.media?.length||0),0)} 张现场照片`;
}
function filters(){const ys=[...new Set(data.map(year))].sort((a,b)=>b.localeCompare(a));if(activeYear!=='全部'&&!ys.includes(activeYear))activeYear='全部';const box=$('yearFilters');box.replaceChildren();for(const y of ['全部',...ys]){const b=document.createElement('button');b.className='chip'+(activeYear===y?' active':'');b.textContent=y==='全部'?'全部记忆':y+' 年';b.type='button';b.setAttribute('aria-pressed',String(activeYear===y));b.addEventListener('click',()=>{activeYear=y;filters();gallery();});box.append(b)}}
function filtered(){return ordered(data).filter(r=>(activeYear==='全部'||year(r)===activeYear)&&(!search||[r.artist,r.title,r.city,r.venue,r.date].join(' ').toLocaleLowerCase().includes(search.toLocaleLowerCase())))}
function gallery(){const box=$('gallery');box.replaceChildren();const rs=filtered();if(!rs.length){const empty=document.createElement('div');empty.className='no-result';empty.innerHTML='<strong>这里暂时没有匹配的回忆</strong><span>换个年份或关键词试试看，也可以记录一场新演出。</span>';box.append(empty);return}rs.forEach((r,i)=>{const el=document.createElement('article');el.className='memory-card';el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label',`查看${r.artist}${r.title}演出详情`);el.innerHTML=`<div class="memory-tag">${safe(upcoming(r)?r.city+' · 待赴现场':r.city)}${r.media?.length?' · '+r.media.length+' 张现场':''}</div><div class="memory-arrow" aria-hidden="true">↗</div><div class="memory-info"><div class="memory-date">${safe(displayDate(r.date))}</div><h3>${safe(r.artist)}</h3><p>${safe(r.title)} <span>·</span> ${safe(r.city)}</p></div>`;el.prepend(imgDiv(r,false,true));el.addEventListener('click',()=>showDetail(r.id));el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showDetail(r.id)}});box.append(el)});}
function timeline(){const list=$('timelineList');list.replaceChildren();const rs=ordered(data);if(!rs.length){list.innerHTML='<p class="timeline-empty">你的时间线还没有演出记录，去记录第一场吧。</p>';return}const groups=new Map();rs.forEach(r=>{let y=year(r);if(!groups.has(y))groups.set(y,[]);groups.get(y).push(r)});for(const [y,items] of groups){const section=document.createElement('div');section.className='timeline-year-block';const h=document.createElement('h3');h.className='timeline-year';h.textContent=y;section.append(h);items.forEach(r=>{const row=document.createElement('button');row.type='button';row.className='timeline-item';row.innerHTML=`<span class="when">${safe(monthDay(r.date))}</span><span><span class="who">${safe(r.artist)} · ${safe(r.title)}${upcoming(r)?' · 待赴现场':''}</span><span class="what" style="display:block">${safe(r.city)}${r.venue?' / '+safe(r.venue):''}</span></span><span class="go" aria-hidden="true">↗</span>`;row.addEventListener('click',()=>showDetail(r.id));section.append(row)});list.append(section)}}

// 轮播仅在可见时自动运行，进度使用 transform 避免逐帧布局。
const HERO_DURATION=6800;
const HERO_REDUCED=window.matchMedia('(prefers-reduced-motion: reduce)');
let heroItems=[],heroIndex=0,heroTimeout=null,heroStartTime=0,heroRemaining=HERO_DURATION;
const heroPauses=new Set();
const heroBars=()=>Array.from($('heroTracks').querySelectorAll('.fill'));
function stopHeroClock(){
 if(heroTimeout===null)return;
 clearTimeout(heroTimeout);heroTimeout=null;
 heroRemaining=Math.max(40,heroRemaining-(performance.now()-heroStartTime));
 const fill=heroBars()[heroIndex];if(fill){fill.style.transition='none';fill.style.transform=`scaleX(${1-heroRemaining/HERO_DURATION})`;}
}
function startHeroClock(){
 if(heroPauses.size||heroItems.length<2||heroTimeout!==null)return;
 const fill=heroBars()[heroIndex];if(!fill)return;
 heroStartTime=performance.now();
 fill.style.transition='none';fill.style.transform=`scaleX(${1-heroRemaining/HERO_DURATION})`;void fill.offsetWidth;
 fill.style.transition=`transform ${heroRemaining}ms linear`;
 fill.style.transform='scaleX(1)';
 heroTimeout=setTimeout(()=>{heroTimeout=null;heroRemaining=HERO_DURATION;setHeroSlide((heroIndex+1)%heroItems.length);},heroRemaining);
}
function heroPause(reason,value){
 if(value){if(!heroPauses.has(reason)){stopHeroClock();heroPauses.add(reason);}}
 else {heroPauses.delete(reason);startHeroClock();}
}
function refreshHeroToggle(){
 const manual=heroPauses.has('manual');
 $('heroToggleIcon').textContent=manual?'▶':'Ⅱ';
 $('heroToggle').setAttribute('aria-label',manual?'继续自动轮播':'暂停自动轮播');
 $('heroToggle').title=manual?'继续自动轮播':'暂停自动轮播';
 $('heroToggle').setAttribute('aria-pressed',String(manual));
}
function setHeroCaption(r,animate){
 $('heroSlideMeta').textContent=r.date?`${displayDate(r.date)}  ·  ${r.city||'LIVE'}${upcoming(r)?' · 待赴现场':''}`:'THE SOUND OF MEMORIES';
 $('heroSlideTitle').textContent=r.title||'你的下一段现场记忆，从这里开始';
 $('heroSlideSub').textContent=r.artist||'Live, forever.';
 $('heroSlideTitle').title=$('heroSlideTitle').textContent;
 $('heroSlideSub').title=$('heroSlideSub').textContent;
 $('heroSlideNote').textContent=r.note||(upcoming(r)?'下一次见面，在歌声与灯光里。':`${r.venue||r.city}，属于 ${r.artist||'音乐'} 的那一晚。${r.media?.length?'打开这场演出，重温亲手拍下的现场。':'从一张海报，回到那一个现场。'}`);
 $('heroDateExact').textContent=r.date?displayDate(r.date):'待记录';
 $('heroCity').textContent=r.city||'下一站';
 $('heroShowVenue').textContent=r.venue||'现场见';
 $('heroCount').innerHTML=`${pad(heroIndex+1)} <i>/</i> ${pad(heroItems.length)}`;
 const caption=$('heroCaptionCopy');
 caption.classList.remove('animate');
 if(animate&&!HERO_REDUCED.matches){void caption.offsetWidth;caption.classList.add('animate');}
}
function createHeroCard(record,index){
 const btn=document.createElement('button');
 btn.type='button';btn.className='hero-stack-card';btn.dataset.index=String(index);btn.setAttribute('role','listitem');
 btn.setAttribute('aria-label',`${record.artist||'演唱会'}，${record.title||'现场记忆'}，${record.city||''}`);
 btn.append(imgDiv(record,index===0));
 const meta=document.createElement('div');meta.className='hero-stack-meta';
 const badge=document.createElement('span');badge.className='hero-stack-index';badge.textContent=`ECHOES ${pad(index+1)}`;
 const city=document.createElement('span');city.className='hero-stack-city';city.textContent=record.city||'LIVE';
 meta.append(badge,city);
 const copy=document.createElement('div');copy.className='hero-stack-copy';
 const kicker=document.createElement('small');kicker.textContent=record.date?displayDate(record.date):'LIVE ARCHIVE';
 const artist=document.createElement('strong');artist.textContent=record.artist||'Live, forever.';
 const title=document.createElement('span');title.textContent=record.title||record.note||'你的下一段现场记忆，从这里开始';
 copy.append(kicker,artist,title);
 btn.append(meta,copy);
 btn.addEventListener('click',()=>setHeroSlide(index));
 return btn;
}
function relativeCardOffset(index){
 const total=heroItems.length;
 let diff=index-heroIndex;
 if(diff>total/2)diff-=total;
 if(diff<-total/2)diff+=total;
 return diff;
}
function layoutHeroCards(){
 const stage=$('heroCardStage');
 const cards=Array.from(stage.children);
 const compact=window.innerWidth<=540, tablet=window.innerWidth<=820;
 const nearShift=compact?74:tablet?96:118;
 const farShift=compact?116:tablet?154:206;
 cards.forEach((card,index)=>{
  const diff=relativeCardOffset(index), abs=Math.abs(diff);
  const tx=abs===0?0:(abs===1?Math.sign(diff)*nearShift:Math.sign(diff)*farShift);
  const ty=abs===0?0:(abs===1?18:36);
  const scale=abs===0?1:(abs===1?.88:.74);
  const rotate=abs===0?0:(diff<0?-7.5:7.5);
  const rotateY=abs===0?0:(diff<0?17:-17);
  const opacity=abs===0?1:(abs===1?.72:(abs===2?.28:0));
  card.classList.toggle('is-current',abs===0);
  card.classList.toggle('is-near',abs===1);
  card.classList.toggle('is-far',abs>=2);
  card.classList.toggle('is-hidden',abs>2);
  card.style.setProperty('--tx',`${tx}px`);
  card.style.setProperty('--ty',`${ty}px`);
  card.style.setProperty('--scale',scale);
  card.style.setProperty('--rotate',`${rotate}deg`);
  card.style.setProperty('--rotateY',`${rotateY}deg`);
  card.style.setProperty('--opacity',opacity);
  card.style.setProperty('--z',String(30-abs));
  card.setAttribute('aria-current',String(abs===0));
  card.tabIndex=abs<=2?0:-1;
  if(abs===0){card.title='当前卡片';}
  else if(diff<0){card.title='点击切换到上一张';}
  else {card.title='点击切换到下一张';}
 });
}
function setHeroTracks(){
 const bars=heroBars();
 bars.forEach((fill,i)=>{
  const current=i===heroIndex;
  fill.style.transition='none';
  fill.style.transform=i<heroIndex?'scaleX(1)':'scaleX(0)';
  fill.parentElement.setAttribute('aria-current',String(current));
  if(current)fill.style.transform='scaleX(0)';
 });
}
function setHeroSlide(index){
 if(!heroItems.length)return;
 const next=(index+heroItems.length)%heroItems.length;
 const changed=next!==heroIndex;
 stopHeroClock();
 heroIndex=next;heroRemaining=HERO_DURATION;
 setHeroCaption(heroItems[heroIndex],changed);
 layoutHeroCards();
 setHeroTracks();
 startHeroClock();
}
function buildCarousel(){
 if(heroTimeout!==null){clearTimeout(heroTimeout);heroTimeout=null;}
 heroItems=[...ordered(data.filter(r=>!upcoming(r))),...ordered(data.filter(upcoming))];
 if(!heroItems.length)heroItems=[{art:0,artist:'Live, forever.',title:'你的下一段现场记忆，从这里开始',city:''}];
 heroIndex=0;heroRemaining=HERO_DURATION;
 const stage=$('heroCardStage');stage.replaceChildren();
 heroItems.forEach((record,index)=>stage.append(createHeroCard(record,index)));
 const tracks=$('heroTracks');tracks.replaceChildren();
 heroItems.forEach((r,i)=>{
  const button=document.createElement('button');button.type='button';button.className='hero-carousel-track';
  button.setAttribute('aria-label',`跳转第${i+1}张：${r.artist||'记忆'}`);button.setAttribute('aria-current',String(i===0));
  const fill=document.createElement('span');fill.className='fill';button.append(fill);
  button.addEventListener('click',()=>setHeroSlide(i));tracks.append(button);
 });
 $('heroCarouselArrows').hidden=heroItems.length<2;
 $('heroToggle').hidden=heroItems.length<2;
 setHeroCaption(heroItems[0],false);layoutHeroCards();setHeroTracks();startHeroClock();
}
$('heroOpen').addEventListener('click',()=>{const r=heroItems[heroIndex];if(r&&data.some(x=>x.id===r.id))showDetail(r.id);else openAdd()});
$('heroPrev').addEventListener('click',()=>setHeroSlide(heroIndex-1));
$('heroNext').addEventListener('click',()=>setHeroSlide(heroIndex+1));
$('heroToggle').addEventListener('click',()=>{heroPause('manual',!heroPauses.has('manual'));refreshHeroToggle();});
$('heroCarousel').addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')heroPause('hover',true)});
$('heroCarousel').addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')heroPause('hover',false)});
$('heroCarousel').addEventListener('keydown',e=>{
 if(e.key==='ArrowLeft'){e.preventDefault();setHeroSlide(heroIndex-1)}
 if(e.key==='ArrowRight'){e.preventDefault();setHeroSlide(heroIndex+1)}
});
let heroTouchX=0,heroTouchY=0;
$('heroCarousel').addEventListener('touchstart',e=>{heroTouchX=e.changedTouches[0].screenX;heroTouchY=e.changedTouches[0].screenY},{passive:true});
$('heroCarousel').addEventListener('touchend',e=>{
 const dx=e.changedTouches[0].screenX-heroTouchX,dy=e.changedTouches[0].screenY-heroTouchY;
 if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.4)setHeroSlide(heroIndex+(dx<0?1:-1));
},{passive:true});
document.addEventListener('visibilitychange',()=>heroPause('hidden',document.hidden));
if('IntersectionObserver' in window){
 const heroObserver=new IntersectionObserver(entries=>{
  for(const entry of entries)heroPause('offscreen',!entry.isIntersecting);
 });
 heroObserver.observe($('heroCarousel'));
}
HERO_REDUCED.addEventListener?.('change',e=>heroPause('reduced',e.matches));
window.addEventListener('resize',()=>layoutHeroCards(),{passive:true});
if(HERO_REDUCED.matches)heroPauses.add('reduced');
if(document.hidden)heroPauses.add('hidden');
refreshHeroToggle();

function rerender(){stats();filters();gallery();timeline();buildCarousel()}
const focusBeforeModal=new Map();
const modalIds=['addModal','detailModal','photoModal'];
function topModal(){return modalIds.map($).filter(el=>el.classList.contains('show')).at(-1)}
function syncModals(){
 const top=topModal();
 modalIds.map($).forEach(el=>el.inert=Boolean(top&&el!==top));
 document.querySelectorAll('header,main,footer').forEach(el=>el.inert=Boolean(top));
 document.body.style.overflow=top?'hidden':'';
 heroPause('modal',Boolean(top));
}
function openModal(el){focusBeforeModal.set(el,document.activeElement);el.classList.add('show');syncModals();(el.querySelector('input')||el.querySelector('.modal-close'))?.focus()}
function closeModal(el){if(el.id==='photoModal')releasePhoto();el.classList.remove('show');syncModals();focusBeforeModal.get(el)?.focus?.()}
let albumRecord=null, photoIndex=0, activeLivePhoto=null;
function releasePhoto(){
 activeLivePhoto?.destroy();activeLivePhoto=null;
 $('photoMedia').querySelectorAll('video').forEach(video=>{video.pause();video.removeAttribute('src');video.load()});
 $('photoMedia').replaceChildren();$('photoPanelPlayback')?.remove();
}
function renderConcertDetail(r){
 const facts=$('detailFacts');facts.replaceChildren();
 for(const [label,value] of [['状态',upcoming(r)?'待赴现场':'已看现场'],['座位',r.seat||'未记录'],['票价',r.price?'¥ '+r.price:'未记录'],['日期',displayDate(r.date)]]){
  const item=document.createElement('div'), dt=document.createElement('dt'), dd=document.createElement('dd');
  dt.textContent=label;dd.textContent=value;item.append(dt,dd);facts.append(item);
 }
 const media=r.media||[], album=$('detailAlbum');album.replaceChildren();
 $('albumCount').textContent=media.length?`${media.length} 份现场记忆`:'';
 $('albumHelp').textContent=media.some(m=>m.kind==='live')?'带 ◉ LIVE 标记的是实况照片。点击放大后，鼠标悬停或按住照片即可播放。':media.length?'点击照片，放大重温那一晚。':'';
 if(!media.length){const empty=document.createElement('p');empty.className='album-empty';empty.textContent=upcoming(r)?'等到那一晚，把新的现场带回来。':'这一晚的照片，等你慢慢收藏。';album.append(empty);return}
 media.forEach((item,index)=>{
  const button=document.createElement('button');button.type='button';button.className='album-photo';
  button.setAttribute('aria-label',`查看第 ${index+1} 张现场${item.kind==='live'?' Live Photo':item.kind==='video'?'视频':'照片'}`);
  const img=document.createElement('img');img.src=imageURL(item.image||r.poster);img.alt=`${r.artist} ${displayDate(r.date)} 现场 ${index+1}`;img.loading='lazy';
  img.addEventListener('error',()=>{img.remove();button.textContent='照片暂时无法显示'});button.append(img);
  if(item.video){const badge=document.createElement('span');badge.className='media-badge';badge.textContent=item.kind==='live'?'◉ LIVE':'▶ 视频';button.append(badge)}
  button.addEventListener('click',()=>{albumRecord=r;photoIndex=index;renderPhoto();openModal($('photoModal'))});album.append(button);
 });
}
function renderPhoto(){
 releasePhoto();
 const media=albumRecord.media, item=media[photoIndex], box=$('photoMedia');
 $('photoTitle').textContent=`${albumRecord.artist} · ${displayDate(albumRecord.date)} · ${photoIndex+1} / ${media.length}`;
 $('photoStatus').textContent='';$('photoPrev').disabled=$('photoNext').disabled=media.length<2;
 const img=document.createElement('img');img.src=imageURL(item.image||albumRecord.poster);img.alt=`${albumRecord.artist}现场照片 ${photoIndex+1}`;
 img.addEventListener('error',()=>{$('photoStatus').textContent='照片暂时无法显示，请检查本地素材。'});box.append(img);
 $('photoPanelPlayback')?.remove();
 if(!item.video)return;
 if(item.kind==='live'){
  const video=document.createElement('video');video.preload='none';video.src=imageURL(item.video);video.poster=img.src;
  const badge=document.createElement('span');badge.className='live-photo-label';badge.textContent='◉ LIVE · 实况';
  box.append(video,badge);
  const controls=document.createElement('div');controls.id='photoPanelPlayback';controls.className='live-photo-controls';
  const play=document.createElement('button'), sound=document.createElement('button');
  play.type=sound.type='button';play.className=sound.className='btn';controls.append(play,sound);
  $('photoStatus').before(controls);
  activeLivePhoto=window.createLivePhotoPlayer({host:box,image:img,video,playButton:play,soundButton:sound,status:$('photoStatus')});
  return;
 }
 const video=document.createElement('video');video.src=imageURL(item.video);video.poster=img.src;video.preload='metadata';video.playsInline=true;video.controls=true;video.muted=item.kind==='live';video.hidden=true;
 box.append(video);
 const play=document.createElement('button');play.type='button';play.id='photoPanelPlayback';play.className='btn live-play';play.textContent=item.kind==='live'?'◉ 播放 Live Photo':'▶ 播放现场视频';
 let failed=false;
 play.addEventListener('click',async()=>{
  if(!video.paused){video.pause();return}
  video.hidden=false;img.hidden=true;
  try{await video.play()}catch{if(!failed)$('photoStatus').textContent='播放未能开始，可重试或使用视频播放器。'}
 });
 video.addEventListener('play',()=>{play.textContent='Ⅱ 暂停播放'});
 video.addEventListener('pause',()=>{play.textContent=item.kind==='live'?'◉ 播放 Live Photo':'▶ 播放现场视频'});
 video.addEventListener('ended',()=>{video.hidden=true;img.hidden=false});
 video.addEventListener('error',()=>{failed=true;video.hidden=true;img.hidden=false;play.disabled=true;$('photoStatus').textContent='当前浏览器无法播放这段视频，仍可查看静态照片。'});
 $('photoStatus').before(play);
}
function movePhoto(offset){if(!albumRecord)return;photoIndex=(photoIndex+offset+albumRecord.media.length)%albumRecord.media.length;renderPhoto()}
$('closePhoto').addEventListener('click',()=>closeModal($('photoModal')));
$('photoPrev').addEventListener('click',()=>movePhoto(-1));
$('photoNext').addEventListener('click',()=>movePhoto(1));
function showDetail(id){const r=data.find(r=>r.id===id);if(!r)return;currentDetail=id;$('detailImage').replaceChildren(imgDiv(r,true));$('detailDate').textContent=displayDate(r.date)+' · '+r.city;$('detailTitle').textContent=r.artist+' · '+r.title;$('detailSub').textContent=r.venue||r.city;$('detailNote').textContent=r.note||'';renderConcertDetail(r);openModal($('detailModal'))}
function openAdd(){$('addForm').reset();openModal($('addModal'))}
for(const id of ['addTop','addBottom'])$(id).addEventListener('click',openAdd);
for(const id of ['closeAdd','cancelAdd'])$(id).addEventListener('click',()=>closeModal($('addModal')));
for(const id of ['closeDetail','closeDetailBottom'])$(id).addEventListener('click',()=>closeModal($('detailModal')));
for(const id of ['addModal','detailModal','photoModal'])$(id).addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal(e.currentTarget)});
document.addEventListener('keydown',e=>{
 const modal=topModal();if(!modal)return;
 if(e.key==='Escape'){e.preventDefault();closeModal(modal);return}
 if(modal.id==='photoModal'&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();movePhoto(e.key==='ArrowLeft'?-1:1)}
 if(e.key==='Tab'){
  const elements=[...modal.querySelectorAll('button:not(:disabled),input,textarea,a[href],video[controls]')].filter(el=>el.getClientRects().length);
  const first=elements[0],last=elements.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
 }
});
$('addForm').addEventListener('submit',e=>{e.preventDefault();const v=new FormData(e.currentTarget);const r={id:(globalThis.crypto&&crypto.randomUUID?crypto.randomUUID():'record-'+Date.now()),artist:String(v.get('artist')).trim(),title:String(v.get('title')).trim(),date:String(v.get('date')),city:String(v.get('city')).trim(),venue:String(v.get('venue')||'').trim(),note:String(v.get('note')||'').trim(),imageUrl:imageURL(String(v.get('imageUrl')||'').trim()),art:Math.floor(Math.random()*6)};if(!r.artist||!r.title||!r.date||!r.city){toast('请填写完整的必填信息');return}data.push(r);persist();activeYear='全部';search='';$('searchInput').value='';rerender();closeModal($('addModal'));toast('✳ 已收藏这段闪闪发光的记忆');setTimeout(()=>$('memories').scrollIntoView({behavior:'smooth'}),100)});
$('deleteRecord').addEventListener('click',()=>{if(!currentDetail)return;if(!confirm('确定删除这条演出记录吗？此操作不可撤销。'))return;if(defaults.some(r=>r.id===currentDetail))deleted.push(currentDetail);data=data.filter(x=>x.id!==currentDetail);persist();rerender();closeModal($('detailModal'));currentDetail=null;toast('记录已删除')});
$('searchInput').addEventListener('input',e=>{search=e.target.value.trim();gallery()});
$('exportBtn').addEventListener('click',()=>{const exportData=data;const blob=new Blob([JSON.stringify(exportData,null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='echoes-concert-memories.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);toast('记录已导出为 JSON 文件')});
$('menuBtn').addEventListener('click',()=>{const open=$('navigation').classList.toggle('show');$('menuBtn').setAttribute('aria-expanded',String(open))});
document.querySelectorAll('.navigation a').forEach(link=>link.addEventListener('click',()=>{$('navigation').classList.remove('show');$('menuBtn').setAttribute('aria-expanded','false');document.querySelectorAll('.navigation a').forEach(a=>a.classList.remove('active'));link.classList.add('active')}));
rerender();
})();
