(() => {
  'use strict';
  const app=document.querySelector('#feed-app'), q=new URLSearchParams(location.search);
  const locations=[
    {name:'World',type:'world'},
    {name:'대한민국',type:'country'},{name:'일본',type:'country'},{name:'프랑스',type:'country'},{name:'태국',type:'country'},{name:'호주',type:'country'},
    {name:'서울',type:'city'},{name:'부산',type:'city'},{name:'도쿄',type:'city'},{name:'파리',type:'city'},
    {name:'성수동',type:'region'},{name:'연남동',type:'region'},{name:'을지로',type:'region'},{name:'해운대',type:'region'}
  ];
  const regions=locations.map(item=>item.name), aliases={world:'World',seongsu:'성수동',yeonnam:'연남동',euljiro:'을지로',haeundae:'해운대'};
  const reactions=['도움돼요','지금도 그래요','상황이 달라졌어요','잘 모르겠어요'];
  const store=window.AllEarthStore;
  const myEmbedded=q.get('embed')==='my'&&parent!==window;
  if(myEmbedded)document.body.classList.add('composer-embedded');
  const initial=()=>({region:'World',view:'list',sort:'hot',tab:'feed',mode:'summary',records:store.posts(),history:[],summaryScroll:0,fullScroll:0,beforeFull:null,selected:null,commentFor:null});
  let state={...initial(),...store.getFeed()};
  if(q.get('reset')==='1'){store.reset();state={...initial(),...store.getFeed()};}
  if(q.get('tab')==='my'){location.replace('my.html');return;}
  if(q.get('tab')==='saved'&&!q.get('post')){location.replace('saved.html');return;}
  const regionArg=aliases[String(q.get('region')||'').toLowerCase()]||q.get('region');
  if(regions.includes(regionArg))state.region=regionArg;
  if(['list','grid'].includes(q.get('view'))){state.view=q.get('view');state.tab='feed';state.mode='summary';}
  if(q.get('tab')==='saved'){state.tab='saved';state.mode='summary';}
  if(['hot','new'].includes(q.get('sort')))state.sort=q.get('sort');
  if(q.get('post')){
    state.selected=q.get('post');state.beforeFull={tab:state.tab,view:state.view,sort:state.sort,region:state.region,scroll:0};state.mode='full';state.fullOrder=null;
  }
  function refreshRecords(){state.records=store.posts();return state.records;}
  // View-only saves always merge the latest records from the store. This keeps a
  // comment mutation from being overwritten by an unrelated render/pagehide.
  function save(){const latest=store.getFeed();store.setFeed({...latest,...state,records:latest.records||[]});refreshRecords();}
  function saveRecords(){store.setFeed(state);refreshRecords();}
  function emit(action,detail={}){const e={channel:'allearth-prototype',action,timestamp:Date.now(),detail:{region:state.region,view:state.view,sort:state.sort,postId:state.selected||undefined,...detail}};if(action==='screen.ready')e.screen=detail.screen;window.dispatchEvent(new CustomEvent('allearth:action',{detail:e}));if(parent!==window)parent.postMessage(e,location.protocol==='file:'?'*':location.origin)}
  const N=(tag,cls='',text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n}, B=(text,action,cls='')=>{const b=N('button',cls,text);b.type='button';b.dataset.action=action;return b};
  const score=r=>r.likes+r.savedCount+r.comments+r.reactionCount;
  function items(){const list=state.tab==='saved'?state.records.filter(r=>r.saved):state.tab==='my'?state.records.filter(r=>state.history.includes(r.id)):state.region==='World'?[...state.records]:state.records.filter(r=>r.region===state.region);if(state.mode==='full'&&state.fullOrder?.length)return list.sort((a,b)=>{const ai=state.fullOrder.indexOf(a.id),bi=state.fullOrder.indexOf(b.id);return (ai<0?9999:ai)-(bi<0?9999:bi)});return list.sort((a,b)=>state.sort==='new'?b.created-a.created:score(b)-score(a)||b.created-a.created)}
  function galleryDots(gallery,count){
    if(count<2)return null;
    const dots=N('div','gallery-dots');dots.setAttribute('aria-label',`${count}개 이미지`);
    const paint=index=>{
      const max=Math.min(5,count),start=count<=5?0:Math.max(0,Math.min(index-2,count-max));
      dots.replaceChildren();
      for(let i=start;i<start+max;i++){const dot=N('span',i===index?'is-active':'');dot.setAttribute('aria-label',`${i+1}번째 이미지`);dots.append(dot);}
    };
    let frame=0;gallery.addEventListener('scroll',()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>paint(Math.max(0,Math.min(count-1,Math.round(gallery.scrollLeft/Math.max(1,gallery.clientWidth))))));},{passive:true});
    paint(0);return dots;
  }
  function card(r,full){const x=N(full?'article':'button',`feed-card ${r.image||r.images?.length?'':'text-card'} ${full&&state.selected===r.id?'is-selected':''}`);x.dataset.id=r.id;if(!full){x.type='button';x.dataset.open=r.id;x.setAttribute('aria-label',`${r.name}의 기록 전체 보기`)}const a=N('div','feed-author');a.append(N('span',`avatar ${r.own?'lime':''}`,r.initial),N('strong','',r.name),N('time','feed-time',store.postDate(r.created)));if(full){const m=B('⋯','more','more-menu');m.dataset.id=r.id;m.setAttribute('aria-label','게시글 메뉴');a.append(m)}x.append(a);if(r.images?.length){const visible=r.images.slice(0,10),wrap=N('div','post-gallery'),gallery=N('div','post-images');visible.forEach((img,i)=>{const picture=document.createElement('img');picture.src=img.src;picture.alt='첨부 이미지 '+(i+1);gallery.append(picture)});wrap.append(gallery);const dots=galleryDots(gallery,visible.length);if(dots)wrap.append(dots);x.append(wrap);if(full)x.append(N('p','image-count',visible.length+'개 이미지 · 좌우로 넘겨 보세요'));}else if(r.image)x.append(N('div',`feed-photo tone-${r.image}`));x.append(N('p','feed-copy',r.text),N('span','feed-tag',r.tag?'# '+r.tag:''),N('div','feed-stats',`조회 ${r.views} · 좋아요 ${r.likes} · 저장 ${r.savedCount} · 댓글 ${r.comments}`));if(full)actions(x,r);else x.append(N('div','feed-reaction-counts',reactions.map((label,i)=>label+' '+store.reactionCounts(r)[i]).join(' · ')));return x}
  function actions(x,r){const a=N('div','full-actions');[['♡ '+r.likes,'like',r.liked],['🔖 '+r.savedCount,'save',r.saved],['댓글 '+r.comments,'comment',state.commentFor===r.id]].forEach(([t,k,on])=>{const b=B(t,k,on?'on':'');b.dataset.id=r.id;a.append(b)});x.append(a);const rr=N('div','reaction-row');reactions.forEach((t,i)=>{const b=B(t+' '+store.reactionCounts(r)[i]+(r.reaction===i?' ✓':''),'reaction',r.reaction===i?'on':'');b.dataset.id=r.id;b.dataset.reaction=i;b.setAttribute('aria-pressed',String(r.reaction===i));rr.append(b)});x.append(rr);if(state.commentFor===r.id){const c=N('div','comments');c.dataset.commentsHost=r.id;c.addEventListener('click',event=>event.stopPropagation());x.append(c)}}
  function header(){const h=N('header','feed-top'),s=N('div','feed-status');s.append(N('span','', '9:41'),N('span','', '●◖▰'));h.append(s);const b=N('div','feed-brand');if(state.mode==='full'){const k=B('‹','back','feed-icon');k.setAttribute('aria-label','이전 보기');b.append(k)}else {const k=B('‹','earth','feed-icon');k.setAttribute('aria-label','Earth로 돌아가기');b.append(k)}b.append(N('strong','feed-country',state.region==='World'?'전 세계':'대한민국 / '+(state.region==='해운대'?'부산':'서울')));const p=B('+','compose','feed-head-compose');p.setAttribute('aria-label','게시글 작성');b.append(p);h.append(b);const t=N('div','feed-title-row');const globe=document.createElement('img');globe.src='assets/figma/home-map-circle.svg';globe.alt='';globe.className='feed-region-icon';t.append(globe,N('h1','feed-title',state.tab==='saved'?'저장한 글':state.tab==='my'?'내가 본 글':state.region));if(state.mode==='summary'&&state.tab==='feed'){const l=B('⌖  '+state.region,'location','feed-location');l.setAttribute('aria-label','조회 위치 선택');t.append(l)}h.append(t);const c=N('div','feed-controls');c.append(N('span','feed-meta',`${items().length}개의 기록`));const right=N('div','feed-control-right'),sort=N('div','feed-sort');[['hot','화제순'],['new','최신순']].forEach(([k,v])=>{const z=B(v,'sort',state.sort===k?'is-active':'');z.dataset.sort=k;z.setAttribute('aria-pressed',String(state.sort===k));sort.append(z)});right.append(sort);if(state.mode==='summary'&&state.tab==='feed'){const z=B(state.view==='grid'?'☷':'▦','view','view-toggle');z.setAttribute('aria-label',state.view==='grid'?'목록 보기':'그리드 보기');right.append(z)}c.append(right);h.append(c);return h}
  function empty(title,text,action){const x=N('section','empty-state');x.append(N('h2','',title),N('p','',text),B(action==='retry'?'다시 시도':action==='location'?'위치 선택':'기록 작성',action));return x}
  function ready(){emit('screen.ready',{screen:state.mode==='full'?'feed-full':state.tab==='saved'?'feed-saved':state.tab==='my'?'feed-my':state.view==='grid'?'feed-grid':'feed-list'})}
  let visibilityObserver;
  const commentControllers=new Map();
  function destroyComments(){for(const controller of commentControllers.values())controller?.destroy?.();commentControllers.clear();}
  function mountComments(){
    if(!window.AllEarthComments?.mount)return;
    app.querySelectorAll('[data-comments-host]').forEach(host=>{
      const id=host.dataset.commentsHost;
      const controller=window.AllEarthComments.mount(host,{kind:'post',id,onChange:()=>{
        refreshRecords();
        const post=state.records.find(item=>item.id===id),card=host.closest('.feed-card');
        const count=window.AllEarthComments.getCount?.('post',id)??post?.comments??0;
        if(post)post.comments=count;
        const commentButton=card?.querySelector('[data-action="comment"]');if(commentButton)commentButton.textContent='댓글 '+count;
        const stats=card?.querySelector('.feed-stats');if(stats&&post)stats.textContent=`조회 ${post.views} · 좋아요 ${post.likes} · 저장 ${post.savedCount} · 댓글 ${count}`;
      }});
      commentControllers.set(id,controller);controller?.open?.();controller?.focus?.();
    });
  }
  function watch(){
    visibilityObserver?.disconnect();
    if(state.mode!=='full'||!window.IntersectionObserver)return;
    const top=Math.ceil(app.querySelector('.feed-top').getBoundingClientRect().height);
    visibilityObserver=new IntersectionObserver(entries=>{for(const entry of entries){
      const id=entry.target.closest('[data-id]').dataset.id;
      if(entry.isIntersecting){const post=state.records.find(p=>p.id===id);if(post)store.recordHistory({type:'post',id,title:post.text.slice(0,60)});}
    }},{rootMargin:`-${top}px 0px -68px 0px`,threshold:0.5});
    app.querySelectorAll('.feed-full .feed-copy').forEach(node=>visibilityObserver.observe(node));
  }
  function render(fullRestore=false){const restoreScroll=state.mode==='full'?state.fullScroll:state.summaryScroll;destroyComments();refreshRecords();app.replaceChildren();const shell=N('div',`feed-shell ${state.mode==='full'?'feed-full':''}`);shell.append(header());const list=items();if(q.get('state')==='error')shell.append(empty('불러오지 못했어요','잠시 후 다시 시도해 주세요.','retry'));else if(!list.length||q.get('state')==='empty')shell.append(empty('아직 기록이 없어요',state.tab==='saved'?'저장한 게시글이 여기에 모여요.':'이 지역의 첫 기록을 남겨 보세요.',state.tab==='saved'?'location':'compose'));else{const section=N('section',state.mode==='summary'&&state.tab==='feed'&&state.view==='grid'?'feed-grid':'feed-list');list.forEach(r=>section.append(card(r,state.mode==='full')));shell.append(section)}app.append(shell);window.AllEarthShell.mount(state.tab==='saved'?'saved':'feed');mountComments();if(state.mode==='full'){const headerHeight=shell.querySelector('.feed-top').offsetHeight;const cards=[...shell.querySelectorAll('.feed-card')];cards.forEach(c=>c.style.scrollMarginTop=headerHeight+'px');const last=cards.at(-1);if(last)last.parentElement.style.paddingBottom=Math.max(0,window.innerHeight-headerHeight-last.offsetHeight-92)+'px'}save();requestAnimationFrame(()=>{if(state.mode==='full'){if(fullRestore)window.scrollTo(0,restoreScroll);else app.querySelector(`[data-id="${CSS.escape(state.selected)}"]`)?.scrollIntoView({block:'start'})}else window.scrollTo(0,restoreScroll);watch();ready()})}
  function closeLayer(l){
    const origin=l._origin;l.remove();const top=app.querySelector('.feed-layer:last-child');const nav=document.querySelector('.app-nav');if(nav)nav.inert=!!top;
    [...app.children].forEach(n=>n.inert=!!top&&n!==top);
    if(origin?.isConnected)origin.focus({preventScroll:true});
  }
  let activeLocationPicker=null,locationSequence=0;
  function finishLocationPicker(l,fromHistory=false,after){
    const finalize=()=>{if(l.isConnected)closeLayer(l);if(activeLocationPicker===l)activeLocationPicker=null;l._locationHistoryActive=false;after?.();};
    if(!fromHistory&&l._locationHistoryActive&&history.state?.allearthLocation===l._locationHistoryId){l._pendingLocationFinish=finalize;history.back();setTimeout(()=>{if(l._pendingLocationFinish){const done=l._pendingLocationFinish;l._pendingLocationFinish=null;done();}},300);return;}
    finalize();
  }
  let activeComposer=null,composerSequence=0;
  function cancelComposer(l,fromHistory=false){
    if(l._changed?.()){
      if(fromHistory&&l._historyActive&&history.state?.allearthComposer!==l._historyId)history.pushState({...history.state,allearthComposer:l._historyId},'',location.href);
      confirm('작성을 취소할까요?','작성 중인 내용은 사라집니다.',()=>finishComposer(l,false));
    }else finishComposer(l,false,fromHistory);
  }
  function finishComposer(l,saved,fromHistory=false){
    if(myEmbedded){parent.postMessage({channel:'allearth-composer',action:'close',saved,post:saved?l._savedPost:null},location.protocol==='file:'?'*':location.origin);return;}
    const finalize=()=>{if(!l.isConnected)return;activeComposer=null;l._historyActive=false;closeLayer(l);document.body.classList.remove('is-composing');if(q.get('return')==='my'){location.href='my.html';return;}if(l._afterFinish){l._afterFinish();return;}render(state.mode==='full');};
    if(!fromHistory&&l._historyActive&&history.state?.allearthComposer===l._historyId){l._pendingFinish=finalize;history.back();setTimeout(()=>{if(l._pendingFinish){const done=l._pendingFinish;l._pendingFinish=null;done();}},300);return;}
    finalize();
  }
  function layer(content,cls='sheet'){const l=N('div','feed-layer'),box=N('section',cls);box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.tabIndex=-1;box.append(content);l.append(box);l._origin=document.activeElement;[...app.children].forEach(n=>n.inert=true);const nav=document.querySelector('.app-nav');if(nav)nav.inert=true;app.append(l);box.focus();
    l.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(l.querySelector('#post-text'))cancelComposer(l);else if(l.querySelector('.location-picker'))finishLocationPicker(l);else closeLayer(l)}
      if(e.key==='Tab'){const nodes=[...box.querySelectorAll('button,input,textarea,select,[tabindex="0"]')].filter(n=>!n.disabled);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===box)){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}
    });return l}
  function savedCountryNames(){
    return [...(store.read().countries||[])]
      .sort((a,b)=>(b.savedAt||0)-(a.savedAt||0))
      .map(country=>country.name).filter(name=>name&&name!=='World').slice(0,4);
  }
  function openLocationPicker({title='위치 선택',current=null,onApply}){
    const confirmed=current,tempStart=current||'World';let choose=tempStart,lastRandom='';
    const f=document.createDocumentFragment(),head=N('div','location-picker-head');head.append(N('h2','',title));
    const world=B('World로 보기','chooseWorld','world-return');world.hidden=choose==='World';head.append(world);f.append(head);
    const currentText=N('p','location-current'),typeText=N('span','location-type');currentText.append(N('span','location-current-label','현재 보고 있는 범위'),N('strong','',choose),typeText);f.append(currentText);
    const saved=savedCountryNames(),shortcuts=N('div','location-shortcuts');
    if(saved.length){shortcuts.append(N('p','location-section-title','Saved한 나라'));saved.forEach(name=>{const b=B(name,'chooseRegion','');b.dataset.region=name;shortcuts.append(b)});}
    else {shortcuts.append(N('p','location-section-title','새로운 나라 둘러보기'));const random=B('어느 나라로 가볼까?','randomRegion','random-location');shortcuts.append(random);}
    f.append(shortcuts);
    const os=N('div','region-options');locations.filter(item=>item.name!=='World').forEach(item=>{const b=B(item.name,'chooseRegion',item.name===choose?'is-active':'');b.dataset.region=item.name;b.dataset.type=item.type;b.append(N('span','location-kind',item.type==='country'?'국가':item.type==='city'?'도시':'지역'));os.append(b)});f.append(os);
    const randomRetry=B('다른 나라 보기','randomRegion','random-retry');randomRetry.hidden=true;f.append(randomRetry);
    const message=N('p','location-error');message.setAttribute('role','status');f.append(message);
    const a=N('div','sheet-actions location-actions');a.append(B('취소','cancelLocation'),B('적용','applyRegion'));f.append(a);const l=layer(f,'sheet location-picker');activeLocationPicker=l;
    if(!myEmbedded){l._locationHistoryId=`location-${Date.now()}-${++locationSequence}`;l._locationHistoryActive=true;history.pushState({...history.state,allearthLocation:l._locationHistoryId},'',location.href);}
    const update=()=>{currentText.querySelector('strong').textContent=choose;const item=locations.find(x=>x.name===choose);typeText.textContent=choose==='World'?'전 세계':item?.type==='country'?'국가':item?.type==='city'?'도시':'지역';world.hidden=choose==='World';os.querySelectorAll('[data-region]').forEach(x=>x.classList.toggle('is-active',x.dataset.region===choose));shortcuts.querySelectorAll('[data-region]').forEach(x=>x.classList.toggle('is-active',x.dataset.region===choose));};
    const select=name=>{choose=name;lastRandom='';randomRetry.hidden=true;update();};
    l.addEventListener('click',event=>{const target=event.target.closest('button');if(!target)return;if(target.dataset.action==='chooseWorld'){select('World');return;}if(target.dataset.region){select(target.dataset.region);return;}if(target.dataset.action==='randomRegion'){const countries=locations.filter(item=>item.type==='country'&&item.name!==lastRandom);const item=countries[Math.floor(Math.random()*countries.length)];choose=item.name;lastRandom=item.name;randomRetry.hidden=false;update();}});
    a.lastElementChild.addEventListener('click',()=>{finishLocationPicker(l,false,()=>{try{onApply(choose,confirmed);}catch(error){message.textContent=error.message||'위치를 적용하지 못했어요. 다시 시도해 주세요.';}})});update();
    return l;
  }
  function openLocation(){openLocationPicker({title:'조회 위치',current:state.region,onApply:choose=>{state.region=choose;state.sort='hot';state.tab='feed';state.mode='summary';state.summaryScroll=0;emit('feed.location');render();}})}
  function openReport(post) {
    const form=N('form','report-form');
    form.append(N('h2','','게시글 신고'),N('p','','신고 사유를 선택해 주세요. 이 프로토타입에서는 신고를 서버로 전송하지 않습니다.'));
    for(const [index,text] of ['스팸 또는 광고','욕설·혐오 표현','개인정보 노출','잘못된 정보','기타'].entries()) {
      const label=N('label'),input=document.createElement('input');input.type='radio';input.name='reason';input.value=text;input.required=true;
      label.append(input,N('span','',text));form.append(label);
    }
    const details=document.createElement('textarea');details.name='details';details.maxLength=500;details.rows=3;details.placeholder='구체적인 이유 (선택)';details.setAttribute('aria-label','구체적인 신고 이유');form.append(details);
    const message=N('p','report-error');message.setAttribute('role','status');form.append(message);
    const buttons=N('div','sheet-actions'),cancel=B('취소','closeLayer'),submit=B('신고하기','submitReport');submit.type='submit';submit.disabled=true;
    buttons.append(cancel,submit);form.append(buttons);const l=layer(form);
    let busy=false;form.addEventListener('change',()=>{submit.disabled=busy||!form.querySelector('input:checked')});
    form.addEventListener('submit',async event=>{
      event.preventDefault();const reason=form.querySelector('input:checked')?.value;if(busy||!reason)return;
      busy=true;submit.disabled=true;submit.textContent='처리 중…';message.textContent='';
      await new Promise(resolve=>setTimeout(resolve,180));if(!l.isConnected)return;
      const result=store.perform?store.perform('report',()=>store.update(s=>{s.reports=[...(s.reports||[]).filter(r=>r.postId!==post.id),{postId:post.id,reason,details:details.value.trim(),reportedAt:Date.now()}]})):{ok:true,value:store.update(s=>{s.reports=[...(s.reports||[]).filter(r=>r.postId!==post.id),{postId:post.id,reason,details:details.value.trim(),reportedAt:Date.now()}]})};
      if(!result.ok){busy=false;submit.disabled=false;submit.textContent='다시 신고';message.textContent=(result.message||'처리하지 못했어요.')+' 선택한 사유와 입력 내용은 유지됩니다. 다시 시도해 주세요.';return;}
      closeLayer(l);toast('미리보기 신고가 기록됐어요.');
    });
  }
  function compose(edit) {
    if(state.mode==='full')state.fullScroll=window.scrollY;else state.summaryScroll=window.scrollY;
    const form=N('form','composer-form'),head=N('header','composer-header');
    const close=B('×','closeComposer','feed-icon');close.setAttribute('aria-label','작성 닫기');
    const submit=B(edit?'수정 완료':'등록','post','submit');submit.type='submit';
    head.append(close,N('h1','',edit?'게시글 수정':'새로운 게시글'),submit);form.append(head);
    const fields=N('div','composer-fields');form.append(fields);
    function field(label,control,id){const l=N('label','',label);l.htmlFor=id;control.id=id;fields.append(l,control);}
    const text=document.createElement('textarea');text.placeholder='입력해 주세요';text.value=edit?.text||'';text.rows=1;field('본문 *',text,'post-text');
    const region=document.createElement('select');region.append(new Option('위치를 선택해 주세요',''));
    locations.forEach(item=>region.append(new Option(item.name,item.name)));
    region.value=edit?edit.region:(state.region==='World'?'':state.region);field('위치 *',region,'post-region');
    const locationPicker=B('지도에서 위치 선택','composeLocation','composer-location-button');locationPicker.setAttribute('aria-describedby','post-region');fields.append(locationPicker);
    const imageLabel=N('label','','이미지');imageLabel.htmlFor='post-images';fields.append(imageLabel);
    const upload=document.createElement('input');upload.type='file';upload.id='post-images';upload.accept='image/jpeg,image/png,image/webp';upload.multiple=true;
    const gallery=N('div','composer-images'),count=N('p','composer-hint'),hint=N('p','composer-hint','선택 첨부 · 최대 10개 · JPG, PNG, WebP · 파일당 8MB 이하');
    fields.append(upload,gallery,count,hint);
    const tag=document.createElement('input');tag.placeholder='#성수';tag.value=edit?.tag||'';field('해시태그 *',tag,'post-tag');
    fields.append(N('p','composer-hint','# 제외 1~19자 · 게시글당 1개 필수'));
    const message=N('p','composer-error');message.setAttribute('role','status');fields.append(message);
    let images=(edit?.images||[]).map(x=>({...x})),busy=false;
    const legacyImage=edit?.image||null;
    const cleanTag=()=>tag.value.trim().replace(/^#/,'');
    const length=value=>typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('ko',{granularity:'grapheme'}).segment(value)].length:[...value].length;
    const snapshot=()=>JSON.stringify({text:text.value,region:region.value,tag:tag.value,images});
    const original=snapshot();
    const l=layer(form,'composer-page');l._changed=()=>snapshot()!==original;activeComposer=l;
    if(!myEmbedded){l._historyId=`composer-${Date.now()}-${++composerSequence}`;l._historyActive=true;history.pushState({...history.state,allearthComposer:l._historyId},'',location.href);}
    document.body.classList.add('is-composing');
    function validate(){
      const t=cleanTag();
      const valid=!!text.value.trim()&&!!region.value&&length(t)>=1&&length(t)<=19&&!/[#\r\n]/.test(t);
      submit.disabled=busy||!valid||(!!edit&&!l._changed());upload.disabled=busy||images.length>=10;
      text.style.height='auto';text.style.height=Math.max(46,Math.min(text.scrollHeight,220))+'px';
      return valid;
    }
    function renderImages(){
      gallery.replaceChildren();
      images.forEach((item,i)=>{const box=N('div','composer-image'),img=document.createElement('img');img.src=item.src;img.alt='첨부 이미지 '+(i+1);const remove=B('×','removeImage');remove.setAttribute('aria-label','이미지 '+(i+1)+' 삭제');remove.addEventListener('click',()=>{images.splice(i,1);renderImages();});box.append(img,remove);gallery.append(box);});
      count.textContent=images.length+' / 10';validate();
    }
    function imageData(file){return new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onerror=()=>reject(new Error('이미지를 읽을 수 없어요.'));reader.onload=()=>{
        const picture=new Image();picture.onerror=()=>reject(new Error('지원하는 이미지 파일을 선택해 주세요.'));picture.onload=()=>{
          const canvas=document.createElement('canvas'),scale=Math.min(1,800/Math.max(picture.width,picture.height));
          canvas.width=Math.max(1,Math.round(picture.width*scale));canvas.height=Math.max(1,Math.round(picture.height*scale));
          canvas.getContext('2d').drawImage(picture,0,0,canvas.width,canvas.height);resolve({name:file.name,src:canvas.toDataURL('image/webp',.75)});
        };picture.src=reader.result;
      };reader.readAsDataURL(file);
    });}
    upload.addEventListener('change',async()=>{
      const selected=[...upload.files],valid=selected.filter(f=>['image/jpeg','image/png','image/webp'].includes(f.type)&&f.size<=8000000);
      message.textContent=valid.length!==selected.length?'형식 또는 8MB 제한에 맞지 않는 파일은 제외했어요.':'';
      if(valid.length+images.length>10){message.textContent='이미지는 최대 10개까지 첨부할 수 있어요.';upload.value='';return;}
      busy=true;validate();try{const loaded=await Promise.allSettled(valid.map(imageData)),failed=loaded.filter(result=>result.status==='rejected'),ready=loaded.filter(result=>result.status==='fulfilled').map(result=>result.value);images.push(...ready);if(failed.length)message.textContent=`${failed.length}개 이미지를 읽지 못해 제외했어요. 나머지 이미지는 유지됩니다.`;}finally{busy=false;upload.value='';renderImages();}
    });
    locationPicker.addEventListener('click',()=>{openLocationPicker({title:'게시글 위치',current:region.value||null,onApply:choose=>{region.value=choose;region.dispatchEvent(new Event('input',{bubbles:true}));region.dispatchEvent(new Event('change',{bubbles:true}));}})});
    form.addEventListener('input',()=>{message.textContent='';validate();});
    form.addEventListener('submit',async e=>{
      e.preventDefault();if(busy||!validate())return;
      busy=true;validate();await new Promise(resolve=>setTimeout(resolve,180));
      const previous=JSON.stringify(state.records),account=store.read().account;
      if(edit){Object.assign(edit,{text:text.value.trim(),region:region.value,tag:cleanTag(),images,image:images.length?null:legacyImage});}
      else state.records.push({id:'own-'+Date.now(),name:account.nickname,initial:account.nickname[0],region:region.value,text:text.value.trim(),tag:cleanTag(),images,image:null,views:0,likes:0,savedCount:0,comments:0,reactionCount:0,created:Date.now(),saved:false,liked:false,reaction:null,commentList:[],own:true});
      try{const result=store.perform?store.perform('save-post',saveRecords):{ok:true,value:saveRecords()};if(!result.ok)throw new Error(result.message);}catch(error){state.records=JSON.parse(previous);if(edit)edit=state.records.find(p=>p.id===edit.id);busy=false;message.textContent='저장하지 못했어요. 입력 내용은 유지됩니다. '+(error.message||'다시 등록해 주세요.');validate();return;}
      l._savedPost=edit||state.records.at(-1);l._bridgeError=error=>{state.records=JSON.parse(previous);if(edit)edit=state.records.find(p=>p.id===edit.id);saveRecords();busy=false;message.textContent=error;validate();};emit('feed.post_added',{inCurrentRegion:region.value===state.region});
      if(edit&&!myEmbedded&&state.tab==='feed'&&state.region!=='World'&&edit.region!==state.region)l._afterFinish=back;
      finishComposer(l,true);
    });
    renderImages();validate();
  }

  function confirm(title,text,yes){const f=document.createDocumentFragment();f.append(N('h2','',title),N('p','',text));const a=N('div','sheet-actions');a.append(B('취소','closeLayer'),B('확인','confirm'));f.append(a);const l=layer(f,'confirm');a.lastElementChild.addEventListener('click',()=>{closeLayer(l);yes()})}
  function confirmDelete(post){
    const box=N('div');box.append(N('h2','','게시글을 삭제할까요?'),N('p','','삭제 후 복구할 수 없습니다.'));
    const message=N('p','delete-error');message.setAttribute('role','status');box.append(message);
    const actions=N('div','sheet-actions'),cancel=B('취소','closeLayer'),submit=B('삭제','confirmDelete');actions.append(cancel,submit);box.append(actions);const l=layer(box,'confirm');let busy=false;
    submit.addEventListener('click',()=>{if(busy)return;busy=true;cancel.disabled=submit.disabled=true;submit.textContent='삭제 중…';message.textContent='';setTimeout(()=>{
      if(!l.isConnected)return;const result=store.deletePost(post.id);
      if(!result.ok){busy=false;cancel.disabled=submit.disabled=false;submit.textContent='다시 삭제';message.textContent=result.message||'삭제하지 못했어요. 게시글은 그대로 유지됩니다.';refreshRecords();return;}
      refreshRecords();closeLayer(l);emit('feed.reaction',{type:'delete'});back();
    },180);});
  }
  function toast(t){const x=N('div','toast',t);app.append(x);setTimeout(()=>x.remove(),1800)}
  function back(){if(q.get('return')==='saved'){location.href='saved.html';return;}if(q.get('return')==='my'){location.href='my.html';return;}const o=state.beforeFull||{tab:'feed',view:state.view,sort:state.sort,region:state.region,scroll:0};state.tab=o.tab;state.view=o.view;state.sort=o.sort;state.region=o.region;state.summaryScroll=o.scroll;state.mode='summary';state.beforeFull=null;state.selected=null;emit('feed.back');render()}
  app.addEventListener('click',e=>{const t=e.target.closest('button,[data-open]');if(!t)return;const a=t.dataset.action;if(t.dataset.open){state.beforeFull={tab:state.tab,view:state.view,sort:state.sort,region:state.region,scroll:window.scrollY};state.summaryScroll=window.scrollY;state.selected=t.dataset.open;state.fullOrder=items().map(r=>r.id);state.mode='full';emit('feed.open');render();return}if(a==='earth'){location.href='home.html';return}if(['feed','saved','my'].includes(a)){save();location.href=a==='feed'?'feed.html':a+'.html';return}if(a==='back'){back();return}if(a==='location'){openLocation();return}if(a==='cancelLocation'){finishLocationPicker(t.closest('.feed-layer'));return}if(a==='closeLayer'){closeLayer(t.closest('.feed-layer'));return}if(a==='view'){state.summaryScroll=window.scrollY;state.view=state.view==='grid'?'list':'grid';emit('feed.view');render();return}if(a==='sort'){state.fullOrder=null;state.sort=t.dataset.sort;state.summaryScroll=0;emit('feed.sort');render();return}if(a==='compose'){if(!store.read().account.loggedIn){requireLogin(()=>compose());return;}if(state.mode==='full')state.fullScroll=window.scrollY;else state.summaryScroll=window.scrollY;compose();return}if(a==='closeComposer'){cancelComposer(t.closest('.feed-layer'));return}if(a==='retry'){const u=new URL(window.location.href);u.searchParams.delete('state');window.location.href=u.href;return}const r=state.records.find(x=>x.id===t.dataset.id);if(!r)return;if(['like','save','comment','reaction','more','edit','delete'].includes(a)&&!store.read().account.loggedIn){requireLogin(()=>t.click());return;}if(a==='like'){store.updatePost(r.id,post=>{post.liked=!post.liked;post.likes+=post.liked?1:-1;});refreshRecords();emit('feed.reaction',{type:'like'});state.fullScroll=window.scrollY;render(true);return}if(a==='save'){const result=store.toggleSavedPost(r.id);if(!result.ok){toast(result.message);return;}refreshRecords();emit('feed.reaction',{type:'save'});state.fullScroll=window.scrollY;render(true);return}if(a==='comment'){state.commentFor=state.commentFor===r.id?null:r.id;state.fullScroll=window.scrollY;emit('feed.reaction',{type:'comment'});render(true);return}if(a==='reaction'){const n=Number(t.dataset.reaction);store.reactToPost(r.id,n);refreshRecords();state.fullScroll=window.scrollY;emit('feed.reaction',{type:'reaction'});render(true);return}if(a==='more'){if(!r.own){openReport(r);return}const f=document.createDocumentFragment(),x=N('div','sheet-actions'),ed=B('수정','edit'),del=B('삭제','delete');ed.dataset.id=del.dataset.id=r.id;x.append(ed,del);f.append(N('h2','','내 기록'),x);layer(f);return}if(a==='edit'){if(!r.own)return;closeLayer(t.closest('.feed-layer'));compose(r);return}if(a==='delete'){if(!r.own)return;closeLayer(t.closest('.feed-layer'));confirmDelete(r)}});
  window.addEventListener('scroll',()=>{if(state.mode==='full')state.fullScroll=window.scrollY;else state.summaryScroll=window.scrollY;},{passive:true});
  window.addEventListener('popstate',()=>{
    const picker=activeLocationPicker;
    if(picker?.isConnected&&history.state?.allearthLocation!==picker._locationHistoryId){if(picker._pendingLocationFinish){const done=picker._pendingLocationFinish;picker._pendingLocationFinish=null;done();}else finishLocationPicker(picker,true);return;}
    const l=activeComposer;if(!l?.isConnected)return;
    if(l._pendingFinish){const done=l._pendingFinish;l._pendingFinish=null;done();return;}
    if(history.state?.allearthComposer!==l._historyId)cancelComposer(l,true);
  });
  function requireLogin(action){const f=document.createDocumentFragment();f.append(N('h2','','로그인이 필요해요'));const buttons=N('div','sheet-actions'),cancel=B('취소','closeLayer'),login=B('Google 계정으로 로그인','login');buttons.append(cancel,login);f.append(buttons);const l=layer(f);login.addEventListener('click',()=>{store.login();closeLayer(l);action();});}
  window.addEventListener('allearth:beforeNavigate',save);
  window.addEventListener('pagehide',save);
  window.addEventListener('pageshow',event=>{if(event.persisted){state={...initial(),...store.getFeed()};render(true);}});
  function initializeComposer(){
  render();
  if(q.has('compose')||q.has('edit')){
    const edit=state.records.find(r=>r.id===q.get('edit')&&r.own);
    if(q.has('edit')&&!edit)toast('수정할 게시글을 찾을 수 없어요.');
    else if(store.read().account.loggedIn)compose(edit);
    else requireLogin(()=>compose(edit));
  }
  }
  if(!myEmbedded)initializeComposer();
  let initialized=false;
  window.addEventListener('message',event=>{
    if(!myEmbedded||event.source!==parent||event.origin!==(location.protocol==='file:'?'null':location.origin)||event.data?.channel!=='allearth-composer')return;
    if(event.data.action==='initialize'&&!initialized){initialized=true;store.setFeed(event.data.feed);store.update(s=>Object.assign(s,event.data.app));state={...initial(),...store.getFeed()};initializeComposer();return;}
    const composer=app.querySelector('.composer-page')?.closest('.feed-layer');
    if(event.data.action==='save-failed'){composer?._bridgeError?.(event.data.message||'저장하지 못했어요. 다시 시도해 주세요.');return;}
    if(event.data.action==='request-close'&&composer)cancelComposer(composer);
  });
})();
