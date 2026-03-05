// CyberShield scanner.js v5.0 — injected into WhatsApp Web + Gmail
(function(){
  "use strict";
  if(window.__CS__)return;
  window.__CS__=true;

  const SITE=location.hostname;
  const INTERVAL=6000;
  const API="http://localhost:5000/predict";
  const checked=new Set();
  let active=true;

  console.log(`%c[CyberShield] ✅ Active on ${SITE}`,"color:#00e5ff;font-weight:bold");

  chrome.storage.local.get("active",(d)=>{active=d.active!==false;});
  chrome.storage.onChanged.addListener((c)=>{if(c.active)active=c.active.newValue;});

  // ── EXTRACTION ──────────────────────────────────────────────

  function getWhatsAppTexts(){
    const out=[];

    // Strategy A: TreeWalker on #main — works on ALL WA versions
    const root=document.querySelector("#main");
    if(root){
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{
        acceptNode(n){
          const t=n.textContent.trim();
          if(t.length<4||t.length>1200)return NodeFilter.FILTER_SKIP;
          if(/^\d{1,2}:\d{2}(\s?(AM|PM))?$/.test(t))return NodeFilter.FILTER_SKIP;
          if(/^(Read|Delivered|Sent|Seen|Typing…|You|Yesterday|Today)$/.test(t))return NodeFilter.FILTER_SKIP;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      let node;
      while((node=walker.nextNode()))out.push(node.textContent.trim());
    }

    // Strategy B: data-pre-plain-text rows
    document.querySelectorAll("[data-pre-plain-text]").forEach(el=>{
      const t=el.innerText?.trim().replace(/\s+/g," ");
      if(t&&t.length>3)out.push(t);
    });

    // Strategy C: focusable list items
    document.querySelectorAll(".focusable-list-item,[tabindex='-1'][role='row']").forEach(el=>{
      const t=el.innerText?.trim().replace(/\s+/g," ");
      if(t&&t.length>3&&t.length<800)out.push(t);
    });

    return[...new Set(out)];
  }

  function getGmailTexts(){
    const out=[];
    document.querySelectorAll("div.a3s.aiL,div.ii.gt").forEach(el=>{
      const t=el.innerText?.trim().replace(/\s+/g," ");
      if(t&&t.length>5)out.push(t.slice(0,900));
    });
    document.querySelectorAll("h2.hP").forEach(el=>{
      const t=el.innerText?.trim();
      if(t)out.push(t);
    });
    document.querySelectorAll("span.y2").forEach(el=>{
      const t=el.innerText?.trim();
      if(t&&t.length>3)out.push(t);
    });
    return[...new Set(out)];
  }

  function collectTexts(){
    if(SITE==="web.whatsapp.com")return getWhatsAppTexts();
    if(SITE==="mail.google.com") return getGmailTexts();
    return[];
  }

  // ── KEYWORD ENGINE ──────────────────────────────────────────

  const RULES=[
    [/send\s*(your\s*)?otp/i,3,"OTP Request"],
    [/share\s*(your\s*)?otp/i,3,"OTP Request"],
    [/enter\s*(the\s*)?otp/i,3,"OTP Request"],
    [/otp\s*(bhejo|send|share|de\s*do)/i,3,"OTP Request"],
    [/verify\s*your\s*account/i,3,"Account Verify"],
    [/account\s*will\s*be\s*block/i,3,"Block Threat"],
    [/atm\s*(pin|card)/i,3,"ATM PIN"],
    [/bank\s*account\s*detail/i,3,"Bank Details"],
    [/confirm\s*your\s*password/i,3,"Password Request"],
    [/kyc\s*(update|verify|complete)/i,3,"KYC Scam"],
    [/(update|complete)\s*kyc/i,3,"KYC Scam"],
    [/pan\s*card\s*(block|expired)/i,3,"PAN Scam"],
    [/aadhaar\s*(update|verify|link)/i,3,"Aadhaar Scam"],
    [/police\s*case\s*filed/i,3,"Threat Scam"],
    [/arrest\s*warrant/i,3,"Threat Scam"],
    [/income\s*tax\s*refund/i,3,"Tax Refund Scam"],
    [/trai\s*block/i,3,"TRAI Scam"],
    [/cybercrime\s*department/i,3,"Authority Scam"],
    [/you\s*(have\s*)?won/i,2,"Prize Scam"],
    [/you\s*(are\s*)?(the\s*)?winner/i,2,"Prize Scam"],
    [/lucky\s*draw/i,2,"Lottery Scam"],
    [/lottery\s*prize/i,2,"Lottery Scam"],
    [/claim\s*(your\s*)?(prize|reward)/i,2,"Claim Scam"],
    [/free\s*(iphone|samsung|laptop)/i,2,"Free Item Scam"],
    [/amazon\s*gift\s*card/i,2,"Gift Card Scam"],
    [/loan\s*(is\s*)?approv/i,2,"Loan Scam"],
    [/click\s*this\s*link/i,2,"Phishing Link"],
    [/limited\s*time\s*offer/i,2,"Urgency Tactic"],
    [/electricity\s*(cut|disconnect)/i,2,"Utility Scam"],
    [/sim\s*will\s*be\s*block/i,2,"SIM Scam"],
    [/government\s*subsidy/i,2,"Gov Scam"],
    [/upi\s*(suspend|block|deactivat)/i,2,"UPI Scam"],
    [/whatsapp\s*(suspend|block|ban)/i,2,"WA Scam"],
    [/pay\s*delivery\s*charge/i,2,"Delivery Scam"],
    [/free\s*recharge/i,2,"Recharge Scam"],
    [/free\s*money/i,2,"Free Money"],
    [/urgent/i,1,"Urgency"],
    [/immediately/i,1,"Urgency"],
    [/click\s*here/i,1,"Click Here"],
    [/congratulations/i,1,"Congrats Hook"],
    [/cashback/i,1,"Cashback"],
    [/winner/i,1,"Winner"],
    [/prize/i,1,"Prize"],
    [/verify\s*now/i,1,"Verify Now"],
  ];

  function keywordCheck(text){
    let score=0;const tags=[];
    for(const[re,w,tag]of RULES){
      if(re.test(text)){score+=w;tags.push(tag);}
    }
    if(/https?:\/\/(?!wa\.me|whatsapp\.|google\.|youtube\.|amazon\.in)/i.test(text)){
      score+=2;tags.push("Suspicious URL");
    }
    const isScam=score>=2;
    return{
      isScam,
      probability:isScam?Math.min(Math.max(score*12,55),97):0,
      tags:[...new Set(tags)].slice(0,4)
    };
  }

  async function mlCheck(text){
    try{
      const r=await fetch(API,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({message:text.slice(0,600)}),
        signal:AbortSignal.timeout(2500)
      });
      if(!r.ok)return null;
      return await r.json();
    }catch{return null;}
  }

  async function analyse(text){
    const kw=keywordCheck(text);
    if(kw.probability>=65)return kw;
    const ml=await mlCheck(text);
    if(ml?.prediction){
      const prob=Math.max(ml.probability||0,kw.probability);
      return{isScam:prob>=50,probability:prob,tags:kw.tags};
    }
    return kw;
  }

  // ── SCAN LOOP ───────────────────────────────────────────────

  async function scan(){
    if(!active)return;
    const texts=collectTexts();
    if(!texts.length){console.log("[CyberShield] No messages yet…");return;}
    console.log(`[CyberShield] Scanning ${texts.length} chunks…`);

    for(const text of texts){
      if(checked.has(text))continue;
      checked.add(text);
      if(checked.size>600){const it=checked.values();for(let i=0;i<100;i++)checked.delete(it.next().value);}

      const result=await analyse(text);
      if(result.isScam){
        console.warn(`%c[CyberShield] 🚨 SCAM ${result.probability}% → "${text.slice(0,60)}"`,"color:#ff4757;font-weight:bold");
        showAlert(text,result);
        try{chrome.runtime.sendMessage({type:"SCAM_FOUND",text,probability:result.probability});}catch(_){}
        break;
      }
    }
    try{chrome.runtime.sendMessage({type:"SCAN_DONE"});}catch(_){}
  }

  // ── ALERT CARD ──────────────────────────────────────────────

  function showAlert(text,result){
    document.getElementById("cs-root")?.remove();
    const prob=result.probability;
    const tags=result.tags?.length?result.tags:["Suspicious Content"];
    const preview=text.length>130?text.slice(0,130)+"…":text;
    const danger=prob>=80?"#ff4757":prob>=55?"#ff9f43":"#ffd32a";
    const site=SITE==="web.whatsapp.com"?"WhatsApp":"Gmail";

    const root=document.createElement("div");
    root.id="cs-root";
    root.innerHTML=`
      <div id="cs-overlay"></div>
      <div id="cs-panel">
        <div id="cs-stripe"></div>
        <div id="cs-top">
          <div id="cs-brand">
            <div id="cs-logo">🛡️</div>
            <div>
              <div id="cs-name">CyberShield</div>
              <div id="cs-where">Detected on ${site}</div>
            </div>
          </div>
          <button id="cs-close">✕</button>
        </div>
        <div id="cs-headline">⚠️ Scam Message Detected</div>
        <div id="cs-msg-box">
          <div id="cs-msg-label">Flagged message</div>
          <div id="cs-msg-text">"${preview}"</div>
        </div>
        <div id="cs-meter-row">
          <span id="cs-meter-label">Scam Risk</span>
          <span id="cs-meter-pct" style="color:${danger}">${prob}%</span>
        </div>
        <div id="cs-meter-track">
          <div id="cs-meter-fill" style="width:${prob}%;background:${danger}"></div>
        </div>
        <div id="cs-tags">${tags.map(t=>`<span class="cs-badge">${t}</span>`).join("")}</div>
        <div id="cs-divider"></div>
        <div id="cs-tips-head">What you should do right now</div>
        <div id="cs-tips">
          <div class="cs-tip"><span class="cs-tip-icon">🚫</span>Do NOT click any link in this message</div>
          <div class="cs-tip"><span class="cs-tip-icon">🔐</span>Never share your OTP, PIN or password</div>
          <div class="cs-tip"><span class="cs-tip-icon">📵</span>Hang up and call your bank directly</div>
          <div class="cs-tip"><span class="cs-tip-icon">🔍</span>Verify the sender's identity independently</div>
          <div class="cs-tip"><span class="cs-tip-icon">🚨</span>Report at cybercrime.gov.in if confirmed</div>
        </div>
        <div id="cs-actions">
          <button id="cs-btn-safe">✅ This is Safe</button>
          <button id="cs-btn-report">🚨 Report Scam</button>
        </div>
        <div id="cs-footer">CyberShield scans your chats every 6 seconds in the background</div>
      </div>`;

    document.body.appendChild(root);
    requestAnimationFrame(()=>{
      const p=root.querySelector("#cs-panel");
      p.style.transform="translateY(0)";
      p.style.opacity="1";
    });

    const close=()=>{
      const p=root.querySelector("#cs-panel");
      p.style.transform="translateY(30px)";p.style.opacity="0";
      setTimeout(()=>root.remove(),320);
    };

    document.getElementById("cs-close").onclick=close;
    document.getElementById("cs-overlay").onclick=close;
    document.getElementById("cs-btn-safe").onclick=close;
    document.getElementById("cs-btn-report").onclick=()=>{
      window.open("https://cybercrime.gov.in","_blank");close();
    };
    setTimeout(close,35000);
  }

  // ── BOOT ────────────────────────────────────────────────────

  async function boot(){
    await new Promise(r=>{
      if(document.readyState==="complete")return r();
      window.addEventListener("load",r,{once:true});
    });

    const delay=SITE==="web.whatsapp.com"?5000:2500;
    await new Promise(r=>setTimeout(r,delay));

    console.log("[CyberShield] 🚀 Scanning every 6s…");
    scan();
    setInterval(scan,INTERVAL);
    document.addEventListener("click",()=>setTimeout(scan,1800),{passive:true});

    // MutationObserver — catches new messages instantly
    const mo=new MutationObserver((mutations)=>{
      for(const m of mutations){
        if(m.addedNodes.length){setTimeout(scan,800);break;}
      }
    });
    const target=document.querySelector("#main")||document.body;
    mo.observe(target,{childList:true,subtree:true});
  }

  boot();
})();