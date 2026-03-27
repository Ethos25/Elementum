// ═══════════════════════════════════════
// LOAD ORDER: game.js → dragon.js → constellation.js → ui.js  (last)
//
// PROVIDES (globals used by other files):
//   activeJourney          — current Wonder Path ID or null
//   renderAll()            — re-render grid + tabs + power bar
//   openModal(el,isNew,isNewFam) — show element detail modal
//   closeModal()           — close element detail modal
//   showFamCeleb(fam,title,quote,cb) — family completion overlay
//   burst(x,y,c)           — small particle burst
//   bigBurst(x,y,c)        — large particle burst
//   showToast(e,n,f,c)     — top-of-screen discovery toast
//   updateJourneyProgress(path) — refresh journey progress UI
//   showJourneyComplete(path)   — journey completion overlay
//   initApp()              — main entry point (called at bottom of file)
//
// CONSUMES (from other files):
//   state, P, T()                  — game.js
//   discover(), discoverFam()      — game.js
//   isDisc(), saveAll()            — game.js
//   checkAch(), checkMega()        — game.js
//   checkArcComplete()             — game.js
//   checkWhisper(), checkSecret119() — game.js
//   updateTabLocks()               — game.js
//   updateArcBanner()              — game.js
//   getRankDisplay()               — game.js
//   isBirthdayWeek(), getBirthdayParticleColor() — game.js
//   getBuddyElement(), renderBuddy() — game.js
//   isRadiant(), applyRadiant()    — game.js
//   clearRadiant()                 — game.js
//   checkComboReaction()           — game.js
//   checkWelcomeBack(), checkWildElement() — game.js
//   checkNightShift(), checkBirthdayMessage() — game.js
//   maybeMatch()                   — game.js
//   E[], EL, F                     — elements-data.js
//   WONDER_PATHS                   — journeys-data.js
//   DS, armSleepCheck()            — dragon.js
//   initDragon()                   — dragon.js
//   triggerExcited(), updateMascot(), updatePower() — dragon.js
//   dgOnModalOpen(), dgOnModalClose() — dragon.js
//   dgOnDiscover(), dgOnRevisit(), dgOnNewFamily() — dragon.js
//   playTone(), playFamilySound()  — sound.js
//   playDiscoverEvolved()          — sound.js
//   speakName(), playRumble()      — sound.js
//   playMegaSwitch(), playEOTDShimmer() — sound.js
//   getAC()                        — sound.js
//   enterConstellationMode()       — constellation.js  (guarded: typeof check)
//   enterConstellationModeAll()    — constellation.js  (guarded)
//   isConstellationActive()        — constellation.js  (guarded)
//   exitConstellationMode()        — constellation.js  (guarded)
// ═══════════════════════════════════════
// JOURNEY STATE (UI layer)
// ═══════════════════════════════════════
var activeJourney = null; // path ID string or null

// ═══════════════════════════════════════
// STARFIELD + PARTICLES
// ═══════════════════════════════════════
function mkStars(){
  var el=document.getElementById('sf');
  for(var i=0;i<60;i++){
    var s=document.createElement('div');s.className='st';
    var z=Math.random()*2.5+.5;
    s.style.cssText='width:'+z+'px;height:'+z+'px;left:'+Math.random()*100+'%;top:'+Math.random()*100+'%;--d:'+(Math.random()*3+2)+'s;--a:'+(Math.random()*.2+.1)+';--b:'+(Math.random()*.5+.4)+';animation-delay:'+Math.random()*3+'s';
    el.appendChild(s);
  }
}

function burst(x,y,color,count){
  if(count===undefined)count=7;
  for(var i=0;i<count;i++){
    var p=document.createElement('div');p.className='particle';
    var a=(Math.PI*2/count)*i+Math.random()*.5,d=30+Math.random()*35;
    p.style.cssText='left:'+(x-3)+'px;top:'+(y-3)+'px;background:'+color+';--tx:'+Math.cos(a)*d+'px;--ty:'+Math.sin(a)*d+'px;box-shadow:0 0 5px '+color;
    document.body.appendChild(p);
    setTimeout(function(){p.remove()},600);
  }
}

function bigBurst(x,y,c){burst(x,y,c,14)}

function showCeleb(text){
  var el=document.getElementById('celeb');
  var t=document.createElement('div');t.className='celeb-text';t.textContent=text;
  el.appendChild(t);setTimeout(function(){t.remove()},900);
}

function showToast(emoji,name,famName,famColor){
  var t=document.getElementById('toast');
  document.getElementById('toastEmoji').textContent=emoji;
  document.getElementById('toastText').innerHTML='<span style="color:var(--cyan)">New Element!</span> '+name;
  document.getElementById('toastFam').textContent=famName;
  t.style.borderLeftColor=famColor;
  t.classList.add('show');
  setTimeout(function(){t.classList.remove('show')},3000);
}

function showFamCeleb(famKey,title,quote,onClose){
  var fc=F[famKey];var ov=document.getElementById('famCeleb');
  document.getElementById('famGlow').style.background=fc.c;
  document.getElementById('famBadge').textContent=fc.n;
  document.getElementById('famBadge').style.background=fc.bg;
  document.getElementById('famBadge').style.color=fc.c;
  document.getElementById('famBadge').style.border='1.5px solid '+fc.bd;
  document.getElementById('famTitle').textContent=title;
  document.getElementById('famTitle').style.color=fc.c;
  document.getElementById('famQuote').textContent='"'+quote+'"';
  ov.classList.add('active');
  // Particle cascade
  for(var i=0;i<6;i++)(function(idx){setTimeout(function(){bigBurst(innerWidth/2+(Math.random()*120-60),innerHeight/2+(Math.random()*100-50),fc.c)},idx*200)})(i);
  // Close on button tap
  document.getElementById('famClose').onclick=function(){ov.classList.remove('active');if(onClose)onClose()};
}

// ═══════════════════════════════════════
// RENDER
// ═══════════════════════════════════════
function renderAll(){renderFamTabs();renderCards();updatePower();updateCount()}

function renderFamTabs(){
  if(activeJourney)return; // journey mode hides family tabs
  var c=document.getElementById('ftabs');c.innerHTML='';
  getFams().forEach(function(fm){
    var b=document.createElement('button');
    b.className='ftab'+(fm.key===curFam?' active':'');
    b.textContent=fm.name;
    if(fm.key!=='all'&&fm.key===curFam){b.style.background=F[fm.key].c;b.style.boxShadow='0 3px 14px '+F[fm.key].gl}
    else if(fm.key==='all'&&curFam==='all')b.style.background='linear-gradient(135deg,var(--cyan),var(--purple))';
    b.onclick=function(){
      curFam=fm.key;renderFamTabs();renderCards();updateCount();
      if(fm.key!=='all'){playFamilySound(fm.key);showFamilyBio(fm.key)}
      else{document.getElementById('fbio').classList.remove('show');playTone(500,'sine',.08)}
      updateMascot(fm.key);
    };
    c.appendChild(b);
  });
}

function showFamilyBio(fk){
  var el=document.getElementById('fbio'),txt=document.getElementById('fbioText');
  txt.textContent=T(F[fk].bio);el.classList.add('show');el.style.borderColor=F[fk].bd;el.style.background=F[fk].bg;
}

