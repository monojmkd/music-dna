import { useState, useEffect, useRef } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || "";
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI || window.location.origin + "/";
const SCOPES = "user-top-read user-read-private";

// ─── PKCE ─────────────────────────────────────────────────────────────────────
function generateVerifier(len = 128) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join("");
}
async function generateChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}
async function initiateLogin() {
  const verifier = generateVerifier();
  const challenge = await generateChallenge(verifier);
  sessionStorage.setItem("pkce_verifier", verifier);
  const params = new URLSearchParams({ client_id:CLIENT_ID, response_type:"code", redirect_uri:REDIRECT_URI, scope:SCOPES, code_challenge_method:"S256", code_challenge:challenge });
  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}
async function exchangeToken(code) {
  const verifier = sessionStorage.getItem("pkce_verifier");
  if (!verifier) throw new Error("PKCE verifier missing — please try logging in again.");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body: new URLSearchParams({ client_id:CLIENT_ID, grant_type:"authorization_code", code, redirect_uri:REDIRECT_URI, code_verifier:verifier }),
  });
  if (!res.ok) throw new Error("Spotify login failed. Please try again.");
  sessionStorage.removeItem("pkce_verifier");
  return res.json();
}
async function spGet(path, token) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, { headers:{ Authorization:`Bearer ${token}` } });
  if (res.status === 401) throw new Error("Session expired. Please log in again.");
  if (!res.ok) throw new Error(`Spotify error ${res.status}`);
  return res.json();
}
async function fetchListeningData(token) {
  const [tracksRes, artistsRes] = await Promise.all([
    spGet("/me/top/tracks?limit=50&time_range=medium_term", token),
    spGet("/me/top/artists?limit=50&time_range=medium_term", token),
  ]);
  return { tracks: tracksRes.items || [], artists: artistsRes.items || [] };
}

// ─── DATA ─────────────────────────────────────────────────────────────────────
const GENRE_MAP = {
  electronic:"Electronic",edm:"Electronic",house:"Electronic",techno:"Electronic",trance:"Electronic",
  ambient:"Electronic","drum and bass":"Electronic",dubstep:"Electronic",synthwave:"Electronic",electro:"Electronic",dance:"Electronic",chillwave:"Electronic",
  rock:"Rock & Alt",alternative:"Rock & Alt",indie:"Rock & Alt",punk:"Rock & Alt",metal:"Rock & Alt",grunge:"Rock & Alt","post-rock":"Rock & Alt",shoegaze:"Rock & Alt",emo:"Rock & Alt",hardcore:"Rock & Alt","folk rock":"Rock & Alt",
  "r&b":"R&B & Soul",soul:"R&B & Soul","neo soul":"R&B & Soul",funk:"R&B & Soul",gospel:"R&B & Soul",motown:"R&B & Soul",
  "hip hop":"Hip-Hop",rap:"Hip-Hop",trap:"Hip-Hop",drill:"Hip-Hop",grime:"Hip-Hop","boom bap":"Hip-Hop",
  folk:"Acoustic & Folk",acoustic:"Acoustic & Folk","singer-songwriter":"Acoustic & Folk",country:"Acoustic & Folk",bluegrass:"Acoustic & Folk",americana:"Acoustic & Folk",
  classical:"Classical & Ambient",orchestral:"Classical & Ambient",jazz:"Classical & Ambient",piano:"Classical & Ambient",instrumental:"Classical & Ambient","new age":"Classical & Ambient",carnatic:"Classical & Ambient",hindustani:"Classical & Ambient",raga:"Classical & Ambient",ghazal:"Classical & Ambient",qawwali:"Classical & Ambient",
  pop:"Pop",latin:"Pop","k-pop":"Pop","j-pop":"Pop",reggaeton:"Pop",dancehall:"Pop",
  bollywood:"Bollywood & World",filmi:"Bollywood & World",hindi:"Bollywood & World","indian pop":"Bollywood & World",kollywood:"Bollywood & World",tollywood:"Bollywood & World",bhangra:"Bollywood & World",assamese:"Bollywood & World",bengali:"Bollywood & World",marathi:"Bollywood & World",punjabi:"Bollywood & World",tamil:"Bollywood & World",telugu:"Bollywood & World",kannada:"Bollywood & World",malayalam:"Bollywood & World",devotional:"Bollywood & World",bhajan:"Bollywood & World",sufi:"Bollywood & World",world:"Bollywood & World",afrobeat:"Bollywood & World",reggae:"Bollywood & World",
};

const GENRE_COLORS = {
  "Electronic":"#5bc8f5","Rock & Alt":"#f07060","R&B & Soul":"#f09060","Hip-Hop":"#f0c060",
  "Acoustic & Folk":"#70c480","Classical & Ambient":"#9080e8","Pop":"#f070b0",
  "Bollywood & World":"#f0a060","Other":"#808898",
};

