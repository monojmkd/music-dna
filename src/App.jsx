import { useState, useEffect, useRef } from "react";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || "";
const REDIRECT_URI =
  import.meta.env.VITE_REDIRECT_URI || window.location.origin + "/";
const SCOPES = "user-top-read user-read-private";

// ─── PKCE Helpers ─────────────────────────────────────────────────────────────
function generateVerifier(len = 128) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join("");
}

async function generateChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function initiateLogin() {
  const verifier = generateVerifier();
  const challenge = await generateChallenge(verifier);
  sessionStorage.setItem("pkce_verifier", verifier);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

async function exchangeToken(code) {
  const verifier = sessionStorage.getItem("pkce_verifier");
  if (!verifier)
    throw new Error("PKCE verifier missing — please try logging in again.");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error("Spotify login failed. Please try again.");
  sessionStorage.removeItem("pkce_verifier");
  return res.json();
}

async function spGet(path, token) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401)
    throw new Error("Session expired. Please log in again.");
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

// ─── Personality Engine ───────────────────────────────────────────────────────
const GENRE_MAP = {
  electronic: "Electronic",
  edm: "Electronic",
  house: "Electronic",
  techno: "Electronic",
  trance: "Electronic",
  ambient: "Electronic",
  "drum and bass": "Electronic",
  dubstep: "Electronic",
  synthwave: "Electronic",
  electro: "Electronic",
  dance: "Electronic",
  chillwave: "Electronic",
  rock: "Rock & Alt",
  alternative: "Rock & Alt",
  indie: "Rock & Alt",
  punk: "Rock & Alt",
  metal: "Rock & Alt",
  grunge: "Rock & Alt",
  "post-rock": "Rock & Alt",
  shoegaze: "Rock & Alt",
  emo: "Rock & Alt",
  hardcore: "Rock & Alt",
  "folk rock": "Rock & Alt",
  "r&b": "R&B & Soul",
  soul: "R&B & Soul",
  "neo soul": "R&B & Soul",
  funk: "R&B & Soul",
  gospel: "R&B & Soul",
  motown: "R&B & Soul",
  "hip hop": "Hip-Hop",
  rap: "Hip-Hop",
  trap: "Hip-Hop",
  drill: "Hip-Hop",
  grime: "Hip-Hop",
  "boom bap": "Hip-Hop",
  folk: "Acoustic & Folk",
  acoustic: "Acoustic & Folk",
  "singer-songwriter": "Acoustic & Folk",
  country: "Acoustic & Folk",
  bluegrass: "Acoustic & Folk",
  americana: "Acoustic & Folk",
  classical: "Classical & Ambient",
  orchestral: "Classical & Ambient",
  jazz: "Classical & Ambient",
  piano: "Classical & Ambient",
  instrumental: "Classical & Ambient",
  "new age": "Classical & Ambient",
  carnatic: "Classical & Ambient",
  hindustani: "Classical & Ambient",
  raga: "Classical & Ambient",
  ghazal: "Classical & Ambient",
  qawwali: "Classical & Ambient",
  pop: "Pop",
  latin: "Pop",
  "k-pop": "Pop",
  "j-pop": "Pop",
  reggaeton: "Pop",
  dancehall: "Pop",
  bollywood: "Bollywood & World",
  filmi: "Bollywood & World",
  hindi: "Bollywood & World",
  "indian pop": "Bollywood & World",
  kollywood: "Bollywood & World",
  tollywood: "Bollywood & World",
  bhangra: "Bollywood & World",
  assamese: "Bollywood & World",
  bengali: "Bollywood & World",
  marathi: "Bollywood & World",
  punjabi: "Bollywood & World",
  tamil: "Bollywood & World",
  telugu: "Bollywood & World",
  kannada: "Bollywood & World",
  malayalam: "Bollywood & World",
  devotional: "Bollywood & World",
  bhajan: "Bollywood & World",
  sufi: "Bollywood & World",
  world: "Bollywood & World",
  afrobeat: "Bollywood & World",
  reggae: "Bollywood & World",
};

const GENRE_COLORS = {
  Electronic: "#7eb8d4",
  "Rock & Alt": "#c97a6a",
  "R&B & Soul": "#b8896a",
  "Hip-Hop": "#c4a96a",
  "Acoustic & Folk": "#8aad8a",
  "Classical & Ambient": "#9a8ab8",
  Pop: "#b87a9a",
  "Bollywood & World": "#c4986a",
  Other: "#6a7a8a",
};

