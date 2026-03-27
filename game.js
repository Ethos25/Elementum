// ═══════════════════════════════════════
// LOAD ORDER: journeys-data.js → elements-data.js → sound.js → game.js
//
// PROVIDES (globals used by other files):
//   state, P, SK        — persisted game state, profile, localStorage key
//   T(s)                — token replacement ({name}, {toy}, etc.)
//   discover(n)         — mark element n discovered; returns true if new
//   discoverFam(f)      — mark family f discovered; returns true if new
//   isDisc(n)           — boolean: is element n discovered?
//   saveAll()           — persist state + profile to localStorage
//   checkAch()          — evaluate achievement conditions
//   getAchTitle()       — current rank title string
//   checkMega()         — unlock Mega Evolution if threshold met
//   checkArcComplete()  — check/advance story arc progress
//   updateArcBanner()   — refresh arc progress in dragon speech + pwr label
//   updateTabLocks()    — lock/unlock tabs based on progress
//   checkWelcomeBack()  — show welcome-back greeting after 4+ hour gap
//   getRankDisplay()    — formatted rank string for profile tab
//   T(s)                — personalisation token substitution
//   spawnMeteorShower() — radiant element celebration effect
//   clearMeteorShower() — clean up meteor shower elements
//   shakeScreen()       — brief CSS screen shake
//   isBirthdayWeek()    — true if within 3 days of profile birthday
//
// CONSUMES (from other files):
//   E[], EL, F          — elements-data.js
//   WONDER_PATHS        — journeys-data.js
//   playTone()          — sound.js
//   playFamilySound()   — sound.js
//   playDiscover()      — sound.js
//   triggerExcited()    — dragon.js
//   dgOnAchievement()   — dragon.js  (guarded: DS.initialized check)
//   DS                  — dragon.js  (guarded: typeof DS check)
//   dgSetEyes()         — dragon.js  (guarded)
//   dgEmitSparks()      — dragon.js  (guarded)
//   renderAll()         — ui.js      (called after mega/arc events)
//   updateJourneyProgress(), showJourneyComplete() — ui.js (guarded)
// ═══════════════════════════════════════
// PERSONALIZATION
// ═══════════════════════════════════════
var SK='elementum_v2';
var P={name:'Explorer',toy:'blanket',food:'',pet:'',color:'',bday:0};
var state;

function loadAll(){
  try{var d=JSON.parse(localStorage.getItem(SK))||{};state=d.state||{};P=d.profile||P}catch(e){state={}}
  if(!state.disc)state.disc=[];if(!state.fams)state.fams=[];if(!state.intro)state.intro=false;
  if(!state.megaUnlocked)state.megaUnlocked=false;if(!state.achShown)state.achShown=[];
  if(!state.matchesPlayed)state.matchesPlayed=0;if(!state.matchesCorrect)state.matchesCorrect=0;if(!state.firstDiscTime)state.firstDiscTime=null;
  if(!state.currentArc)state.currentArc=0;if(!state.arcComplete)state.arcComplete=[];
  if(!state.lastVisit)state.lastVisit=Date.now();if(!state.sessionDisc)state.sessionDisc=[];
  if(!state.megaTourDone)state.megaTourDone=false;if(!state.lastWild)state.lastWild=0;
  if(!state.radiants)state.radiants=[];if(!state.whispersShown)state.whispersShown=[];
  if(!state.combosReacted)state.combosReacted=[];if(!state.secret119)state.secret119=false;
  // Journey system (V1)
  if(!state.rank)state.rank='explorer';
  if(!state.journeys)state.journeys={completed:[],active:null,progress:{}};
  if(!state.wonderPathsCompleted)state.wonderPathsCompleted=0;
  if(!state.detectiveTrailsCompleted)state.detectiveTrailsCompleted=0;
  if(!state.detectiveQuizAvg)state.detectiveQuizAvg=0;
  if(state.journeyFirstOpen===undefined)state.journeyFirstOpen=false;
}

function saveAll(){
  try{localStorage.setItem(SK,JSON.stringify({state:state,profile:P}))}catch(e){}
}

function isDisc(n){return state.disc.includes(n)}

// ═══════════════════════════════════════
// JOURNEY PROGRESS
// ═══════════════════════════════════════
function checkJourneyProgress(num){
  if(typeof WONDER_PATHS==='undefined')return;
  WONDER_PATHS.forEach(function(path){
    if(state.journeys.completed.includes(path.id))return;
    if(!path.elements.includes(num))return;
    // Update journey header display if currently viewing this path
    if(typeof updateJourneyProgress==='function'&&typeof activeJourney!=='undefined'&&activeJourney===path.id){
      updateJourneyProgress(path);
    }
    // Check if all elements are discovered
    var allDone=path.elements.every(function(n){return isDisc(n)});
    if(allDone){
      state.journeys.completed.push(path.id);
      state.wonderPathsCompleted=state.journeys.completed.length;
      state.journeys.active=null;
      saveAll();
      setTimeout(function(){
        if(typeof showJourneyComplete==='function')showJourneyComplete(path);
      },600);
    }
  });
}