const ARCHETYPES = [
  { id:"midnight_drifter",name:"Midnight Drifter",tagline:"You feel everything twice.",
    desc:"Music is your emotional processing system. You gravitate toward songs that articulate things you can't say out loud. Late nights, low volume, high feeling.",
    profile:[85,30,25,55,65,30,40,60],color:"#b8a0f8",bg:"#100d1e",word:"Introspective" },
  { id:"sonic_rebel",name:"Sonic Rebel",tagline:"You don't listen to music. You survive it.",
    desc:"High energy, genre-agnostic chaos. You need music that matches your internal voltage. Rules and structures exist to be distorted.",
    profile:[60,80,35,25,80,20,85,15],color:"#f07060",bg:"#1c0e0c",word:"Untamed" },
  { id:"velvet_romantic",name:"Velvet Romantic",tagline:"You've built a whole world inside three chords.",
    desc:"Deeply emotional, socially warm. R&B, soul, emotional pop. You believe a song should feel like being held by someone who truly understands.",
    profile:[90,20,60,50,30,55,30,40],color:"#f07aaa",bg:"#1a0d16",word:"Tender" },
  { id:"neon_runner",name:"Neon Runner",tagline:"Music is fuel. Everything else is noise.",
    desc:"Function over feeling. BPM is your currency. Your playlist is precision-engineered for momentum — gym, commute, personal records.",
    profile:[25,50,80,10,45,70,95,10],color:"#40c8f8",bg:"#080f1c",word:"Kinetic" },
  { id:"cosmic_dreamer",name:"Cosmic Dreamer",tagline:"You listen to music that doesn't exist yet.",
    desc:"Ambient, experimental, instrumental. You treat music as a portal, not entertainment. Sound over song. Maximum diversity, minimum mainstream.",
    profile:[50,60,15,30,90,15,25,90],color:"#7088f8",bg:"#08091e",word:"Transcendent" },
  { id:"chaos_curator",name:"Chaos Curator",tagline:"Your shuffle would give an algorithm an existential crisis.",
    desc:"Truly genre-fluid. Classical to drill to bossa nova in three songs. You don't have a type — you contain all types.",
    profile:[40,95,50,35,95,40,55,35],color:"#f8a840",bg:"#1c1008",word:"Boundless" },
  { id:"nostalgia_architect",name:"Nostalgia Architect",tagline:"You're building a museum, one playlist at a time.",
    desc:"Drawn to older recordings, acoustic textures, familiar structures. The past isn't where you live — it's what you trust.",
    profile:[65,25,45,95,25,45,35,50],color:"#d4b060",bg:"#181408",word:"Reverent" },
  { id:"cafe_philosopher",name:"Café Philosopher",tagline:"You have opinions about reverb.",
    desc:"Jazz, acoustic, lo-fi, singer-songwriter. Music is simultaneously background and foreground. Deeply intentional listening.",
    profile:[55,30,30,60,55,35,20,70],color:"#60c880",bg:"#081410",word:"Contemplative" },
  { id:"hype_machine",name:"The Hype Machine",tagline:"If it's not a banger, what even is the point.",
    desc:"Chart-dominant, high popularity, maximum danceability. You're not chasing trends — you are the trend, three weeks before anyone else.",
    profile:[20,55,90,15,30,95,80,5],color:"#c878f8",bg:"#120c1e",word:"Electric" },
  { id:"phantom_aesthete",name:"Phantom Aesthete",tagline:"You listen like a critic, feel like a poet.",
    desc:"Underground, genre-selective, instrumentally complex. Low mainstream pull, impossibly high sonic standards. Hard to impress.",
    profile:[70,40,20,45,70,10,45,85],color:"#40d0b8",bg:"#081412",word:"Discerning" },
  { id:"lone_wolf",name:"Lone Wolf",tagline:"Your taste is a locked room only you have the key to.",
    desc:"Deeply personal, non-social choices. Eclectic underground selections that feel autobiographical. Music as identity, not conversation.",
    profile:[75,70,15,40,85,15,60,65],color:"#a0a0c8",bg:"#0c0c14",word:"Sovereign" },
  { id:"solar_architect",name:"Solar Architect",tagline:"You make the energy in the room.",
    desc:"Upbeat, diverse, socially calibrated. Your music makes things happen — parties, workouts, good moods. You are the soundtrack person.",
    profile:[30,45,65,20,60,60,70,30],color:"#f09040",bg:"#1a1008",word:"Radiant" },
];

const mean = (a) => a.length ? a.reduce((s,v)=>s+v,0)/a.length : 0;
const clamp = (v,lo=0,hi=100) => Math.max(lo,Math.min(hi,v));

const GK = {
  emotional:["emo","sad","melanchol","heartbreak","grief","blues","soul","slowcore","blackgaze","darkwave","post-punk","doom","shoegaze","chamber","ballad","ghazal","qawwali","sufi","thumri","carnatic","devotional","bhajan","filmi"],
  drive:["metal","punk","hardcore","drum and bass","dnb","speedcore","thrash","hip hop","rap","trap","drill","edm","house","techno","trance","dubstep","funk","bhangra","workout","gym","hype"],
  social:["pop","dance","latin","reggaeton","k-pop","j-pop","dancehall","club","afrobeats","disco","hip hop","rap","tropical","filmi","bollywood","indian pop","party"],
  nostalgia:["classic","oldies","retro","70s","80s","90s","vintage","motown","swing","rockabilly","soul","blues","golden era","old school"],
  ether:["ambient","instrumental","post-rock","neoclassical","new age","sleep","drone","atmospheric","shoegaze","chillwave","lo-fi","vaporwave","dream pop","ethereal","meditation","raga","classical"],
  chaos:["experimental","avant","noise","glitch","free jazz","math rock","microtonal","no wave","industrial","art punk","fusion","world","crossover","eclectic"],
};

function genreSignal(all, kw) {
  if (!all.length) return 0;
  return all.filter(g => kw.some(k => g.toLowerCase().includes(k))).length / all.length;
}