function renderCards(){
  var grid=document.getElementById('grid');grid.innerHTML='';
  var els;
  if(activeJourney){
    var jPath=WONDER_PATHS.find(function(p){return p.id===activeJourney});
    els=jPath?jPath.elements.map(function(n){return EL[n]}).filter(Boolean):[];
  }else{
    els=getEls();if(curFam!=='all')els=els.filter(function(el){return el.f===curFam});
  }
  els.sort(function(a,b){return a.num-b.num});
  els.forEach(function(el,i){
    var fc=F[el.f];var disc=isDisc(el.num);var w=document.createElement('div');
    w.className='cw'+(disc?'':' undiscovered');
    w.style.animationDelay=Math.min(i*.035,1.2)+'s';
    w.style.setProperty('--cc',fc.c);w.style.setProperty('--cbg',fc.bg);w.style.setProperty('--cg',fc.gl);w.style.setProperty('--cb',fc.bd);
    w.innerHTML='<div class="cin" style="border:1.5px solid '+fc.bd+'"><div class="c-fam">'+F[el.f].n+'</div><div class="c-emoji">'+el.e+'</div><div class="c-sym">'+el.s+'</div><div class="c-name">'+el.n+'</div>'+(state.radiants&&state.radiants.includes(el.num)?'<div class="card-radiant">✨</div>':'')+'</div>';
    w.onclick=function(ev){
      var isNew=discover(el.num);var isNewFam=discoverFam(el.f);openModal(el,isNew,isNewFam);
      if(isNew){
        bigBurst(ev.clientX,ev.clientY,getBirthdayParticleColor()||fc.c);playDiscoverEvolved(state.disc.length);showToast(el.e,el.n,F[el.f].n,fc.c);w.classList.remove('undiscovered');
        if(!state.sessionDisc)state.sessionDisc=[];state.sessionDisc.push(el.n);saveAll();
        setTimeout(function(){checkAch();checkMega();checkArcComplete();checkWhisper();checkSecret119();updateTabLocks();updateArcBanner();maybeMatch();
          if(activeJourney&&Math.random()<0.3){var ap=WONDER_PATHS.find(function(p){return p.id===activeJourney});if(ap&&ap.elements.includes(el.num)){var found=ap.elements.filter(function(n){return isDisc(n)}).length;if(found<ap.elements.length)document.getElementById('mspText').textContent='🐉 Eternatus: "That\'s '+found+' of '+ap.elements.length+'! Keep going!"';}}
        },500);
      }else{burst(ev.clientX,ev.clientY,fc.c);playRevisit(el.f)}
      if(isNewFam)setTimeout(function(){playTone(392,'sine',.1)},400);
      updatePower();updateCount();
    };
    grid.appendChild(w);
  });
}

function updateCount(){
  if(activeJourney){
    var jPath=WONDER_PATHS.find(function(p){return p.id===activeJourney});
    if(jPath){var found=jPath.elements.filter(function(n){return isDisc(n)}).length;document.getElementById('cnt').innerHTML='<span>'+found+'</span> of '+jPath.elements.length+' on this path';return;}
  }
  var els=getEls();
  var f=curFam==='all'?els:els.filter(function(el){return el.f===curFam});
  var d=f.filter(function(el){return isDisc(el.num)}).length;
  document.getElementById('cnt').innerHTML='<span>'+d+'</span> of '+f.length+' discovered';
}

// ═══════════════════════════════════════
// ELEMENT OF THE DAY
// ═══════════════════════════════════════
function getEOTD(){var d=Math.floor(Date.now()/86400000);return E[d%E.length]}

function buildEOTDCardHTML(el){
  var fc=F[el.f];
  var discBtn=isDisc(el.num)
    ?'<button class="eotd-disc-btn" disabled>Already Discovered ✓</button>'
    :'<button class="eotd-disc-btn" id="eotdDiscover">⚡ Discover this element</button>';
  return (
    '<div class="eotd-card" style="background:var(--bg3);border:1.5px solid '+fc.bd+'">'+
      '<div class="eotd-hdr" style="--cg:'+fc.gl+';background:'+fc.bg+'">'+
        '<div class="eotd-emoji">'+el.e+'</div>'+
        '<div class="eotd-sym" style="--cc:'+fc.c+';color:'+fc.c+';text-shadow:0 0 30px '+fc.gl+'">'+el.s+'</div>'+
        '<div class="eotd-name">'+el.n+'</div>'+
        '<div class="m-meta" style="margin-top:8px"><span>#'+el.num+'</span><span>'+F[el.f].n+'</span></div>'+
      '</div>'+
      '<div class="eotd-body">'+
        '<div><div class="m-lbl" style="color:'+fc.c+'">Superpower</div><div class="m-fact">'+el.fact+'</div></div>'+
        '<div><div class="m-lbl" style="color:'+fc.c+'">Story</div><div class="m-story">'+T(el.story)+'</div></div>'+
        (el.cb&&el.cb.length?'<div><div class="m-lbl" style="color:'+fc.c+'">⚡ Mega Combos</div><div class="m-combos">'+el.cb.map(function(c){return '<div class="m-combo" style="border-color:'+fc.bd+'"><span class="m-combo-eq" style="color:'+fc.c+'">'+el.s+' + '+c.w+'</span><span class="m-combo-arrow" style="color:'+fc.c+'">→</span><span class="m-combo-result">'+c.r+'</span></div>'}).join('')+'</div></div>':'')+
        '<div class="eotd-teach"><p>🐉 Eternatus challenge: "Think you know '+el.n+' well enough to teach it? Try explaining it to someone in your own words!"</p></div>'+
        '<div class="eotd-disc-wrap">'+discBtn+'</div>'+
      '</div>'+
    '</div>'+
    '<div class="eotd-nav">'+
      '<button id="eotdRandom">🔀 Random Element</button>'+
      '<button id="eotdSpeak">🔊 Hear the Name</button>'+
    '</div>'
  );
}

function wireEOTDButtons(el){
  var fc=F[el.f];
  document.getElementById('eotdSpeak').onclick=function(){speakName(el.n);playFamilySound(el.f)};
  document.getElementById('eotdRandom').onclick=function(){renderEOTDCustom(E[Math.floor(Math.random()*E.length)])};
  var discBtn=document.getElementById('eotdDiscover');
  if(discBtn){
    discBtn.onclick=function(){
      var isNew=discover(el.num);var isNewFam=discoverFam(el.f);
      updatePower();updateCount();
      showToast(el.e,el.n,F[el.f].n,fc.c);
      if(isNew){playDiscoverEvolved(state.disc.length);setTimeout(function(){checkAch();checkMega();checkArcComplete();checkWhisper();updateTabLocks();updateArcBanner();},500)}
      // Replace button with disabled confirmed state
      discBtn.textContent='Already Discovered ✓';discBtn.disabled=true;
    };
  }
}

function renderEOTD(){
  var el=getEOTD();var container=document.getElementById('eotd');
  container.innerHTML=buildEOTDCardHTML(el);
  wireEOTDButtons(el);
}

function renderEOTDCustom(el){
  var container=document.getElementById('eotd');
  container.innerHTML=buildEOTDCardHTML(el);
  wireEOTDButtons(el);
  speakName(el.n);playFamilySound(el.f);
}