// ═══════════════════════════════════════
// RANK SYSTEM
// ═══════════════════════════════════════
function getRankDisplay(){
  var r=state.rank||'explorer';
  if(r==='detective')return '🔍 Detective';
  if(r==='inventor')return '⚡ Inventor';
  return '🔭 Explorer';
}

function discover(n){
  if(!isDisc(n)){state.disc.push(n);if(!state.firstDiscTime)state.firstDiscTime=Date.now();saveAll();if(typeof WONDER_PATHS!=='undefined')checkJourneyProgress(n);return true}
  return false;
}

function isFamDisc(f){return state.fams.includes(f)}

function discoverFam(f){
  if(!isFamDisc(f)){state.fams.push(f);saveAll();return true}
  return false;
}

// Color to element mapping
var COLOR_MAP={
  red:{el:'Strontium',s:'Sr',n:38,why:'makes red fireworks'},
  blue:{el:'Cobalt',s:'Co',n:27,why:'creates the deepest blue paint'},
  green:{el:'Chromium',s:'Cr',n:24,why:'makes emeralds green and chrome shine'},
  yellow:{el:'Sulfur',s:'S',n:16,why:'is bright yellow and found in volcanoes'},
  purple:{el:'Iodine',s:'I',n:53,why:'turns gorgeous purple when heated'},
  orange:{el:'Copper',s:'Cu',n:29,why:'glows orange when heated'},
  pink:{el:'Cobalt',s:'Co',n:27,why:'makes pink glass'},
  white:{el:'Titanium',s:'Ti',n:22,why:'makes the whitest white paint'},
  gold:{el:'Gold',s:'Au',n:79,why:'IS your favorite color'},
  silver:{el:'Silver',s:'Ag',n:47,why:'IS your favorite color'}
};

function getColorElement(){
  var c=P.color.toLowerCase().trim();
  return COLOR_MAP[c]||null;
}

// Token replacement with all fields
function T(s){
  var r=s.replace(/\{name\}/g,P.name).replace(/\{toy\}/g,P.toy);
  if(P.food)r=r.replace(/\{food\}/g,P.food);else r=r.replace(/\{food\}/g,'your food');
  if(P.pet)r=r.replace(/\{pet\}/g,P.pet);else r=r.replace(/\{pet\}/g,'your pet');
  if(P.color)r=r.replace(/\{color\}/g,P.color);else r=r.replace(/\{color\}/g,'your favorite color');
  return r;
}

loadAll();

// ═══════════════════════════════════════
// ACHIEVEMENTS
// ═══════════════════════════════════════
var ACHS=[
  {c:5,t:'⚡ Atom Apprentice',m:'5 elements! You are an Atom Apprentice!'},
  {c:20,t:'🏆 Starter Champion',m:'ALL 20 Starters! You are a Starter Champion!'},
  {c:50,t:'🔬 Element Master',m:'50 elements! Element Master!'},
  {c:100,t:'🧪 Mega Scientist',m:'100! Mega Scientist!'},
  {c:118,t:'🐉 Eternal Dragon',m:'ALL 118! THE ETERNAL DRAGON!'}
];

function getAchTitle(){
  var t='';
  for(var i=0;i<ACHS.length;i++)if(state.disc.length>=ACHS[i].c)t=ACHS[i].t;
  return t;
}

function checkAch(){
  for(var i=0;i<ACHS.length;i++){
    var a=ACHS[i];
    if(state.disc.length>=a.c&&!state.achShown.includes(a.c)){
      state.achShown.push(a.c);saveAll();showCeleb(a.t);
      playTone(523,'sine',.12);setTimeout(function(){playTone(784,'sine',.15)},100);setTimeout(function(){playTone(1047,'sine',.2)},220);
      triggerExcited();if(typeof dgOnAchievement==='function'&&typeof DS!=='undefined'&&DS.initialized)setTimeout(dgOnAchievement,400);document.getElementById('mspText').textContent=a.m;
      // 118/118 FINALE
      if(a.c===118){setTimeout(function(){showFinale()},1500)}
      break;
    }
  }
  document.getElementById('achTitle').textContent=getAchTitle();
}

function showFinale(){
  var mc=document.getElementById('megaCeleb');
  document.getElementById('mcTitle').textContent='🐉 THE ETERNAL DRAGON 🐉';
  document.getElementById('mcSub').textContent=T('{name}... you did it. Every element. Every power. I am whole again for the first time in a thousand years. I am Eternatus, the Eternal Dragon. And you are my champion.');
  document.getElementById('mcBtn').textContent='I Am the Eternal Dragon';
  mc.classList.add('active');
  // Epic audio
  playTone(262,'sine',.2,.12);setTimeout(function(){playTone(330,'sine',.2,.12)},150);setTimeout(function(){playTone(392,'sine',.2,.12)},300);setTimeout(function(){playTone(523,'sine',.25,.12)},480);setTimeout(function(){playTone(659,'sine',.25,.12)},660);setTimeout(function(){playTone(784,'sine',.3,.12)},840);setTimeout(function(){playTone(1047,'sine',.4,.12)},1050);
  var cols=['#7DF9FF','#C792EA','#FFD54F','#66BB6A','#EF5350','#CE93D8','#FF7043','#5C6BC0'];
  for(var i=0;i<8;i++)(function(idx){setTimeout(function(){bigBurst(Math.random()*innerWidth,Math.random()*innerHeight,cols[idx])},idx*250)})(i);
  document.getElementById('mcBtn').onclick=function(){mc.classList.remove('active');document.getElementById('mbar').setAttribute('data-tier','5')};
}

