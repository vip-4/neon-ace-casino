/* Neon Ace — European Roulette (歐式輪盤) Canvas 示範
 * 架構：OutcomeProvider(結果來源) / RouletteEngine(FSM+賠率) / WheelRenderer / GameLoop
 *
 * ⚠️ 安全邊界：本頁為虛擬籌碼展示。RNG 在前端以 Web Crypto 產生，僅供娛樂；
 * 真金/排名/兌換/跨裝置必須改為後端權威 RNG、派彩與簽章，前端僅演出與驗章。
 */
(function () {
  'use strict';

  var CFG = {
    START_BANKROLL: 1000,
    BETS: [10, 25, 50, 100],
    MAX_DPR: 2,
    FIXED_DT: 1 / 120,
    MAX_FRAME_DT: 0.05,
    MAX_SUBSTEPS: 8,
    SPIN_MIN: 4.2,
    SPIN_VAR: 1.4,
    REVEAL_HOLD: 2.0
  };
  var STATE = { BETTING: 'BETTING', SPINNING: 'SPINNING', REVEAL: 'REVEAL', SETTLE: 'SETTLE' };

  // 歐式輪盤輪序（單零）與顏色
  var WHEEL = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
  var RED = {1:1,3:1,5:1,7:1,9:1,12:1,14:1,16:1,18:1,19:1,21:1,23:1,25:1,27:1,30:1,32:1,34:1,36:1};

  function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
  function fmt(n){ var v=Math.round(n*100)/100; return Math.abs(v-Math.round(v))<0.001?String(Math.round(v)):v.toFixed(2); }
  function $(id){ return document.getElementById(id); }
  function randInt(max){
    var u=new Uint32Array(1);
    if(window.crypto&&window.crypto.getRandomValues) window.crypto.getRandomValues(u); else u[0]=Math.floor(Math.random()*4294967296);
    return u[0]%max;
  }
  function easeOutCubic(t){ var u=1-t; return 1-u*u*u; }

  var Sfx = {
    ctx:null,on:false,
    unlock:function(){ if(this.ctx){ if(this.ctx.state==='suspended') this.ctx.resume(); return; } var AC=window.AudioContext||window.webkitAudioContext; if(!AC) return; try{this.ctx=new AC();}catch(e){} },
    tick:function(){ if(!this.on||!this.ctx) return; try{var o=this.ctx.createOscillator(),v=this.ctx.createGain(); o.type='square'; o.frequency.value=900; v.gain.value=0.015; o.connect(v); v.connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime+0.02);}catch(e){} },
    win:function(){ if(!this.on||!this.ctx) return; try{var t=this.ctx.currentTime; [880,1100,1320].forEach(function(f,i){var o=Sfx.ctx.createOscillator(),v=Sfx.ctx.createGain(); o.type='sine'; o.frequency.value=f; v.gain.value=0.03; o.connect(v); v.connect(Sfx.ctx.destination); o.start(t+i*0.08); o.stop(t+i*0.08+0.09);});}catch(e){} },
    lose:function(){ if(!this.on||!this.ctx) return; try{var o=this.ctx.createOscillator(),v=this.ctx.createGain(); o.type='sine'; o.frequency.value=220; v.gain.value=0.03; o.connect(v); v.connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime+0.12);}catch(e){} }
  };

  function colorOf(n){ if(n===0) return 'green'; return RED[n]?'red':'black'; }

  // ---------- 引擎 ----------
  function Engine(){
    this.resetRound();
    this.bankroll=CFG.START_BANKROLL;
    this.stats={hands:0,won:0,best:CFG.START_BANKROLL};
  }
  Engine.prototype.resetRound=function(){
    this.state=STATE.BETTING;
    this.bets={}; // key -> amount; keys: n0-n36, red,black,odd,even,low,high,d1,d2,d3,c1,c2,c3
    this.resultNum=null; this.result=null; this.t=0; this.hold=0;
    this.spinAngle=0; this.spinStart=0; this.spinTarget=0; this.spinDur=0; this.ballAngle=0; this.lastTick=0;
  };
  Engine.prototype.totalBet=function(){ var s=0,k; for(k in this.bets) s+=this.bets[k]; return s; };
  Engine.prototype.canSpin=function(){ return this.state===STATE.BETTING && this.totalBet()>0 && this.totalBet()<=this.bankroll; };

  Engine.prototype.startSpin=function(){
    if(!this.canSpin()) return false;
    this.resultNum = randInt(37); // 0-36，歐式單零（展示用本地 RNG）
    var idx = WHEEL.indexOf(this.resultNum);
    var seg = (Math.PI*2)/WHEEL.length;
    // 目標：讓結果格停在指針（正上方）下方
    var targetPocketAngle = -Math.PI/2 + (idx + 0.5) * seg;
    var extraSpins = 5 + randInt(3);
    this.spinStart = this.spinAngle;
    this.spinDur = CFG.SPIN_MIN + Math.random()*CFG.SPIN_VAR;
    // 輪盤順時針轉，球視覺上可用相對角度；這裡簡化為輪盤角度插值到對準結果
    var current = this.spinAngle;
    var desired = targetPocketAngle;
    // 調整 desired 使其在 current 前方 extraSpins 圈
    while(desired <= current + Math.PI*2*extraSpins) desired += Math.PI*2;
    this.spinTarget = desired;
    this.state=STATE.SPINNING; this.t=0; this.lastTick=0;
    return true;
  };

  Engine.prototype.evalBets=function(n){
    var win=0, lose=0, wins=[];
    var col = n===0?0:((n-1)%3+1);
    var doz = n===0?0:(n<=12?1:(n<=24?2:3));
    var isRed = colorOf(n)==='red', isBlack=colorOf(n)==='black';
    var isEven = n!==0 && n%2===0, isOdd = n!==0 && n%2===1;
    var isLow = n>=1 && n<=18, isHigh = n>=19 && n<=36;
    var self=this;
    function settle(key, cond, mult, label){
      var amt=self.bets[key]||0; if(!amt) return;
      if(cond){ win += amt*mult; wins.push(label+' +'+fmt(amt*mult)); } else lose += amt;
    }
    // 直注
    for(var i=0;i<=36;i++) settle('n'+i, n===i, 35, '直注 '+i);
    settle('red', isRed, 1, '紅 Red');
    settle('black', isBlack, 1, '黑 Black');
    settle('odd', isOdd, 1, '單 Odd');
    settle('even', isEven, 1, '雙 Even');
    settle('low', isLow, 1, '1-18');
    settle('high', isHigh, 1, '19-36');
    settle('d1', doz===1, 2, '第1打');
    settle('d2', doz===2, 2, '第2打');
    settle('d3', doz===3, 2, '第3打');
    settle('c1', col===1, 2, '第1列');
    settle('c2', col===2, 2, '第2列');
    settle('c3', col===3, 2, '第3列');
    var net=Math.round((win-lose)*100)/100;
    this.bankroll=Math.round((this.bankroll+net)*100)/100;
    this.stats.hands++; if(net>0) this.stats.won++; if(this.bankroll>this.stats.best) this.stats.best=this.bankroll;
    this.result={n:n,color:colorOf(n),net:net,wins:wins};
    this.state=STATE.REVEAL; this.hold=0;
  };

  Engine.prototype.update=function(dt){
    if(this.state===STATE.SPINNING){
      this.t += dt;
      var p = clamp(this.t/this.spinDur,0,1);
      var e = easeOutCubic(p);
      this.spinAngle = this.spinStart + (this.spinTarget-this.spinStart)*e;
      // 球反向旋轉視覺（簡化）：用額外角度偏移繪製
      this.ballAngle = this.spinStart - (this.spinTarget-this.spinStart)*e*1.35;
      // 音效節奏隨速度變慢
      var speed = 1-e;
      var interval = 0.04 + (1-speed)*0.18;
      if(this.t - this.lastTick >= interval){ this.lastTick=this.t; Sfx.tick(); }
      if(p>=1){ this.spinAngle=this.spinTarget; this.evalBets(this.resultNum); }
    } else if(this.state===STATE.REVEAL){
      this.hold += dt;
      if(this.hold>=CFG.REVEAL_HOLD) this.state=STATE.SETTLE;
    }
  };

  // ---------- 繪製 ----------
  function Renderer(canvas){
    this.canvas=canvas; this.ctx=canvas.getContext('2d');
    this.dpr=1; this.w=720; this.h=360; this._lastW=-1; this._lastH=-1; this._lastDpr=-1;
  }
  Renderer.prototype.resize=function(wrapW){
    var cssW=Math.max(300,Math.min(760,wrapW)); var cssH=Math.round(cssW*0.5);
    var dpr=Math.min(window.devicePixelRatio||1,CFG.MAX_DPR);
    if(cssW===this._lastW && cssH===this._lastH && dpr===this._lastDpr) return; // 尺寸/DPR 未變則不重設，避免清空緩衝區
    this.dpr=dpr; this.w=cssW; this.h=cssH;
    var bw=Math.round(cssW*dpr), bh=Math.round(cssH*dpr);
    if(this.canvas.width!==bw) this.canvas.width=bw;
    if(this.canvas.height!==bh) this.canvas.height=bh;
    this.canvas.style.width=cssW+'px'; this.canvas.style.height=cssH+'px';
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
    this._lastW=cssW; this._lastH=cssH; this._lastDpr=dpr;
  };
  Renderer.prototype.render=function(eng){
    var c=this.ctx; c.setTransform(this.dpr,0,0,this.dpr,0,0);
    var g=c.createLinearGradient(0,0,0,this.h); g.addColorStop(0,'#102f24'); g.addColorStop(1,'#071713');
    c.fillStyle=g; c.fillRect(0,0,this.w,this.h);
    var cx=this.w*0.33, cy=this.h*0.52, R=Math.min(this.w,this.h)*0.36;
    this.drawWheel(c,cx,cy,R,eng);
    this.drawInfo(c,eng,cx,cy,R);
  };
  Renderer.prototype.drawWheel=function(c,cx,cy,R,eng){
    var n=WHEEL.length, seg=(Math.PI*2)/n;
    var angle=eng.spinAngle||0;
    // 外框
    c.save(); c.translate(cx,cy);
    c.beginPath(); c.arc(0,0,R+8,0,Math.PI*2); c.fillStyle='#3a2a06'; c.fill();
    c.beginPath(); c.arc(0,0,R+2,0,Math.PI*2); c.fillStyle='#0b1f19'; c.fill();
    for(var i=0;i<n;i++){
      var a0=angle+i*seg - Math.PI/2, a1=a0+seg, num=WHEEL[i];
      c.beginPath(); c.moveTo(0,0); c.arc(0,0,R,a0,a1); c.closePath();
      c.fillStyle = num===0?'#1f7a4d':(RED[num]?'#b3261e':'#17212b');
      c.fill(); c.strokeStyle='rgba(245,239,226,0.35)'; c.lineWidth=1; c.stroke();
      // 數字
      c.save();
      var mid=a0+seg/2; c.rotate(mid); c.translate(R*0.78,0); c.rotate(Math.PI/2);
      c.fillStyle='#f5efe2'; c.font='bold '+Math.max(9,Math.round(R*0.075))+'px system-ui,sans-serif';
      c.textAlign='center'; c.textBaseline='middle'; c.fillText(String(num),0,0);
      c.restore();
    }
    // 內圈
    c.beginPath(); c.arc(0,0,R*0.38,0,Math.PI*2); c.fillStyle='#0d2a21'; c.fill();
    c.strokeStyle='#e8c879'; c.lineWidth=2; c.stroke();
    c.fillStyle='#e8c879'; c.font='700 '+Math.round(R*0.16)+'px system-ui,sans-serif';
    c.textAlign='center'; c.textBaseline='middle'; c.fillText('0',0,2);
    // 球：繪製在相對輪盤位置（簡化：結果時對準，旋轉時沿軌道）
    var ballA = eng.state===STATE.SPINNING ? eng.ballAngle : angle;
    var idx = eng.resultNum!=null ? WHEEL.indexOf(eng.resultNum) : 0;
    var pocketA = angle + (idx+0.5)*seg - Math.PI/2;
    var drawA = eng.state===STATE.SPINNING ? ballA + (idx+0.5)*seg - Math.PI/2 : pocketA;
    var br = R*0.62;
    var bx = Math.cos(drawA)*br, by = Math.sin(drawA)*br;
    c.beginPath(); c.arc(bx,by,Math.max(4,R*0.045),0,Math.PI*2); c.fillStyle='#f5efe2'; c.fill();
    c.restore();
    // 指針
    c.save(); c.translate(cx,cy-R-2);
    c.fillStyle='#e8c879'; c.beginPath(); c.moveTo(0,14); c.lineTo(-7,0); c.lineTo(7,0); c.closePath(); c.fill();
    c.restore();
  };
  Renderer.prototype.drawInfo=function(c,eng,cx,cy,R){
    var x=this.w*0.62, w=this.w*0.34;
    c.fillStyle='rgba(13,42,33,0.7)'; c.fillRect(x-10, this.h*0.12, w+20, this.h*0.76);
    c.strokeStyle='rgba(232,200,121,0.25)'; c.strokeRect(x-10, this.h*0.12, w+20, this.h*0.76);
    c.textAlign='left'; c.fillStyle='#e8c879'; c.font='700 18px system-ui,sans-serif';
    c.fillText('歐式輪盤 Roulette', x, this.h*0.22);
    c.fillStyle='#a9c3b7'; c.font='14px system-ui,sans-serif';
    var msg='下注後按「旋轉」';
    if(eng.state===STATE.SPINNING) msg='轉盤中…';
    else if(eng.result){ var col=eng.result.color==='red'?'紅':(eng.result.color==='black'?'黑':'綠'); msg='開出 '+eng.result.n+'（'+col+'）'; }
    c.fillText(msg, x, this.h*0.32);
    if(eng.result){
      var net=eng.result.net, nt=net>0?('淨贏 +'+fmt(net)):(net<0?('淨輸 '+fmt(net)):'淨和 0');
      c.fillStyle = net>0?'#7bd88f':(net<0?'#ff9ab0':'#f5efe2');
      c.font='700 20px system-ui,sans-serif'; c.fillText(nt, x, this.h*0.42);
      c.fillStyle='#a9c3b7'; c.font='13px system-ui,sans-serif';
      var y=this.h*0.5; var lines=eng.result.wins.length?eng.result.wins.slice(0,5):['無中獎注'];
      for(var i=0;i<lines.length;i++){ c.fillText(lines[i], x, y + i*20); }
    } else {
      c.fillStyle='#a9c3b7'; c.font='13px system-ui,sans-serif';
      c.fillText('單零 0–36 · 37 格', x, this.h*0.44);
      c.fillText('可同時下注多個項目', x, this.h*0.51);
    }
  };

  // ---------- 控制器 ----------
  function Game(){
    this.eng=new Engine();
    this.canvas=$('roulette-canvas'); this.wrap=$('roulette-demo'); this.renderer=new Renderer(this.canvas);
    this.statusEl=$('game-status'); this.bankrollEl=$('bankroll'); this.totalBetEl=$('total-bet');
    this.spinBtn=$('spin-btn'); this.clearBtn=$('clear-btn'); this.soundBtn=$('sound-btn');
    this.selectedChip=25; this.running=false; this.last=0; this.acc=0;
    this.load(); this.bind(); this.renderer.resize(this.wrap.clientWidth||720);
    this.syncUI(); this.renderer.render(this.eng);
    this.loop=this.loop.bind(this); this.running=true; requestAnimationFrame(this.loop);
  }
  Game.prototype.load=function(){
    try{ var raw=localStorage.getItem('neonace_roulette_v1'); if(raw){ var d=JSON.parse(raw);
      if(d&&typeof d.bankroll==='number') this.eng.bankroll=d.bankroll;
      if(d&&d.stats) this.eng.stats=d.stats; if(d&&typeof d.sound==='boolean') Sfx.on=d.sound; }}catch(e){}
  };
  Game.prototype.save=function(){ try{ localStorage.setItem('neonace_roulette_v1', JSON.stringify({bankroll:this.eng.bankroll,stats:this.eng.stats,sound:Sfx.on})); }catch(e){} };
  Game.prototype.bind=function(){
    var self=this;
    var chips=document.querySelectorAll('[data-chip]');
    for(var i=0;i<chips.length;i++)(function(btn){
      btn.addEventListener('click',function(){ self.selectedChip=parseInt(btn.getAttribute('data-chip'),10)||25; for(var j=0;j<chips.length;j++) chips[j].setAttribute('aria-pressed', chips[j]===btn?'true':'false'); });
    })(chips[i]);
    var areas=document.querySelectorAll('[data-bet]');
    for(var k=0;k<areas.length;k++)(function(el){
      var act=function(){ self.place(el.getAttribute('data-bet')); };
      el.addEventListener('click',act);
      el.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); act(); }});
    })(areas[k]);
    this.spinBtn.addEventListener('click',function(){ self.spin(); });
    this.clearBtn.addEventListener('click',function(){ self.clearBets(); });
    this.soundBtn.addEventListener('click',function(){ Sfx.unlock(); Sfx.on=!Sfx.on; self.save(); self.syncUI(); });
    // Resize：ResizeObserver + rAF 合併，並偵測 DPR 變化
    this._resizeRaf=0;
    var scheduleResize=function(){
      if(self._resizeRaf) return;
      self._resizeRaf=requestAnimationFrame(function(){ self._resizeRaf=0; self.renderer.resize(self.wrap.clientWidth||720); self.renderer.render(self.eng); });
    };
    if(typeof ResizeObserver!=='undefined' && this.wrap){ this._ro=new ResizeObserver(scheduleResize); this._ro.observe(this.wrap); }
    else { window.addEventListener('resize', scheduleResize); }
    var bindDpr=function(){
      if(self._dprMq){ if(self._dprMq.removeEventListener) self._dprMq.removeEventListener('change', onDpr); else if(self._dprMq.removeListener) self._dprMq.removeListener(onDpr); }
      if(!window.matchMedia) return;
      self._dprMq=window.matchMedia('(resolution: '+(window.devicePixelRatio||1)+'dppx)');
      if(self._dprMq.addEventListener) self._dprMq.addEventListener('change', onDpr); else if(self._dprMq.addListener) self._dprMq.addListener(onDpr);
    };
    var onDpr=function(){ bindDpr(); scheduleResize(); };
    bindDpr();
    document.addEventListener('visibilitychange',function(){ if(document.hidden){self.running=false;} else {self.running=true; self.last=0; self.acc=0; requestAnimationFrame(self.loop);} });
  };
  Game.prototype.place=function(key){
    Sfx.unlock(); if(this.eng.state!==STATE.BETTING) return;
    var next=this.eng.totalBet()+this.selectedChip;
    if(next>this.eng.bankroll){ this.setStatus('籌碼不足，無法加注。'); return; }
    this.eng.bets[key]=(this.eng.bets[key]||0)+this.selectedChip; this.syncUI();
  };
  Game.prototype.clearBets=function(){ if(this.eng.state!==STATE.BETTING) return; this.eng.bets={}; this.setStatus('已清除下注。'); this.syncUI(); };
  Game.prototype.spin=function(){
    Sfx.unlock();
    if(this.eng.state===STATE.SETTLE){ this.newRound(); return; }
    if(!this.eng.startSpin()){ this.setStatus('請先下注（總注額需 > 0 且 ≤ 餘額）。'); return; }
    this.setStatus('轉盤中…'); this.syncUI();
  };
  Game.prototype.newRound=function(){ if(this.eng.state!==STATE.BETTING && this.eng.state!==STATE.SETTLE) return; var keep=this.eng.bankroll, stats=this.eng.stats; this.eng.resetRound(); this.eng.bankroll=keep; this.eng.stats=stats; this.setStatus('新一局：請下注。'); this.syncUI(); this.renderer.render(this.eng); };
  Game.prototype.setStatus=function(t){ if(this.statusEl) this.statusEl.textContent=t; };
  Game.prototype.syncUI=function(){
    if(this.bankrollEl) this.bankrollEl.textContent=fmt(this.eng.bankroll);
    if(this.totalBetEl) this.totalBetEl.textContent=fmt(this.eng.totalBet());
    // 更新各下注區顯示
    var areas=document.querySelectorAll('[data-bet]');
    for(var i=0;i<areas.length;i++){
      var k=areas[i].getAttribute('data-bet'); var amt=this.eng.bets[k]||0;
      var badge=areas[i].querySelector('.amt'); if(badge) badge.textContent=amt?fmt(amt):'';
      if(amt) areas[i].classList.add('has-bet'); else areas[i].classList.remove('has-bet');
    }
    var can=this.eng.canSpin();
    this.spinBtn.disabled=!(can || this.eng.state===STATE.SETTLE);
    this.spinBtn.textContent=this.eng.state===STATE.SETTLE?'新一局 New Round':'旋轉 Spin';
    this.clearBtn.disabled=(this.eng.state!==STATE.BETTING || this.eng.totalBet()===0);
    if(this.soundBtn){ this.soundBtn.setAttribute('aria-pressed', Sfx.on?'true':'false'); this.soundBtn.textContent='音效 Sound：'+(Sfx.on?'開':'關'); }
    var sh=$('stat-hands'), sw=$('stat-won'), sb=$('stat-best');
    if(sh) sh.textContent=String(this.eng.stats.hands); if(sw) sw.textContent=String(this.eng.stats.won); if(sb) sb.textContent=fmt(this.eng.stats.best);
    if(this.eng.state===STATE.SETTLE && this.eng.result){
      var r=this.eng.result, col=r.color==='red'?'紅':(r.color==='black'?'黑':'綠');
      var netTxt=r.net>0?('淨贏 +'+fmt(r.net)):(r.net<0?('淨輸 '+fmt(r.net)):'淨和 0');
      var extra=r.wins.length?('｜'+r.wins.slice(0,4).join('、')):'';
      this.setStatus('開出 '+r.n+'（'+col+'）· '+netTxt+extra+'。');
      if(r.net>0) Sfx.win(); else if(r.net<0) Sfx.lose(); this.save();
    }
  };
  Game.prototype.loop=function(ts){
    if(!this.running) return; if(!this.last) this.last=ts; var dt=Math.min(CFG.MAX_FRAME_DT,(ts-this.last)/1000); this.last=ts; this.acc+=dt; var steps=0;
    while(this.acc>=CFG.FIXED_DT && steps<CFG.MAX_SUBSTEPS){ var prev=this.eng.state; this.eng.update(CFG.FIXED_DT); if(this.eng.state!==prev) this.syncUI(); this.acc-=CFG.FIXED_DT; steps++; }
    if(steps===CFG.MAX_SUBSTEPS) this.acc=0; this.renderer.render(this.eng); requestAnimationFrame(this.loop);
  };

  function boot(){ if(!$('roulette-canvas')) return; window.__neonRoulette=new Game(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
