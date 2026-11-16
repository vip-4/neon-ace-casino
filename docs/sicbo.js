/* Neon Ace — Sic Bo (骰寶) Canvas 示範
 * 架構：OutcomeProvider(結果來源) / SicBoEngine(FSM+規則) / Renderer / GameLoop
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
    ROLL_TIME: 1.15,
    REVEAL_HOLD: 1.7
  };
  var STATE = { BETTING: 'BETTING', ROLLING: 'ROLLING', REVEAL: 'REVEAL', SETTLE: 'SETTLE' };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function fmt(n) { var v = Math.round(n * 100) / 100; return Math.abs(v - Math.round(v)) < 0.001 ? String(Math.round(v)) : v.toFixed(2); }
  function $(id) { return document.getElementById(id); }

  // 音效：使用者手勢解鎖
  var Sfx = {
    ctx: null, on: false,
    unlock: function () {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return; try { this.ctx = new AC(); } catch (e) {}
    },
    beep: function (f, d, g) {
      if (!this.on || !this.ctx) return;
      try { var o = this.ctx.createOscillator(), v = this.ctx.createGain();
        o.type = 'triangle'; o.frequency.value = f; v.gain.value = g || 0.03;
        o.connect(v); v.connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + (d || 0.05));
      } catch (e) {}
    },
    roll: function(){ this.beep(420,0.04,0.02); },
    win: function(){ this.beep(880,0.09,0.04); setTimeout(function(){Sfx.beep(1175,0.1,0.04);},80); },
    lose: function(){ this.beep(220,0.12,0.03); }
  };

  function randInt(max) { // 0..max-1
    var u = new Uint32Array(1);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(u);
    else u[0] = Math.floor(Math.random() * 4294967296);
    return u[0] % max;
  }

  // ---------- 引擎 ----------
  function Engine() {
    this.resetRound();
    this.bankroll = CFG.START_BANKROLL;
    this.stats = { hands: 0, won: 0, best: CFG.START_BANKROLL };
  }
  Engine.prototype.resetRound = function () {
    this.state = STATE.BETTING;
    this.bets = { small:0, big:0, odd:0, even:0, anyTriple:0, triple1:0, triple2:0, triple3:0, triple4:0, triple5:0, triple6:0 };
    this.dice = [1,1,1];
    this.displayDice = [1,1,1];
    this.result = null; // {sum, triple, net, wins[]}
    this.t = 0; this.hold = 0; this.rollTicks = 0;
  };
  Engine.prototype.totalBet = function () {
    var s = 0, k; for (k in this.bets) s += this.bets[k]; return s;
  };
  Engine.prototype.rollDice = function () {
    return [randInt(6)+1, randInt(6)+1, randInt(6)+1];
  };
  Engine.prototype.canRoll = function () {
    return this.state === STATE.BETTING && this.totalBet() > 0 && this.totalBet() <= this.bankroll;
  };
  Engine.prototype.startRoll = function () {
    if (!this.canRoll()) return false;
    this.dice = this.rollDice();
    this.state = STATE.ROLLING; this.t = 0; this.rollTicks = 0;
    return true;
  };
  Engine.prototype.settle = function () {
    var d = this.dice, sum = d[0]+d[1]+d[2];
    var isTriple = (d[0]===d[1] && d[1]===d[2]);
    var isSmall = !isTriple && sum >= 4 && sum <= 10;
    var isBig = !isTriple && sum >= 11 && sum <= 17;
    var isOdd = (sum % 2 === 1);
    var isEven = !isOdd;
    var win = 0, lose = 0, wins = [];
    function w(key, cond, mult, label){ if (this.bets[key] > 0){ if(cond){ win += this.bets[key]*mult; wins.push(label+' +'+fmt(this.bets[key]*mult)); } else lose += this.bets[key]; } }
    w.call(this,'small', isSmall, 1, '小 Small');
    w.call(this,'big', isBig, 1, '大 Big');
    w.call(this,'odd', !isTriple && isOdd, 1, '單 Odd'); // 常見規則：圍骰通吃大小單雙
    w.call(this,'even', !isTriple && isEven, 1, '雙 Even');
    // 圍骰規則：本示範採「圍骰通吃大小單雙」；Any Triple 另賠
    // 若要大小單雙在圍骰仍依點數判定，可調整上述條件（此處明確揭露）
    if (this.bets.anyTriple > 0) {
      if (isTriple) { win += this.bets.anyTriple * 30; wins.push('圍骰 Any Triple +'+fmt(this.bets.anyTriple*30)); }
      else lose += this.bets.anyTriple;
    }
    for (var n=1;n<=6;n++){
      var k='triple'+n, cond = isTriple && d[0]===n;
      if (this.bets[k] > 0) {
        if (cond) { win += this.bets[k]*180; wins.push('指定圍骰 '+n+n+n+' +'+fmt(this.bets[k]*180)); }
        else lose += this.bets[k];
      }
    }
    var net = Math.round((win - lose) * 100) / 100;
    this.bankroll = Math.round((this.bankroll + net) * 100) / 100;
    this.stats.hands++; if (net > 0) this.stats.won++; if (this.bankroll > this.stats.best) this.stats.best = this.bankroll;
    this.result = { sum: sum, triple: isTriple, net: net, wins: wins, d: d.slice() };
    this.state = STATE.REVEAL; this.hold = 0;
  };
  Engine.prototype.update = function (dt) {
    if (this.state === STATE.ROLLING) {
      this.t += dt; this.rollTicks += dt;
      // 擲骰動畫：快速變換顯示點數
      if (this.rollTicks >= 0.07) {
        this.rollTicks = 0;
        this.displayDice = [randInt(6)+1, randInt(6)+1, randInt(6)+1];
        Sfx.roll();
      }
      if (this.t >= CFG.ROLL_TIME) {
        this.displayDice = this.dice.slice();
        this.settle();
      }
    } else if (this.state === STATE.REVEAL) {
      this.hold += dt;
      if (this.hold >= CFG.REVEAL_HOLD) this.state = STATE.SETTLE;
    }
  };

  // ---------- 繪製 ----------
  function Renderer(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.dpr = 1; this.w = 720; this.h = 360; this._lastW = -1; this._lastH = -1; this._lastDpr = -1;
  }
  Renderer.prototype.resize = function (wrapW) {
    var cssW = Math.max(300, Math.min(760, wrapW));
    var cssH = Math.round(cssW * 0.48);
    var dpr = Math.min(window.devicePixelRatio || 1, CFG.MAX_DPR);
    if (cssW === this._lastW && cssH === this._lastH && dpr === this._lastDpr) return; // 尺寸/DPR 未變不重設，避免緩衝區清空
    this.dpr = dpr; this.w = cssW; this.h = cssH;
    var bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr);
    if (this.canvas.width !== bw) this.canvas.width = bw;
    if (this.canvas.height !== bh) this.canvas.height = bh;
    this.canvas.style.width = cssW + 'px'; this.canvas.style.height = cssH + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._lastW = cssW; this._lastH = cssH; this._lastDpr = dpr;
  };
  Renderer.prototype.drawDie = function (x,y,size,val,rolling) {
    var c=this.ctx, r=size*0.18, s=size;
    c.save(); c.translate(x,y);
    if (rolling) c.rotate((Math.sin(x+y+Date.now()/90))*0.12);
    c.fillStyle='#f6f1e7'; c.strokeStyle='#d8cfbf'; c.lineWidth=2;
    c.beginPath();
    c.moveTo(-s/2+r,-s/2); c.lineTo(s/2-r,-s/2); c.quadraticCurveTo(s/2,-s/2,s/2,-s/2+r);
    c.lineTo(s/2,s/2-r); c.quadraticCurveTo(s/2,s/2,s/2-r,s/2);
    c.lineTo(-s/2+r,s/2); c.quadraticCurveTo(-s/2,s/2,-s/2,s/2-r);
    c.lineTo(-s/2,-s/2+r); c.quadraticCurveTo(-s/2,-s/2,-s/2+r,-s/2);
    c.closePath(); c.fill(); c.stroke();
    var pip=function(px,py){ c.beginPath(); c.arc(px,py,size*0.085,0,Math.PI*2); c.fill(); };
    c.fillStyle = (val===1||val===4)?'#c53b3b':'#17212b';
    var o=size*0.22;
    if(val===1||val===3||val===5) pip(0,0);
    if(val>=2){ pip(-o,-o); pip(o,o); }
    if(val>=4){ pip(o,-o); pip(-o,o); }
    if(val===6){ pip(-o,0); pip(o,0); }
    c.restore();
  };
  Renderer.prototype.render = function (eng) {
    var c=this.ctx; c.setTransform(this.dpr,0,0,this.dpr,0,0);
    var g=c.createLinearGradient(0,0,0,this.h); g.addColorStop(0,'#123b2e'); g.addColorStop(1,'#071713');
    c.fillStyle=g; c.fillRect(0,0,this.w,this.h);
    // 罩盅區
    c.strokeStyle='rgba(232,200,121,0.25)'; c.lineWidth=2;
    c.strokeRect(this.w*0.18,this.h*0.18,this.w*0.64,this.h*0.5);
    var size=Math.min(this.w,this.h)*0.16;
    var cy=this.h*0.43, gap=size*1.35, mid=this.w/2;
    var rolling = eng.state===STATE.ROLLING;
    var d = eng.displayDice || eng.dice;
    this.drawDie(mid-gap,cy,size,d[0],rolling);
    this.drawDie(mid,cy,size,d[1],rolling);
    this.drawDie(mid+gap,cy,size,d[2],rolling);
    c.fillStyle='#a9c3b7'; c.font='14px system-ui,sans-serif'; c.textAlign='center';
    var msg='選擇下注後擲骰';
    if (eng.state===STATE.ROLLING) msg='擲骰中…';
    else if (eng.result) {
      var r=eng.result; msg='點數 '+r.sum+(r.triple?'（圍骰）':'')+' · '+(r.net>0?('淨贏 +'+fmt(r.net)):(r.net<0?('淨輸 '+fmt(r.net)):'淨和 0'));
    }
    c.fillStyle='rgba(6,17,14,0.55)'; var tw=c.measureText(msg).width+26; c.fillRect(mid-tw/2,this.h*0.78-14,tw,28);
    c.fillStyle='#f5efe2'; c.fillText(msg,mid,this.h*0.78+5);
  };

  // ---------- 控制器 ----------
  function Game(){
    this.eng=new Engine();
    this.canvas=$('sicbo-canvas'); this.wrap=$('sicbo-demo'); this.renderer=new Renderer(this.canvas);
    this.statusEl=$('game-status'); this.bankrollEl=$('bankroll'); this.totalBetEl=$('total-bet');
    this.rollBtn=$('roll-btn'); this.clearBtn=$('clear-btn'); this.soundBtn=$('sound-btn');
    this.selectedChip=25; this.specific=1;
    this.running=false; this.last=0; this.acc=0;
    this.load(); this.bind();
    this.renderer.resize(this.wrap.clientWidth||720);
    this.syncUI(); this.renderer.render(this.eng);
    this.loop=this.loop.bind(this); this.running=true; requestAnimationFrame(this.loop);
  }
  Game.prototype.load=function(){
    try{ var raw=localStorage.getItem('neonace_sicbo_v1'); if(raw){ var d=JSON.parse(raw);
      if(d&&typeof d.bankroll==='number') this.eng.bankroll=d.bankroll;
      if(d&&d.stats){ this.eng.stats=d.stats; } if(d&&typeof d.sound==='boolean') Sfx.on=d.sound;
    }}catch(e){}
  };
  Game.prototype.save=function(){ try{ localStorage.setItem('neonace_sicbo_v1', JSON.stringify({bankroll:this.eng.bankroll,stats:this.eng.stats,sound:Sfx.on})); }catch(e){} };
  Game.prototype.bind=function(){
    var self=this;
    var chips=document.querySelectorAll('[data-chip]');
    for(var i=0;i<chips.length;i++)(function(btn){
      btn.addEventListener('click',function(){ self.selectedChip=parseInt(btn.getAttribute('data-chip'),10)||25;
        for(var j=0;j<chips.length;j++) chips[j].setAttribute('aria-pressed', chips[j]===btn?'true':'false'); });
    })(chips[i]);
    var areas=document.querySelectorAll('[data-bet]');
    for(var i2=0;i2<areas.length;i2++)(function(el){
      var act=function(){ self.place(el.getAttribute('data-bet')); };
      el.addEventListener('click',act);
      el.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); act(); }});
    })(areas[i2]);
    var sel=$('triple-num');
    if(sel) sel.addEventListener('change',function(){ self.specific=parseInt(sel.value,10)||1; self.syncUI(); });
    this.rollBtn.addEventListener('click',function(){ self.roll(); });
    this.clearBtn.addEventListener('click',function(){ self.clearBets(); });
    this.soundBtn.addEventListener('click',function(){ Sfx.unlock(); Sfx.on=!Sfx.on; self.save(); self.syncUI(); });
    // Resize：ResizeObserver + rAF 合併，並偵測 DPR 變化（跨螢幕/縮放）
    this._resizeRaf = 0;
    var scheduleResize = function () {
      if (self._resizeRaf) return;
      self._resizeRaf = requestAnimationFrame(function () { self._resizeRaf = 0; self.renderer.resize(self.wrap.clientWidth || 720); self.renderer.render(self.eng); });
    };
    if (typeof ResizeObserver !== 'undefined' && this.wrap) { this._ro = new ResizeObserver(scheduleResize); this._ro.observe(this.wrap); }
    else { window.addEventListener('resize', scheduleResize); }
    var bindDpr = function () {
      if (self._dprMq) { if (self._dprMq.removeEventListener) self._dprMq.removeEventListener('change', onDpr); else if (self._dprMq.removeListener) self._dprMq.removeListener(onDpr); }
      if (!window.matchMedia) return;
      self._dprMq = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
      if (self._dprMq.addEventListener) self._dprMq.addEventListener('change', onDpr); else if (self._dprMq.addListener) self._dprMq.addListener(onDpr);
    };
    var onDpr = function () { bindDpr(); scheduleResize(); };
    bindDpr();
    document.addEventListener('visibilitychange',function(){ if(document.hidden){self.running=false;} else {self.running=true; self.last=0; self.acc=0; requestAnimationFrame(self.loop);} });
  };
  Game.prototype.place=function(key){
    Sfx.unlock();
    if(this.eng.state!==STATE.BETTING) return;
    var actual = key==='specificTriple' ? ('triple'+this.specific) : key;
    if(!(actual in this.eng.bets)) return;
    var next=this.eng.totalBet()+this.selectedChip;
    if(next>this.eng.bankroll){ this.setStatus('籌碼不足，無法加注。'); return; }
    this.eng.bets[actual]+=this.selectedChip; this.syncUI();
  };
  Game.prototype.clearBets=function(){ if(this.eng.state!==STATE.BETTING) return; this.eng.resetRound(); this.eng.visible=this.eng.displayDice; this.setStatus('已清除下注。'); this.syncUI(); this.renderer.render(this.eng); };
  Game.prototype.roll=function(){
    Sfx.unlock();
    if(this.eng.state===STATE.SETTLE){ this.newRound(); return; }
    if(!this.eng.startRoll()){ this.setStatus('請先下注（總注額需 > 0 且 ≤ 餘額）。'); return; }
    this.setStatus('擲骰中…'); this.syncUI();
  };
  Game.prototype.newRound=function(){
    if(this.eng.state!==STATE.BETTING && this.eng.state!==STATE.SETTLE) return;
    var keep=this.eng.bankroll, stats=this.eng.stats; this.eng.resetRound(); this.eng.bankroll=keep; this.eng.stats=stats;
    this.setStatus('新一局：請下注。'); this.syncUI(); this.renderer.render(this.eng);
  };
  Game.prototype.setStatus=function(t){ if(this.statusEl) this.statusEl.textContent=t; };
  Game.prototype.syncUI=function(){
    if(this.bankrollEl) this.bankrollEl.textContent=fmt(this.eng.bankroll);
    if(this.totalBetEl) this.totalBetEl.textContent=fmt(this.eng.totalBet());
    var map={small:'amt-small',big:'amt-big',odd:'amt-odd',even:'amt-even',anyTriple:'amt-any'};
    var k; for(k in map){ var el=$(map[k]); if(el) el.textContent=this.eng.bets[k]?fmt(this.eng.bets[k]):'—'; }
    var st=$('amt-specific'); if(st){ var v=this.eng.bets['triple'+this.specific]; st.textContent=v?fmt(v):'—'; }
    var can=this.eng.canRoll();
    this.rollBtn.disabled=!(can || this.eng.state===STATE.SETTLE);
    this.rollBtn.textContent=this.eng.state===STATE.SETTLE?'新一局 New Round':'擲骰 Roll';
    this.clearBtn.disabled=(this.eng.state!==STATE.BETTING || this.eng.totalBet()===0);
    if(this.soundBtn){ this.soundBtn.setAttribute('aria-pressed', Sfx.on?'true':'false'); this.soundBtn.textContent='音效 Sound：'+(Sfx.on?'開':'關'); }
    var sh=$('stat-hands'), sw=$('stat-won'), sb=$('stat-best');
    if(sh) sh.textContent=String(this.eng.stats.hands); if(sw) sw.textContent=String(this.eng.stats.won); if(sb) sb.textContent=fmt(this.eng.stats.best);
    if(this.eng.state===STATE.SETTLE && this.eng.result){
      var r=this.eng.result, netTxt=r.net>0?('淨贏 +'+fmt(r.net)):(r.net<0?('淨輸 '+fmt(r.net)):'淨和 0');
      var extra=r.wins.length?('｜'+r.wins.join('、')):'';
      this.setStatus('開出 '+r.d.join('、')+'（合 '+r.sum+(r.triple?' 圍骰':'')+'）· '+netTxt+extra+'。');
      if(r.net>0) Sfx.win(); else if(r.net<0) Sfx.lose(); this.save();
    }
  };
  Game.prototype.loop=function(ts){
    if(!this.running) return;
    if(!this.last) this.last=ts; var dt=Math.min(CFG.MAX_FRAME_DT,(ts-this.last)/1000); this.last=ts; this.acc+=dt; var steps=0;
    while(this.acc>=CFG.FIXED_DT && steps<CFG.MAX_SUBSTEPS){ var prev=this.eng.state; this.eng.update(CFG.FIXED_DT); if(this.eng.state!==prev) this.syncUI(); this.acc-=CFG.FIXED_DT; steps++; }
    if(steps===CFG.MAX_SUBSTEPS) this.acc=0;
    this.renderer.render(this.eng); requestAnimationFrame(this.loop);
  };

  function boot(){ if(!$('sicbo-canvas')) return; window.__neonSicBo=new Game(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