// Mega gate
function startersOK(){return E.filter(function(el){return el.l1}).every(function(el){return isDisc(el.num)})}
function megaOK(){return state.megaUnlocked||startersOK()}

function checkMega(){
  if(!state.megaUnlocked&&startersOK()){state.megaUnlocked=true;saveAll();showMegaCeleb();return true}
  return false;
}

function showMegaCeleb(){
  var mc=document.getElementById('megaCeleb');
  document.getElementById('mcTitle').textContent='MEGA EVOLUTION UNLOCKED!';
  document.getElementById('mcSub').textContent=T('All 20 Starters discovered! Eternatus has evolved! The full periodic table of 118 elements awaits you, {name}.');
  document.getElementById('mcBtn').textContent='Enter Mega Evolution →';
  mc.classList.add('active');
  playTone(262,'sine',.15);setTimeout(function(){playTone(392,'sine',.15)},120);setTimeout(function(){playTone(523,'sine',.15)},240);setTimeout(function(){playTone(659,'sine',.2)},380);setTimeout(function(){playTone(784,'sine',.2)},520);setTimeout(function(){playTone(1047,'sine',.3)},680);
  var cols=['#7DF9FF','#C792EA','#FFD54F','#66BB6A','#EF5350'];
  for(var i=0;i<5;i++)(function(idx){setTimeout(function(){bigBurst(innerWidth/2+(Math.random()*100-50),innerHeight/2+(Math.random()*100-50),cols[idx])},idx*200)})(i);
  document.getElementById('mcBtn').onclick=function(){
    mc.classList.remove('active');curLv='2';curFam='all';
    document.querySelectorAll('.ltab').forEach(function(t){t.classList.remove('active')});
    document.querySelectorAll('.ltab')[1].classList.add('active');
    updateTabLocks();renderAll();updateMascot('all');runMegaTour();
  };
}

function updateTabLocks(){
  var tabs=document.querySelectorAll('.ltab');
  if(megaOK())tabs[1].classList.remove('locked');
  else{
    tabs[1].classList.add('locked');
    var n=20-E.filter(function(el){return el.l1&&isDisc(el.num)}).length;
    tabs[1].querySelector('.lc').textContent=n+' to unlock';
  }
}

// ═══════════════════════════════════════
// GUIDED FAMILY ARCS (L1)
// ═══════════════════════════════════════
var ARC_ORDER=[
  {fam:'lifemaker',title:'Chapter 1: The Life Makers',intro:"These are the building blocks of everything alive. You, me, trees, {toy}. Find them all and my life force returns!",done:"Life energy floods through me! The Life Makers are COMPLETE!"},
  {fam:'noble',title:'Chapter 2: The Glow Squad',intro:"My wings need their light back! The Glow Squad are loners who never react with anyone. But they GLOW! Find them!",done:"My wings shimmer with new light! The Glow Squad is COMPLETE!"},
  {fam:'explosion',title:'Chapter 3: The Explosion Squad',intro:"CAREFUL, {name}! These are dangerous. Drop them in water and BOOM! But I need their fire power. Can you handle it?",done:"FIRE POWER RESTORED! The Explosion Squad is COMPLETE! Stand back!"},
  {fam:'warrior',title:'Chapter 4: The Metal Warriors',intro:"My biggest army! These metals build everything. Bridges, coins, jewelry, rockets. I need ALL of them, {name}!",done:"My armor is UNBREAKABLE! The Metal Warriors are COMPLETE!"},
  {fam:'earth',title:'Chapter 5: Earth Builders',intro:"Strong and steady like the ground beneath your feet. I need this foundation, {name}!",done:"The ground trembles beneath me! Earth Builder power: RESTORED!"},
  {fam:'halfhalf',title:'Chapter 6: The Half-and-Halfs',intro:"The tricksters! Half metal, half not. They can't pick a side, but I need their cleverness!",done:"Both sides of my power unite! The trickster is MINE!"},
  {fam:'shifter',title:'Chapter 7: Shape Shifters',intro:"Sneaky metals that bend and change. Soft but very clever. I need this one, {name}!",done:"My form shifts and flows! Shape Shifter power: ABSORBED!"},
  {fam:'saltmaker',title:'Chapter 8: Salt Makers',intro:"Fierce and stinky! This one fights germs and never apologizes. The last piece of my Starter power!",done:"My breath burns with fierce energy! The Salt Maker is MINE!"}
];

function getArcL1Els(fam){return E.filter(function(el){return el.l1&&el.f===fam})}
function getArcRemaining(fam){return getArcL1Els(fam).filter(function(el){return !isDisc(el.num)})}
function getCurrentArc(){return state.currentArc<ARC_ORDER.length?ARC_ORDER[state.currentArc]:null}

