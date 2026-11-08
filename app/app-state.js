(() => {
  'use strict';
  const KEY = 'allearth.app.v1', FEED_KEY = 'allearth.feed.v2';
  const clone = value => JSON.parse(JSON.stringify(value));
  const defaults = () => ({
    account: { loggedIn: true, nickname: 'Aegungi', email: 'example@gmail.com' },
    countries: [], issues: [], savedRefs: [], history: [], reports: [], commentThreads: {}, commentUi: {}, issueActivity: {}, my: { view: 'grid', historyTab: 'all' }, saved: { tab:'countries', scroll:0 },
  });
  let memory = defaults(), feedMemory = { records: [] };
  let transactionDepth=0, pendingStateEvent=false;
  const consumedFailures=new Set();
  function changed() {
    if(transactionDepth){pendingStateEvent=true;return;}
    window.dispatchEvent(new CustomEvent('allearth:state'));
  }
  function failRequested(action) {
    const aliases={ 'save-post':['save','saved-remove'], 'save-issue':['save','saved-remove'], 'save-country':['save','saved-remove'], 'post-delete':['delete'], 'nickname':['save'] };
    const requested=(new URLSearchParams(location.search).get('fail')||'').split(/[,|]/);
    const token=[action,...(aliases[action]||[])].find(name=>requested.includes(name)&&!consumedFailures.has(name));
    if(token)consumedFailures.add(token);
    return !!token;
  }
  function perform(action, fn) {
    if(failRequested(action))return {ok:false,message:'처리하지 못했어요. 내용은 유지되었으니 다시 시도해 주세요.'};
    const before=read(), beforeFeed=getFeed();
    transactionDepth++;
    try {
      const value=fn();
      return {ok:true,value};
    } catch(error) {
      memory=before;feedMemory=beforeFeed;
      try {sessionStorage.setItem(KEY,JSON.stringify(before));sessionStorage.setItem(FEED_KEY,JSON.stringify(beforeFeed));}catch(_){}
      pendingStateEvent=true;
      return {ok:false,message:error?.message||'처리하지 못했어요. 다시 시도해 주세요.'};
    } finally {
      transactionDepth--;
      if(!transactionDepth&&pendingStateEvent){pendingStateEvent=false;changed();}
    }
  }
  function read() {
    try { const data = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (data) memory = { ...defaults(), ...data }; } catch (_) {}
    return clone(memory);
  }
  function update(fn) {
    const next = read(); fn(next);
    try { sessionStorage.setItem(KEY, JSON.stringify(next)); }
    catch(error){throw new Error(error.name==='QuotaExceededError'?'저장 공간이 부족해요. 첨부 이미지를 줄여 다시 시도해 주세요.':'내용을 저장하지 못했어요. 다시 시도해 주세요.');}
    memory = next;
    changed();
    return clone(next);
  }
  const samples = [
    ['pop','성수러버','성수동','오늘 성수 팝업 웨이팅이 2시간이 넘었어요. 평일 오전 10시 전에 가면 훨씬 여유롭고 앱 예약을 먼저 확인하는 편이 좋아요.','팝업 웨이팅',86,41,'peach'],
    ['night','야장탐험대','성수동','서울숲 근처 야장은 금요일 저녁 7시 이후부터 자리가 빠르게 차요. 두 명이면 바 테이블도 괜찮았습니다.','야장',68,32,'night'],
    ['run','한강러너','성수동','서울숲에서 뚝섬까지 이어지는 저녁 러닝 코스예요. 해 질 무렵에는 바람이 좋아서 천천히 걸어도 좋습니다.','러닝 코스',74,19,'green'],
    ['cafe','커피는진심','성수동','새로 생긴 카페는 오전에 가면 창가 자리를 잡기 쉬워요. 디카페인도 생각보다 괜찮았습니다.','성수 카페',51,18,'coffee'],
    ['walk','동네기록','성수동','주말에는 연무장길보다 골목길 쪽이 조금 한적해요. 작은 편집숍을 천천히 둘러보기 좋았습니다.','산책',33,12,null],
    ['market','주말산책자','성수동','토요일 플리마켓은 카드 결제 가능한 부스가 많았지만 현금만 받는 곳도 있었어요. 작은 가방을 추천해요.','플리마켓',45,15,'sky'],
    ['yeonnam','연남산책','연남동','경의선숲길의 오후 햇살이 좋아요. 조용한 책방은 평일에 방문하는 편이 좋습니다.','연남동',31,9,null],
    ['world','지구기록자','도쿄','여행 중 만난 작은 동네의 팁을 기록해 두세요. 다음 방문자에게 큰 도움이 됩니다.','여행 기록',40,20,'earth'],
  ];
  function seedFeed() {
    return { region:'World', view:'list', sort:'hot', tab:'feed', mode:'summary', history:[], summaryScroll:0, fullScroll:0,
      records:samples.map((r,i)=>({id:r[0],name:r[1],initial:r[1][0],region:r[2],text:r[3],tag:r[4],views:r[5],likes:r[6],image:r[7],savedCount:0,comments:0,reactionCount:0,created:100-i,saved:false,liked:false,reaction:null,commentList:[],own:false})) };
  }
  function getFeed() {
    try { const stored=JSON.parse(sessionStorage.getItem(FEED_KEY)||'null'); if(stored) feedMemory=stored; } catch (_) {}
    if (!feedMemory.records?.length && !feedMemory.initialized) feedMemory = { ...seedFeed(), initialized:true };
    return clone(feedMemory);
  }
  function setFeed(value) {
    const next={...value,initialized:true};
    try { sessionStorage.setItem(FEED_KEY,JSON.stringify(next)); } catch (error) {
      // Do not silently claim that an oversized image post was saved.
      throw new Error(error.name==='QuotaExceededError'?'저장 공간이 부족해요. 첨부 이미지를 줄여 다시 시도해 주세요.':'내용을 저장하지 못했어요. 다시 시도해 주세요.');
    }
    feedMemory=clone(next);
    return next;
  }
  function posts() { return getFeed().records || []; }
  function addMyExamples() {
    const state=read();
    if (!state.account.loggedIn || state.my.examplesAdded) return;
    const examples=[
      ['cafe','성수동','창가에 앉아 쉬어 가기','성수 카페','골목 안 작은 카페에서 잠깐 쉬었어요. 창가 자리에 앉아 다음 산책 코스를 정리해 봤습니다.',['cafe','park'],24,8],
      ['park','성수동','서울숲에서 보낸 오후','산책','나무 사이로 들어오는 햇빛이 예뻤던 오후. 천천히 걷다가 마음에 드는 풍경을 남겼어요.',['park'],38,12],
      ['sunset','연남동','노을을 기다리는 시간','오늘의 풍경','산책을 마칠 때쯤 하늘이 주황빛으로 바뀌었어요. 잠깐 멈춰 하루를 돌아봤습니다.',['sunset'],19,5],
      ['book','연남동','책방에서 고른 한 권','동네 책방','표지를 보고 꺼낸 책에서 마음에 드는 문장을 발견했어요. 다음에는 조금 더 오래 머물고 싶어요.',[],12,3],
      ['walk','성수동','익숙한 길의 새로운 모습','주말 기록','늘 지나치던 골목을 반대 방향으로 걸어 봤어요. 작은 가게와 풍경이 새롭게 보였습니다.',['park'],27,6],
      ['note','성수동','다음 산책을 위한 메모','나만의 팁','편한 신발과 가벼운 가방이면 충분해요. 마음에 드는 장소는 지도에 표시해 두기로 했습니다.',[],9,2],
    ];
    const feed=getFeed();
    for (const [index,r] of examples.entries()) {
      const id=`my-example-${r[0]}`;
      if (feed.records.some(p=>p.id===id)) continue;
      feed.records.push({id,name:state.account.nickname,initial:state.account.nickname[0],region:r[1],title:r[2],tag:r[3],text:r[4],
        images:r[5].map(name=>({src:`assets/examples/${name}.svg`,name:`${name}.svg`})),image:null,
        views:r[6],likes:r[7],savedCount:0,comments:0,reactionCount:0,created:106-index,
        saved:false,liked:false,reaction:null,commentList:[],own:true,example:true});
    }
    setFeed(feed);
    update(s=>{s.my.examplesAdded=true;s.my.scroll=0;});
  }
  function updatePost(id, fn) { const feed=getFeed(),post=feed.records.find(p=>p.id===id);if(post){fn(post);setFeed(feed);}return post; }
  function postDate(value) {
    if (typeof value!=='number' || value<1e10) return '예시 기록';
    const elapsed=Date.now()-value;
    if(elapsed>=0 && elapsed<60000)return '방금';
    return new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'numeric',day:'numeric'}).format(new Date(value));
  }
  function reactionCounts(post) {
    if(Array.isArray(post.reactionCounts)&&post.reactionCounts.length===4)return post.reactionCounts.map(x=>Math.max(0,Number(x)||0));
    return [0,1,2,3].map(index=>post.reaction===index?1:0);
  }
  function reactToPost(id,index) {
    return updatePost(id,p=>{
      const counts=reactionCounts(p),old=p.reaction;
      if(old!=null)counts[old]=Math.max(0,counts[old]-1);
      p.reaction=old===index?null:index;
      if(p.reaction!=null)counts[p.reaction]++;
      p.reactionCounts=counts;
      p.reactionCount=Math.max(0,(p.reactionCount||0)+(old==null?1:0)-(p.reaction==null?1:0));
    });
  }
  const SAVED_LIMIT=100;
  function reference(kind,item) {return {kind,id:item.id,title:item.title||item.text?.slice(0,80)||item.tag||'저장한 콘텐츠',countryId:item.countryId,savedAt:item.savedAt||item.created||0};}
  function getSavedContent() {
    const state=read(), records=posts(), refs=new Map((state.savedRefs||[]).map(item=>[item.kind+':'+item.id,item]));
    records.filter(p=>p.saved).forEach(p=>refs.set('post:'+p.id,{...refs.get('post:'+p.id),...reference('post',p)}));
    state.issues.forEach(item=>refs.set('issue:'+item.id,{...refs.get('issue:'+item.id),...reference('issue',item)}));
    return [...refs.values()].flatMap(ref=>{
      const value=ref.kind==='post'?records.find(p=>p.id===ref.id):state.issues.find(item=>item.id===ref.id);
      if(ref.kind==='post'&&value&&!value.saved)return [];
      return [{...ref,value:value||ref,unavailable:!value||!!value.deleted||value.accessible===false}];
    }).sort((a,b)=>b.savedAt-a.savedAt);
  }
  function ensureSavedRefs() {
    const refs=getSavedContent().map(item=>({kind:item.kind,id:item.id,title:item.title,countryId:item.countryId,savedAt:item.savedAt}));
    if(JSON.stringify(refs)!==JSON.stringify(read().savedRefs||[]))update(s=>{s.savedRefs=refs;});
  }
  function savedContentCount() { return getSavedContent().length; }
  function savedError() { return '게시글은 최대 100개까지 저장할 수 있어요. 기존 저장을 해제한 뒤 다시 시도해 주세요.'; }
  function toggleSavedPost(id) {
    if (!read().account.loggedIn) return {ok:false,message:'로그인이 필요해요.'};
    const post=posts().find(p=>p.id===id);
    const previous=post?!!post.saved:read().savedRefs?.some(ref=>ref.kind==='post'&&ref.id===id);
    if (!post&&!previous) return {ok:false,message:'더 이상 볼 수 없는 게시글이에요.'};
    if (!previous && savedContentCount()>=SAVED_LIMIT) return {ok:false,message:savedError()};
    const saved=!previous;
    const result=perform('save-post',()=>{
      const updated=post?updatePost(id,p=>{p.saved=saved;p.savedCount=Math.max(0,(p.savedCount||0)+(saved?1:-1));p.savedAt=saved?Date.now():null;}):null;
      update(s=>{s.savedRefs=(s.savedRefs||[]).filter(ref=>!(ref.kind==='post'&&ref.id===id));if(saved)s.savedRefs.push(reference('post',updated));});
    });
    return result.ok?{ok:true,saved}:result;
  }
  function toggleSavedIssue(item) {
    const state=read();
    if (!state.account.loggedIn) return {ok:false,message:'로그인이 필요해요.'};
    const saved=!(state.issues.some(x=>x.id===item.id)||(state.savedRefs||[]).some(ref=>ref.kind==='issue'&&ref.id===item.id));
    if (saved && savedContentCount()>=SAVED_LIMIT) return {ok:false,message:savedError()};
    const result=perform('save-issue',()=>update(s=>{
      s.issues=s.issues.filter(x=>x.id!==item.id);
      s.savedRefs=(s.savedRefs||[]).filter(ref=>!(ref.kind==='issue'&&ref.id===item.id));
      s.issueActivity||={};
      const activity=s.issueActivity[item.id]||={liked:false,likes:0,events:[]};
      activity.events=(activity.events||[]).filter(event=>!(event.type==='save'&&event.created===activity.ownSaveAt));
      if(saved){
        const next={...item,savedAt:Date.now()};s.issues.push(next);s.savedRefs.push(reference('issue',next));
        activity.ownSaveAt=next.savedAt;activity.events.push({type:'save',created:next.savedAt});
      }else delete activity.ownSaveAt;
    }));
    return result.ok?{ok:true,saved}:result;
  }
  function toggleSavedCountry(country) {
    if(!read().account.loggedIn)return {ok:false,message:'로그인이 필요해요.'};
    if(typeof country==='string')country={id:country,name:country};
    const saved=!read().countries.some(item=>item.id===country.id);
    const result=perform('save-country',()=>update(s=>{s.countries=s.countries.filter(item=>item.id!==country.id);if(saved)s.countries.push({...country,savedAt:Date.now()});}));
    return result.ok?{ok:true,saved}:result;
  }
  function deletePost(id) {
    if(!read().account.loggedIn)return {ok:false,message:'로그인이 필요해요.'};
    const post=posts().find(item=>item.id===id);
    if(!post?.own)return {ok:false,message:'삭제할 내 게시글을 찾을 수 없어요.'};
    const result=perform('post-delete',()=>{ensureSavedRefs();const feed=getFeed();feed.records=feed.records.filter(item=>item.id!==id);setFeed(feed);update(s=>{delete s.commentUi?.['post:'+id];});});
    return result.ok?{ok:true,id}:result;
  }
  function addSavedExamples() {
    const state=read();
    if (!state.account.loggedIn || state.saved?.examplesAdded) return;
    const feed=getFeed(),source=seedFeed().records;
    const count=Math.max(0,SAVED_LIMIT-savedContentCount());
    for(const [index,post] of [source[3],source[2],source[7]].slice(0,count).entries()) {
      const id=`saved-example-${index}`;
      const existing=feed.records.find(p=>p.id===id);
      if(existing){if(!existing.saved){existing.saved=true;existing.savedCount=(existing.savedCount||0)+1;existing.savedAt=Date.now()-index;}continue;}
      feed.records.push({...post,id,images:[{src:`assets/examples/${['cafe','park','sunset'][index]}.svg`,name:'미리보기 일러스트'}],image:null,
        saved:true,savedCount:post.savedCount+1,savedAt:Date.now()-index,example:true});
    }
    setFeed(feed);
    update(s=>{
      for(const [id,name] of [['kr','대한민국'],['jp','일본'],['fr','프랑스']])if(!s.countries.some(c=>c.id===id))s.countries.push({id,name,savedAt:Date.now()});
      s.saved={...s.saved,examplesAdded:true,scroll:0};
    });
  }
  function recordHistory(item) {
    if (!read().account.loggedIn) return;
    update(s=>{s.history=[{...item,visited:Date.now()},...s.history.filter(x=>!(x.type===item.type&&x.id===item.id))].slice(0,100);});
  }
  function nicknameError(value) {
    const name=value.trim();
    const count=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('ko',{granularity:'grapheme'}).segment(name)].length:[...name].length;
    if(count<1||count>10) return '닉네임은 1~10자로 입력해 주세요.';
    if(!/^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9_]+$/u.test(name)) return '한글·영문·숫자·밑줄(_)만 사용할 수 있어요.';
    if(posts().some(p=>!p.own&&p.name.toLocaleLowerCase()===name.toLocaleLowerCase())) return '이미 사용 중인 닉네임이에요.';
    return '';
  }
  function rename(value) {
    const error=nicknameError(value);if(error)throw new Error(error);
    const name=value.trim();const feed=getFeed();
    feed.records.forEach(p=>{if(p.own){p.name=name;p.initial=name[0];}p.commentList=(p.commentList||[]).map(c=>typeof c==='object'&&c.own?{...c,name}:c);});
    setFeed(feed);update(s=>{s.account.nickname=name;for(const thread of Object.values(s.commentThreads||{}))for(const c of thread.comments||[])if(c.own)c.name=name;});
  }
  function logout() { update(s=>{s.account.loggedIn=false;}); }
  function login() { update(s=>{s.account.loggedIn=true;}); }
  function withdraw() {
    const cleanComments=items=>{
      const kept=(items||[]).filter(c=>typeof c==='object'&&!c.own);
      for(const c of items||[])if(typeof c==='object'&&c.own&&!c.parentId&&kept.some(r=>r.parentId===c.id&&!r.deleted))kept.push({...c,text:'',name:'',own:false,deleted:true,liked:false,likes:0});
      return kept;
    };
    const oldState=read(),publicThreads={};
    for(const [key,thread] of Object.entries(oldState.commentThreads||{}))publicThreads[key]={...thread,comments:cleanComments(thread.comments)};
    const feed=getFeed();feed.records=feed.records.filter(p=>!p.own);
    feed.records.forEach(p=>{
      if(p.liked)p.likes=Math.max(0,p.likes-1);if(p.saved)p.savedCount=Math.max(0,p.savedCount-1);if(p.reaction!=null)p.reactionCount=Math.max(0,p.reactionCount-1);
      if(p.reaction!=null){const counts=reactionCounts(p);counts[p.reaction]=Math.max(0,counts[p.reaction]-1);p.reactionCounts=counts;}
      p.liked=false;p.saved=false;p.reaction=null;
      const old=p.commentList||[];p.commentList=cleanComments(old);p.comments=Math.max(0,p.comments-old.filter(c=>typeof c!=='object'||(c.own&&!c.deleted)).length);
    });feed.history=[];feed.beforeFull=null;feed.selected=null;feed.mode='summary';setFeed(feed);
    update(s=>{Object.assign(s,defaults());s.commentThreads=publicThreads;s.account.loggedIn=false;});
  }
  function savedCount() { const s=read();return s.account.loggedIn?savedContentCount()+s.countries.length:0; }
  function reset() { memory=defaults();feedMemory={...seedFeed(),initialized:true};consumedFailures.clear();try{sessionStorage.removeItem(KEY);sessionStorage.removeItem(FEED_KEY);}catch(_){} }
  function emit(action,detail={}) {
    const event={channel:'allearth-prototype',action,screen:detail.screen,timestamp:Date.now(),detail};
    window.dispatchEvent(new CustomEvent('allearth:action',{detail:event}));
    if(parent!==window)parent.postMessage(event,location.protocol==='file:'?'*':location.origin);
  }
  window.AllEarthStore={read,update,getFeed,setFeed,perform,posts,addMyExamples,addSavedExamples,updatePost,deletePost,postDate,reactionCounts,reactToPost,toggleSavedPost,toggleSavedIssue,toggleSavedCountry,getSavedContent,ensureSavedRefs,savedContentCount,SAVED_LIMIT,recordHistory,nicknameError,rename,logout,login,withdraw,savedCount,reset,emit};
  // Only an explicit selection in the preview inspector requests a mock auth state.
  // Consume the flag so reloads and ordinary app navigation preserve a real logout.
  const previewUrl=new URL(location.href), previewAuth=previewUrl.searchParams.get('previewAuth');
  if (previewAuth==='in' || previewAuth==='out') {
    previewAuth==='in'?login():logout();
    previewUrl.searchParams.delete('previewAuth');
    history.replaceState(null,'',previewUrl);
  }
})();