const ARCHETYPES = [
  {
    id: "midnight_drifter",
    name: "Midnight Drifter",
    tagline: "You feel everything twice.",
    desc: "Music is your emotional processing system. You gravitate toward songs that articulate things you can't say out loud. Late nights, low volume, high feeling.",
    profile: [85, 30, 25, 55, 65, 30, 40, 60],
    color: "#9d8ec4",
    bg: "#0e0b14",
    accent: "#c4b8e8",
    word: "Introspective",
  },
  {
    id: "sonic_rebel",
    name: "Sonic Rebel",
    tagline: "You don't listen to music. You survive it.",
    desc: "High energy, genre-agnostic chaos. You need music that matches your internal voltage. Rules and structures exist to be distorted.",
    profile: [60, 80, 35, 25, 80, 20, 85, 15],
    color: "#c47a6a",
    bg: "#140b0b",
    accent: "#e8c0b0",
    word: "Untamed",
  },
  {
    id: "velvet_romantic",
    name: "Velvet Romantic",
    tagline: "You've built a whole world inside three chords.",
    desc: "Deeply emotional, socially warm. R&B, soul, emotional pop. You believe a song should feel like being held by someone who truly understands.",
    profile: [90, 20, 60, 50, 30, 55, 30, 40],
    color: "#b87a9a",
    bg: "#120b10",
    accent: "#e8c0d8",
    word: "Tender",
  },
  {
    id: "neon_runner",
    name: "Neon Runner",
    tagline: "Music is fuel. Everything else is noise.",
    desc: "Function over feeling. BPM is your currency. Your playlist is precision-engineered for momentum — gym, commute, personal records.",
    profile: [25, 50, 80, 10, 45, 70, 95, 10],
    color: "#6a9ab4",
    bg: "#080e14",
    accent: "#b0d4e8",
    word: "Kinetic",
  },
  {
    id: "cosmic_dreamer",
    name: "Cosmic Dreamer",
    tagline: "You listen to music that doesn't exist yet.",
    desc: "Ambient, experimental, instrumental. You treat music as a portal, not entertainment. Sound over song. Maximum diversity, minimum mainstream.",
    profile: [50, 60, 15, 30, 90, 15, 25, 90],
    color: "#6a7ab4",
    bg: "#080b14",
    accent: "#b0bce8",
    word: "Transcendent",
  },
  {
    id: "chaos_curator",
    name: "Chaos Curator",
    tagline: "Your shuffle would give an algorithm an existential crisis.",
    desc: "Truly genre-fluid. Classical to drill to bossa nova in three songs. You don't have a type — you contain all types.",
    profile: [40, 95, 50, 35, 95, 40, 55, 35],
    color: "#c4986a",
    bg: "#140e08",
    accent: "#e8d0b0",
    word: "Boundless",
  },
  {
    id: "nostalgia_architect",
    name: "Nostalgia Architect",
    tagline: "You're building a museum, one playlist at a time.",
    desc: "Drawn to older recordings, acoustic textures, familiar structures. The past isn't where you live — it's what you trust.",
    profile: [65, 25, 45, 95, 25, 45, 35, 50],
    color: "#b4a06a",
    bg: "#14120b",
    accent: "#e8d8b0",
    word: "Reverent",
  },
  {
    id: "cafe_philosopher",
    name: "Café Philosopher",
    tagline: "You have opinions about reverb.",
    desc: "Jazz, acoustic, lo-fi, singer-songwriter. Music is simultaneously background and foreground. Deeply intentional listening.",
    profile: [55, 30, 30, 60, 55, 35, 20, 70],
    color: "#7a9a7a",
    bg: "#0b120b",
    accent: "#b8d8b8",
    word: "Contemplative",
  },
  {
    id: "hype_machine",
    name: "The Hype Machine",
    tagline: "If it's not a banger, what even is the point.",
    desc: "Chart-dominant, high popularity, maximum danceability. You're not chasing trends — you are the trend, three weeks before anyone else.",
    profile: [20, 55, 90, 15, 30, 95, 80, 5],
    color: "#aa7ab4",
    bg: "#110b14",
    accent: "#d8b8e8",
    word: "Electric",
  },
  {
    id: "phantom_aesthete",
    name: "Phantom Aesthete",
    tagline: "You listen like a critic, feel like a poet.",
    desc: "Underground, genre-selective, instrumentally complex. Low mainstream pull, impossibly high sonic standards. Hard to impress.",
    profile: [70, 40, 20, 45, 70, 10, 45, 85],
    color: "#6a9a8a",
    bg: "#080e0c",
    accent: "#b0d8c8",
    word: "Discerning",
  },
  {
    id: "lone_wolf",
    name: "Lone Wolf",
    tagline: "Your taste is a locked room only you have the key to.",
    desc: "Deeply personal, non-social choices. Eclectic underground selections that feel autobiographical. Music as identity, not conversation.",
    profile: [75, 70, 15, 40, 85, 15, 60, 65],
    color: "#8a8a9a",
    bg: "#0b0b0e",
    accent: "#c8c8d8",
    word: "Sovereign",
  },
  {
    id: "solar_architect",
    name: "Solar Architect",
    tagline: "You make the energy in the room.",
    desc: "Upbeat, diverse, socially calibrated. Your music makes things happen — parties, workouts, good moods. You are the soundtrack person.",
    profile: [30, 45, 65, 20, 60, 60, 70, 30],
    color: "#c4946a",
    bg: "#140e08",
    accent: "#e8c8a0",
    word: "Radiant",
  },
];

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

const GK = {
  emotional: [
    "emo",
    "sad",
    "melanchol",
    "heartbreak",
    "grief",
    "blues",
    "soul",
    "slowcore",
    "blackgaze",
    "darkwave",
    "post-punk",
    "doom",
    "shoegaze",
    "chamber",
    "ballad",
    "ghazal",
    "qawwali",
    "sufi",
    "thumri",
    "carnatic",
    "devotional",
    "bhajan",
    "filmi",
    "bollywood sad",
    "indie sad",
  ],
  drive: [
    "metal",
    "punk",
    "hardcore",
    "drum and bass",
    "dnb",
    "speedcore",
    "thrash",
    "hip hop",
    "rap",
    "trap",
    "drill",
    "edm",
    "house",
    "techno",
    "trance",
    "dubstep",
    "funk",
    "bhangra",
    "garba",
    "dandiya",
    "workout",
    "gym",
    "hype",
  ],
  social: [
    "pop",
    "dance",
    "latin",
    "reggaeton",
    "k-pop",
    "j-pop",
    "dancehall",
    "club",
    "afrobeats",
    "disco",
    "hip hop",
    "rap",
    "tropical",
    "filmi",
    "bollywood",
    "indian pop",
    "hindi pop",
    "kollywood",
    "tollywood",
    "party",
  ],
  nostalgia: [
    "classic",
    "oldies",
    "retro",
    "70s",
    "80s",
    "90s",
    "vintage",
    "motown",
    "swing",
    "rockabilly",
    "soul",
    "blues",
    "golden era",
    "old school",
    "hindustani classic",
    "carnatic classic",
    "golden bollywood",
  ],
  ether: [
    "ambient",
    "instrumental",
    "post-rock",
    "neoclassical",
    "new age",
    "sleep",
    "drone",
    "atmospheric",
    "shoegaze",
    "chillwave",
    "lo-fi",
    "vaporwave",
    "dream pop",
    "ethereal",
    "meditation",
    "healing",
    "raga",
    "classical",
  ],
  chaos: [
    "experimental",
    "avant",
    "noise",
    "glitch",
    "free jazz",
    "math rock",
    "microtonal",
    "no wave",
    "industrial",
    "art punk",
    "fusion",
    "world",
    "crossover",
    "eclectic",
  ],
};

function genreSignal(allGenres, keywords) {
  if (!allGenres.length) return 0;
  return (
    allGenres.filter((g) => keywords.some((k) => g.toLowerCase().includes(k)))
      .length / allGenres.length
  );
}