function updateArcBanner(){
  document.getElementById('arcBanner').classList.add('hidden');
  var arc=getCurrentArc();
  if(!arc||curLv!=='1')return;
  var els=getArcL1Els(arc.fam);var found=els.filter(function(el){return isDisc(el.num)}).length;
  if(found>=els.length)return;
  document.getElementById('mspText').textContent=T(arc.intro);
  document.getElementById('pwrLabel').textContent=arc.title.split(':')[0]+': '+found+' of '+els.length+' found';
}

function checkArcComplete(){
  var arc=getCurrentArc();if(!arc)return false;
  var els=getArcL1Els(arc.fam);
  var allFound=els.every(function(el){return isDisc(el.num)});
  if(allFound&&!state.arcComplete.includes(arc.fam)){
    state.arcComplete.push(arc.fam);
    // Family completion celebration - FULL SCREEN
    var fc=F[arc.fam];
    showFamCeleb(arc.fam,fc.n+' COMPLETE!',T(arc.done),function(){
      state.currentArc++;saveAll();
      var next=getCurrentArc();
      if(next){
        document.getElementById('mspText').textContent=T(next.intro);
        updateArcBanner();
      }else{
        document.getElementById('arcBanner').classList.add('hidden');
      }
    });
    document.getElementById('mspText').textContent=T(arc.done);
    // Unique family audio
    var famAudio={lifemaker:[440,523,659,784],noble:[880,1047,1319,1568],explosion:[164.81,246.94,329.63,493.88],warrior:[330,440,523,659],earth:[260,330,392,523],halfhalf:[600,700,800,900],shifter:[500,600,700,840],saltmaker:[700,840,1000,1200]};
    var tones=famAudio[arc.fam]||[440,523,659,784];
    tones.forEach(function(f,i){setTimeout(function(){playTone(f,fc.audio[1]||'sine',.2,.12)},i*150)});
    triggerExcited();
    saveAll();return true;
  }
  return false;
}

// ═══════════════════════════════════════
// MEGA EVOLUTION MINI-TOUR
// ═══════════════════════════════════════
var MEGA_TOUR=[
  {num:3,speech:"Welcome to Mega Evolution! Meet Lithium. I power every battery in every device. The iPad? Me."},
  {num:60,speech:"Neodymium! From the Hidden Powers family. My magnets are inside every headphone and speaker you own."},
  {num:92,speech:"{name}: Uranium! The Radioactive Force. One tiny piece of me has more energy than TONS of coal. Welcome to the big leagues, {name}."}
];

function runMegaTour(){
  if(state.megaTourDone)return;state.megaTourDone=true;saveAll();
  var step=0;
  function advanceMT(){
    if(step>=MEGA_TOUR.length){return}
    var mt=MEGA_TOUR[step];var el=EL[mt.num];var fc=F[el.f];
    discover(el.num);discoverFam(el.f);
    document.getElementById('mspText').textContent=T(mt.speech);
    speakName(el.n);playFamilySound(el.f);triggerExcited();
    bigBurst(innerWidth/2,innerHeight/3,fc.c);
    step++;
    if(step<MEGA_TOUR.length)setTimeout(advanceMT,3000);
    else{setTimeout(function(){document.getElementById('mspText').textContent=T('98 more elements await you, {name}. Explore any family you want!');updatePower();renderAll()},3000)}
  }
  setTimeout(advanceMT,1500);
}

// ═══════════════════════════════════════
// WELCOME BACK
// ═══════════════════════════════════════
function checkWelcomeBack(){
  if(!state.intro||!state.firstDiscTime)return;
  var hours=(Date.now()-state.lastVisit)/3600000;
  state.lastVisit=Date.now();state.sessionDisc=[];saveAll();
  if(hours>=4){
    var remaining=118-state.disc.length;
    var wb=document.getElementById('wbReturn');
    var text=remaining>0?T('{name}! You\'re back! I missed you. We have '+remaining+' elements to go. Ready?'):T('{name}! The Eternal Dragon welcomes you back!');
    document.getElementById('wbReturnText').textContent='\uD83D\uDC09 Eternatus: "'+text+'"';
    wb.classList.remove('hidden');
    playTone(440,'sine',.1,.06);setTimeout(function(){playTone(660,'sine',.12,.06)},150);
    // Dragon physical welcome-back reaction
    if (typeof DS !== 'undefined' && DS.initialized) {
      dgSetEyes(5);
      setTimeout(function() {
        if (DS.mbar) {
          DS.mbar.classList.add('dg-wing-flap');
          setTimeout(function() {
            DS.mbar.classList.remove('dg-wing-flap');
            dgSetEyes(3.5);
          }, 1800);
        }
      }, 500);
      setTimeout(function() {
        dgEmitSparks(6, ['#7DF9FF', '#C792EA', '#FFD54F']);
      }, 300);
    }
    setTimeout(function(){wb.classList.add('hidden')},6000);
  }
}

// ═══════════════════════════════════════
// BIRTHDAY ELEMENT BUDDY
// ═══════════════════════════════════════
function getBuddyElement(){
  if(!P.bday||P.bday<1||P.bday>31)return null;
  return EL[P.bday]||null;
}