function scoreDimensions(tracks, artists) {
  const pop = tracks.map(t=>t.popularity);
  const yrs = tracks.map(t=>parseInt((t.album?.release_date||"2020").slice(0,4)));
  const followers = artists.map(a=>a.followers?.total||0);
  const allGenres = artists.flatMap(a=>a.genres||[]);
  const genreCounts = {};
  for (const g of allGenres) genreCounts[g]=(genreCounts[g]||0)+1;
  const uniqueCount = Object.keys(genreCounts).length;
  const totalG = allGenres.length||1;
  let shannonH=0;
  for (const c of Object.values(genreCounts)) { const p=c/totalG; if(p>0) shannonH-=p*Math.log2(p); }
  const genreEntropy = Math.min(1, shannonH/Math.log2(Math.max(uniqueCount,2)));
  const hasGenres = allGenres.length>0;
  const avgPop = mean(pop)||50;
  const avgYear = mean(yrs)||2018;
  const medFollowers = [...followers].sort((a,b)=>a-b)[Math.floor(followers.length/2)]||1000;
  const underground = clamp(1-Math.log10(Math.max(medFollowers,100))/8);
  const sig = {
    emotional: hasGenres ? genreSignal(allGenres,GK.emotional) : (1-avgPop/100)*0.6,
    drive: hasGenres ? genreSignal(allGenres,GK.drive) : (avgPop/100)*0.5,
    social: hasGenres ? genreSignal(allGenres,GK.social) : (avgPop/100)*0.7,
    nostalgia: hasGenres ? genreSignal(allGenres,GK.nostalgia) : 0,
    ether: hasGenres ? genreSignal(allGenres,GK.ether) : underground*0.4,
    chaos: hasGenres ? genreSignal(allGenres,GK.chaos) : (uniqueCount/Math.max(artists.length,1))*0.3,
  };
  return {
    emotionality: Math.round(clamp(sig.emotional*65+(1-avgPop/100)*22+13)),
    entropy:      Math.round(clamp(genreEntropy*58+sig.chaos*32+5)),
    sociability:  Math.round(clamp(sig.social*62+(avgPop/100)*33+5)),
    nostalgia:    Math.round(clamp((Math.max(0,2024-avgYear)/30)*70+sig.nostalgia*25+5)),
    exploration:  Math.round(clamp((Math.min(uniqueCount,35)/35)*45+underground*35+(1-avgPop/100)*15+5)),
    mainstream:   Math.round(clamp(avgPop)),
    drive:        Math.round(clamp(sig.drive*68+(1-Math.max(0,2024-avgYear)/30)*27+5)),
    ether:        Math.round(clamp(sig.ether*70+(1-sig.social)*20+5)),
  };
}

function classifyArchetype(dims) {
  const user = [dims.emotionality,dims.entropy,dims.sociability,dims.nostalgia,dims.exploration,dims.mainstream,dims.drive,dims.ether];
  const W = [1.5,1.2,1.0,1.0,1.3,0.8,1.1,1.2];
  const scored = ARCHETYPES.map(a=>({ a, d:Math.sqrt(a.profile.reduce((s,v,i)=>s+W[i]*(user[i]-v)**2,0)) })).sort((x,y)=>x.d-y.d);
  return { primary:scored[0].a, secondary:scored[1].a };
}

function buildGenreDNA(artists) {
  const meta = {};
  for (const g of artists.flatMap(a=>a.genres||[])) {
    let group="Other";
    for (const [k,v] of Object.entries(GENRE_MAP)) { if(g.toLowerCase().includes(k)){group=v;break;} }
    meta[group]=(meta[group]||0)+1;
  }
  const total = Object.values(meta).reduce((a,b)=>a+b,0)||1;
  return Object.entries(meta).map(([name,count])=>({ name, pct:Math.round((count/total)*100), color:GENRE_COLORS[name]||"#808898" })).sort((a,b)=>b.pct-a.pct).slice(0,6);
}

function buildMoodSpectrum(dims) {
  return [
    { label:"Intensity", value:dims.drive },
    { label:"Euphoria",  value:clamp(100-dims.emotionality) },
    { label:"Groove",    value:dims.sociability },
    { label:"Reverie",   value:dims.ether },
    { label:"Rawness",   value:dims.entropy },
    { label:"Memory",    value:dims.nostalgia },
  ];
}

function analyzeAll(tracks, artists) {
  const dims = scoreDimensions(tracks, artists);
  const { primary, secondary } = classifyArchetype(dims);
  const genreDNA = buildGenreDNA(artists);
  const moodSpectrum = buildMoodSpectrum(dims);
  const allGenresList = [...new Set(artists.flatMap(a=>a.genres||[]))];
  const stats = {
    popularity: Math.round(mean(tracks.map(t=>t.popularity??0)))||0,
    topArtist: artists[0]?.name||"—",
    topTrack: tracks[0]?.name||"—",
    uniqueGenres: allGenresList.length||"N/A",
    tracksScored: tracks.length,
    topGenre: genreDNA[0]?.name||(artists.length?"Varied":"—"),
  };
  return { dims, primary, secondary, genreDNA, moodSpectrum, stats, artistNames:artists.map(a=>a.name) };
}