function scoreDimensions(tracks, artists) {
  const pop = tracks.map((t) => t.popularity);
  const yrs = tracks.map((t) =>
    parseInt((t.album?.release_date || "2020").slice(0, 4)),
  );
  const followers = artists.map((a) => a.followers?.total || 0);
  const allGenres = artists.flatMap((a) => a.genres || []);
  const genreCounts = {};
  for (const g of allGenres) genreCounts[g] = (genreCounts[g] || 0) + 1;
  const uniqueCount = Object.keys(genreCounts).length;
  const totalG = allGenres.length || 1;
  let shannonH = 0;
  for (const c of Object.values(genreCounts)) {
    const p = c / totalG;
    if (p > 0) shannonH -= p * Math.log2(p);
  }
  const genreEntropy = Math.min(
    1,
    shannonH / Math.log2(Math.max(uniqueCount, 2)),
  );
  const hasGenres = allGenres.length > 0;
  const avgPop = mean(pop) || 50;
  const avgYear = mean(yrs) || 2018;
  const medFollowers =
    [...followers].sort((a, b) => a - b)[Math.floor(followers.length / 2)] ||
    1000;
  const underground = clamp(1 - Math.log10(Math.max(medFollowers, 100)) / 8);
  const sig = {
    emotional: hasGenres
      ? genreSignal(allGenres, GK.emotional)
      : (1 - avgPop / 100) * 0.6,
    drive: hasGenres ? genreSignal(allGenres, GK.drive) : (avgPop / 100) * 0.5,
    social: hasGenres
      ? genreSignal(allGenres, GK.social)
      : (avgPop / 100) * 0.7,
    nostalgia: hasGenres ? genreSignal(allGenres, GK.nostalgia) : 0,
    ether: hasGenres ? genreSignal(allGenres, GK.ether) : underground * 0.4,
    chaos: hasGenres
      ? genreSignal(allGenres, GK.chaos)
      : (uniqueCount / Math.max(artists.length, 1)) * 0.3,
  };
  const EQ = clamp(sig.emotional * 65 + (1 - avgPop / 100) * 22 + 13);
  const Entropy = clamp(genreEntropy * 58 + sig.chaos * 32 + 5);
  const Social = clamp(sig.social * 62 + (avgPop / 100) * 33 + 5);
  const Nostalgia = clamp(
    (Math.max(0, 2024 - avgYear) / 30) * 70 + sig.nostalgia * 25 + 5,
  );
  const Explore = clamp(
    (Math.min(uniqueCount, 35) / 35) * 45 +
      underground * 35 +
      (1 - avgPop / 100) * 15 +
      5,
  );
  const Pop = clamp(avgPop);
  const Drive = clamp(
    sig.drive * 68 + (1 - Math.max(0, 2024 - avgYear) / 30) * 27 + 5,
  );
  const Ether = clamp(sig.ether * 70 + (1 - sig.social) * 20 + 5);
  return {
    emotionality: Math.round(EQ),
    entropy: Math.round(Entropy),
    sociability: Math.round(Social),
    nostalgia: Math.round(Nostalgia),
    exploration: Math.round(Explore),
    mainstream: Math.round(Pop),
    drive: Math.round(Drive),
    ether: Math.round(Ether),
  };
}

function classifyArchetype(dims) {
  const user = [
    dims.emotionality,
    dims.entropy,
    dims.sociability,
    dims.nostalgia,
    dims.exploration,
    dims.mainstream,
    dims.drive,
    dims.ether,
  ];
  const W = [1.5, 1.2, 1.0, 1.0, 1.3, 0.8, 1.1, 1.2];
  const scored = ARCHETYPES.map((a) => ({
    a,
    d: Math.sqrt(
      a.profile.reduce((s, v, i) => s + W[i] * (user[i] - v) ** 2, 0),
    ),
  })).sort((x, y) => x.d - y.d);
  return { primary: scored[0].a, secondary: scored[1].a };
}