function renderBuddy(){
  var badge=document.getElementById('buddyBadge');var wrap=document.getElementById('buddyWrap');var el=getBuddyElement();
  if(!el){badge.classList.add('empty');badge.textContent='?';wrap.classList.remove('has-buddy');return}
  var fc=F[el.f];badge.classList.remove('empty');badge.textContent=el.e;
  badge.style.borderColor=fc.c;badge.style.background=fc.bg;wrap.classList.add('has-buddy');
}

function onBuddyTap(){
  var el=getBuddyElement();
  if(!el){document.getElementById('mspText').textContent='Set your birthday in a new quest to meet your Element Buddy!';return}
  var fc=F[el.f];var isFound=isDisc(el.num);
  if(!isFound){discover(el.num);discoverFam(el.f);updatePower();renderAll()}
  // Special buddy modal
  openModal(el,!isFound,false);
  // Override Eternatus text with buddy speech
  var etT=document.getElementById('meternText');
  if(isFound){
    etT.textContent='\u{1F49C} Eternatus: "'+T(el.n+' is YOUR element, {name}. Born on the '+P.bday+ordSuf(P.bday)+', atomic number '+el.num+'. You two are bonded forever.')+'"';
  }else{
    etT.textContent='\u{1F49C} Eternatus: "'+T('{name}... meet YOUR element. '+el.n+'. Born on the '+P.bday+ordSuf(P.bday)+', atomic number '+el.num+'. This one was always meant for you.')+'"';
    // Special buddy discovery audio
    playTone(523,'sine',.15,.1);setTimeout(function(){playTone(659,'sine',.15,.1)},120);setTimeout(function(){playTone(784,'sine',.15,.1)},240);setTimeout(function(){playTone(1047,'sine',.2,.12)},380);setTimeout(function(){playTone(1319,'sine',.25,.12)},520);
    bigBurst(innerWidth/2,innerHeight/3,fc.c);bigBurst(innerWidth/2,innerHeight/3,'#FFD54F');
    triggerExcited();
  }
  // Buddy-specific audio: 4-note personal melody
  var base=[262,330,392,523];var off=el.num%12;
  base.forEach(function(f,i){setTimeout(function(){playTone(f+off*10,'sine',.12,.06)},i*180)});
}

function ordSuf(n){
  var s=['th','st','nd','rd'];var v=n%100;
  return s[(v-20)%10]||s[v]||s[0];
}

// ═══════════════════════════════════════
// WILD ELEMENT SURPRISE
// ═══════════════════════════════════════
function checkWildElement(){
  if(!state.intro)return;
  var undiscovered=E.filter(function(el){return !isDisc(el.num)});
  if(undiscovered.length===0)return;
  var hours=(Date.now()-(state.lastWild||0))/3600000;
  if(hours<4)return;
  if(Math.random()>0.3)return;
  // Show wild banner
  var banner=document.getElementById('wildBanner');
  banner.classList.remove('hidden');
  document.getElementById('wildText').textContent='\u{1F409} Eternatus senses a wild element nearby!';
  playTone(200,'sine',.2,.05);setTimeout(function(){playTone(300,'sine',.2,.05)},200);setTimeout(function(){playTone(400,'sine',.15,.06)},400);
  // Stays until child taps Reveal
  document.getElementById('wildBtn').onclick=function(){
    state.lastWild=Date.now();saveAll();
    // Pick random undiscovered
    var pool=E.filter(function(el){return !isDisc(el.num)});
    var el=pool[Math.floor(Math.random()*pool.length)];
    var fc=F[el.f];
    discover(el.num);discoverFam(el.f);
    // Reveal animation in-place with close button
    banner.innerHTML='<div class="wild-reveal"><div class="wr-emoji">'+el.e+'</div><div class="wr-sym" style="color:'+fc.c+';text-shadow:0 0 20px '+fc.gl+'">'+el.s+'</div><div class="wr-name">'+el.n+'</div><div class="wr-speech">"\u26a1 A wild '+el.n+' appeared! '+el.fact+'"</div><button style="margin-top:10px;padding:8px 24px;border-radius:10px;border:none;font-family:Outfit,system-ui,sans-serif;font-size:.78rem;font-weight:600;cursor:pointer;background:rgba(255,255,255,.1);color:var(--t1)" id="wildClose">Got it! \u2192</button></div>';
    banner.style.borderColor=fc.bd;banner.style.background=fc.bg;
    speakName(el.n);playDiscover();
    bigBurst(banner.getBoundingClientRect().left+banner.offsetWidth/2,banner.getBoundingClientRect().top+30,fc.c);
    if(!state.sessionDisc)state.sessionDisc=[];state.sessionDisc.push(el.n);
    updatePower();updateArcBanner();
    // Stay until child taps close
    document.getElementById('wildClose').onclick=function(){
      banner.classList.add('hidden');
      banner.innerHTML='<div class="wild-text" id="wildText"></div><button class="wild-btn" id="wildBtn">Reveal \u2192</button>';
      checkAch();checkArcComplete();updateTabLocks();renderAll();
    };
  };
}