// ═══════════════════════════════════════
// DRAGON'S MAP
// ═══════════════════════════════════════
var mapFam='all';

function renderMapTabs(){
  var c=document.getElementById('dmFtabs');c.innerHTML='';
  var fams=[{key:'all',name:'All Families'}].concat(Object.keys(F).map(function(k){return {key:k,name:F[k].n}}));
  fams.forEach(function(fm){
    var b=document.createElement('button');b.className='ftab'+(fm.key===mapFam?' active':'');b.textContent=fm.name;
    if(fm.key!=='all'&&fm.key===mapFam){b.style.background=F[fm.key].c;b.style.boxShadow='0 3px 14px '+F[fm.key].gl}
    else if(fm.key==='all'&&mapFam==='all')b.style.background='linear-gradient(135deg,var(--cyan),var(--purple))';
    b.onclick=function(){
      mapFam=fm.key;renderMapTabs();applyMapFilter();
      document.getElementById('dmColHint').classList.remove('show');
      if(fm.key!=='all'){
        playFamilySound(fm.key);
        var bio=document.getElementById('dmFbio'),txt=document.getElementById('dmFbioText');
        txt.textContent=T(F[fm.key].bio);bio.classList.add('show');bio.style.borderColor=F[fm.key].bd;bio.style.background=F[fm.key].bg;
      }else{document.getElementById('dmFbio').classList.remove('show');playTone(500,'sine',.08)}
    };
    c.appendChild(b);
  });
}

function applyMapFilter(){
  var cells=document.querySelectorAll('.dm-cell');
  cells.forEach(function(cell){
    var num=parseInt(cell.dataset.num);var el=EL[num];
    if(!el)return;
    var fc=F[el.f];
    if(mapFam==='all'){
      cell.style.opacity='';cell.style.transform='';cell.style.boxShadow='';
      cell.style.background=fc.bg;cell.style.borderColor=fc.bd;cell.style.zIndex='';
      cell.querySelector('.dm-sym').style.color=fc.c;
      cell.querySelector('.dm-num').style.color='';
    }else if(el.f===mapFam){
      cell.style.opacity='1';
      cell.style.transform='scale(1.15)';
      cell.style.background=fc.c;
      cell.style.borderColor=fc.c;
      cell.style.boxShadow='0 0 10px '+fc.gl+', 0 0 20px '+fc.gl;
      cell.style.zIndex='3';
      cell.querySelector('.dm-sym').style.color='#0B0E1A';
      cell.querySelector('.dm-num').style.color='#0B0E1A';
    }else{
      cell.style.opacity='.15';cell.style.transform='';cell.style.boxShadow='';
      cell.style.background=fc.bg;cell.style.borderColor=fc.bd;cell.style.zIndex='';
      cell.querySelector('.dm-sym').style.color=fc.c;
      cell.querySelector('.dm-num').style.color='';
    }
  });
}

function renderMap(){
  // Reset constellation state — map always opens clean
  if(typeof _resetConstellationState==='function')_resetConstellationState();
  var g=document.getElementById('dmapGrid');g.innerHTML='';
  document.getElementById('dmColHint').classList.remove('show');
  document.getElementById('dmFbio').classList.remove('show');
  mapFam='all';renderMapTabs();
  // Build lookup: which completed journeys include each element num
  var completedPaths=[];
  if(typeof WONDER_PATHS!=='undefined'&&state.journeys&&state.journeys.completed&&state.journeys.completed.length>0){
    completedPaths=WONDER_PATHS.filter(function(p){return state.journeys.completed.indexOf(p.id)!==-1});
  }
  for(var r=1;r<=10;r++){
    for(var c=1;c<=18;c++){
      var el=null;
      for(var num in PP){if(PP[num][0]===r&&PP[num][1]===c){el=EL[+num];break}}
      if(r===8){
        if(c===1){var d0=document.createElement('div');d0.style.cssText='grid-row:8;grid-column:1/19;height:6px';g.appendChild(d0)}
        continue;
      }
      if((r===6&&c===3)||(r===7&&c===3)){
        var dl=document.createElement('div');dl.className='dm-label';
        dl.style.cssText='grid-row:'+r+';grid-column:'+c;
        dl.textContent=r===6?'57-71':'89-103';g.appendChild(dl);continue;
      }
      if(!el)continue;
      var fc=F[el.f];var disc=isDisc(el.num);var d=document.createElement('div');
      d.className='dm-cell'+(disc?'':' undiscovered');
      d.dataset.num=el.num;
      d.style.cssText='grid-row:'+r+';grid-column:'+c+';background:'+fc.bg+';border:1px solid '+fc.bd+';color:'+fc.c+';transition:opacity .3s,transform .3s';
      d.innerHTML='<div class="dm-num">'+el.num+'</div><div class="dm-sym">'+el.s+'</div>';
      // Journey marker dots (subtle colored dots in top-right corner)
      if(completedPaths.length>0&&typeof THREAD_STYLES!=='undefined'){
        var dotColors=[];
        completedPaths.forEach(function(p){
          if(p.elements.indexOf(el.num)!==-1){var ts=THREAD_STYLES[p.id];if(ts)dotColors.push(ts.color);}
        });
        if(dotColors.length>0){
          var dotWrap=document.createElement('div');dotWrap.className='dm-jdots';
          dotColors.forEach(function(col){var dot=document.createElement('div');dot.className='dm-jdot';dot.style.background=col;dotWrap.appendChild(dot);});
          d.appendChild(dotWrap);
        }
      }
      (function(elRef,dRef,cRef){
        dRef.onclick=function(ev){
          // Exit constellation mode if active, then open modal normally
          if(typeof isConstellationActive==='function'&&isConstellationActive()){
            exitConstellationMode();
            document.getElementById('dmConstellationMenu').classList.add('hidden');
          }
          var isNew=discover(elRef.num);var isNewFam=discoverFam(elRef.f);openModal(elRef,isNew,isNewFam);
          var fcRef=F[elRef.f];
          if(isNew){
            bigBurst(ev.clientX,ev.clientY,getBirthdayParticleColor()||fcRef.c);playDiscoverEvolved(state.disc.length);showToast(elRef.e,elRef.n,F[elRef.f].n,fcRef.c);dRef.classList.remove('undiscovered');
            if(!state.sessionDisc)state.sessionDisc=[];state.sessionDisc.push(elRef.n);saveAll();
            setTimeout(function(){checkAch();checkMega();checkArcComplete();checkWhisper();checkSecret119();updateTabLocks();updateArcBanner();maybeMatch()},500);
          }else{burst(ev.clientX,ev.clientY,fcRef.c);playRevisit(elRef.f)}
          updatePower();
          // Column teaching
          var hint=document.getElementById('dmColHint');
          hint.classList.remove('show');
          if(COL_TEACH[cRef]){
            document.getElementById('dmColText').textContent=T(COL_TEACH[cRef]+' See? All '+(F[COL_FAM[cRef]]&&F[COL_FAM[cRef]].n||'elements')+' in the same column share the same powers!');
            hint.classList.add('show');
          }
        };
      })(el,d,c);
      g.appendChild(d);
    }
  }
  // Wire constellation toggle button + dropdown
  var consWrap=document.getElementById('dmConsWrap');
  var consBtn=document.getElementById('dmConstellationBtn');
  var consMenu=document.getElementById('dmConstellationMenu');
  if(consWrap&&consBtn&&consMenu){
    if(completedPaths.length===0){
      consWrap.classList.add('hidden');
    }else{
      consWrap.classList.remove('hidden');
      // Populate menu
      var mHtml='<div class="dmc-item dmc-all" data-action="all">✨ Show All Paths</div>';
      completedPaths.forEach(function(p){mHtml+='<div class="dmc-item" data-pathid="'+p.id+'">'+p.emoji+' '+p.title+'</div>';});
      consMenu.innerHTML=mHtml;
      consMenu.classList.add('hidden');
      consBtn.onclick=function(e){
        e.stopPropagation();
        if(typeof isConstellationActive==='function'&&isConstellationActive()){
          exitConstellationMode();consMenu.classList.add('hidden');return;
        }
        consMenu.classList.toggle('hidden');
      };
      consMenu.querySelectorAll('.dmc-item').forEach(function(item){
        item.onclick=function(e){
          e.stopPropagation();consMenu.classList.add('hidden');
          if(item.dataset.action==='all'){if(typeof enterConstellationModeAll==='function')enterConstellationModeAll();}
          else{if(typeof enterConstellationMode==='function')enterConstellationMode(item.dataset.pathid);}
        };
      });
    }
  }
  // Tap anywhere on the map area to exit constellation mode
  document.getElementById('dmap').onclick=function(e){
    if(typeof isConstellationActive!=='function'||!isConstellationActive())return;
    if(e.target.closest('#dmConsWrap'))return;
    exitConstellationMode();consMenu&&consMenu.classList.add('hidden');
  };
}

