/* Neon Ace — Video Poker (Jacks or Better) Canvas 示範
 * 架構：OutcomeProvider(牌靴/RNG) / VPEngine(FSM+牌型評估) / Renderer / GameLoop
 * ⚠️ 安全邊界：本頁為虛擬籌碼展示。RNG 在前端以 Web Crypto 產生，僅供娛樂；
 * 真金/排名/兌換/跨裝置必須改為後端權威 RNG、派彩與簽章，前端僅演出與驗章。
 */
(function () {
  'use strict';

  var CFG = {
    START_BANKROLL: 1000,
    BETS: [5, 10, 25, 50],
    MAX_DPR: 2,
    FIXED_DT: 1 / 120,
    MAX_FRAME_DT: 0.05,
    MAX_SUBSTEPS: 8,
    DEAL_STAGGER: 0.12,
    REVEAL_HOLD: 1.8
  };
  var STATE = { BETTING: 'BETTING', DEALING: 'DEALING', HOLD: 'HOLD', DRAWING: 'DRAWING', REVEAL: 'REVEAL', SETTLE: 'SETTLE' };
  var SUITS = ['♠', '♥', '♦', '♣'];
  var RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  var RANK_VAL = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
  // 9/6 Jacks or Better（每注 1 單位）示範賠率
  var PAY = {
    'Royal Flush': 250,
    'Straight Flush': 50,
    'Four of a Kind': 25,
    'Full House': 9,
    'Flush': 6,
    'Straight': 4,
    'Three of a Kind': 3,
    'Two Pair': 2,
    'Jacks or Better': 1
  };

  function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
  function fmt(n){ var v=Math.round(n*100)/100; return Math.abs(v-Math.round(v))<0.001?String(Math.round(v)):v.toFixed(2); }
  function $(id){ return document.getElementById(id); }
  function randInt(max){ var u=new Uint32Array(1); if(window.crypto&&window.crypto.getRandomValues) window.crypto.getRandomValues(u); else u[0]=Math.floor(Math.random()*4294967296); return u[0]%max; }

  var Sfx = {
    ctx:null,on:false,
    unlock:function(){ if(this.ctx){ if(this.ctx.state==='suspended') this.ctx.resume(); return; } var AC=window.AudioContext||window.webkitAudioContext; if(!AC) return; try{this.ctx=new AC();}catch(e){} },
    beep:function(f,d,g){ if(!this.on||!this.ctx) return; try{var o=this.ctx.createOscillator(),v=this.ctx.createGain(); o.type='sine'; o.frequency.value=f; v.gain.value=g||0.03; o.connect(v); v.connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime+(d||0.05));}catch(e){} },
    deal:function(){ this.beep(760,0.04,0.02); },
    win:function(){ this.beep(880,0.08,0.04); setTimeout(function(){Sfx.beep(1100,0.1,0.04);},90); },
    lose:function(){ this.beep(220,0.1,0.03); }
  };

  function makeDeck(){
    var d=[], s,r;
    for(s=0;s<4;s++) for(r=0;r<13;r++) d.push({s:s,r:r});
    // Fisher–Yates
    for(var i=d.length-1;i>0;i--){ var j=randInt(i+1), t=d[i]; d[i]=d[j]; d[j]=t; }
    return d;
  }

  function evaluate(hand){
    var vals = hand.map(function(c){return RANK_VAL[RANKS[c.r]];}).sort(function(a,b){return a-b;});
    var suits = hand.map(function(c){return c.s;});
    var isFlush = suits.every(function(s){return s===suits[0];});
    // 順子判定（含 A-2-3-4-5）
    var uniq = vals.filter(function(v,i,a){return a.indexOf(v)===i;});
    var isStraight = false, highStraight = 0;
    if(uniq.length===5){
      if(vals[4]-vals[0]===4){ isStraight=true; highStraight=vals[4]; }
      else if(vals[0]===2&&vals[1]===3&&vals[2]===4&&vals[3]===5&&vals[4]===14){ isStraight=true; highStraight=5; } // wheel
    }
    // 計數
    var counts={}, k; for(k=0;k<vals.length;k++) counts[vals[k]]=(counts[vals[k]]||0)+1;
    var groups = Object.keys(counts).map(function(x){return {v:+x,c:counts[x]};}).sort(function(a,b){return b.c-a.c || b.v-a.v;});
    var isRoyal = isFlush && isStraight && highStraight===14 && vals[0]===10;

    if(isRoyal) return {name:'Royal Flush', mult:PAY['Royal Flush']};
    if(isStraight && isFlush) return {name:'Straight Flush', mult:PAY['Straight Flush']};
    if(groups[0].c===4) return {name:'Four of a Kind', mult:PAY['Four of a Kind']};
    if(groups[0].c===3 && groups[1].c===2) return {name:'Full House', mult:PAY['Full House']};
    if(isFlush) return {name:'Flush', mult:PAY['Flush']};
    if(isStraight) return {name:'Straight', mult:PAY['Straight']};
    if(groups[0].c===3) return {name:'Three of a Kind', mult:PAY['Three of a Kind']};
    if(groups[0].c===2 && groups[1].c===2) return {name:'Two Pair', mult:PAY['Two Pair']};
    if(groups[0].c===2 && groups[0].v>=11) return {name:'Jacks or Better', mult:PAY['Jacks or Better']}; // JJ+
    return {name:'No Win', mult:0};
  }

  function Engine(){
    this.resetRound();
    this.bankroll=CFG.START_BANKROLL;
    this.stats={hands:0,won:0,best:CFG.START_BANKROLL};
  }
  Engine.prototype.resetRound=function(){
    this.state=STATE.BETTING;
    this.bet=CFG.BETS[1];
    this.deck=[]; this.hand=[]; this.held=[false,false,false,false,false];
    this.result=null; this.t=0; this.holdTime=0; this.dealIdx=0; this.visible=0; this.drawQueue=[];
  };
  Engine.prototype.canDeal=function(){ return this.state===STATE.BETTING && this.bet>0 && this.bet<=this.bankroll; };
  Engine.prototype.startDeal=function(){
    if(!this.canDeal()) return false;
    this.bankroll = Math.round((this.bankroll - this.bet)*100)/100;
    this.deck=makeDeck();
    this.hand=[this.deck.pop(),this.deck.pop(),this.deck.pop(),this.deck.pop(),this.deck.pop()];
    this.held=[false,false,false,false,false];
    this.result=null; this.t=0; this.dealIdx=0; this.visible=0; this.drawQueue=[];
    this.state=STATE.DEALING;
    return true;
  };
  Engine.prototype.toggleHold=function(i){
    if(this.state!==STATE.HOLD) return;
    if(i<0||i>4) return;
    this.held[i]=!this.held[i];
  };
  Engine.prototype.startDraw=function(){
    if(this.state!==STATE.HOLD) return false;
    this.drawQueue=[];
    for(var i=0;i<5;i++) if(!this.held[i]) this.drawQueue.push(i);
    if(this.drawQueue.length===0){
      // 全保留：直接評估
      this.finish();
    } else {
      this.state=STATE.DRAWING; this.t=0; this.dealIdx=0; this.visible=0;
      // 先替換資料，逐張顯示翻開動畫節奏由 visible 控制
      for(var j=0;j<this.drawQueue.length;j++) this.hand[this.drawQueue[j]]=this.deck.pop();
    }
    return true;
  };
  Engine.prototype.finish=function(){
    var ev=evaluate(this.hand);
    var winAmt = ev.mult * this.bet;
    // 下注已於發牌時扣除；中獎時返還本金 + 派彩（賠率為「倍數」淨贏概念：1 = 贏 1 倍）
    if(winAmt>0) this.bankroll = Math.round((this.bankroll + this.bet + winAmt)*100)/100;
    this.stats.hands++; if(winAmt>0) this.stats.won++; if(this.bankroll>this.stats.best) this.stats.best=this.bankroll;
    this.result={name:ev.name,mult:ev.mult,win:winAmt};
    this.state=STATE.REVEAL; this.holdTime=0;
  };
  Engine.prototype.update=function(dt){
    if(this.state===STATE.DEALING){
      this.t += dt;
      while(this.t>=CFG.DEAL_STAGGER && this.visible<5){ this.t-=CFG.DEAL_STAGGER; this.visible++; Sfx.deal(); }
      if(this.visible>=5) this.state=STATE.HOLD;
    } else if(this.state===STATE.DRAWING){
      this.t += dt;
      while(this.t>=CFG.DEAL_STAGGER && this.dealIdx<this.drawQueue.length){ this.t-=CFG.DEAL_STAGGER; this.dealIdx++; Sfx.deal(); }
      if(this.dealIdx>=this.drawQueue.length) this.finish();
    } else if(this.state===STATE.REVEAL){
      this.holdTime += dt;
      if(this.holdTime>=CFG.REVEAL_HOLD) this.state=STATE.SETTLE;
    }
  };

  // ---------- 繪製 ----------
  function Renderer(canvas){ this.canvas=canvas; this.ctx=canvas.getContext('2d'); this.dpr=1; this.w=720; this.h=340; this._lastW=-1; this._lastH=-1; this._lastDpr=-1; }
  Renderer.prototype.resize=function(wrapW){
    var cssW=Math.max(300,Math.min(760,wrapW)); var cssH=Math.round(cssW*0.44);
    var dpr=Math.min(window.devicePixelRatio||1,CFG.MAX_DPR);
    // 僅在 CSS 尺寸或 DPR 實際變化時重設畫布，避免清空緩衝區與重配置造成掉幀
    if(cssW===this._lastW && cssH===this._lastH && dpr===this._lastDpr) return;
    this.dpr=dpr; this.w=cssW; this.h=cssH;
    var bw=Math.round(cssW*dpr), bh=Math.round(cssH*dpr);
    if(this.canvas.width!==bw) this.canvas.width=bw;
    if(this.canvas.height!==bh) this.canvas.height=bh;
    this.canvas.style.width=cssW+'px'; this.canvas.style.height=cssH+'px';
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
    this._lastW=cssW; this._lastH=cssH; this._lastDpr=dpr;
  };
  Renderer.prototype.drawCard=function(x,y,w,h,card,face,held,dim){
    var c=this.ctx,r=8; c.save(); c.translate(x,y); if(dim) c.globalAlpha=0.55;
    c.fillStyle='#f6f1e7'; c.strokeStyle=held?'#e8c879':'#d8cfbf'; c.lineWidth=held?3:1.5;
    c.beginPath(); c.moveTo(-w/2+r,-h/2); c.lineTo(w/2-r,-h/2); c.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r); c.lineTo(w/2,h/2-r); c.quadraticCurveTo(w/2,h/2,w/2-r,h/2); c.lineTo(-w/2+r,h/2); c.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r); c.lineTo(-w/2,-h/2+r); c.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2); c.closePath(); c.fill(); c.stroke();
    if(face && card){
      var red=(card.s===1||card.s===2); c.fillStyle=red?'#c53b3b':'#17212b';
      c.textAlign='left'; c.textBaseline='top'; c.font='700 '+Math.round(h*0.18)+'px system-ui,sans-serif';
      c.fillText(RANKS[card.r]+SUITS[card.s], -w/2+6, -h/2+6);
      c.textAlign='center'; c.textBaseline='middle'; c.font=Math.round(h*0.34)+'px system-ui,sans-serif';
      c.fillText(SUITS[card.s],0,4);
    } else {
      c.fillStyle='#123b2e'; c.fillRect(-w/2+5,-h/2+5,w-10,h-10);
      c.strokeStyle='rgba(232,200,121,0.5)'; c.lineWidth=1; c.strokeRect(-w/2+8,-h/2+8,w-16,h-16);
    }
    if(held){ c.fillStyle='#e8c879'; c.font='700 '+Math.round(h*0.13)+'px system-ui,sans-serif'; c.textAlign='center'; c.textBaseline='bottom'; c.fillText('HOLD',0,h/2-6); }
    c.restore();
  };
  Renderer.prototype.render=function(eng){
    var c=this.ctx; c.setTransform(this.dpr,0,0,this.dpr,0,0); // 每幀重設變換，確保座標系一致且不累積
    var g=c.createLinearGradient(0,0,0,this.h); g.addColorStop(0,'#0f3d2f'); g.addColorStop(1,'#071713'); c.fillStyle=g; c.fillRect(0,0,this.w,this.h);
    var cw=Math.min(110,this.w*0.155), ch=cw*1.45, gap=Math.max(8,this.w*0.02);
    var totalW=5*cw+4*gap, startX=(this.w-totalW)/2+cw/2, y=this.h*0.46;
    for(var i=0;i<5;i++){
      var face=false, dim=false;
      if(eng.state===STATE.DEALING){ face = i < eng.visible; }
      else if(eng.state===STATE.DRAWING){ var isDraw = eng.drawQueue.indexOf(i)!==-1; face = !isDraw || eng.drawQueue.indexOf(i) < eng.dealIdx; }
      else if(eng.state===STATE.HOLD || eng.state===STATE.REVEAL || eng.state===STATE.SETTLE){ face=true; }
      else { face=false; }
      var card=eng.hand[i]||null;
      this.drawCard(startX+i*(cw+gap), y, cw, ch, card, face && !!card, eng.held[i] && (eng.state===STATE.HOLD||eng.state===STATE.DRAWING), dim);
    }
    // 訊息
    c.textAlign='center'; c.fillStyle='rgba(6,17,14,0.55)';
    var msg='下注後按「發牌」';
    if(eng.state===STATE.DEALING) msg='發牌中…';
    else if(eng.state===STATE.HOLD) msg='點擊卡牌選擇 HOLD，再按「換牌」';
    else if(eng.state===STATE.DRAWING) msg='換牌中…';
    else if(eng.result){ msg = eng.result.win>0 ? (eng.result.name+' · 贏 '+fmt(eng.result.win)) : '未中獎 · 再試一次'; }
    c.font='14px system-ui,sans-serif'; var tw=c.measureText(msg).width+26; c.fillRect(this.w/2-tw/2,this.h*0.84-14,tw,28);
    c.fillStyle='#f5efe2'; c.fillText(msg,this.w/2,this.h*0.84+5);
  };

  // ---------- 控制器 ----------
  function Game(){
    this.eng=new Engine();
    this.canvas=$('vp-canvas'); this.wrap=$('vp-demo'); this.renderer=new Renderer(this.canvas);
    this.statusEl=$('game-status'); this.bankrollEl=$('bankroll'); this.betEl=$('bet-amt');
    this.dealBtn=$('deal-btn'); this.drawBtn=$('draw-btn'); this.soundBtn=$('sound-btn');
    this.cardBtns=[]; for(var i=0;i<5;i++) this.cardBtns.push($('hold-'+i));
    this.running=false; this.last=0; this.acc=0;
    this.load(); this.bind(); this.renderer.resize(this.wrap.clientWidth||720);
    this.syncUI(); this.renderer.render(this.eng);
    this.loop=this.loop.bind(this); this.running=true; requestAnimationFrame(this.loop);
  }
  Game.prototype.load=function(){ try{ var raw=localStorage.getItem('neonace_videopoker_v1'); if(raw){ var d=JSON.parse(raw); if(d&&typeof d.bankroll==='number') this.eng.bankroll=d.bankroll; if(d&&d.stats) this.eng.stats=d.stats; if(d&&typeof d.sound==='boolean') Sfx.on=d.sound; if(d&&d.bet) this.eng.bet=d.bet; } }catch(e){} };
  Game.prototype.save=function(){ try{ localStorage.setItem('neonace_videopoker_v1', JSON.stringify({bankroll:this.eng.bankroll,stats:this.eng.stats,sound:Sfx.on,bet:this.eng.bet})); }catch(e){} };
  Game.prototype.bind=function(){
    var self=this;
    var chips=document.querySelectorAll('[data-chip]');
    for(var i=0;i<chips.length;i++)(function(btn){ btn.addEventListener('click',function(){ self.eng.bet=parseInt(btn.getAttribute('data-chip'),10)||10; for(var j=0;j<chips.length;j++) chips[j].setAttribute('aria-pressed', chips[j]===btn?'true':'false'); self.save(); self.syncUI(); }); })(chips[i]);
    this.dealBtn.addEventListener('click',function(){ self.deal(); });
    this.drawBtn.addEventListener('click',function(){ self.draw(); });
    this.soundBtn.addEventListener('click',function(){ Sfx.unlock(); Sfx.on=!Sfx.on; self.save(); self.syncUI(); });
    for(var c=0;c<this.cardBtns.length;c++)(function(idx,btn){ if(!btn) return; btn.addEventListener('click',function(){ self.toggle(idx); }); })(c,this.cardBtns[c]);
    // 點擊畫布對應卡牌位置也可切換 HOLD（提升易用性）
    this.canvas.addEventListener('click',function(e){ if(self.eng.state!==STATE.HOLD) return; var rect=self.canvas.getBoundingClientRect(); var x=e.clientX-rect.left; var cw=Math.min(110,rect.width*0.155), gap=Math.max(8,rect.width*0.02); var totalW=5*cw+4*gap, start=(rect.width-totalW)/2; var idx=Math.floor((x-start)/(cw+gap)); if(idx>=0&&idx<5) self.toggle(idx); });
    // Resize：ResizeObserver + rAF 合併，避免連續觸發重設畫布；並監聽 DPR 變化（跨螢幕/縮放）
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
  Game.prototype.toggle=function(i){ Sfx.unlock(); this.eng.toggleHold(i); this.syncUI(); };
  Game.prototype.deal=function(){
    Sfx.unlock();
    if(this.eng.state===STATE.SETTLE || this.eng.state===STATE.REVEAL){ this.newRound(); }
    if(this.eng.state===STATE.BETTING){ if(!this.eng.startDeal()){ this.setStatus('餘額不足，請降低注額。'); return; } this.setStatus('發牌中…'); }
    else if(this.eng.state===STATE.HOLD){ this.draw(); return; }
    this.syncUI();
  };
  Game.prototype.draw=function(){ Sfx.unlock(); if(this.eng.state!==STATE.HOLD) return; this.eng.startDraw(); this.setStatus('換牌中…'); this.syncUI(); };
  Game.prototype.newRound=function(){ var keep=this.eng.bankroll, stats=this.eng.stats, bet=this.eng.bet; this.eng.resetRound(); this.eng.bankroll=keep; this.eng.stats=stats; this.eng.bet=bet; this.setStatus('新一局：按「發牌」。'); this.syncUI(); this.renderer.render(this.eng); };
  Game.prototype.setStatus=function(t){ if(this.statusEl) this.statusEl.textContent=t; };
  Game.prototype.syncUI=function(){
    if(this.bankrollEl) this.bankrollEl.textContent=fmt(this.eng.bankroll);
    if(this.betEl) this.betEl.textContent=fmt(this.eng.bet);
    var inBet=this.eng.state===STATE.BETTING || this.eng.state===STATE.SETTLE || this.eng.state===STATE.REVEAL;
    this.dealBtn.textContent=(this.eng.state===STATE.HOLD)?'換牌 Draw':'發牌 Deal';
    this.dealBtn.disabled=!( (inBet && this.eng.bet<=this.eng.bankroll) || this.eng.state===STATE.HOLD );
    this.drawBtn.disabled=(this.eng.state!==STATE.HOLD);
    var chips=document.querySelectorAll('[data-chip]'); for(var i=0;i<chips.length;i++) chips[i].disabled=!inBet;
    for(var c=0;c<this.cardBtns.length;c++){ var b=this.cardBtns[c]; if(!b) continue; var active=this.eng.state===STATE.HOLD; b.disabled=!active; b.setAttribute('aria-pressed', this.eng.held[c]?'true':'false'); b.textContent=this.eng.held[c]?'HELD':'HOLD'; }
    if(this.soundBtn){ this.soundBtn.setAttribute('aria-pressed', Sfx.on?'true':'false'); this.soundBtn.textContent='音效 Sound：'+(Sfx.on?'開':'關'); }
    var sh=$('stat-hands'), sw=$('stat-won'), sb=$('stat-best'); if(sh) sh.textContent=String(this.eng.stats.hands); if(sw) sw.textContent=String(this.eng.stats.won); if(sb) sb.textContent=fmt(this.eng.stats.best);
    if(this.eng.state===STATE.SETTLE && this.eng.result){ var r=this.eng.result; var txt=r.win>0?(r.name+' · 贏 '+fmt(r.win)):'未中獎'; this.setStatus('結果：'+txt+'。按「發牌」開始新一局。'); if(r.win>0) Sfx.win(); else Sfx.lose(); this.save(); }
    else if(this.eng.state===STATE.HOLD){ this.setStatus('選擇要保留的牌（HOLD），再按「換牌」。'); }
  };
  Game.prototype.loop=function(ts){
    if(!this.running) return; if(!this.last) this.last=ts; var dt=Math.min(CFG.MAX_FRAME_DT,(ts-this.last)/1000); this.last=ts; this.acc+=dt; var steps=0;
    while(this.acc>=CFG.FIXED_DT && steps<CFG.MAX_SUBSTEPS){ var prev=this.eng.state; this.eng.update(CFG.FIXED_DT); if(this.eng.state!==prev) this.syncUI(); this.acc-=CFG.FIXED_DT; steps++; }
    if(steps===CFG.MAX_SUBSTEPS) this.acc=0; this.renderer.render(this.eng); requestAnimationFrame(this.loop);
  };

  function boot(){ if(!$('vp-canvas')) return; window.__neonVideoPoker=new Game(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