// ═══════════════════════════════════════
// EASTER EGG 1: RADIANT ELEMENTS (7% on revisit)
// ═══════════════════════════════════════
function isRadiant(){return Math.random()<0.07}

function shakeScreen(){
  var el=document.body;el.style.transition='none';
  var shakes=[[-4,-2],[6,3],[-3,5],[5,-4],[-6,2],[3,-3],[-2,4],[4,-2],[-3,1],[2,-3],[0,0]];
  shakes.forEach(function(s,i){
    setTimeout(function(){el.style.transform='translate('+s[0]+'px,'+s[1]+'px)'},i*40);
  });
  setTimeout(function(){el.style.transform='';el.style.transition=''},500);
}

function spawnMeteorShower(){
  var container=document.createElement('div');container.className='meteor-shower';document.body.appendChild(container);
  var colors=['#FFD93D','#FF6B6B','#7DF9FF','#C792EA','#6BCB77','#4D96FF','#FF7043','#fff','#E040FB','#FFAB40'];

  // SCREEN SHAKE on impact
  shakeScreen();

  // PHASE 1: BRIGHT screen flash (0ms)
  var flash=document.createElement('div');flash.className='radiant-flash';
  flash.style.background='linear-gradient(135deg,rgba(255,217,61,.3),rgba(125,249,255,.2),rgba(199,146,234,.2))';
  document.body.appendChild(flash);

  // PHASE 2: 7 shockwave rings (0-840ms)
  for(var r=0;r<7;r++){
    (function(idx){
      setTimeout(function(){
        var ring=document.createElement('div');ring.className='radiant-ring';
        var rc=['#FFD93D','#7DF9FF','#C792EA','#FF6B6B','#6BCB77','#fff','#E040FB'];
        ring.style.cssText='top:40%;left:50%;width:'+(120+idx*70)+'px;height:'+(120+idx*70)+'px;border-color:'+rc[idx]+';border-width:3px';
        document.body.appendChild(ring);
        setTimeout(function(){ring.remove()},1000);
      },idx*120);
    })(r);
  }

  // PHASE 3: 35 meteors (200ms - 2000ms)
  for(var i=0;i<35;i++){
    (function(idx){
      setTimeout(function(){
        var m=document.createElement('div');m.className='meteor';
        var c=colors[Math.floor(Math.random()*colors.length)];
        var startX=Math.random()*120-10;
        var dur=0.4+Math.random()*0.8;
        var mx=60+Math.random()*300;
        var my=200+Math.random()*600;
        var sz=3+Math.random()*4;
        m.style.cssText='left:'+startX+'%;top:-10px;color:'+c+';background:'+c+';box-shadow:0 0 10px '+c+',0 0 20px '+c+';--mx:'+mx+'px;--my:'+my+'px;animation-duration:'+dur+'s;width:'+sz+'px;height:'+sz+'px';
        container.appendChild(m);
      },200+idx*55);
    })(i);
  }

  // PHASE 4: FIRST confetti wave — 60 pieces launching UP from bottom (500ms)
  for(var j=0;j<60;j++){
    (function(idx){
      setTimeout(function(){
        var conf=document.createElement('div');
        var c=colors[Math.floor(Math.random()*colors.length)];
        var w=Math.random()*10+4;var h=Math.random()*8+3;
        var sx=Math.random()*innerWidth;
        var tx=(Math.random()-0.5)*500;
        var ty=-(150+Math.random()*400);
        var rot=Math.random()*1080-540;
        var dur=2+Math.random()*2;
        conf.style.cssText='position:fixed;left:'+sx+'px;bottom:-10px;width:'+w+'px;height:'+h+'px;background:'+c+';border-radius:'+(Math.random()>0.5?'50%':'2px')+';z-index:660;pointer-events:none;opacity:1;box-shadow:0 0 6px '+c+';animation:confettiBurst '+dur+'s cubic-bezier(.15,.8,.3,1) forwards';
        conf.style.setProperty('--ctx',tx+'px');
        conf.style.setProperty('--cty',ty+'px');
        conf.style.setProperty('--cr',rot+'deg');
        document.body.appendChild(conf);
        setTimeout(function(){conf.remove()},dur*1000+100);
      },500+idx*30);
    })(j);
  }

  // PHASE 5: 8 big particle bursts (300ms - 2500ms)
  for(var b=0;b<8;b++){
    (function(idx){
      setTimeout(function(){
        bigBurst(Math.random()*innerWidth,Math.random()*innerHeight*0.7,colors[Math.floor(Math.random()*colors.length)]);
      },300+idx*320);
    })(b);
  }

  // PHASE 6: Second screen flash + shake at peak (1500ms)
  setTimeout(function(){
    shakeScreen();
    var flash2=document.createElement('div');flash2.className='radiant-flash';
    flash2.style.background='linear-gradient(135deg,rgba(255,217,61,.35),rgba(255,107,107,.2))';
    document.body.appendChild(flash2);
    setTimeout(function(){flash2.remove()},700);
  },1500);

  // Cleanup (4 seconds total)
  setTimeout(function(){container.remove();flash.remove()},4000);
}