// ═══════════════════════════════════════
// MODAL
// ═══════════════════════════════════════
function openModal(el,isNew,isNewFam){
  clearRadiant();
  var fc=F[el.f];var m=document.getElementById('mov'),mc=document.getElementById('mc');
  mc.style.setProperty('--cc',fc.c);mc.style.setProperty('--cbg',fc.bg);mc.style.setProperty('--cg',fc.gl);mc.style.setProperty('--cb',fc.bd);
  document.getElementById('mhdr').style.background=fc.bg;
  document.getElementById('me').textContent=el.e;document.getElementById('ms').textContent=el.s;
  document.getElementById('mn').textContent=el.n;
  document.getElementById('mm').innerHTML='<span>#'+el.num+'</span><span>'+F[el.f].n+'</span>';
  document.getElementById('mf').textContent=el.fact;document.getElementById('mst').textContent=T(el.story);
  // Combos
  var cw=document.getElementById('mCombosWrap'),cc=document.getElementById('mCombos');
  if(el.cb&&el.cb.length>0){
    cw.style.display='block';
    cc.innerHTML=el.cb.map(function(c){return '<div class="m-combo"><span class="m-combo-eq">'+el.s+' + '+c.w+'</span><span class="m-combo-arrow">→</span><span class="m-combo-result">'+c.r+'</span></div>'}).join('');
  }else cw.style.display='none';
  // Eternatus
  var et=document.getElementById('metern'),etT=document.getElementById('meternText');et.style.display='block';
  if(isNew){
    var line=el.eLine?T(el.eLine):T(F[el.f].disc);
    if(isNewFam)line='NEW FAMILY: '+F[el.f].n+'! '+line;
    // Check combo reaction
    var comboMsg=checkComboReaction(el);
    if(comboMsg)line=line+' '+comboMsg;
    etT.textContent='⚡ Eternatus: "'+line+'"';
  }else{
    // RADIANT CHECK (7% chance on revisit)
    if(isRadiant()){
      applyRadiant(el);
    }else{
      var rv=el.rv?T(el.rv):el.n+'! One of my favorites.';
      etT.textContent='🐉 Eternatus: "'+rv+'"';
    }
  }
  // Dragon reactions
  if(DS.initialized){
    if(isNew){dgOnDiscover(fc.c);if(isNewFam)setTimeout(dgOnNewFamily,300);}
    else{dgOnRevisit();}
  }
  speakName(el.n);
  playRumble();if(isNew)document.getElementById('mspText').textContent=el.eLine?T(el.eLine):T(F[el.f].disc);
  var btn=document.getElementById('mspk');btn.style.borderColor=fc.bd;btn.style.background=fc.bg;btn.style.color=fc.c;
  btn.onclick=function(){speakName(el.n);playFamilySound(el.f)};
  m.classList.add('active');document.body.style.overflow='hidden';
  clearInterval(DS.sleepCheckInterval);
  // v3: dragon peeks toward modal
  if(DS.initialized){
    var mRect=document.getElementById('mc').getBoundingClientRect();
    dgOnModalOpen(mRect.left+mRect.width/2,mRect.top+mRect.height/2);
  }
}

function closeModal(){
  clearRadiant();if(typeof clearMeteorShower==='function')clearMeteorShower();
  document.getElementById('mov').classList.remove('active');document.body.style.overflow='';playTone(500,'sine',.06);
  if(DS.initialized)armSleepCheck();
  // v3: dragon eyes return to center
  if(DS.initialized)dgOnModalClose();
}