// ─── Radar ────────────────────────────────────────────────────────────────────
function RadarChart({ axes, color }) {
  const CX=140, CY=140, R=100, N=axes.length;
  const ang = i => (2*Math.PI*i)/N - Math.PI/2;
  const pt = (val,i) => { const d=(val/100)*R; return [CX+d*Math.cos(ang(i)), CY+d*Math.sin(ang(i))]; };
  const pts = axes.map((a,i)=>pt(a.value,i));
  const poly = pts.map(p=>p.join(",")).join(" ");
  return (
    <svg viewBox="0 0 280 280" style={{ width:"100%", maxWidth:260 }}>
      {[0.33,0.66,1].map(lvl=>{
        const gp=axes.map((_,i)=>{const a=ang(i);return [CX+lvl*R*Math.cos(a),CY+lvl*R*Math.sin(a)].join(",");}).join(" ");
        return <polygon key={lvl} points={gp} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1"/>;
      })}
      {axes.map((_,i)=><line key={i} x1={CX} y1={CY} x2={CX+R*Math.cos(ang(i))} y2={CY+R*Math.sin(ang(i))} stroke="rgba(255,255,255,0.07)" strokeWidth="1"/>)}
      <polygon points={poly} fill={`${color}22`} stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
      {pts.map(([x,y],i)=><circle key={i} cx={x} cy={y} r={3} fill={color}/>)}
      {axes.map((a,i)=>{
        const lx=CX+(R+26)*Math.cos(ang(i)), ly=CY+(R+26)*Math.sin(ang(i));
        return (
          <g key={i}>
            <text x={lx} y={ly-5} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="'DM Mono',monospace" letterSpacing="1">{a.label.toUpperCase()}</text>
            <text x={lx} y={ly+7} textAnchor="middle" fill={color} fontSize="10" fontFamily="'DM Mono',monospace" fontWeight="700">{a.value}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const G = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@300;400;500&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;1,9..144,300;1,9..144,400&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html{scroll-behavior:smooth;}
body{background:#080808;color:#f2ede4;-webkit-font-smoothing:antialiased;}
::-webkit-scrollbar{width:2px;}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);}

.grain{
  position:fixed;top:-50%;left:-50%;width:200%;height:200%;
  pointer-events:none;z-index:9999;opacity:0.025;
  background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  animation:grain 0.4s steps(1) infinite;
}
@keyframes grain{0%,100%{transform:translate(0,0)}10%{transform:translate(-2%,-3%)}20%{transform:translate(2%,2%)}30%{transform:translate(-1%,3%)}40%{transform:translate(3%,-1%)}50%{transform:translate(-2%,1%)}60%{transform:translate(1%,-2%)}70%{transform:translate(-3%,2%)}80%{transform:translate(2%,-3%)}90%{transform:translate(-1%,1%)}}

@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes barGrow{from{width:0%}to{width:var(--w)}}

.fu{animation:fadeUp 0.7s ease both;}
.fu1{animation:fadeUp 0.7s ease 0.1s both;}
.fu2{animation:fadeUp 0.7s ease 0.2s both;}
.fu3{animation:fadeUp 0.7s ease 0.35s both;}
.fu4{animation:fadeUp 0.7s ease 0.5s both;}
.fi{animation:fadeIn 0.6s ease both;}
`;

// ─── Login ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, noClientId }) {
  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"#080808", padding:"40px 24px", position:"relative", overflow:"hidden" }}>
      <div className="grain"/>

      <div style={{ position:"fixed", top:"-10%", right:"-5%", width:"55vw", height:"55vw", borderRadius:"50%", background:"radial-gradient(ellipse, rgba(110,70,220,0.18) 0%, transparent 65%)", pointerEvents:"none" }}/>
      <div style={{ position:"fixed", bottom:"-15%", left:"-10%", width:"50vw", height:"50vw", borderRadius:"50%", background:"radial-gradient(ellipse, rgba(240,100,80,0.1) 0%, transparent 65%)", pointerEvents:"none" }}/>
      <div style={{ position:"fixed", top:"40%", left:"20%", width:"30vw", height:"30vw", borderRadius:"50%", background:"radial-gradient(ellipse, rgba(60,180,240,0.07) 0%, transparent 65%)", pointerEvents:"none" }}/>

      <div style={{ maxWidth:460, width:"100%", textAlign:"center", position:"relative", zIndex:1 }}>
        <p className="fi" style={{ fontFamily:"'DM Mono'", fontSize:10, letterSpacing:4, color:"rgba(255,255,255,0.28)", textTransform:"uppercase", marginBottom:32 }}>
          A Spotify Listening Portrait
        </p>

        <h1 className="fu" style={{ fontFamily:"'Syne',sans-serif", fontSize:"clamp(60px,14vw,100px)", fontWeight:800, lineHeight:0.9, letterSpacing:"-4px", color:"#f2ede4", marginBottom:12 }}>
          Music
          <span style={{ color:"transparent", WebkitTextStroke:"2px rgba(255,255,255,0.2)" }}>DNA</span>
        </h1>

        <p className="fu1" style={{ fontFamily:"'Fraunces',serif", fontStyle:"italic", fontWeight:300, fontSize:"clamp(16px,3vw,22px)", color:"rgba(255,255,255,0.38)", lineHeight:1.6, maxWidth:340, margin:"0 auto 48px" }}>
          Uncover the archetype hidden inside your listening history.
        </p>

        {noClientId ? (
          <div className="fu2" style={{ border:"1px solid rgba(220,80,60,0.25)", borderRadius:6, padding:"20px 24px", marginBottom:28, textAlign:"left" }}>
            <p style={{ fontFamily:"'DM Mono'", fontSize:9, letterSpacing:3, color:"rgba(220,80,60,0.6)", textTransform:"uppercase", marginBottom:10 }}>Setup Required</p>
            <p style={{ fontFamily:"'Syne'", fontSize:13, color:"rgba(255,255,255,0.4)", lineHeight:1.7 }}>
              Set <code style={{ fontFamily:"'DM Mono'", fontSize:11, background:"rgba(255,255,255,0.07)", padding:"2px 7px", borderRadius:3 }}>VITE_SPOTIFY_CLIENT_ID</code> in your environment.
            </p>
          </div>
        ) : (
          <button className="fu2" onClick={onLogin} style={{
            display:"inline-flex", alignItems:"center", gap:12,
            padding:"17px 44px",
            fontFamily:"'Syne'", fontWeight:700, fontSize:13, letterSpacing:1.5, textTransform:"uppercase",
            cursor:"pointer", border:"none", borderRadius:3,
            color:"#080808", background:"#f2ede4",
            transition:"all 0.25s",
          }}
          onMouseOver={e=>{e.currentTarget.style.background="#fff";e.currentTarget.style.transform="translateY(-2px)";}}
          onMouseOut={e=>{e.currentTarget.style.background="#f2ede4";e.currentTarget.style.transform="translateY(0)";}}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.623.623 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.623.623 0 01.207.857zm1.223-2.722a.779.779 0 01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.779.779 0 01-.456-1.489c3.633-1.115 8.147-.574 11.236 1.326a.779.779 0 01.257 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.532-1.072 9.404-.865 13.115 1.338a.935.935 0 01-.955 1.609z"/>
            </svg>
            Connect Spotify
          </button>
        )}

        <p className="fu3" style={{ fontFamily:"'DM Mono'", fontSize:9, letterSpacing:2, color:"rgba(255,255,255,0.18)", marginTop:22 }}>
          Read-only · Nothing stored · Works with free accounts
        </p>

        <div className="fu4" style={{ display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap", marginTop:48 }}>
          {["Archetype","Mood Radar","Genre DNA","Alter Ego"].map(t=>(
            <span key={t} style={{ fontFamily:"'DM Mono'", fontSize:9, letterSpacing:2, textTransform:"uppercase", color:"rgba(255,255,255,0.3)", padding:"8px 14px", border:"1px solid rgba(255,255,255,0.1)", borderRadius:20 }}>{t}</span>
          ))}
        </div>
      </div>
      <style>{G}</style>
    </div>
  );
}

// ─── Loading ──────────────────────────────────────────────────────────────────
function LoadingScreen({ stage }) {
  const labels = ["Connecting","Fetching library","Mapping genres","Scoring dimensions","Classifying archetype","Almost there"];
  const pct = Math.round(((stage+1)/labels.length)*100);
  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"#080808" }}>
      <div className="grain"/>
      <div style={{ textAlign:"center", padding:24 }}>
        <p style={{ fontFamily:"'Fraunces',serif", fontStyle:"italic", fontSize:32, fontWeight:300, color:"rgba(255,255,255,0.6)", marginBottom:48, animation:"float 2.5s ease-in-out infinite" }}>
          Listening to your listening…
        </p>
        <div style={{ width:180, height:1, background:"rgba(255,255,255,0.08)", margin:"0 auto 0", position:"relative" }}>
          <div style={{ position:"absolute", left:0, top:0, height:1, background:"rgba(255,255,255,0.7)", width:`${pct}%`, transition:"width 0.7s cubic-bezier(0.4,0,0.2,1)" }}/>
        </div>
        <p style={{ fontFamily:"'DM Mono'", fontSize:10, color:"rgba(255,255,255,0.25)", letterSpacing:2, marginTop:18 }}>
          {labels[Math.min(stage, labels.length-1)]}
        </p>
      </div>
      <style>{G}</style>
    </div>
  );
}

// ─── Results ──────────────────────────────────────────────────────────────────
function ResultsScreen({ analysis, onLogout, cardRef }) {
  const { dims, primary, secondary, genreDNA, moodSpectrum, stats, artistNames } = analysis;
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState("");
  const [vis, setVis] = useState(false);

  useEffect(()=>{ const t=setTimeout(()=>setVis(true),80); return ()=>clearTimeout(t); },[]);

  const DIM_META = [
    { key:"emotionality", label:"Emotional Depth" },
    { key:"entropy",      label:"Sonic Chaos"     },
    { key:"sociability",  label:"Social Pull"     },
    { key:"nostalgia",    label:"Nostalgia"       },
    { key:"exploration",  label:"Exploration"     },
    { key:"mainstream",   label:"Mainstream"      },
    { key:"drive",        label:"Intensity"       },
    { key:"ether",        label:"Dreaminess"      },
  ];

  async function handleShare() {
    setSharing(true);
    setShareMsg("Capturing…");
    try {
      if (!window.html2canvas) {
        setShareMsg("Loading renderer…");
        await new Promise((res,rej)=>{
          const s=document.createElement("script");
          s.src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
          s.onload=res; s.onerror=rej; document.head.appendChild(s);
        });
      }
      setShareMsg("Rendering…");
      const canvas = await window.html2canvas(cardRef.current, {
        scale:3, useCORS:true, backgroundColor:primary.bg, logging:false,
      });

      // Always download PNG first
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `musicdna-${primary.id}.png`;
      link.click();

      // Then try native share on mobile (non-blocking)
      if (navigator.share && navigator.canShare) {
        const blob = await new Promise(r=>canvas.toBlob(r,"image/png"));
        const file = new File([blob], `musicdna-${primary.id}.png`, { type:"image/png" });
        if (navigator.canShare({ files:[file] })) {
          await navigator.share({ files:[file], title:`My MusicDNA — ${primary.name}`, text:primary.tagline }).catch(()=>{});
        }
      }
      setShareMsg("Downloaded!");
      setTimeout(()=>setShareMsg(""),2500);
    } catch(e) {
      if (e.name !== "AbortError") { setShareMsg(`Error: ${e.message}`); setTimeout(()=>setShareMsg(""),3500); }
      else setShareMsg("");
    }
    setSharing(false);
  }

  const c = primary.color;

  return (
    <div style={{ background:"#080808", minHeight:"100vh", fontFamily:"'Syne',sans-serif" }}>
      <div className="grain"/>

      {/* Ambient wash tied to archetype color */}
      <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, pointerEvents:"none", zIndex:0,
        background:`radial-gradient(ellipse 70% 55% at 85% 5%, ${c}1a 0%, transparent 60%), radial-gradient(ellipse 45% 45% at 5% 90%, ${c}0e 0%, transparent 60%)` }}/>

      {/* Nav */}
      <nav style={{ position:"fixed", top:0, left:0, right:0, zIndex:100, display:"flex", justifyContent:"space-between", alignItems:"center", padding:"18px 28px", background:"linear-gradient(to bottom,rgba(8,8,8,0.9) 0%,transparent 100%)" }}>
        <span style={{ fontFamily:"'Syne'", fontSize:15, fontWeight:800, color:"rgba(255,255,255,0.45)", letterSpacing:"-0.5px" }}>
          Music<span style={{ color:c }}>DNA</span>
        </span>
        <button onClick={onLogout} style={{ fontFamily:"'DM Mono'", fontSize:9, letterSpacing:2, textTransform:"uppercase", background:"transparent", border:"1px solid rgba(255,255,255,0.12)", borderRadius:3, color:"rgba(255,255,255,0.35)", padding:"8px 14px", cursor:"pointer", transition:"all 0.2s" }}
          onMouseOver={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.3)";e.currentTarget.style.color="rgba(255,255,255,0.6)";}}
          onMouseOut={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.12)";e.currentTarget.style.color="rgba(255,255,255,0.35)";}}
        >Log out</button>
      </nav>

      <div style={{ maxWidth:720, margin:"0 auto", padding:"0 24px 80px", position:"relative", zIndex:1 }}>

        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <div style={{ paddingTop:110, paddingBottom:64, borderBottom:`1px solid rgba(255,255,255,0.07)` }}>
          <p style={{ fontFamily:"'DM Mono'", fontSize:9, letterSpacing:4, textTransform:"uppercase", color:c, marginBottom:18,
            opacity:vis?1:0, transition:"opacity 0.6s ease 0.2s" }}>
            {primary.word} · Your Archetype
          </p>
          <h1 style={{
            fontFamily:"'Syne'", fontWeight:800, lineHeight:0.88,
            fontSize:"clamp(52px,12vw,96px)", letterSpacing:"-3px", color:"#f2ede4", marginBottom:18,
            opacity:vis?1:0, transform:vis?"translateY(0)":"translateY(28px)",
            transition:"all 0.85s cubic-bezier(0.4,0,0.2,1) 0.3s",
          }}>
            {primary.name}
          </h1>
          <p style={{ fontFamily:"'Fraunces',serif", fontStyle:"italic", fontWeight:300,
            fontSize:"clamp(17px,3.5vw,24px)", color:"rgba(255,255,255,0.42)", marginBottom:24, lineHeight:1.5,
            opacity:vis?1:0, transition:"opacity 0.7s ease 0.6s" }}>
            "{primary.tagline}"
          </p>
          <p style={{ fontSize:15, fontWeight:400, color:"rgba(255,255,255,0.42)", lineHeight:1.85, maxWidth:520,
            opacity:vis?1:0, transition:"opacity 0.7s ease 0.8s" }}>
            {primary.desc}
          </p>
          <div style={{ display:"flex", gap:32, marginTop:36, flexWrap:"wrap",
            opacity:vis?1:0, transition:"opacity 0.7s ease 1s" }}>
            {[
              { label:"Top Artist", val:stats.topArtist },
              { label:"Popularity", val:`${stats.popularity}/100` },
              { label:"Top Genre",  val:stats.topGenre },
            ].map(({label,val})=>(
              <div key={label}>
                <p style={{ fontFamily:"'DM Mono'", fontSize:8, letterSpacing:3, color:"rgba(255,255,255,0.2)", textTransform:"uppercase", marginBottom:5 }}>{label}</p>
                <p style={{ fontSize:14, fontWeight:600, color:"rgba(255,255,255,0.62)" }}>{val}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── MOOD + DIMS ───────────────────────────────────────────────────── */}
        <div style={{ padding:"52px 0", borderBottom:`1px solid rgba(255,255,255,0.07)` }}>
          <p style={{ fontFamily:"'DM Mono'", fontSize:9, letterSpacing:4, textTransform:"uppercase", color:"rgba(255,255,255,0.22)", marginBottom:28 }}>Mood Spectrum</p>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"32px 40px", alignItems:"start" }}>
            <div style={{ display:"flex", justifyContent:"center" }}>
              <RadarChart axes={moodSpectrum} color={c}/>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:14, justifyContent:"center" }}>
              {DIM_META.map((d,i)=>(
                <div key={d.key} style={{ opacity:0, animation:`fadeUp 0.5s ease ${0.05*i}s both` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                    <span style={{ fontFamily:"'DM Mono'", fontSize:9, letterSpacing:1, color:"rgba(255,255,255,0.28)", textTransform:"uppercase" }}>{d.label}</span>
                    <span style={{ fontFamily:"'DM Mono'", fontSize:10, color:c, fontWeight:500 }}>{dims[d.key]}</span>
                  </div>
                  <div style={{ height:2, background:"rgba(255,255,255,0.06)", borderRadius:1, overflow:"hidden" }}>
                    <div style={{ height:2, background:`linear-gradient(90deg,${c}55,${c})`, borderRadius:1, "--w":`${dims[d.key]}%`, animation:`barGrow 1s ease ${0.1+0.05*i}s both` }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── GENRE DNA ─────────────────────────────────────────────────────── */}
        <div style={{ padding:"52px 0", borderBottom:`1px solid rgba(255,255,255,0.07)` }}>
          <p style={{ fontFamily:"'DM Mono'", fontSize:9, letterSpacing:4, textTransform:"uppercase", color:"rgba(255,255,255,0.22)", marginBottom:28 }}>Genre DNA</p>
          {genreDNA.length > 0 ? (
            <>
              {genreDNA.map((g,i)=>(
                <div key={g.name} style={{ display:"flex", alignItems:"center", gap:14, marginBottom:16, opacity:0, animation:`fadeUp 0.5s ease ${0.06*i}s both` }}>
                  <span style={{ fontFamily:"'DM Mono'", fontSize:9, color:"rgba(255,255,255,0.18)", width:18, flexShrink:0 }}>{String(i+1).padStart(2,"0")}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                      <span style={{ fontFamily:"'Syne'", fontSize:14, fontWeight:600, color:"rgba(255,255,255,0.6)" }}>{g.name}</span>
                      <span style={{ fontFamily:"'DM Mono'", fontSize:11, color:g.color, fontWeight:500 }}>{g.pct}%</span>
                    </div>
                    <div style={{ height:2, background:"rgba(255,255,255,0.06)", borderRadius:1, overflow:"hidden" }}>
                      <div style={{ height:2, background:g.color, borderRadius:1, "--w":`${g.pct}%`, animation:`barGrow 1.2s ease ${0.1+0.07*i}s both` }}/>
                    </div>
                  </div>
                </div>
              ))}
              {artistNames.length > 0 && (
                <p style={{ fontFamily:"'DM Mono'", fontSize:9.5, color:"rgba(255,255,255,0.18)", lineHeight:2.2, marginTop:20 }}>
                  {artistNames.slice(0,10).join(" · ")}
                </p>
              )}
            </>
          ) : (
            artistNames.slice(0,8).map((name,i)=>(
              <div key={i} style={{ padding:"13px 0", borderBottom:"1px solid rgba(255,255,255,0.05)", fontSize:15, fontWeight:500, color:"rgba(255,255,255,0.48)" }}>{name}</div>
            ))
          )}
        </div>

        {/* ── ALTER EGO ─────────────────────────────────────────────────────── */}
        <div style={{ padding:"52px 0", borderBottom:`1px solid rgba(255,255,255,0.07)` }}>
          <p style={{ fontFamily:"'DM Mono'", fontSize:9, letterSpacing:4, textTransform:"uppercase", color:"rgba(255,255,255,0.22)", marginBottom:28 }}>Alter Ego</p>
          <div style={{ paddingLeft:22, borderLeft:`2px solid ${secondary.color}55` }}>
            <p style={{ fontFamily:"'DM Mono'", fontSize:9, letterSpacing:3, color:secondary.color, textTransform:"uppercase", marginBottom:10 }}>{secondary.word}</p>
            <h3 style={{ fontFamily:"'Syne'", fontWeight:800, fontSize:"clamp(28px,7vw,52px)", letterSpacing:"-2px", color:"#f2ede4", marginBottom:12, lineHeight:1 }}>
              {secondary.name}
            </h3>
            <p style={{ fontFamily:"'Fraunces',serif", fontStyle:"italic", fontWeight:300, fontSize:17, color:"rgba(255,255,255,0.32)", marginBottom:14 }}>
              "{secondary.tagline}"
            </p>
            <p style={{ fontSize:14, fontWeight:400, color:"rgba(255,255,255,0.38)", lineHeight:1.85, maxWidth:460 }}>
              {secondary.desc}
            </p>
          </div>
        </div>

        {/* ── CARD + SHARE ──────────────────────────────────────────────────── */}
        <div style={{ paddingTop:52 }}>
          <p style={{ fontFamily:"'DM Mono'", fontSize:9, letterSpacing:4, textTransform:"uppercase", color:"rgba(255,255,255,0.22)", marginBottom:24 }}>Download Your Portrait</p>

          <div ref={cardRef} style={{
            background:`linear-gradient(145deg, ${primary.bg} 0%, #0c0c0c 100%)`,
            border:"1px solid rgba(255,255,255,0.08)",
            borderRadius:6, padding:"32px 28px", marginBottom:18,
            position:"relative", overflow:"hidden",
          }}>
            <div style={{ position:"absolute", top:-80, right:-80, width:320, height:320, borderRadius:"50%", background:`radial-gradient(circle, ${c}1c 0%, transparent 65%)`, pointerEvents:"none" }}/>
            <div style={{ position:"absolute", bottom:-50, left:-30, width:200, height:200, borderRadius:"50%", background:`radial-gradient(circle, ${secondary.color}0e 0%, transparent 65%)`, pointerEvents:"none" }}/>

            <p style={{ fontFamily:"'DM Mono'", fontSize:8, letterSpacing:4, color:c, textTransform:"uppercase", marginBottom:9 }}>Music DNA · {primary.word}</p>
            <h3 style={{ fontFamily:"'Syne'", fontWeight:800, fontSize:40, letterSpacing:"-2px", lineHeight:1, color:"#f2ede4", marginBottom:9 }}>{primary.name}</h3>
            <p style={{ fontFamily:"'Fraunces',serif", fontStyle:"italic", fontWeight:300, fontSize:13, color:"rgba(255,255,255,0.32)", marginBottom:24 }}>"{primary.tagline}"</p>

            {genreDNA.slice(0,4).map((g)=>(
              <div key={g.name} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:7 }}>
                <div style={{ width:4, height:4, borderRadius:"50%", background:g.color, flexShrink:0 }}/>
                <span style={{ fontFamily:"'DM Mono'", fontSize:9, color:"rgba(255,255,255,0.32)", flex:1 }}>{g.name}</span>
                <span style={{ fontFamily:"'DM Mono'", fontSize:9, color:g.color, fontWeight:500 }}>{g.pct}%</span>
              </div>
            ))}

            <div style={{ height:1, background:"rgba(255,255,255,0.07)", margin:"20px 0" }}/>

            <p style={{ fontFamily:"'DM Mono'", fontSize:7.5, letterSpacing:3, color:"rgba(255,255,255,0.18)", textTransform:"uppercase", marginBottom:4 }}>Alter Ego</p>
            <p style={{ fontSize:13, fontWeight:500, color:"rgba(255,255,255,0.38)", marginBottom:20 }}>
              {secondary.name} — <em style={{ fontStyle:"italic", color:"rgba(255,255,255,0.25)" }}>"{secondary.tagline}"</em>
            </p>

            <div style={{ height:1, background:"rgba(255,255,255,0.07)", margin:"0 0 18px" }}/>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
              {[{ label:"Popularity", val:stats.popularity },{ label:"Genres", val:stats.uniqueGenres },{ label:"Tracks", val:stats.tracksScored }].map(({label,val})=>(
                <div key={label}>
                  <p style={{ fontFamily:"'DM Mono'", fontSize:7, letterSpacing:2, color:"rgba(255,255,255,0.16)", textTransform:"uppercase", marginBottom:5 }}>{label}</p>
                  <p style={{ fontFamily:"'DM Mono'", fontSize:22, color:c, fontWeight:500, lineHeight:1 }}>{val}</p>
                </div>
              ))}
            </div>

            <p style={{ fontFamily:"'DM Mono'", fontSize:7, letterSpacing:2.5, color:"rgba(255,255,255,0.1)", textTransform:"uppercase", marginTop:22 }}>
              musicdna · powered by spotify
            </p>
          </div>

          <button
            onClick={handleShare}
            disabled={sharing}
            style={{
              width:"100%", padding:"18px",
              fontFamily:"'Syne'", fontWeight:700, fontSize:13, letterSpacing:1.5, textTransform:"uppercase",
              cursor:sharing?"wait":"pointer",
              border:"none", borderRadius:4,
              color: sharing ? "rgba(255,255,255,0.35)" : "#080808",
              background: sharing ? "rgba(255,255,255,0.07)" : "#f2ede4",
              transition:"all 0.25s",
            }}
            onMouseOver={e=>{ if(!sharing){e.currentTarget.style.background="#fff";e.currentTarget.style.transform="translateY(-1px)";} }}
            onMouseOut={e=>{ e.currentTarget.style.background=sharing?"rgba(255,255,255,0.07)":"#f2ede4"; e.currentTarget.style.transform="translateY(0)"; }}
          >
            {sharing ? (shareMsg||"Processing…") : shareMsg || "Download PNG"}
          </button>
          <p style={{ fontFamily:"'DM Mono'", fontSize:9, color:"rgba(255,255,255,0.16)", letterSpacing:1.5, marginTop:12, textAlign:"center" }}>
            High-res PNG · Also opens share sheet on mobile
          </p>
        </div>
      </div>
      <style>{G}</style>
    </div>
  );
}