function applyRadiant(el){
  var hdr=document.getElementById('mhdr');hdr.classList.add('radiant');
  var info=hdr.querySelector('.m-info');
  if(info){var badge=document.createElement('div');badge.className='radiant-badge';badge.textContent='✨ RADIANT';info.insertBefore(badge,info.firstChild)}
  var etT=document.getElementById('meternText');
  var radiantLines=[
    'Whoa! A RADIANT '+el.n+'! Incredibly rare!',
    'The universe is shining on you! RADIANT '+el.n+'!',
    'I have not seen a Radiant in centuries! '+el.n+' is glowing!',
    'RADIANT! Only the luckiest explorers find these!',
    'The atoms are aligned! A RADIANT '+el.n+'!'
  ];
  etT.textContent='✨ Eternatus: "'+radiantLines[Math.floor(Math.random()*radiantLines.length)]+'"';
  if(!state.radiants.includes(el.num)){state.radiants.push(el.num);saveAll()}
  playRadiantSound();
  spawnMeteorShower();
}

function clearRadiant(){
  document.getElementById('mhdr').classList.remove('radiant');
  var b=document.querySelector('.radiant-badge');if(b)b.remove();
}

function clearMeteorShower(){
  document.querySelectorAll('.meteor-shower').forEach(function(el){el.remove()});
  document.querySelectorAll('.radiant-flash').forEach(function(el){el.remove()});
  document.querySelectorAll('.radiant-ring').forEach(function(el){el.remove()});
}

// ═══════════════════════════════════════
// EASTER EGG 2: ETERNATUS WHISPERS (lore at milestones)
// ═══════════════════════════════════════
var WHISPERS={
  15:{text:"Did you know, {name}? Before my powers were scattered, I could fly between stars."},
  30:{text:"I once met an element so rare it only existed for a millionth of a second. I still remember it."},
  45:{text:"The elements do not just have powers. They have memories. Carbon remembers every living thing it has ever been part of."},
  60:{text:"You are past the halfway mark. I can feel the old power coming back. My wings are spreading wider."},
  75:{text:"Most humans never learn what you already know, {name}. You are different."},
  90:{text:"Only 28 more. I can almost see the finish line. Can you feel it too?"},
  105:{text:"13 left. My heart is pounding. For the first time in a thousand years, I am nervous."}
};

function checkWhisper(){
  var count=state.disc.length;
  if(WHISPERS[count]&&!state.whispersShown.includes(count)){
    state.whispersShown.push(count);saveAll();
    document.getElementById('mspText').textContent=T('\uD83C\uDF1F '+WHISPERS[count].text);
    playTone(330,'sine',.2,.05);setTimeout(function(){playTone(440,'sine',.2,.05)},200);setTimeout(function(){playTone(523,'sine',.25,.06)},420);
  }
}