// ═══════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════
function renderProfile(){
  var c=document.getElementById('profile');var total=state.disc.length;
  var days=state.firstDiscTime?Math.max(1,Math.ceil((Date.now()-state.firstDiscTime)/86400000)):0;
  var ce=getColorElement();
  var anch='<div class="prof-anchor">💎 <span>Carbon</span> lives inside '+P.toy+'</div>';
  if(P.food)anch+='<div class="prof-anchor">🍟 <span>Sodium</span> is the salt on '+P.food+'</div>';
  if(P.pet)anch+='<div class="prof-anchor">🦴 <span>Calcium</span> builds '+P.pet+"'s bones</div>"+'<div class="prof-anchor">🌉 <span>Iron</span> carries oxygen in '+P.pet+"'s blood</div>";
  if(ce)anch+='<div class="prof-anchor">🎨 <span>'+ce.el+'</span> '+ce.why+' — '+P.color+'!</div>';
  var buddy=getBuddyElement();
  if(buddy)anch+='<div class="prof-anchor">💜 <span>'+buddy.n+'</span> is your Element Buddy — born on the '+P.bday+ordSuf(P.bday)+', atomic number '+buddy.num+'</div>';
  if(state.radiants&&state.radiants.length>0)anch+='<div class="prof-anchor">✨ <span>Radiant Elements</span> found: '+state.radiants.length+' of 118</div>';
  var tl='';
  if(state.firstDiscTime)tl+='<div class="tl-item">Started Elementum</div>';
  ACHS.filter(function(a){return state.achShown.includes(a.c)}).forEach(function(a){tl+='<div class="tl-item">Earned '+a.t+'</div>'});
  if(state.megaUnlocked)tl+='<div class="tl-item">Mega Evolution unlocked!</div>';
  // Session summary
  var sess='';
  if(state.sessionDisc&&state.sessionDisc.length>0){
    var fams=new Set();
    state.sessionDisc.forEach(function(n){var el=E.find(function(e){return e.n===n});if(el)fams.add(F[el.f].n)});
    sess='<div class="sess-summary"><h3>This Session</h3><div class="sess-item">Discovered '+state.sessionDisc.length+' new element'+(state.sessionDisc.length>1?'s':'')+': '+state.sessionDisc.join(', ')+'</div>'+(fams.size?'<div class="sess-item" style="margin-top:4px;color:var(--cyan)">Families touched: '+Array.from(fams).join(', ')+'</div>':'')+'</div>';
  }
  c.innerHTML='<div class="prof-card"><div class="prof-name">'+P.name+"'s Elementum</div>"+'<div class="prof-title"><span class="prof-rank">'+getRankDisplay()+'</span><span class="prof-rank-sep"> · </span>'+(getAchTitle()||'Beginner Explorer')+'</div><div class="prof-stats"><div class="prof-stat"><div class="prof-stat-val">'+total+'</div><div class="prof-stat-lbl">Elements</div></div><div class="prof-stat"><div class="prof-stat-val">'+state.fams.length+'</div><div class="prof-stat-lbl">Families</div></div><div class="prof-stat"><div class="prof-stat-val">'+(state.matchesCorrect||0)+'</div><div class="prof-stat-lbl">Quiz Right</div></div><div class="prof-stat"><div class="prof-stat-val">'+days+'</div><div class="prof-stat-lbl">Days</div></div></div></div>'+sess+(anch?'<div class="prof-anchors"><h3>Your Element Anchors</h3>'+anch+'</div>':'')+(tl?'<div class="prof-timeline"><h3>Your Journey</h3>'+tl+'</div>':'')+'<button class="prof-share" id="profShare">📸 Share Progress</button><button class="reset-btn" id="resetBtn" style="margin-top:16px;opacity:.3;font-size:.6rem;font-family:Quicksand,sans-serif;font-weight:600;color:var(--t2);background:none;border:none;cursor:pointer;width:100%;text-align:center;padding:8px">↺ Reset All Progress</button>';
  document.getElementById('profShare').onclick=showShareCard;
  document.getElementById('resetBtn').onclick=function(){document.getElementById('resetConfirm').classList.remove('hidden')};
}

function showShareCard(){
  var ov=document.getElementById('shareOv');
  document.getElementById('scName').textContent=P.name+"'s Elementum";
  document.getElementById('scTitle').textContent=getAchTitle()||'Beginner Explorer';
  document.getElementById('scStat').textContent=state.disc.length;
  document.getElementById('scBar').style.width=Math.round(state.disc.length/118*100)+'%';
  ov.classList.add('active');playTone(523,'sine',.1);setTimeout(function(){playTone(784,'sine',.12)},100);
}

// ═══════════════════════════════════════
// WELCOME
// ═══════════════════════════════════════
function runWelcome(){
  var w=document.getElementById('welcome');
  if(state.intro){w.style.display='none';document.getElementById('app').classList.remove('hidden');return}
  if(P.name!=='Explorer'){w.style.display='none';runIntro();return}
  var ni=document.getElementById('wName'),ti=document.getElementById('wToy'),btn=document.getElementById('wStart');
  var fi=document.getElementById('wFood'),pi=document.getElementById('wPet'),ci=document.getElementById('wColor'),bi=document.getElementById('wBday');
  function check(){var ok=ni.value.trim()&&ti.value.trim();btn.disabled=!ok;document.getElementById('wStartHint').style.display=ok?'none':'block'}
  ni.oninput=check;ti.oninput=check;
  btn.onclick=function(){
    // Resume AudioContext for iPad
    try{getAC().resume()}catch(e){}
    P.name=ni.value.trim()||'Explorer';P.toy=ti.value.trim()||'blanket';
    P.food=fi.value.trim()||'';P.pet=pi.value.trim()||'';P.color=ci.value.trim()||'';
    P.bday=bi?parseInt(bi.value)||0:0;if(P.bday<1||P.bday>31)P.bday=0;
    saveAll();
    // Welcome beat
    w.classList.add('done');
    var wb=document.getElementById('welcomeBeat');
    wb.classList.remove('hidden');
    document.getElementById('wbName').textContent='Welcome, '+P.name+'.';
    playTone(440,'sine',.15,.06);setTimeout(function(){playTone(660,'sine',.15,.06)},200);
    document.getElementById('wbBtn').onclick=function(){wb.classList.add('hidden');w.style.display='none';runIntro()};
  };
}

// ═══════════════════════════════════════
// INTRO
// ═══════════════════════════════════════
var INTRO_SEQ=[
  {num:1,speech:"This is Hydrogen. The very first atom ever born in the universe. I can feel ancient fire returning to my core!"},
  {num:2,speech:"Helium! My wings feel lighter already! This one makes balloons float and voices go squeaky!"},
  {num:6,speech:"{toy}: Carbon! The builder of all life! I can feel {toy}'s warmth... life energy is flooding back into me!"},
  {num:79,speech:"GOLD! My scales are hardening into golden armor! Nothing can stop me now!"},
  {num:8,speech:"Oxygen! *takes a huge breath* I can BREATHE again, {name}! You've restored five of my powers!"}
];
var introStep=-1;

function runIntro(){
  var ov=document.getElementById('intro');
  if(state.intro){ov.style.display='none';document.getElementById('app').classList.remove('hidden');return}
  ov.classList.remove('hidden');ov.style.display='flex';
  document.getElementById('iSpeech').textContent=T("I am the ancient dragon of the elements. But my powers have been scattered across the Elementum... Every element you discover restores my strength. Will you help me, {name}?");
  document.getElementById('iBtn').onclick=function(){introStep++;advanceIntro()};
}