// ─── Error ────────────────────────────────────────────────────────────────────
function ErrorScreen({ message, onRetry }) {
  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#080808", padding:32 }}>
      <div className="grain"/>
      <div style={{ textAlign:"center", maxWidth:380 }}>
        <p style={{ fontFamily:"'DM Mono'", fontSize:9, letterSpacing:3, color:"rgba(220,80,60,0.6)", textTransform:"uppercase", marginBottom:20 }}>Something went wrong</p>
        <p style={{ fontFamily:"'Fraunces',serif", fontStyle:"italic", fontWeight:300, fontSize:20, color:"rgba(255,255,255,0.45)", lineHeight:1.7, marginBottom:36 }}>{message}</p>
        <button onClick={onRetry} style={{ background:"transparent", border:"1px solid rgba(255,255,255,0.12)", borderRadius:3, color:"rgba(255,255,255,0.45)", padding:"11px 24px", cursor:"pointer", fontFamily:"'DM Mono'", fontSize:9, letterSpacing:2, textTransform:"uppercase" }}>Try Again</button>
      </div>
      <style>{G}</style>
    </div>
  );
}

// ─── Init + App ───────────────────────────────────────────────────────────────
function getInitialState() {
  const p = new URLSearchParams(window.location.search);
  const code = p.get("code"), err = p.get("error");
  if (code || err) window.history.replaceState({}, "", window.location.pathname);
  if (err) return { screen:"error", error:`Spotify auth denied: ${err}`, code:null };
  if (code) return { screen:"loading", error:null, code };
  return { screen:"login", error:null, code:null };
}