// ═══════════════════════════════════════
// EASTER EGG 3: COMBO DISCOVERY REACTIONS
// ═══════════════════════════════════════
function checkComboReaction(el){
  if(!el.cb||!el.cb.length)return null;
  for(var i=0;i<el.cb.length;i++){
    var combo=el.cb[i];
    var partnerName=combo.w;
    var partner=E.find(function(e){return e.n===partnerName||e.s===partnerName});
    if(partner&&isDisc(partner.num)){
      var key=Math.min(el.num,partner.num)+'-'+Math.max(el.num,partner.num);
      if(!state.combosReacted.includes(key)){
        state.combosReacted.push(key);saveAll();
        return 'Wait... you have BOTH '+el.n+' and '+partner.n+' now! Together they make '+combo.r+'! '+combo.eq+'!';
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════
// EASTER EGG 4: SECRET ELEMENT 119
// ═══════════════════════════════════════
function checkSecret119(){
  if(state.secret119)return;
  var allFams=Object.keys(F);
  var touched=allFams.every(function(f){return state.fams.includes(f)});
  if(touched){
    state.secret119=true;saveAll();
    setTimeout(function(){
      document.getElementById('mspText').textContent=T('\uD83D\uDD2E {name}... you have touched every family in my kingdom. Here is something most people never learn: the periodic table is not finished. Scientists are still trying to CREATE element 119. Maybe someday, {name}, YOU will be the one who finds it.');
      playTone(262,'sine',.2,.06);setTimeout(function(){playTone(392,'sine',.2,.06)},180);setTimeout(function(){playTone(523,'sine',.25,.08)},360);setTimeout(function(){playTone(784,'sine',.3,.1)},560);
    },1500);
  }
}

// ═══════════════════════════════════════
// EASTER EGG 5: BIRTHDAY WEEK
// ═══════════════════════════════════════
function isBirthdayWeek(){
  if(!P.bday)return false;
  var today=new Date().getDate();
  var diff=Math.abs(today-P.bday);
  if(diff>28)diff=31-diff;
  return diff<=3;
}

var birthdayMsgShown=false;

function getBirthdayParticleColor(){return isBirthdayWeek()?'#FFD93D':null}

function checkBirthdayMessage(){
  if(isBirthdayWeek()&&!birthdayMsgShown&&state.disc.length>5){
    birthdayMsgShown=true;
    setTimeout(function(){
      document.getElementById('mspText').textContent=T('\uD83C\uDF82 Birthday power is making me stronger, {name}!');
      playTone(523,'sine',.1,.08);setTimeout(function(){playTone(659,'sine',.1,.08)},80);setTimeout(function(){playTone(784,'sine',.12,.08)},160);setTimeout(function(){playTone(1047,'sine',.15,.1)},260);
    },3000);
  }
}

// ═══════════════════════════════════════
// EASTER EGG 6: NIGHT SHIFT
// ═══════════════════════════════════════
function checkNightShift(){
  var h=new Date().getHours();
  if(h>=20||h<6){
    var sf=document.getElementById('sf');
    for(var i=0;i<40;i++){
      var s=document.createElement('div');s.className='st';
      var z=Math.random()*3+1;
      s.style.cssText='width:'+z+'px;height:'+z+'px;left:'+Math.random()*100+'%;top:'+Math.random()*100+'%;--d:'+(Math.random()*2+1.5)+'s;--a:'+(Math.random()*.3+.2)+';--b:'+(Math.random()*.6+.4)+';animation-delay:'+Math.random()*2+'s';
      sf.appendChild(s);
    }
    if(state.intro){
      setTimeout(function(){
        document.getElementById('mspText').textContent=T('\uD83C\uDF19 The elements glow brighter at night, {name}. Perfect time to discover.');
      },2000);
    }
  }
}

// ═══════════════════════════════════════
// MATCH GAME (with reverse quiz)
// ═══════════════════════════════════════
function maybeMatch(){
  if(state.disc.length%5===0&&state.disc.length>0)setTimeout(function(){showMatch()},800);
}

function showMatch(){
  var disc=E.filter(function(el){return isDisc(el.num)});if(disc.length<4)return;
  var rev=((state.matchesPlayed||0)%2===1);
  var tgt=disc[Math.floor(Math.random()*disc.length)];
  var oth=disc.filter(function(el){return el.num!==tgt.num}).sort(function(){return Math.random()-.5}).slice(0,3);
  var opts=[tgt].concat(oth).sort(function(){return Math.random()-.5});
  var ov=document.getElementById('matchOv');
  playTone(294,'sine',.06,.1);setTimeout(function(){playTone(587,'sine',.08,.1)},80);
  var og=document.getElementById('matchOpts');og.innerHTML='';var ans=false;
  if(rev){
    document.getElementById('matchQ').textContent=T('Eternatus asks: What does '+tgt.n+' do?');
    opts.forEach(function(el){
      var d=document.createElement('div');d.className='match-opt';
      d.innerHTML='<div class="mo-emoji">'+el.e+'</div><div class="mo-name" style="font-size:.72rem">'+el.fact+'</div>';
      d.onclick=function(){if(!ans){ans=true;doMatch(d,el,tgt,opts,og,function(){ans=true})}};
      og.appendChild(d);
    });
  }else{
    document.getElementById('matchQ').textContent=T('Eternatus asks: Which element '+tgt.fact.toLowerCase().replace(/!$/,'')+'?');
    opts.forEach(function(el){
      var d=document.createElement('div');d.className='match-opt';
      d.innerHTML='<div class="mo-emoji">'+el.e+'</div><div class="mo-name">'+el.n+'</div>';
      d.onclick=function(){if(!ans){ans=true;doMatch(d,el,tgt,opts,og,function(){ans=true})}};
      og.appendChild(d);
    });
  }
  document.getElementById('matchRes').textContent='';
  document.getElementById('matchSkip').onclick=function(){ov.classList.remove('active');state.matchesPlayed=(state.matchesPlayed||0)+1;saveAll()};
  ov.classList.add('active');
}

function doMatch(d,el,tgt,opts,og,setA){
  setA();state.matchesPlayed=(state.matchesPlayed||0)+1;
  if(el.num===tgt.num){
    d.classList.add('correct');document.getElementById('matchRes').textContent='⚡ Correct!';
    playTone(659,'sine',.08,.1);setTimeout(function(){playTone(880,'sine',.1,.1)},80);setTimeout(function(){playTone(1047,'sine',.12,.1)},160);
    state.matchesCorrect=(state.matchesCorrect||0)+1;triggerExcited();
  }else{
    d.classList.add('wrong');document.getElementById('matchRes').textContent="That's "+el.n+'! Answer: '+tgt.n;
    playTone(200,'square',.08,.05);
    var children=Array.prototype.slice.call(og.children);
    children.forEach(function(c,i){if(opts[i].num===tgt.num)c.classList.add('correct')});
  }
  saveAll();setTimeout(function(){document.getElementById('matchOv').classList.remove('active')},2000);
}

// ═══════════════════════════════════════
// APP STATE
// ═══════════════════════════════════════
var curLv='1',curFam='all';

function getEls(){return curLv==='1'?E.filter(function(el){return el.l1}):E}
function getFams(){
  var els=getEls();
  var fs=new Set(els.map(function(el){return el.f}));
  return [{key:'all',name:curLv==='1'?'All Starters':'All 118'}].concat(Array.from(fs).map(function(k){return {key:k,name:F[k].n}}));
}