function advanceIntro(){
  var btn=document.getElementById('iBtn'),speech=document.getElementById('iSpeech'),card=document.getElementById('iCard');
  var buddy=getBuddyElement();
  var hasBuddy=!!buddy;
  if(introStep===0){
    document.getElementById('iTitle').textContent='Professor Eternatus';
    card.innerHTML='';card.classList.remove('show');card.style.background='transparent';card.style.border='none';
    if(hasBuddy){
      speech.textContent=T("I am the ancient dragon of the elements, {name}. My powers have been scattered across 118 elements. Every one you discover makes me stronger. But first... let me show you something about YOU.");
      btn.textContent='What is it? →';
    }else{
      speech.textContent=T("I am the ancient dragon of the elements, {name}. My powers have been scattered across 118 elements. Every one you discover makes me stronger. Let me introduce you to your first 5!");
      btn.textContent='Find Hydrogen →';
    }
  }else if(introStep===1&&hasBuddy){
    var fc=F[buddy.f];
    var BS={1:"Hydrogen is the lightest thing in the entire universe and the FIRST atom ever born after the Big Bang. Two Hydrogens plus one Oxygen makes every drop of water you have ever touched. Your superpower? You are the beginning of EVERYTHING.",2:"Helium makes balloons fly and voices go squeaky! Stars are made of it. The Sun is BURNING Helium right now. Your superpower? You are lighter than air itself.",3:"Lithium powers every battery in every phone, tablet, and electric car. Without Lithium, the iPad goes dark. Your superpower? You keep the whole world charged.",4:"Beryllium hides inside every emerald on Earth. That gorgeous green? Beryllium. It is also in spacecraft. Your superpower? Precious gems AND space travel.",5:"Boron is in laundry soap fighting stains, in slime recipes, and in rocket fuel. Your superpower? You clean, you play, you FLY.",6:"Carbon is inside EVERYTHING alive. Inside {toy}. Inside you. Inside every plant, animal, and person on Earth. Squeeze Carbon hard enough and it becomes a DIAMOND. Your superpower? You are the building block of all life.",7:"Nitrogen is invisible and makes up 80% of every breath you take. The ultimate ninja. Everywhere, but nobody notices. Your superpower? You are the invisible force that fills the world.",8:"Oxygen keeps every human, animal, and fire alive. Every breath {name} takes? Oxygen giving your body energy. Your superpower? You are the breath of life itself.",9:"Fluorine is in toothpaste fighting sugar bugs every morning. It makes teeth so tough they crunch anything. Your superpower? You protect and strengthen everything you touch.",10:"Neon lights up the night! Every glowing sign uses Neon. Red, blue, green, any color. Your superpower? You light up the world when it gets dark.",11:"Sodium makes fries taste amazing AND explodes in water! BOOM! Delicious AND dangerous. Your superpower? You are a walking contradiction.",12:"Magnesium makes the dazzling white flash in fireworks. That bright burst that makes everyone go OOOOH? Magnesium. Your superpower? You light up the sky.",13:"Aluminum holds up airplanes AND wraps leftovers. Strong enough for rockets but crushable by hand. Your superpower? Lightweight but mighty.",14:"Silicon started as beach sand. Then it learned to think. Every computer and video game runs on Silicon. Your superpower? You are the sand that learned to THINK.",15:"Phosphorus glows in the dark AND lives inside your DNA. The code that makes you YOU? Phosphorus. Your superpower? You glow AND carry the code of life.",16:"Sulfur stinks like rotten eggs but lives in volcanoes and every living cell. Gross, powerful, and absolutely essential. Your superpower? Nobody can ignore you.",17:"Chlorine zaps germs in every pool so kids splash safe. That pool smell? Chlorine doing its job. Your superpower? You protect everyone around you.",18:"Argon is the shyest element. It hides in lightbulbs, quietly keeping the light going. Never reacts with anyone. Your superpower? You work silently, keeping everything running.",19:"Potassium hides in every banana. It keeps muscles moving and hearts beating. Without it, your heart stops. Your superpower? You keep the most important muscle going.",20:"Calcium builds every bone in your body. Without it you would be floppy like a jellyfish. Your superpower? You are the framework that holds everything together.",21:"Scandium makes stadium lights blazingly bright. That wall of light at a big game? Scandium. Your superpower? You make the biggest stages shine.",22:"Titanium is the superhero metal. Rockets, jets, artificial bones. Almost NOTHING breaks it. Your superpower? You are unbreakable.",23:"Vanadium toughens steel for tools and jet engines. Mix it in and metal becomes way stronger. Your superpower? You make everything around you tougher.",24:"Chromium makes everything shiny! Chrome bumpers, mirror finishes, stainless steel. Your superpower? You bring brilliance to the world.",25:"Manganese stops rust. Without it, train tracks crumble and bridges fall. Your superpower? You prevent things from breaking down.",26:"Iron holds up bridges AND carries oxygen in your blood. Right now, Iron is flowing through {name}. Your superpower? You are strength, inside and out.",27:"Cobalt paints the deepest, most gorgeous blue. For thousands of years, that perfect blue. Your superpower? You create beauty that lasts forever.",28:"Nickel is in every nickel coin. Smooth, strong, humble. Never rusts, never tarnishes. Your superpower? Reliable, steady, always there.",29:"Copper carries electricity through every wire and charger. Every light that turns on ran through Copper. Your superpower? You deliver power to the world.",30:"Zinc heals cuts and scrapes. Got a boo-boo? Zinc fixes it. Also in sunscreen. Your superpower? You heal and protect.",31:"Gallium melts in your hand! Liquid metal puddle. Then solid again. Your superpower? You transform between solid and liquid at will."};
    document.getElementById('iTitle').textContent='Your Element Superpower';
    speech.textContent=T(BS[P.bday]||buddy.story);
    card.style.background=fc.bg;card.style.border='2px solid '+fc.c;
    card.innerHTML='<div class="ic-emoji" style="font-size:2.8rem">'+buddy.e+'</div><div class="ic-sym" style="color:'+fc.c+';text-shadow:0 0 24px '+fc.gl+';font-size:3.6rem">'+buddy.s+'</div><div class="ic-name" style="font-size:1.1rem">'+buddy.n+'</div><div style="font-family:Quicksand,sans-serif;font-size:.6rem;color:'+fc.c+';font-weight:700;margin-top:4px">YOUR ELEMENT BUDDY</div>';
    card.classList.add('show');
    discover(buddy.num);discoverFam(buddy.f);speakName(buddy.n);
    playTone(523,'sine',.15,.1);setTimeout(function(){playTone(659,'sine',.15,.1)},120);setTimeout(function(){playTone(784,'sine',.15,.1)},240);setTimeout(function(){playTone(1047,'sine',.2,.12)},380);setTimeout(function(){playTone(1319,'sine',.25,.12)},520);
    setTimeout(function(){bigBurst(innerWidth/2,innerHeight/2-40,'#FFD54F');bigBurst(innerWidth/2,innerHeight/2-40,fc.c)},300);
    btn.textContent='Meet My First 5 →';
  }else if((introStep===2&&hasBuddy)||(introStep===1&&!hasBuddy)){
    document.getElementById('iTitle').textContent='Your First 5 Elements';
    speech.textContent=T("There are 118 elements in my world, {name}. I am going to introduce you to your first 5 right now. These are your Starters. After that, you will explore the rest on your own. Ready?");
    card.innerHTML='';card.classList.remove('show');card.style.background='transparent';card.style.border='none';
    btn.textContent='Find Hydrogen →';
  }else{
    var offset=hasBuddy?3:2;
    var elIdx=introStep-offset;
    if(elIdx>=0&&elIdx<5){
      var seq=INTRO_SEQ[elIdx];var el=EL[seq.num];var fc2=F[el.f];
      document.getElementById('iTitle').textContent='Element '+(elIdx+1)+' of 5';
      speech.textContent=T(seq.speech);
      card.style.background=fc2.bg;card.style.border='1.5px solid '+fc2.bd;
      card.innerHTML='<div class="ic-emoji">'+el.e+'</div><div class="ic-sym" style="color:'+fc2.c+';text-shadow:0 0 20px '+fc2.gl+'">'+el.s+'</div><div class="ic-name">'+el.n+'</div>';
      card.classList.add('show');discover(seq.num);discoverFam(el.f);speakName(el.n);playDiscover();
      if(elIdx<4)btn.textContent='Next Element →';
      else btn.textContent="Let's Explore!";
    }else{
      state.intro=true;saveAll();
      document.getElementById('intro').classList.add('done');document.getElementById('app').classList.remove('hidden');
      setTimeout(function(){document.getElementById('intro').style.display='none'},600);
      updatePower();renderAll();updateTabLocks();renderBuddy();
      setTimeout(function() {
        if (!state.journeyFirstOpen) {
          document.getElementById('mspText').textContent =
            T('\uD83D\uDC09 Eternatus: "Psst, {name}... when you are ready, I have QUESTS for us! Look for the Quests tab!"');
          if (typeof triggerExcited === 'function') triggerExcited();
        }
      }, 8000);
    }
  }
}