export default function App() {
  const [init] = useState(getInitialState);
  const [screen, setScreen] = useState(init.screen);
  const [stage, setStage] = useState(0);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(init.error);
  const cardRef = useRef(null);

  useEffect(()=>{
    if (!init.code) return;
    const wait = ms => new Promise(r=>setTimeout(r,ms));
    exchangeToken(init.code)
      .then(({access_token})=>{ setStage(1); return fetchListeningData(access_token); })
      .then(({tracks,artists})=>{ setStage(3); return wait(400).then(()=>({tracks,artists})); })
      .then(({tracks,artists})=>{ setStage(4); const result=analyzeAll(tracks,artists); setStage(5); return wait(500).then(()=>result); })
      .then(result=>{ setAnalysis(result); setScreen("results"); })
      .catch(e=>{ setError(e.message); setScreen("error"); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  function handleLogout() { sessionStorage.clear(); setAnalysis(null); setError(null); setScreen("login"); }

  if (screen==="error") return <ErrorScreen message={error} onRetry={handleLogout}/>;
  if (screen==="loading") return <LoadingScreen stage={stage}/>;
  if (screen==="results" && analysis) return <ResultsScreen analysis={analysis} onLogout={handleLogout} cardRef={cardRef}/>;
  return <LoginScreen onLogin={initiateLogin} noClientId={!CLIENT_ID}/>;
}