function buildGenreDNA(artists) {
  const meta = {};
  for (const g of artists.flatMap((a) => a.genres || [])) {
    let group = "Other";
    for (const [k, v] of Object.entries(GENRE_MAP)) {
      if (g.toLowerCase().includes(k)) {
        group = v;
        break;
      }
    }
    meta[group] = (meta[group] || 0) + 1;
  }
  const total = Object.values(meta).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(meta)
    .map(([name, count]) => ({
      name,
      pct: Math.round((count / total) * 100),
      color: GENRE_COLORS[name] || "#6a7a8a",
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 7);
}

function buildMoodSpectrum(dims) {
  return [
    { label: "Intensity", value: dims.drive },
    { label: "Euphoria", value: clamp(100 - dims.emotionality) },
    { label: "Groove", value: dims.sociability },
    { label: "Reverie", value: dims.ether },
    { label: "Rawness", value: dims.entropy },
    { label: "Memory", value: dims.nostalgia },
  ];
}

function analyzeAll(tracks, artists) {
  const dims = scoreDimensions(tracks, artists);
  const { primary, secondary } = classifyArchetype(dims);
  const genreDNAList = buildGenreDNA(artists);
  const moodSpectrum = buildMoodSpectrum(dims);
  const allGenresList = [...new Set(artists.flatMap((a) => a.genres || []))];
  const stats = {
    popularity: Math.round(mean(tracks.map((t) => t.popularity ?? 0))) || 0,
    topArtist: artists[0]?.name || "—",
    topTrack: tracks[0]?.name || "—",
    uniqueGenres: allGenresList.length || "N/A",
    tracksScored: tracks.length,
    topGenre: genreDNAList[0]?.name || (artists.length ? "Varied" : "—"),
  };
  return {
    dims,
    primary,
    secondary,
    genreDNA: genreDNAList,
    moodSpectrum,
    stats,
    artistNames: artists.map((a) => a.name),
  };
}

// ─── Radar Chart ──────────────────────────────────────────────────────────────
function RadarChart({ axes, color }) {
  const CX = 155,
    CY = 155,
    R = 108,
    N = axes.length;
  const ang = (i) => (2 * Math.PI * i) / N - Math.PI / 2;
  const pt = (val, i) => {
    const d = (val / 100) * R;
    return [CX + d * Math.cos(ang(i)), CY + d * Math.sin(ang(i))];
  };
  const pts = axes.map((a, i) => pt(a.value, i));
  const poly = pts.map((p) => p.join(",")).join(" ");
  return (
    <svg viewBox="0 0 310 310" style={{ width: "100%", maxWidth: 280 }}>
      {[0.25, 0.5, 0.75, 1].map((lvl) => {
        const gp = axes
          .map((_, i) => {
            const a = ang(i);
            return [
              CX + lvl * R * Math.cos(a),
              CY + lvl * R * Math.sin(a),
            ].join(",");
          })
          .join(" ");
        return (
          <polygon
            key={lvl}
            points={gp}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
        );
      })}
      {axes.map((_, i) => (
        <line
          key={i}
          x1={CX}
          y1={CY}
          x2={CX + R * Math.cos(ang(i))}
          y2={CY + R * Math.sin(ang(i))}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
        />
      ))}
      <polygon
        points={poly}
        fill={`${color}20`}
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3.5} fill={color} opacity={0.9} />
      ))}
      {axes.map((a, i) => {
        const lx = CX + (R + 30) * Math.cos(ang(i));
        const ly = CY + (R + 30) * Math.sin(ang(i));
        return (
          <g key={i}>
            <text
              x={lx}
              y={ly - 5}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="rgba(255,255,255,0.5)"
              fontSize="9"
              fontFamily="'DM Mono',monospace"
              letterSpacing="1"
            >
              {a.label.toUpperCase()}
            </text>
            <text
              x={lx}
              y={ly + 8}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={color}
              fontSize="10"
              fontFamily="'DM Mono',monospace"
              fontWeight="700"
            >
              {a.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── GLOBAL STYLES ────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Mono:wght@300;400;500&family=Barlow:wght@300;400;500;600;700;900&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body { background: #0a0a0a; color: #f0ece4; -webkit-font-smoothing: antialiased; }
  ::-webkit-scrollbar { width: 2px; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); }

  .fade-in { animation: fadeIn 0.9s ease forwards; }
  .fade-up { animation: fadeUp 0.8s ease forwards; }
  .fade-up-d1 { animation: fadeUp 0.8s ease 0.1s both; }
  .fade-up-d2 { animation: fadeUp 0.8s ease 0.2s both; }
  .fade-up-d3 { animation: fadeUp 0.8s ease 0.35s both; }
  .fade-up-d4 { animation: fadeUp 0.8s ease 0.5s both; }
  .fade-up-d5 { animation: fadeUp 0.8s ease 0.65s both; }
  .fade-up-d6 { animation: fadeUp 0.8s ease 0.8s both; }

  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
  @keyframes breathe { 0%,100% { opacity: 0.4; } 50% { opacity: 0.7; } }
  @keyframes grain {
    0%,100% { transform: translate(0,0); }
    10% { transform: translate(-2%,-3%); }
    20% { transform: translate(2%,2%); }
    30% { transform: translate(-1%,3%); }
    40% { transform: translate(3%,-1%); }
    50% { transform: translate(-2%,1%); }
    60% { transform: translate(1%,-2%); }
    70% { transform: translate(-3%,2%); }
    80% { transform: translate(2%,-3%); }
    90% { transform: translate(-1%,1%); }
  }
  @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
  @keyframes numberRoll {
    0% { opacity: 0; transform: translateY(8px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  .grain-overlay {
    position: fixed; top: -50%; left: -50%; width: 200%; height: 200%;
    pointer-events: none; z-index: 9999; opacity: 0.03;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E");
    animation: grain 0.5s steps(1) infinite;
  }

  .btn-primary {
    display: inline-flex; align-items: center; gap: 10px;
    padding: 16px 36px;
    font-family: 'Barlow', sans-serif; font-weight: 600; font-size: 13px;
    letter-spacing: 2px; text-transform: uppercase;
    cursor: pointer; border: none; border-radius: 2px;
    color: #0a0a0a; background: #f0ece4;
    transition: all 0.3s ease;
  }
  .btn-primary:hover { background: #ffffff; transform: translateY(-1px); }

  .btn-ghost {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 20px;
    font-family: 'DM Mono', monospace; font-size: 11px;
    letter-spacing: 1.5px; text-transform: uppercase;
    cursor: pointer; border: 1px solid rgba(255,255,255,0.15); border-radius: 2px;
    color: rgba(255,255,255,0.5); background: transparent;
    transition: all 0.3s ease;
  }
  .btn-ghost:hover { border-color: rgba(255,255,255,0.4); color: rgba(255,255,255,0.8); }

  .section-label {
    font-family: 'DM Mono', monospace; font-size: 10px;
    letter-spacing: 3px; text-transform: uppercase;
    color: rgba(255,255,255,0.35);
  }
`;

// ─── Screen: Login ────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, noClientId }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0a",
        padding: "40px 24px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div className="grain-overlay" />

      {/* Atmospheric light */}
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 600,
          height: 400,
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse, rgba(180,160,120,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          maxWidth: 480,
          width: "100%",
          textAlign: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Overline */}
        <p className="section-label fade-in" style={{ marginBottom: 40 }}>
          A Spotify Listening Portrait
        </p>

        {/* Wordmark */}
        <h1
          className="fade-up"
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: "clamp(52px, 12vw, 84px)",
            fontWeight: 400,
            lineHeight: 1,
            color: "#f0ece4",
            letterSpacing: "-2px",
            marginBottom: 8,
          }}
        >
          Music
          <em style={{ fontStyle: "italic", color: "rgba(255,255,255,0.45)" }}>
            DNA
          </em>
        </h1>

        <p
          className="fade-up-d1"
          style={{
            fontFamily: "'Barlow', sans-serif",
            fontWeight: 300,
            fontSize: 16,
            color: "rgba(255,255,255,0.4)",
            lineHeight: 1.7,
            maxWidth: 340,
            margin: "0 auto 56px",
          }}
        >
          Uncover the archetype that lives inside your listening history.
        </p>

        {/* Divider line */}
        <div
          className="fade-up-d2"
          style={{
            width: 1,
            height: 48,
            background: "rgba(255,255,255,0.12)",
            margin: "0 auto 48px",
          }}
        />

        {noClientId ? (
          <div
            className="fade-up-d3"
            style={{
              border: "1px solid rgba(200,100,80,0.3)",
              borderRadius: 2,
              padding: "24px 28px",
              textAlign: "left",
              marginBottom: 32,
            }}
          >
            <p
              className="section-label"
              style={{ color: "rgba(200,100,80,0.7)", marginBottom: 12 }}
            >
              Setup Required
            </p>
            <p
              style={{
                fontFamily: "'Barlow', sans-serif",
                fontSize: 13,
                color: "rgba(255,255,255,0.5)",
                lineHeight: 1.8,
              }}
            >
              Set{" "}
              <code
                style={{
                  fontFamily: "'DM Mono'",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.7)",
                  background: "rgba(255,255,255,0.08)",
                  padding: "2px 6px",
                }}
              >
                VITE_SPOTIFY_CLIENT_ID
              </code>{" "}
              in your environment to continue.
            </p>
          </div>
        ) : (
          <button className="btn-primary fade-up-d3" onClick={onLogin}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.623.623 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.623.623 0 01.207.857zm1.223-2.722a.779.779 0 01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.779.779 0 01-.456-1.489c3.633-1.115 8.147-.574 11.236 1.326a.779.779 0 01.257 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.532-1.072 9.404-.865 13.115 1.338a.935.935 0 01-.955 1.609z" />
            </svg>
            Connect Spotify
          </button>
        )}

        <p
          className="fade-up-d4"
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 10,
            color: "rgba(255,255,255,0.2)",
            letterSpacing: 1.5,
            marginTop: 28,
            lineHeight: 1.8,
          }}
        >
          Read-only · No data stored · Free accounts supported
        </p>

        {/* Feature list */}
        <div
          className="fade-up-d5"
          style={{
            marginTop: 64,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "24px 32px",
            textAlign: "left",
          }}
        >
          {[
            ["Archetype", "Which of 12 listener archetypes are you?"],
            ["Mood Radar", "Your emotional listening fingerprint"],
            ["Genre DNA", "The sonic palette that defines you"],
            ["Alter Ego", "The archetype you almost became"],
          ].map(([title, sub]) => (
            <div key={title}>
              <p
                style={{
                  fontFamily: "'DM Mono'",
                  fontSize: 10,
                  letterSpacing: 2,
                  color: "rgba(255,255,255,0.3)",
                  marginBottom: 6,
                  textTransform: "uppercase",
                }}
              >
                {title}
              </p>
              <p
                style={{
                  fontFamily: "'Barlow', sans-serif",
                  fontSize: 13,
                  color: "rgba(255,255,255,0.45)",
                  lineHeight: 1.6,
                  fontWeight: 300,
                }}
              >
                {sub}
              </p>
            </div>
          ))}
        </div>
      </div>

      <style>{GLOBAL_CSS}</style>
    </div>
  );
}

// ─── Screen: Loading ──────────────────────────────────────────────────────────
function LoadingScreen({ stage }) {
  const stages = [
    "Connecting",
    "Reading your library",
    "Tracing your genres",
    "Scoring dimensions",
    "Finding your archetype",
    "Composing your portrait",
  ];
  const label = stages[Math.min(stage, stages.length - 1)];
  const pct = Math.round(((stage + 1) / stages.length) * 100);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0a",
      }}
    >
      <div className="grain-overlay" />
      <div style={{ textAlign: "center", padding: 24 }}>
        <h2
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: 36,
            fontWeight: 400,
            color: "#f0ece4",
            marginBottom: 48,
            letterSpacing: "-0.5px",
            animation: "float 3s ease-in-out infinite",
          }}
        >
          Listening
          <br />
          <em style={{ color: "rgba(255,255,255,0.35)" }}>to your listening</em>
        </h2>

        <div
          style={{
            width: 200,
            height: 1,
            background: "rgba(255,255,255,0.08)",
            margin: "0 auto 0",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: 1,
              background: "rgba(255,255,255,0.6)",
              width: `${pct}%`,
              transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
            }}
          />
        </div>

        <p
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            color: "rgba(255,255,255,0.3)",
            letterSpacing: 2,
            marginTop: 20,
          }}
        >
          {label}
        </p>
      </div>
      <style>{GLOBAL_CSS}</style>
    </div>
  );
}

// ─── Results Screen ───────────────────────────────────────────────────────────
function ResultsScreen({ analysis, onLogout, cardRef }) {
  const {
    dims,
    primary,
    secondary,
    genreDNA,
    moodSpectrum,
    stats,
    artistNames,
  } = analysis;

  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState("");
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const DIM_META = [
    { key: "emotionality", label: "Emotional Depth", color: primary.accent },
    { key: "entropy", label: "Sonic Chaos", color: primary.accent },
    { key: "sociability", label: "Social Pull", color: primary.accent },
    { key: "nostalgia", label: "Nostalgia", color: primary.accent },
    { key: "exploration", label: "Exploration", color: primary.accent },
    { key: "mainstream", label: "Mainstream", color: primary.accent },
    { key: "drive", label: "Intensity", color: primary.accent },
    { key: "ether", label: "Dreaminess", color: primary.accent },
  ];

  async function handleShare() {
    setSharing(true);
    setShareMsg("Capturing...");
    try {
      if (!window.html2canvas) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src =
            "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
          s.onload = res;
          s.onerror = rej;
          document.head.appendChild(s);
        });
      }
      const canvas = await window.html2canvas(cardRef.current, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: primary.bg,
        logging: false,
      });
      if (navigator.share && navigator.canShare) {
        const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
        const file = new File([blob], `musicdna-${primary.id}.png`, {
          type: "image/png",
        });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `My MusicDNA — ${primary.name}`,
            text: primary.tagline,
          });
          setShareMsg("");
          setSharing(false);
          return;
        }
      }
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `musicdna-${primary.id}.png`;
      a.click();
      setShareMsg("");
    } catch (e) {
      if (e.name !== "AbortError") {
        setShareMsg(`Error: ${e.message}`);
        setTimeout(() => setShareMsg(""), 3500);
      } else setShareMsg("");
    }
    setSharing(false);
  }

  return (
    <div
      style={{
        background: "#0a0a0a",
        minHeight: "100vh",
        fontFamily: "'Barlow', sans-serif",
      }}
    >
      <div className="grain-overlay" />

      {/* Nav */}
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 32px",
          background:
            "linear-gradient(to bottom, rgba(10,10,10,0.9) 0%, transparent 100%)",
        }}
      >
        <span
          style={{
            fontFamily: "'Instrument Serif'",
            fontSize: 18,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          Music<em style={{ fontStyle: "italic" }}>DNA</em>
        </span>
        <button className="btn-ghost" onClick={onLogout}>
          Log out
        </button>
      </nav>

      {/* ── SECTION 1: ARCHETYPE REVEAL ─────────────────────────────────────── */}
      <section
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "120px 32px 80px",
          position: "relative",
          overflow: "hidden",
          background: primary.bg,
        }}
      >
        {/* Background atmospheric wash */}
        <div
          style={{
            position: "absolute",
            top: "-30%",
            right: "-20%",
            width: "70vw",
            height: "70vw",
            borderRadius: "50%",
            background: `radial-gradient(ellipse, ${primary.color}12 0%, transparent 70%)`,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-20%",
            left: "-10%",
            width: "50vw",
            height: "50vw",
            borderRadius: "50%",
            background: `radial-gradient(ellipse, ${primary.color}08 0%, transparent 70%)`,
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            maxWidth: 680,
            margin: "0 auto",
            width: "100%",
            position: "relative",
          }}
        >
          {/* Overline */}
          <p className="section-label fade-in" style={{ marginBottom: 32 }}>
            Your Archetype · {new Date().getFullYear()}
          </p>

          {/* One-word descriptor */}
          <p
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              letterSpacing: 4,
              color: primary.color,
              marginBottom: 16,
              textTransform: "uppercase",
              opacity: revealed ? 1 : 0,
              transition: "opacity 0.6s ease 0.3s",
            }}
          >
            {primary.word}
          </p>

          {/* Name */}
          <h1
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: "clamp(48px, 10vw, 96px)",
              fontWeight: 400,
              lineHeight: 1,
              letterSpacing: "-2px",
              color: "#f0ece4",
              marginBottom: 32,
              opacity: revealed ? 1 : 0,
              transform: revealed ? "translateY(0)" : "translateY(32px)",
              transition: "all 0.9s cubic-bezier(0.4,0,0.2,1) 0.4s",
            }}
          >
            {primary.name}
          </h1>

          {/* Tagline */}
          <p
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontStyle: "italic",
              fontSize: "clamp(18px, 4vw, 26px)",
              fontWeight: 400,
              color: "rgba(255,255,255,0.5)",
              marginBottom: 40,
              lineHeight: 1.5,
              opacity: revealed ? 1 : 0,
              transition: "opacity 0.8s ease 0.7s",
            }}
          >
            "{primary.tagline}"
          </p>

          {/* Horizontal rule */}
          <div
            style={{
              width: 60,
              height: 1,
              background: `${primary.color}60`,
              marginBottom: 32,
              opacity: revealed ? 1 : 0,
              transition: "opacity 0.8s ease 0.9s",
            }}
          />

          {/* Description */}
          <p
            style={{
              fontSize: 16,
              fontWeight: 300,
              lineHeight: 1.9,
              color: "rgba(255,255,255,0.55)",
              maxWidth: 520,
              opacity: revealed ? 1 : 0,
              transition: "opacity 0.8s ease 1.1s",
            }}
          >
            {primary.desc}
          </p>

          {/* Stats row */}
          <div
            style={{
              display: "flex",
              gap: 48,
              marginTop: 64,
              flexWrap: "wrap",
              opacity: revealed ? 1 : 0,
              transition: "opacity 0.8s ease 1.3s",
            }}
          >
            {[
              { label: "Top Artist", value: stats.topArtist },
              { label: "Popularity", value: `${stats.popularity}/100` },
              { label: "Top Genre", value: stats.topGenre },
            ].map(({ label, value }) => (
              <div key={label}>
                <p
                  style={{
                    fontFamily: "'DM Mono'",
                    fontSize: 9,
                    letterSpacing: 3,
                    color: "rgba(255,255,255,0.25)",
                    marginBottom: 8,
                    textTransform: "uppercase",
                  }}
                >
                  {label}
                </p>
                <p
                  style={{
                    fontSize: 15,
                    fontWeight: 500,
                    color: "rgba(255,255,255,0.75)",
                  }}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 2: MOOD SPECTRUM ─────────────────────────────────────────── */}
      <section
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "100px 32px",
          background: "#0a0a0a",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "80vw",
            height: "80vw",
            maxWidth: 600,
            borderRadius: "50%",
            background: `radial-gradient(ellipse, ${primary.color}06 0%, transparent 70%)`,
            pointerEvents: "none",
          }}
        />

        <div style={{ maxWidth: 680, margin: "0 auto", width: "100%" }}>
          <p className="section-label fade-in" style={{ marginBottom: 20 }}>
            02 — Mood Spectrum
          </p>
          <h2
            className="fade-up"
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: "clamp(32px, 7vw, 64px)",
              fontWeight: 400,
              lineHeight: 1.1,
              letterSpacing: "-1px",
              color: "#f0ece4",
              marginBottom: 16,
            }}
          >
            Your Emotional
            <br />
            <em
              style={{ color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}
            >
              Fingerprint
            </em>
          </h2>
          <p
            className="fade-up-d1"
            style={{
              fontSize: 15,
              color: "rgba(255,255,255,0.4)",
              lineHeight: 1.8,
              fontWeight: 300,
              maxWidth: 400,
              marginBottom: 56,
            }}
          >
            Six dimensions distilled from your listening history.
          </p>

          <div
            className="fade-up-d2"
            style={{ display: "flex", justifyContent: "center" }}
          >
            <RadarChart axes={moodSpectrum} color={primary.color} />
          </div>

          {/* Dimension bars */}
          <div
            className="fade-up-d3"
            style={{
              marginTop: 56,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "24px 48px",
            }}
          >
            {DIM_META.map((d) => (
              <div key={d.key}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'DM Mono'",
                      fontSize: 10,
                      letterSpacing: 1.5,
                      color: "rgba(255,255,255,0.3)",
                      textTransform: "uppercase",
                    }}
                  >
                    {d.label}
                  </span>
                  <span
                    style={{
                      fontFamily: "'DM Mono'",
                      fontSize: 11,
                      color: primary.color,
                      fontWeight: 500,
                    }}
                  >
                    {dims[d.key]}
                  </span>
                </div>
                <div
                  style={{
                    height: 1,
                    background: "rgba(255,255,255,0.07)",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      height: 1,
                      width: `${dims[d.key]}%`,
                      background: primary.color,
                      transition: "width 1.2s cubic-bezier(0.4,0,0.2,1)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 3: GENRE DNA ─────────────────────────────────────────────── */}
      <section
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "100px 32px",
          background: primary.bg,
          position: "relative",
        }}
      >
        <div style={{ maxWidth: 680, margin: "0 auto", width: "100%" }}>
          <p className="section-label" style={{ marginBottom: 20 }}>
            03 — Genre DNA
          </p>
          <h2
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: "clamp(32px, 7vw, 64px)",
              fontWeight: 400,
              lineHeight: 1.1,
              letterSpacing: "-1px",
              color: "#f0ece4",
              marginBottom: 16,
            }}
          >
            The Palette
            <br />
            <em
              style={{ color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}
            >
              of Your Sound
            </em>
          </h2>

          {genreDNA.length > 0 ? (
            <>
              {/* Large genre bars */}
              <div style={{ marginTop: 56 }}>
                {genreDNA.map((g, i) => (
                  <div
                    key={g.name}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 20,
                      marginBottom: 28,
                      opacity: 0,
                      animation: `fadeUp 0.6s ease ${0.1 + i * 0.08}s forwards`,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'DM Mono'",
                        fontSize: 10,
                        color: "rgba(255,255,255,0.25)",
                        width: 28,
                        textAlign: "right",
                      }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 8,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 15,
                            fontWeight: 500,
                            color: "rgba(255,255,255,0.75)",
                          }}
                        >
                          {g.name}
                        </span>
                        <span
                          style={{
                            fontFamily: "'DM Mono'",
                            fontSize: 12,
                            color: g.color,
                          }}
                        >
                          {g.pct}%
                        </span>
                      </div>
                      <div
                        style={{
                          height: 2,
                          background: "rgba(255,255,255,0.05)",
                          borderRadius: 1,
                        }}
                      >
                        <div
                          style={{
                            height: 2,
                            borderRadius: 1,
                            width: `${g.pct}%`,
                            background: g.color,
                            transition: "width 1.4s cubic-bezier(0.4,0,0.2,1)",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Top artists note */}
              {artistNames.length > 0 && (
                <div
                  style={{
                    marginTop: 48,
                    paddingTop: 40,
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <p
                    style={{
                      fontFamily: "'DM Mono'",
                      fontSize: 9,
                      letterSpacing: 3,
                      color: "rgba(255,255,255,0.25)",
                      marginBottom: 16,
                      textTransform: "uppercase",
                    }}
                  >
                    Drawn from artists including
                  </p>
                  <p
                    style={{
                      fontSize: 14,
                      color: "rgba(255,255,255,0.35)",
                      lineHeight: 1.9,
                      fontWeight: 300,
                    }}
                  >
                    {artistNames.slice(0, 10).join(" · ")}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div style={{ marginTop: 56 }}>
              <p
                style={{
                  fontSize: 14,
                  color: "rgba(255,255,255,0.35)",
                  lineHeight: 1.9,
                }}
              >
                Your genre landscape is too personal to categorize. That's rare.
              </p>
              <div style={{ marginTop: 32 }}>
                {artistNames.slice(0, 8).map((name, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "16px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      fontSize: 15,
                      fontWeight: 400,
                      color: "rgba(255,255,255,0.6)",
                    }}
                  >
                    {name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── SECTION 4: ALTER EGO ─────────────────────────────────────────────── */}
      <section
        style={{
          minHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "100px 32px",
          background: "#0a0a0a",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "50%",
            background: `linear-gradient(to top, ${secondary.bg} 0%, transparent 100%)`,
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            maxWidth: 680,
            margin: "0 auto",
            width: "100%",
            position: "relative",
          }}
        >
          <p className="section-label" style={{ marginBottom: 20 }}>
            04 — Alter Ego
          </p>
          <h2
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: "clamp(28px, 6vw, 52px)",
              fontWeight: 400,
              lineHeight: 1.2,
              letterSpacing: "-1px",
              color: "rgba(255,255,255,0.35)",
              marginBottom: 48,
            }}
          >
            On other nights,
            <br />
            you become —
          </h2>

          <div
            style={{
              display: "flex",
              gap: 48,
              alignItems: "flex-start",
              borderLeft: `2px solid ${secondary.color}40`,
              paddingLeft: 32,
            }}
          >
            <div>
              <p
                style={{
                  fontFamily: "'DM Mono'",
                  fontSize: 10,
                  letterSpacing: 3,
                  color: secondary.color,
                  marginBottom: 12,
                  textTransform: "uppercase",
                }}
              >
                {secondary.word}
              </p>
              <h3
                style={{
                  fontFamily: "'Instrument Serif', serif",
                  fontSize: "clamp(32px, 6vw, 56px)",
                  fontWeight: 400,
                  lineHeight: 1,
                  letterSpacing: "-1px",
                  color: "#f0ece4",
                  marginBottom: 20,
                }}
              >
                {secondary.name}
              </h3>
              <p
                style={{
                  fontFamily: "'Instrument Serif'",
                  fontStyle: "italic",
                  fontSize: 18,
                  color: "rgba(255,255,255,0.4)",
                  marginBottom: 24,
                }}
              >
                "{secondary.tagline}"
              </p>
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 300,
                  color: "rgba(255,255,255,0.45)",
                  lineHeight: 1.8,
                  maxWidth: 460,
                }}
              >
                {secondary.desc}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 5: SHAREABLE CARD ────────────────────────────────────────── */}
      <section
        style={{
          padding: "100px 32px 120px",
          background: primary.bg,
          position: "relative",
        }}
      >
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <p className="section-label" style={{ marginBottom: 20 }}>
            05 — Your Portrait
          </p>
          <h2
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: "clamp(28px, 6vw, 48px)",
              fontWeight: 400,
              lineHeight: 1.2,
              letterSpacing: "-1px",
              color: "#f0ece4",
              marginBottom: 48,
            }}
          >
            Save it.
            <br />
            <em
              style={{ fontStyle: "italic", color: "rgba(255,255,255,0.35)" }}
            >
              Share it. Own it.
            </em>
          </h2>

          {/* Share card */}
          <div
            ref={cardRef}
            style={{
              background: `linear-gradient(160deg, ${primary.bg} 0%, #0f0f0f 100%)`,
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 4,
              padding: "40px 32px",
              marginBottom: 24,
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Card atmospheric bg */}
            <div
              style={{
                position: "absolute",
                top: -60,
                right: -60,
                width: 300,
                height: 300,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${primary.color}15 0%, transparent 70%)`,
                pointerEvents: "none",
              }}
            />

            {/* Card header */}
            <div style={{ marginBottom: 36 }}>
              <p
                style={{
                  fontFamily: "'DM Mono'",
                  fontSize: 9,
                  letterSpacing: 4,
                  color: primary.color,
                  marginBottom: 12,
                  textTransform: "uppercase",
                }}
              >
                Music DNA · {primary.word}
              </p>
              <h3
                style={{
                  fontFamily: "'Instrument Serif', serif",
                  fontSize: 40,
                  fontWeight: 400,
                  lineHeight: 1,
                  letterSpacing: "-1px",
                  color: "#f0ece4",
                  marginBottom: 12,
                }}
              >
                {primary.name}
              </h3>
              <p
                style={{
                  fontFamily: "'Instrument Serif'",
                  fontStyle: "italic",
                  fontSize: 15,
                  color: "rgba(255,255,255,0.4)",
                }}
              >
                "{primary.tagline}"
              </p>
            </div>

            {/* Genre bars (mini) */}
            {genreDNA.slice(0, 4).map((g) => (
              <div
                key={g.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    width: 3,
                    height: 3,
                    borderRadius: "50%",
                    background: g.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontFamily: "'DM Mono'",
                    fontSize: 10,
                    color: "rgba(255,255,255,0.4)",
                    flex: 1,
                  }}
                >
                  {g.name}
                </span>
                <span
                  style={{
                    fontFamily: "'DM Mono'",
                    fontSize: 10,
                    color: g.color,
                  }}
                >
                  {g.pct}%
                </span>
              </div>
            ))}

            <div
              style={{
                height: 1,
                background: "rgba(255,255,255,0.06)",
                margin: "24px 0",
              }}
            />

            {/* Alter ego */}
            <p
              style={{
                fontFamily: "'DM Mono'",
                fontSize: 9,
                letterSpacing: 3,
                color: "rgba(255,255,255,0.25)",
                marginBottom: 8,
                textTransform: "uppercase",
              }}
            >
              Alter Ego
            </p>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
              {secondary.name}
            </p>

            <div
              style={{
                height: 1,
                background: "rgba(255,255,255,0.06)",
                margin: "24px 0",
              }}
            />

            {/* Stats */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 16,
              }}
            >
              {[
                { label: "Popularity", val: stats.popularity },
                { label: "Genres", val: stats.uniqueGenres },
                { label: "Tracks", val: stats.tracksScored },
              ].map(({ label, val }) => (
                <div key={label}>
                  <p
                    style={{
                      fontFamily: "'DM Mono'",
                      fontSize: 8,
                      letterSpacing: 2,
                      color: "rgba(255,255,255,0.2)",
                      marginBottom: 6,
                      textTransform: "uppercase",
                    }}
                  >
                    {label}
                  </p>
                  <p
                    style={{
                      fontFamily: "'DM Mono'",
                      fontSize: 18,
                      color: primary.color,
                      fontWeight: 500,
                    }}
                  >
                    {val}
                  </p>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 32 }}>
              <p
                style={{
                  fontFamily: "'DM Mono'",
                  fontSize: 8,
                  letterSpacing: 2,
                  color: "rgba(255,255,255,0.15)",
                  textTransform: "uppercase",
                }}
              >
                musicdna · powered by spotify
              </p>
            </div>
          </div>

          {/* Share button */}
          <button
            onClick={handleShare}
            disabled={sharing}
            style={{
              width: "100%",
              padding: "18px",
              fontFamily: "'Barlow', sans-serif",
              fontWeight: 600,
              fontSize: 13,
              letterSpacing: 2,
              textTransform: "uppercase",
              cursor: sharing ? "wait" : "pointer",
              border: "none",
              borderRadius: 2,
              color: "#0a0a0a",
              background: sharing ? "rgba(240,236,228,0.4)" : "#f0ece4",
              transition: "all 0.3s ease",
            }}
          >
            {sharing ? shareMsg || "Processing..." : "Save Portrait"}
          </button>

          <p
            style={{
              fontFamily: "'DM Mono'",
              fontSize: 10,
              color: "rgba(255,255,255,0.2)",
              letterSpacing: 1.5,
              marginTop: 16,
              textAlign: "center",
            }}
          >
            Exported as high-resolution PNG · Optimized for Stories
          </p>
        </div>
      </section>

      <style>{GLOBAL_CSS}</style>
    </div>
  );
}

// ─── Error Screen ─────────────────────────────────────────────────────────────
function ErrorScreen({ message, onRetry }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0a",
        padding: 32,
      }}
    >
      <div className="grain-overlay" />
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <p
          className="section-label"
          style={{ color: "rgba(200,100,80,0.6)", marginBottom: 24 }}
        >
          Something went wrong
        </p>
        <p
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: 22,
            color: "rgba(255,255,255,0.5)",
            lineHeight: 1.6,
            marginBottom: 40,
          }}
        >
          {message}
        </p>
        <button className="btn-ghost" onClick={onRetry}>
          Try Again
        </button>
      </div>
      <style>{GLOBAL_CSS}</style>
    </div>
  );
}

// ─── Initial State ─────────────────────────────────────────────────────────────
function getInitialState() {
  const p = new URLSearchParams(window.location.search);
  const code = p.get("code");
  const err = p.get("error");
  if (code || err)
    window.history.replaceState({}, "", window.location.pathname);
  if (err)
    return {
      screen: "error",
      error: `Spotify auth denied: ${err}`,
      code: null,
    };
  if (code) return { screen: "loading", error: null, code };
  return { screen: "login", error: null, code: null };
}

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function App() {
  const [init] = useState(getInitialState);
  const [screen, setScreen] = useState(init.screen);
  const [stage, setStage] = useState(0);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(init.error);
  const cardRef = useRef(null);

  useEffect(() => {
    if (!init.code) return;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    exchangeToken(init.code)
      .then(({ access_token }) => {
        setStage(1);
        return fetchListeningData(access_token);
      })
      .then(({ tracks, artists }) => {
        setStage(3);
        return wait(400).then(() => ({ tracks, artists }));
      })
      .then(({ tracks, artists }) => {
        setStage(4);
        const result = analyzeAll(tracks, artists);
        setStage(5);
        return wait(500).then(() => result);
      })
      .then((result) => {
        setAnalysis(result);
        setScreen("results");
      })
      .catch((e) => {
        setError(e.message);
        setScreen("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleLogout() {
    sessionStorage.clear();
    setAnalysis(null);
    setError(null);
    setScreen("login");
  }

  if (screen === "error")
    return <ErrorScreen message={error} onRetry={handleLogout} />;
  if (screen === "loading") return <LoadingScreen stage={stage} />;
  if (screen === "results" && analysis)
    return (
      <ResultsScreen
        analysis={analysis}
        onLogout={handleLogout}
        cardRef={cardRef}
      />
    );
  return <LoginScreen onLogin={initiateLogin} noClientId={!CLIENT_ID} />;
}