// ═══════════════════════════════════════
// LEVEL TABS
// ═══════════════════════════════════════
function initLevelTabs(){
  document.getElementById('ltabs').onclick=function(e){
    var tab=e.target.closest('.ltab');if(!tab)return;var lv=tab.dataset.lv;
    // Journeys tab always shows the journey screen
    if(lv==='journeys'){showJourneyScreen();return;}
    // Leaving any journey state when switching to a normal tab
    if(activeJourney){
      activeJourney=null;
      document.getElementById('journeyHeader').classList.add('hidden');
    }
    if(lv===curLv)return;
    if(lv==='2'&&!megaOK()){
      var n=20-E.filter(function(el){return el.l1&&isDisc(el.num)}).length;
      document.getElementById('mspText').textContent=T('Not yet, {name}! Discover '+n+' more Starters to unlock Mega Evolution!');
      playTone(200,'square',.1,.06);playRumble();return;
    }
    curLv=lv;curFam='all';
    document.querySelectorAll('.ltab').forEach(function(t){t.classList.remove('active')});
    tab.classList.add('active');
    document.getElementById('fbio').classList.remove('show');
    var showGrid=lv==='1'||lv==='2';
    document.getElementById('grid').classList.toggle('hidden',!showGrid);
    document.getElementById('ftabs').classList.toggle('hidden',!showGrid);
    document.getElementById('cnt').classList.toggle('hidden',!showGrid);
    document.getElementById('dmap').classList.toggle('hidden',lv!=='map');
    document.getElementById('eotd').classList.toggle('hidden',lv!=='eotd');
    document.getElementById('profile').classList.toggle('hidden',lv!=='profile');
    document.getElementById('journeyScreen').classList.add('hidden');
    if(showGrid){renderAll();if(lv==='1')updateArcBanner();else document.getElementById('arcBanner').classList.add('hidden')}
    if(lv==='map'){renderMap();document.getElementById('arcBanner').classList.add('hidden')}
    if(lv==='eotd'){renderEOTD();playEOTDShimmer()}
    if(lv==='profile')renderProfile();
    updateMascot('all');updatePower();
    if(lv==='2')playMegaSwitch();else playTone(440,'sine',.08);
  };
}

// ═══════════════════════════════════════
// JOURNEY UI
// ═══════════════════════════════════════
function showJourneyScreen(){
  activeJourney=null;
  curLv='journeys';
  document.querySelectorAll('.ltab').forEach(function(t){t.classList.remove('active')});
  var jt=document.querySelector('.ltab[data-lv="journeys"]');if(jt)jt.classList.add('active');
  document.getElementById('grid').classList.add('hidden');
  document.getElementById('ftabs').classList.add('hidden');
  document.getElementById('cnt').classList.add('hidden');
  document.getElementById('dmap').classList.add('hidden');
  document.getElementById('eotd').classList.add('hidden');
  document.getElementById('profile').classList.add('hidden');
  document.getElementById('fbio').classList.remove('show');
  document.getElementById('arcBanner').classList.add('hidden');
  document.getElementById('journeyHeader').classList.add('hidden');
  document.getElementById('journeyScreen').classList.remove('hidden');
  renderJourneyScreen();
  updatePower();
  playTone(440,'sine',.08);
  if(!state.journeyFirstOpen){
    state.journeyFirstOpen=true;saveAll();
    document.getElementById('mspText').textContent='🐉 Eternatus: "Oh! I have ADVENTURES for us! Pick one!"';
    triggerExcited();
  }
}

function renderJourneyScreen(){
  var s=document.getElementById('journeyScreen');
  var html='<div class="jr-rank"><div class="jr-rank-label">'+getRankDisplay()+'</div><div class="jr-rank-sub">YOUR CURRENT RANK</div></div>';
  html+='<div class="jr-section-header">Wonder Paths</div>';
  WONDER_PATHS.forEach(function(path){
    var found=path.elements.filter(function(n){return isDisc(n)}).length;
    var total=path.elements.length;
    var done=state.journeys.completed.includes(path.id);
    var pct=Math.round(found/total*100);
    html+='<div class="jpath-card'+(done?' jpath-done':'')+'" data-pathid="'+path.id+'">';
    html+='<div class="jpc-emoji">'+path.emoji+'</div>';
    html+='<div class="jpc-body"><div class="jpc-title">'+path.title+'</div>';
    if(done){html+='<div class="jpc-badge">'+path.badge+' '+path.badgeTitle+'</div>';html+='<button class="jpc-map-btn" data-viewmap="'+path.id+'">🗺️ View on Map</button>';}
    else{html+='<div class="jpc-prog-wrap"><div class="jpc-prog-bar"><div class="jpc-prog-fill" style="width:'+pct+'%"></div></div><div class="jpc-prog-text">'+found+' of '+total+'</div></div>';}
    html+='</div><div class="jpc-arrow">'+(done?'✓':'→')+'</div></div>';
  });
  // Detective Trails (locked)
  html+='<div class="jr-locked-section"><div class="jrl-card"><div class="jrl-emoji">🔍</div><div class="jrl-body"><div class="jrl-title">DETECTIVE TRAILS</div><div class="jrl-cond">Discover 30 elements and complete 2 Wonder Paths to unlock</div></div><div class="jrl-lock">🔒</div></div></div>';
  // Inventor Labs (locked, more dim)
  html+='<div class="jr-locked-section" style="opacity:.4"><div class="jrl-card"><div class="jrl-emoji">⚡</div><div class="jrl-body"><div class="jrl-title">INVENTOR LABS</div><div class="jrl-cond">Reach Detective rank first</div></div><div class="jrl-lock">🔒</div></div></div>';
  // Earned badges
  var earned=WONDER_PATHS.filter(function(p){return state.journeys.completed.includes(p.id)});
  if(earned.length>0){
    html+='<div class="jr-badges-section"><div class="jr-section-header">My Badges</div><div class="jr-badges">';
    earned.forEach(function(p){html+='<div class="jr-badge-item"><div class="jr-badge-emoji">'+p.badge+'</div><div class="jr-badge-name">'+p.badgeTitle+'</div></div>';});
    html+='</div></div>';
    html+='<div class="jr-constellation-link" id="jrMapLink">🗺️ View your Constellation Map</div>';
  }
  s.innerHTML=html;
  s.querySelectorAll('.jpath-card').forEach(function(card){
    card.onclick=function(){enterJourney(card.dataset.pathid);};
  });
  // "View on Map" buttons — navigate to Dragon's Map and enter constellation mode for that path
  s.querySelectorAll('[data-viewmap]').forEach(function(btn){
    btn.onclick=function(e){
      e.stopPropagation();
      var pid=btn.dataset.viewmap;
      curLv='map';
      document.querySelectorAll('.ltab').forEach(function(t){t.classList.remove('active')});
      var mapTab=document.querySelector('.ltab[data-lv="map"]');if(mapTab)mapTab.classList.add('active');
      document.getElementById('journeyScreen').classList.add('hidden');
      document.getElementById('grid').classList.add('hidden');
      document.getElementById('ftabs').classList.add('hidden');
      document.getElementById('cnt').classList.add('hidden');
      document.getElementById('eotd').classList.add('hidden');
      document.getElementById('profile').classList.add('hidden');
      document.getElementById('arcBanner').classList.add('hidden');
      document.getElementById('dmap').classList.remove('hidden');
      renderMap();
      playTone(440,'sine',.08);
      setTimeout(function(){if(typeof enterConstellationMode==='function')enterConstellationMode(pid);},150);
    };
  });
  // "View your Constellation Map" link — open map and show all threads
  var mapLink=s.querySelector('#jrMapLink');
  if(mapLink){
    mapLink.onclick=function(){
      curLv='map';
      document.querySelectorAll('.ltab').forEach(function(t){t.classList.remove('active')});
      var mapTab=document.querySelector('.ltab[data-lv="map"]');if(mapTab)mapTab.classList.add('active');
      document.getElementById('journeyScreen').classList.add('hidden');
      document.getElementById('grid').classList.add('hidden');
      document.getElementById('ftabs').classList.add('hidden');
      document.getElementById('cnt').classList.add('hidden');
      document.getElementById('eotd').classList.add('hidden');
      document.getElementById('profile').classList.add('hidden');
      document.getElementById('arcBanner').classList.add('hidden');
      document.getElementById('dmap').classList.remove('hidden');
      renderMap();
      playTone(440,'sine',.08);
      setTimeout(function(){if(typeof enterConstellationModeAll==='function')enterConstellationModeAll();},150);
    };
  }
}

