(() => {
  'use strict';
  const tabs=[['earth','Earth','home.html','home-nav-home.svg'],['feed','Feed','feed.html','home-nav-local.svg'],['saved','Saved','saved.html','home-nav-keep.svg'],['my','My','my.html','home-nav-my.svg']];
  function mount(active) {
    document.querySelectorAll('.app-nav,.home-nav,.feed-nav').forEach(n=>n.remove());
    const nav=document.createElement('nav');nav.className='app-nav';nav.setAttribute('aria-label','주 탐색');
    tabs.forEach(([key,label,href,icon])=>{
      const link=document.createElement('a');link.href=href;link.dataset.nav=key;link.setAttribute('aria-label',label);
      const image=document.createElement('img');image.src='assets/figma/'+icon;image.alt='';
      const text=document.createElement('span');text.textContent=label;link.append(image,text);
      if(key===active){link.classList.add('is-active');link.setAttribute('aria-current','page');}
      link.addEventListener('click',()=>{window.dispatchEvent(new CustomEvent('allearth:beforeNavigate'));});
      nav.append(link);
    });document.body.append(nav);return nav;
  }
  window.AllEarthShell={mount};
})();