function enterJourney(pathId){
  var path=WONDER_PATHS.find(function(p){return p.id===pathId});if(!path)return;
  activeJourney=pathId;
  state.journeys.active=pathId;saveAll();
  curLv='2';curFam='all'; // Use all-elements level so journey elements (l1+l2) all render
  document.querySelectorAll('.ltab').forEach(function(t){t.classList.remove('active')});
  var jt=document.querySelector('.ltab[data-lv="journeys"]');if(jt)jt.classList.add('active');
  document.getElementById('journeyScreen').classList.add('hidden');
  document.getElementById('journeyHeader').classList.remove('hidden');
  document.getElementById('grid').classList.remove('hidden');
  document.getElementById('ftabs').classList.add('hidden');
  document.getElementById('cnt').classList.remove('hidden');
  document.getElementById('arcBanner').classList.add('hidden');
  document.getElementById('dmap').classList.add('hidden');
  document.getElementById('eotd').classList.add('hidden');
  document.getElementById('profile').classList.add('hidden');
  document.getElementById('fbio').classList.remove('show');
  document.getElementById('journeyTitle').textContent=path.emoji+' '+path.title;
  document.getElementById('journeyQuestion').textContent=path.question;
  updateJourneyProgress(path);
  renderCards();updateCount();
  document.getElementById('mspText').textContent='🐉 Eternatus: "'+path.dragonLine+'"';
  triggerExcited();
  document.getElementById('journeyBack').onclick=function(){showJourneyScreen();};
  playTone(440,'sine',.08);updatePower();
}

function updateJourneyProgress(path){
  var found=path.elements.filter(function(n){return isDisc(n)}).length;
  var el=document.getElementById('journeyProg');
  if(el)el.textContent=found+' of '+path.elements.length+' discovered';
}

function showJourneyComplete(path){
  var ov=document.getElementById('journeyComplete');if(!ov)return;
  document.getElementById('jcEmoji').textContent=path.emoji;
  document.getElementById('jcRevelation').textContent=path.revelation;
  document.getElementById('jcBadge').innerHTML='<span class="jcb-emoji">'+path.badge+'</span><span class="jcb-title">'+path.badgeTitle+'</span>';
  ov.classList.add('active');
  document.getElementById('mspText').textContent='🐉 Eternatus: "You did it! You\'re a '+path.badgeTitle+' now!"';
  triggerExcited();
  // Reuse celebration audio
  playTone(523,'sine',.15);setTimeout(function(){playTone(659,'sine',.15)},100);
  setTimeout(function(){playTone(784,'sine',.18)},220);setTimeout(function(){playTone(1047,'sine',.22)},380);
  for(var i=0;i<4;i++)(function(idx){setTimeout(function(){bigBurst(innerWidth/2+(Math.random()*120-60),innerHeight/2+(Math.random()*80-40),'#E8AF38')},idx*200)})(i);
  document.getElementById('jcBtn').onclick=function(){
    ov.classList.remove('active');
    activeJourney=null;
    // Switch to Dragon's Map to reveal the new constellation thread
    curLv='map';
    document.querySelectorAll('.ltab').forEach(function(t){t.classList.remove('active')});
    var mapTab=document.querySelector('.ltab[data-lv="map"]');if(mapTab)mapTab.classList.add('active');
    document.getElementById('grid').classList.add('hidden');
    document.getElementById('ftabs').classList.add('hidden');
    document.getElementById('cnt').classList.add('hidden');
    document.getElementById('journeyScreen').classList.add('hidden');
    document.getElementById('journeyHeader').classList.add('hidden');
    document.getElementById('eotd').classList.add('hidden');
    document.getElementById('profile').classList.add('hidden');
    document.getElementById('arcBanner').classList.add('hidden');
    document.getElementById('dmap').classList.remove('hidden');
    renderMap();
    // First-time reward: auto-enter constellation mode for this journey
    setTimeout(function(){
      if(typeof enterConstellationMode==='function'){
        enterConstellationMode(path.id);
        if(state.wonderPathsCompleted>=2){
          setTimeout(function(){document.getElementById('mspText').textContent='🐉 Eternatus: "I think you\'re getting SMARTER. I can feel it."'},3000);
        }
      }
    },400);
  };
}

// ═══════════════════════════════════════
// INIT
// ═══════════════════════════════════════
function initApp(){
  mkStars();
  initDragon();

  // Wire up modal close
  document.getElementById('mx').onclick=closeModal;
  document.getElementById('mov').onclick=function(e){if(e.target.id==='mov')closeModal()};

  // Wire up share close
  document.getElementById('shareClose').onclick=function(){document.getElementById('shareOv').classList.remove('active')};

  // Wire up reset buttons
  document.getElementById('resetCancel').onclick=function(){document.getElementById('resetConfirm').classList.add('hidden')};
  document.getElementById('resetYes').onclick=function(){localStorage.removeItem(SK);location.reload()};

  // Wire up toast click
  document.getElementById('toast').onclick=function(){this.classList.remove('show')};

  // Wire up buddy tap
  document.getElementById('buddyWrap').onclick=function(){onBuddyTap()};

  // Wire up level tabs
  initLevelTabs();

  runWelcome();

  if(state.intro){
    renderAll();updateMascot('all');updateTabLocks();updateArcBanner();
    checkWelcomeBack();checkWildElement();renderBuddy();checkNightShift();checkBirthdayMessage();
    document.getElementById('achTitle').textContent=getAchTitle();
  }
}

// Start when DOM is ready
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',initApp);
}else{
  initApp();
}
