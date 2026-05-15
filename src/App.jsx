import { useState, useCallback, useRef } from "react";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Developer sets these once. Users never see them.
// For Vercel: set VITE_SPOTIFY_CLIENT_ID and VITE_REDIRECT_URI in dashboard.
// For local dev: create .env file with same vars.
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

// ─── Spotify API ──────────────────────────────────────────────────────────────
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
  // audio-features endpoint removed (Spotify 403 for new apps since late 2024)
  // all personality dims now derived purely from genres + track metadata
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
  pop: "Pop",
  latin: "Pop",
  "k-pop": "Pop",
  "j-pop": "Pop",
  reggaeton: "Pop",
  dancehall: "Pop",
};

const GENRE_COLORS = {
  Electronic: "#00f5ff",
  "Rock & Alt": "#ff4757",
  "R&B & Soul": "#ff6b9d",
  "Hip-Hop": "#ffa502",
  "Acoustic & Folk": "#7bed9f",
  "Classical & Ambient": "#a29bfe",
  Pop: "#fd79a8",
  Other: "#636e72",
};

// 12 Archetypes — ideal-point vectors in 8D personality space
// Dims: [Emotionality, Chaos, Sociability, Nostalgia, Exploration, Mainstream, Drive, Ether]
const ARCHETYPES = [
  {
    id: "midnight_drifter",
    name: "Midnight Drifter",
    emoji: "🌙",
    tagline: "You feel everything twice.",
    desc: "Music is your emotional processing system. You gravitate toward songs that articulate things you can't say out loud. Late nights, low volume, high feeling.",
    profile: [85, 30, 25, 55, 65, 30, 40, 60],
    color: "#9d4edd",
  },
  {
    id: "sonic_rebel",
    name: "Sonic Rebel",
    emoji: "⚡",
    tagline: "You don't listen to music. You survive it.",
    desc: "High energy, genre-agnostic chaos. You need music that matches your internal voltage. Rules and structures exist to be distorted.",
    profile: [60, 80, 35, 25, 80, 20, 85, 15],
    color: "#ff4757",
  },
  {
    id: "velvet_romantic",
    name: "Velvet Romantic",
    emoji: "🥀",
    tagline: "You've built a whole world inside three chords.",
    desc: "Deeply emotional, socially warm. R&B, soul, emotional pop. You believe a song should feel like being held by someone who truly understands.",
    profile: [90, 20, 60, 50, 30, 55, 30, 40],
    color: "#e91e8c",
  },
  {
    id: "neon_runner",
    name: "Neon Runner",
    emoji: "🏃",
    tagline: "Music is fuel. Everything else is noise.",
    desc: "Function over feeling. BPM is your currency. Your playlist is precision-engineered for momentum — gym, commute, personal records.",
    profile: [25, 50, 80, 10, 45, 70, 95, 10],
    color: "#06b6d4",
  },
  {
    id: "cosmic_dreamer",
    name: "Cosmic Dreamer",
    emoji: "🌌",
    tagline: "You listen to music that doesn't exist yet.",
    desc: "Ambient, experimental, instrumental. You treat music as a portal, not entertainment. Sound over song. Maximum diversity, minimum mainstream.",
    profile: [50, 60, 15, 30, 90, 15, 25, 90],
    color: "#4361ee",
  },
  {
    id: "chaos_curator",
    name: "Chaos Curator",
    emoji: "🎲",
    tagline: "Your shuffle would give an algorithm an existential crisis.",
    desc: "Truly genre-fluid. Classical to drill to bossa nova in three songs. You don't have a type — you contain all types.",
    profile: [40, 95, 50, 35, 95, 40, 55, 35],
    color: "#f7931e",
  },
  {
    id: "nostalgia_architect",
    name: "Nostalgia Architect",
    emoji: "📼",
    tagline: "You're building a museum, one playlist at a time.",
    desc: "Drawn to older recordings, acoustic textures, familiar structures. The past isn't where you live — it's what you trust.",
    profile: [65, 25, 45, 95, 25, 45, 35, 50],
    color: "#d4a017",
  },
  {
    id: "cafe_philosopher",
    name: "Café Philosopher",
    emoji: "☕",
    tagline: "You have opinions about reverb.",
    desc: "Jazz, acoustic, lo-fi, singer-songwriter. Music is simultaneously background and foreground. Deeply intentional listening.",
    profile: [55, 30, 30, 60, 55, 35, 20, 70],
    color: "#2dc653",
  },
  {
    id: "hype_machine",
    name: "The Hype Machine",
    emoji: "📣",
    tagline: "If it's not a banger, what even is the point.",
    desc: "Chart-dominant, high popularity, maximum danceability. You're not chasing trends — you are the trend, three weeks before anyone else.",
    profile: [20, 55, 90, 15, 30, 95, 80, 5],
    color: "#c77dff",
  },
  {
    id: "phantom_aesthete",
    name: "Phantom Aesthete",
    emoji: "🎭",
    tagline: "You listen like a critic, feel like a poet.",
    desc: "Underground, genre-selective, instrumentally complex. Low mainstream pull, impossibly high sonic standards. Hard to impress.",
    profile: [70, 40, 20, 45, 70, 10, 45, 85],
    color: "#0f9b8e",
  },
  {
    id: "lone_wolf",
    name: "Lone Wolf",
    emoji: "🐺",
    tagline: "Your taste is a locked room only you have the key to.",
    desc: "Deeply personal, non-social choices. Eclectic underground selections that feel autobiographical. Music as identity, not conversation.",
    profile: [75, 70, 15, 40, 85, 15, 60, 65],
    color: "#8d99ae",
  },
  {
    id: "solar_architect",
    name: "Solar Architect",
    emoji: "🔆",
    tagline: "You make the energy in the room.",
    desc: "Upbeat, diverse, socially calibrated. Your music makes things happen — parties, workouts, good moods. You are the soundtrack person.",
    profile: [30, 45, 65, 20, 60, 60, 70, 30],
    color: "#ff7b00",
  },
];

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

// Genre keyword lists — each dimension has "positive" signal genres
const GK = {
  // Emotionality → sad, dark, melancholic genres
  emotional: [
    "emo",
    "sad",
    "melanchol",
    "heartbreak",
    "grief",
    "blues",
    "soul",
    "cry",
    "depression",
    "slowcore",
    "blackgaze",
    "darkwave",
    "post-punk",
    "doom",
    "shoegaze",
    "chamber",
  ],
  // Drive → high-energy genres
  drive: [
    "metal",
    "punk",
    "hardcore",
    "drum and bass",
    "dnb",
    "speedcore",
    "grindcore",
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
  ],
  // Sociability → crowd / party genres
  social: [
    "pop",
    "dance",
    "latin",
    "reggaeton",
    "k-pop",
    "j-pop",
    "dancehall",
    "club",
    "party",
    "afrobeats",
    "disco",
    "hip hop",
    "rap",
    "tropical",
  ],
  // Nostalgia → old-era genre tags
  nostalgia: [
    "classic",
    "oldies",
    "retro",
    "70s",
    "80s",
    "90s",
    "vintage",
    "motown",
    "doo-wop",
    "swing",
    "big band",
    "rockabilly",
    "soul",
    "blues",
  ],
  // Ether → instrumental/ambient/dreamy
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
  ],
  // Chaos → genre-blend / experimental / boundary-breaking
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
    "post-",
    "art punk",
    "skronk",
    "weird",
  ],
};

// Returns 0-1: fraction of all genre tags matching any keyword in list
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
  // artist follower counts → proxy for underground-ness
  const followers = artists.map((a) => a.followers?.total || 0);

  const allGenres = artists.flatMap((a) => a.genres || []);
  const genreCounts = {};
  for (const g of allGenres) genreCounts[g] = (genreCounts[g] || 0) + 1;
  const uniqueCount = Object.keys(genreCounts).length;
  const totalG = allGenres.length || 1;

  // Shannon entropy → spread of genre distribution
  let shannonH = 0;
  for (const c of Object.values(genreCounts)) {
    const p = c / totalG;
    if (p > 0) shannonH -= p * Math.log2(p);
  }
  const genreEntropy = Math.min(
    1,
    shannonH / Math.log2(Math.max(uniqueCount, 2)),
  );

  // 1. EMOTIONALITY — emotional genre affinity + inverse popularity (emotional music less charted)
  const EQ = clamp(
    genreSignal(allGenres, GK.emotional) * 70 + (1 - mean(pop) / 100) * 20 + 10, // baseline
  );

  // 2. CHAOS — Shannon entropy of genre distribution + experimental genre signal
  const Entropy = clamp(
    genreEntropy * 60 + genreSignal(allGenres, GK.chaos) * 40,
  );

  // 3. SOCIABILITY — party/social genre signal + mainstream popularity
  const Social = clamp(
    genreSignal(allGenres, GK.social) * 65 + (mean(pop) / 100) * 35,
  );

  // 4. NOSTALGIA — release year delta + old-era genre tags
  const avgYear = mean(yrs);
  const Nostalgia = clamp(
    (Math.max(0, 2024 - avgYear) / 30) * 75 +
      genreSignal(allGenres, GK.nostalgia) * 25,
  );

  // 5. EXPLORATION — genre diversity + underground bias (low popularity + low follower counts)
  const medianFollowers =
    followers.sort((a, b) => a - b)[Math.floor(followers.length / 2)] || 1;
  const underground = clamp(1 - Math.log10(Math.max(medianFollowers, 1)) / 8); // log scale 0-100M
  const Explore = clamp(
    (Math.min(uniqueCount, 35) / 35) * 50 +
      underground * 30 +
      (1 - mean(pop) / 100) * 20,
  );

  // 6. MAINSTREAM — raw Spotify popularity (0-100)
  const Pop = clamp(mean(pop));

  // 7. DRIVE / INTENSITY — high-energy genre signal + inverse nostalgia (new + fast)
  const Drive = clamp(
    genreSignal(allGenres, GK.drive) * 72 +
      (1 - Math.max(0, 2024 - avgYear) / 30) * 28,
  );

  // 8. ETHER / DREAMINESS — ambient/instrumental genre signal
  const Ether = clamp(
    genreSignal(allGenres, GK.ether) * 75 +
      (1 - genreSignal(allGenres, GK.social)) * 25,
  );

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
      color: GENRE_COLORS[name] || "#636e72",
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
  const genreDNA = buildGenreDNA(artists);
  const moodSpectrum = buildMoodSpectrum(dims);
  const stats = {
    popularity: Math.round(mean(tracks.map((t) => t.popularity))),
    topArtist: artists[0]?.name || "—",
    topTrack: tracks[0]?.name || "—",
    uniqueGenres: [...new Set(artists.flatMap((a) => a.genres || []))].length,
    tracksScored: tracks.length,
    topGenre: buildGenreDNA(artists)[0]?.name || "—",
  };
  return { dims, primary, secondary, genreDNA, moodSpectrum, stats };
}

// ─── SVG: Radar Chart ─────────────────────────────────────────────────────────
function RadarChart({ axes, color }) {
  const CX = 150,
    CY = 150,
    R = 105,
    N = axes.length;
  const ang = (i) => (2 * Math.PI * i) / N - Math.PI / 2;
  const pt = (val, i) => {
    const d = (val / 100) * R;
    return [CX + d * Math.cos(ang(i)), CY + d * Math.sin(ang(i))];
  };
  const pts = axes.map((a, i) => pt(a.value, i));
  const poly = pts.map((p) => p.join(",")).join(" ");
  return (
    <svg
      viewBox="0 0 300 300"
      style={{
        width: "100%",
        maxWidth: 270,
        filter: `drop-shadow(0 0 20px ${color}44)`,
      }}
    >
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
            stroke="rgba(255,255,255,0.07)"
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
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="1"
        />
      ))}
      <polygon
        points={poly}
        fill={`${color}28`}
        stroke={color}
        strokeWidth="2.5"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 10px ${color})` }}
      />
      {pts.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={4.5}
          fill={color}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      ))}
      {axes.map((a, i) => {
        const lx = CX + (R + 26) * Math.cos(ang(i)),
          ly = CY + (R + 26) * Math.sin(ang(i));
        return (
          <text
            key={i}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(255,255,255,0.58)"
            fontSize="9"
            fontFamily="'Space Mono',monospace"
            fontWeight="700"
          >
            {a.label.toUpperCase()}
          </text>
        );
      })}
      {pts.map(([x, y], i) => (
        <text
          key={`v${i}`}
          x={x}
          y={y - 10}
          textAnchor="middle"
          fill={color}
          fontSize="8"
          fontFamily="'Space Mono',monospace"
          fontWeight="700"
          opacity="0.9"
        >
          {axes[i].value}
        </text>
      ))}
    </svg>
  );
}

// ─── SVG: Donut Chart ─────────────────────────────────────────────────────────
function DonutChart({ data }) {
  const CX = 90,
    CY = 90,
    OR = 70,
    IR = 46;
  const GAP = 0.03;
  // Use reduce so we never mutate a variable after render (satisfies react-hooks/immutability)
  const slices = data.reduce((acc, d) => {
    const prev = acc[acc.length - 1];
    const start = prev ? prev.start + prev.sw + GAP : -Math.PI / 2;
    const sw = (d.pct / 100) * 2 * Math.PI - GAP;
    return [...acc, { ...d, start, sw }];
  }, []);
  const arc = (s, sw, O, I) => {
    const ea = s + sw,
      lg = sw > Math.PI ? 1 : 0;
    const x1 = CX + O * Math.cos(s),
      y1 = CY + O * Math.sin(s),
      x2 = CX + O * Math.cos(ea),
      y2 = CY + O * Math.sin(ea);
    const x3 = CX + I * Math.cos(ea),
      y3 = CY + I * Math.sin(ea),
      x4 = CX + I * Math.cos(s),
      y4 = CY + I * Math.sin(s);
    return `M${x1},${y1} A${O},${O} 0 ${lg} 1 ${x2},${y2} L${x3},${y3} A${I},${I} 0 ${lg} 0 ${x4},${y4} Z`;
  };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      <svg
        viewBox="0 0 180 180"
        style={{ width: 136, height: 136, flexShrink: 0 }}
      >
        {slices.map((s, i) => (
          <path
            key={i}
            d={arc(s.start, s.sw, OR, IR)}
            fill={s.color}
            opacity={0.88}
            style={{ filter: `drop-shadow(0 0 5px ${s.color}88)` }}
          />
        ))}
        <circle cx={CX} cy={CY} r={IR - 3} fill="#0b0b18" />
        <text
          x={CX}
          y={CY - 7}
          textAnchor="middle"
          fill="rgba(255,255,255,0.85)"
          fontSize="8.5"
          fontFamily="'Space Mono',monospace"
          fontWeight="700"
        >
          GENRE
        </text>
        <text
          x={CX}
          y={CY + 7}
          textAnchor="middle"
          fill="rgba(255,255,255,0.85)"
          fontSize="8.5"
          fontFamily="'Space Mono',monospace"
          fontWeight="700"
        >
          DNA
        </text>
      </svg>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 5,
          flex: 1,
          minWidth: 0,
        }}
      >
        {data.slice(0, 6).map((d, i) => (
          <div
            key={i}
            style={{ display: "flex", alignItems: "center", gap: 7 }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: d.color,
                boxShadow: `0 0 5px ${d.color}`,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 9.5,
                color: "rgba(255,255,255,0.6)",
                fontFamily: "Space Mono",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {d.name}
            </span>
            <span
              style={{
                fontSize: 9.5,
                color: d.color,
                fontFamily: "Space Mono",
                fontWeight: "bold",
              }}
            >
              {d.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Component: Dim Bar ───────────────────────────────────────────────────────
function DimBar({ label, value, color, icon }) {
  return (
    <div style={{ marginBottom: 9 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 9.5,
            color: "rgba(255,255,255,0.5)",
            fontFamily: "Space Mono",
            display: "flex",
            gap: 5,
            alignItems: "center",
          }}
        >
          <span>{icon}</span>
          {label}
        </span>
        <span
          style={{
            fontSize: 9.5,
            color,
            fontFamily: "Space Mono",
            fontWeight: "bold",
          }}
        >
          {value}
        </span>
      </div>
      <div
        style={{
          height: 3,
          background: "rgba(255,255,255,0.07)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${value}%`,
            height: "100%",
            borderRadius: 2,
            background: `linear-gradient(90deg,${color}55,${color})`,
            boxShadow: `0 0 8px ${color}55`,
          }}
        />
      </div>
    </div>
  );
}

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
        fontFamily: "'Space Mono',monospace",
        background:
          "radial-gradient(ellipse at 25% 40%, #1e0b3d 0%, #0b0b18 55%, #0a1628 100%)",
        padding: "24px 16px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient orbs */}
      <div
        style={{
          position: "fixed",
          top: "5%",
          left: "-8%",
          width: 480,
          height: 480,
          borderRadius: "50%",
          background:
            "radial-gradient(circle,rgba(157,78,237,.12) 0%,transparent 65%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "fixed",
          bottom: "5%",
          right: "-5%",
          width: 380,
          height: 380,
          borderRadius: "50%",
          background:
            "radial-gradient(circle,rgba(6,182,212,.08) 0%,transparent 65%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          maxWidth: 400,
          width: "100%",
          textAlign: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <div
          style={{
            fontSize: 56,
            marginBottom: 14,
            filter: "drop-shadow(0 0 24px rgba(157,78,237,.65))",
          }}
        >
          🎵
        </div>
        <h1
          style={{
            margin: "0 0 6px",
            fontSize: 36,
            fontWeight: 700,
            color: "white",
            letterSpacing: "-1px",
          }}
        >
          Music
          <span style={{ color: "#9d4edd", textShadow: "0 0 24px #9d4edd88" }}>
            DNA
          </span>
        </h1>
        <p
          style={{
            color: "rgba(255,255,255,.35)",
            fontSize: 11,
            letterSpacing: 3,
            margin: "0 0 10px",
          }}
        >
          PERSONALITY PROFILER
        </p>
        <p
          style={{
            color: "rgba(255,255,255,.5)",
            fontSize: 12,
            lineHeight: 1.75,
            margin: "0 0 32px",
            maxWidth: 340,
            display: "inline-block",
          }}
        >
          Discover your music archetype, mood spectrum, and alter ego — all from
          your real Spotify listening data.
        </p>

        {/* Feature chips */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: "center",
            marginBottom: 36,
          }}
        >
          {[
            "🎭 Archetype",
            "📡 Mood Radar",
            "🧬 Genre DNA",
            "🪞 Alter Ego",
          ].map((t) => (
            <span
              key={t}
              style={{
                fontSize: 11,
                padding: "5px 12px",
                borderRadius: 20,
                border: "1px solid rgba(157,78,237,.28)",
                color: "rgba(255,255,255,.5)",
                background: "rgba(157,78,237,.07)",
              }}
            >
              {t}
            </span>
          ))}
        </div>

        {noClientId ? (
          /* Dev forgot to set env var */
          <div
            style={{
              background: "rgba(255,71,87,.08)",
              border: "1px solid rgba(255,71,87,.3)",
              borderRadius: 14,
              padding: "20px 24px",
              marginBottom: 20,
            }}
          >
            <p
              style={{
                color: "#ff4757",
                fontSize: 12,
                lineHeight: 1.75,
                margin: 0,
              }}
            >
              ⚠️ <strong>Developer setup required.</strong>
              <br />
              Set{" "}
              <code
                style={{
                  background: "rgba(255,255,255,.1)",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                VITE_SPOTIFY_CLIENT_ID
              </code>{" "}
              in your <code>.env</code> or Vercel dashboard.
              <br />
              <a
                href="https://developer.spotify.com/dashboard"
                target="_blank"
                rel="noreferrer"
                style={{ color: "#ff8fa0", fontSize: 11 }}
              >
                → developer.spotify.com/dashboard
              </a>
            </p>
          </div>
        ) : (
          /* Normal user sees only this */
          <button
            onClick={onLogin}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              padding: "16px 40px",
              fontFamily: "Space Mono",
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: 1.5,
              cursor: "pointer",
              border: "none",
              borderRadius: 50,
              color: "white",
              background: "linear-gradient(135deg,#1db954 0%,#1ed760 100%)",
              boxShadow: "0 0 40px rgba(29,185,84,.5)",
              transition: "all .25s ease",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = "scale(1.04)";
              e.currentTarget.style.boxShadow = "0 0 55px rgba(29,185,84,.65)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow = "0 0 40px rgba(29,185,84,.5)";
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.623.623 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.623.623 0 01.207.857zm1.223-2.722a.779.779 0 01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.779.779 0 01-.456-1.489c3.633-1.115 8.147-.574 11.236 1.326a.779.779 0 01.257 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.532-1.072 9.404-.865 13.115 1.338a.935.935 0 01-.955 1.609z" />
            </svg>
            LOGIN WITH SPOTIFY
          </button>
        )}

        <p
          style={{
            color: "rgba(255,255,255,.2)",
            fontSize: 10,
            letterSpacing: 1,
            marginTop: 18,
          }}
        >
          Read-only access · No data stored · Works with free Spotify accounts
        </p>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
      `}</style>
    </div>
  );
}

// ─── Screen: Loading ──────────────────────────────────────────────────────────
function LoadingScreen({ stage }) {
  const stages = [
    { label: "Connecting to Spotify...", icon: "🔑" },
    { label: "Fetching your top tracks...", icon: "🎵" },
    { label: "Analysing your genre fingerprint...", icon: "🔬" },
    { label: "Scoring personality dimensions...", icon: "🧠" },
    { label: "Classifying your archetype...", icon: "🎭" },
    { label: "Rendering your profile...", icon: "✨" },
  ];
  const s = stages[Math.min(stage, stages.length - 1)];
  const pct = Math.round(((stage + 1) / stages.length) * 100);
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Space Mono",
        background:
          "radial-gradient(ellipse at 25% 40%,#1e0b3d 0%,#0b0b18 55%,#0a1628 100%)",
      }}
    >
      <div style={{ textAlign: "center", padding: 24 }}>
        <div
          style={{
            fontSize: 50,
            marginBottom: 22,
            animation: "float 2.4s ease-in-out infinite",
          }}
        >
          {s.icon}
        </div>
        <div
          style={{
            width: 220,
            height: 3,
            background: "rgba(255,255,255,.08)",
            borderRadius: 2,
            margin: "0 auto 13px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 2,
              background: "linear-gradient(90deg,#7c3aed,#a78bfa)",
              width: `${pct}%`,
              transition: "width .6s ease",
              boxShadow: "0 0 12px rgba(167,139,250,.55)",
            }}
          />
        </div>
        <p
          style={{
            color: "rgba(255,255,255,.48)",
            fontSize: 12,
            letterSpacing: 1,
          }}
        >
          {s.label}
        </p>
        <p
          style={{
            color: "rgba(255,255,255,.2)",
            fontSize: 10,
            letterSpacing: 2,
            marginTop: 5,
          }}
        >
          {pct}%
        </p>
      </div>
      <style>{`@keyframes float{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-8px) scale(1.05)}}`}</style>
    </div>
  );
}

// ─── Screen: Results ──────────────────────────────────────────────────────────
function ResultsScreen({ analysis, onLogout, cardRef }) {
  const { dims, primary, secondary, genreDNA, moodSpectrum, stats } = analysis;
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState("");

  const DIM_META = [
    {
      key: "emotionality",
      label: "Emotionality",
      icon: "💜",
      color: "#9d4edd",
    },
    { key: "entropy", label: "Chaos", icon: "🌀", color: "#ff4757" },
    { key: "sociability", label: "Sociability", icon: "🌐", color: "#2dc653" },
    { key: "nostalgia", label: "Nostalgia", icon: "📼", color: "#f7c59f" },
    { key: "exploration", label: "Exploration", icon: "🔭", color: "#4cc9f0" },
    { key: "mainstream", label: "Mainstream", icon: "📡", color: "#ff6bb5" },
    { key: "drive", label: "Intensity", icon: "⚡", color: "#ff7b00" },
    { key: "ether", label: "Dreaminess", icon: "🌫", color: "#818cf8" },
  ];

  async function handleShare() {
    setSharing(true);
    setShareMsg("Loading renderer...");
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
      setShareMsg("Capturing card...");
      const canvas = await window.html2canvas(cardRef.current, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: "#0b0b18",
        logging: false,
      });
      setShareMsg("Saving...");
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `music-dna-${primary.id}.png`;
      a.click();
      setShareMsg("");
    } catch (e) {
      setShareMsg(`Error: ${e.message}`);
      setTimeout(() => setShareMsg(""), 3500);
    }
    setSharing(false);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse at 20% 15%,#1e0b3d 0%,#0b0b18 55%,#0a1628 100%)",
        fontFamily: "'Space Mono',monospace",
        padding: "20px 16px 52px",
      }}
    >
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle,${primary.color}14 0%,transparent 65%)`,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div
        style={{
          maxWidth: 700,
          margin: "0 auto",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Topbar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,.3)",
              letterSpacing: 2,
            }}
          >
            MUSIC<span style={{ color: primary.color }}>DNA</span>
          </span>
          <button
            onClick={onLogout}
            style={{
              background: "rgba(255,255,255,.05)",
              border: "1px solid rgba(255,255,255,.11)",
              borderRadius: 7,
              color: "rgba(255,255,255,.4)",
              fontSize: 10,
              padding: "7px 13px",
              cursor: "pointer",
              fontFamily: "Space Mono",
              letterSpacing: 1,
            }}
          >
            ↩ LOG OUT
          </button>
        </div>

        {/* ═══ SHAREABLE CARD ═══ */}
        <div
          ref={cardRef}
          style={{
            background:
              "linear-gradient(148deg,#0d0b1e 0%,#12082a 45%,#08101f 100%)",
            border: `1px solid ${primary.color}25`,
            borderRadius: 22,
            padding: "28px 26px",
            marginBottom: 14,
            boxShadow: `0 0 90px ${primary.color}16,0 0 28px rgba(0,0,0,.85),inset 0 1px 0 rgba(255,255,255,.04)`,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -120,
              right: -120,
              width: 450,
              height: 450,
              borderRadius: "50%",
              background: `radial-gradient(circle,${primary.color}14 0%,transparent 65%)`,
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: -80,
              left: -80,
              width: 320,
              height: 320,
              borderRadius: "50%",
              background: `radial-gradient(circle,${secondary.color}0b 0%,transparent 65%)`,
              pointerEvents: "none",
            }}
          />

          {/* Archetype Hero */}
          <div
            style={{
              textAlign: "center",
              marginBottom: 26,
              position: "relative",
            }}
          >
            <div
              style={{
                fontSize: 56,
                lineHeight: 1,
                marginBottom: 10,
                filter: `drop-shadow(0 0 26px ${primary.color}88)`,
              }}
            >
              {primary.emoji}
            </div>
            <div
              style={{
                fontSize: 8.5,
                letterSpacing: 4,
                color: primary.color,
                marginBottom: 7,
                opacity: 0.9,
              }}
            >
              YOUR ARCHETYPE
            </div>
            <h2
              style={{
                margin: "0 0 8px",
                fontSize: 29,
                color: "white",
                fontWeight: 700,
                letterSpacing: "-.5px",
                textShadow: `0 0 42px ${primary.color}44`,
              }}
            >
              {primary.name}
            </h2>
            <p
              style={{
                color: "rgba(255,255,255,.42)",
                fontSize: 13,
                fontStyle: "italic",
                margin: "0 0 12px",
              }}
            >
              "{primary.tagline}"
            </p>
            <p
              style={{
                color: "rgba(255,255,255,.65)",
                fontSize: 12,
                lineHeight: 1.78,
                maxWidth: 430,
                margin: "0 auto",
              }}
            >
              {primary.desc}
            </p>
          </div>

          {/* Mood Spectrum */}
          <div
            style={{
              background: "rgba(0,0,0,.32)",
              borderRadius: 16,
              padding: "16px 18px",
              marginBottom: 13,
              border: "1px solid rgba(255,255,255,.04)",
            }}
          >
            <div
              style={{
                fontSize: 8.5,
                letterSpacing: 3,
                color: "rgba(255,255,255,.28)",
                marginBottom: 12,
                textAlign: "center",
              }}
            >
              ◈ MOOD SPECTRUM
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <RadarChart axes={moodSpectrum} color={primary.color} />
            </div>
          </div>

          {/* Genre DNA + Dimensions */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 11,
              marginBottom: 13,
            }}
          >
            <div
              style={{
                background: "rgba(0,0,0,.32)",
                borderRadius: 16,
                padding: "14px 13px",
                border: "1px solid rgba(255,255,255,.04)",
              }}
            >
              <div
                style={{
                  fontSize: 8.5,
                  letterSpacing: 3,
                  color: "rgba(255,255,255,.28)",
                  marginBottom: 12,
                }}
              >
                ◈ GENRE DNA
              </div>
              <DonutChart data={genreDNA} />
            </div>
            <div
              style={{
                background: "rgba(0,0,0,.32)",
                borderRadius: 16,
                padding: "14px 13px",
                border: "1px solid rgba(255,255,255,.04)",
              }}
            >
              <div
                style={{
                  fontSize: 8.5,
                  letterSpacing: 3,
                  color: "rgba(255,255,255,.28)",
                  marginBottom: 12,
                }}
              >
                ◈ DIMENSIONS
              </div>
              {DIM_META.map((d) => (
                <DimBar
                  key={d.key}
                  label={d.label}
                  value={dims[d.key]}
                  color={d.color}
                  icon={d.icon}
                />
              ))}
            </div>
          </div>

          {/* Alter Ego */}
          <div
            style={{
              background: `linear-gradient(135deg,${secondary.color}0d 0%,rgba(0,0,0,.28) 100%)`,
              border: `1px solid ${secondary.color}22`,
              borderRadius: 16,
              padding: "15px 17px",
              marginBottom: 13,
            }}
          >
            <div
              style={{
                fontSize: 8.5,
                letterSpacing: 3,
                color: "rgba(255,255,255,.28)",
                marginBottom: 11,
              }}
            >
              🪞 YOUR ALTER EGO
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 15 }}>
              <div
                style={{
                  fontSize: 38,
                  lineHeight: 1,
                  filter: `drop-shadow(0 0 14px ${secondary.color}88)`,
                }}
              >
                {secondary.emoji}
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    color: secondary.color,
                    fontSize: 14,
                    fontWeight: "bold",
                    marginBottom: 6,
                  }}
                >
                  {secondary.name}
                </div>
                <div
                  style={{
                    color: "rgba(255,255,255,.52)",
                    fontSize: 11,
                    lineHeight: 1.68,
                  }}
                >
                  On different nights, with different playlists — you become a{" "}
                  <span style={{ color: secondary.color, fontStyle: "italic" }}>
                    {secondary.name}
                  </span>
                  . <em>"{secondary.tagline}"</em>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Strip */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 8,
              marginBottom: 14,
            }}
          >
            {[
              { label: "POPULARITY", val: stats.popularity, icon: "📈" },
              { label: "TOP GENRE", val: stats.topGenre, icon: "🎸" },
              { label: "GENRES", val: `${stats.uniqueGenres}`, icon: "🌐" },
              {
                label: "TOP ARTIST",
                val: stats.topArtist.split(" ").slice(0, 2).join(" "),
                icon: "🎤",
              },
              {
                label: "TOP TRACK",
                val:
                  stats.topTrack.length > 13
                    ? stats.topTrack.slice(0, 12) + "…"
                    : stats.topTrack,
                icon: "🎵",
              },
              { label: "TRACKS", val: `${stats.tracksScored}`, icon: "💿" },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  background: "rgba(0,0,0,.32)",
                  borderRadius: 12,
                  padding: "10px 8px 9px",
                  textAlign: "center",
                  border: "1px solid rgba(255,255,255,.04)",
                }}
              >
                <div style={{ fontSize: 13, marginBottom: 3 }}>{s.icon}</div>
                <div
                  style={{
                    fontSize: 8,
                    color: "rgba(255,255,255,.28)",
                    letterSpacing: 2,
                    marginBottom: 4,
                  }}
                >
                  {s.label}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "white",
                    fontWeight: "bold",
                    lineHeight: 1,
                  }}
                >
                  {s.val}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              textAlign: "center",
              fontSize: 8.5,
              color: "rgba(255,255,255,.13)",
              letterSpacing: 3,
            }}
          >
            MUSICDNA • POWERED BY SPOTIFY
          </div>
        </div>

        {/* Share Button */}
        <button
          onClick={handleShare}
          disabled={sharing}
          style={{
            width: "100%",
            padding: "14px",
            fontFamily: "Space Mono",
            border: "none",
            borderRadius: 13,
            color: "white",
            fontSize: 12,
            fontWeight: "bold",
            letterSpacing: 2,
            cursor: sharing ? "wait" : "pointer",
            marginBottom: 8,
            background: sharing
              ? "rgba(124,58,237,.4)"
              : "linear-gradient(135deg,#7c3aed,#4f46e5)",
            boxShadow: "0 0 42px rgba(124,58,237,.48)",
            transition: "all .3s",
          }}
        >
          {sharing
            ? `⏳ ${shareMsg || "PROCESSING..."}`
            : "📸 SAVE & SHARE CARD"}
        </button>
        <p
          style={{
            textAlign: "center",
            fontSize: 9.5,
            color: "rgba(255,255,255,.18)",
            letterSpacing: 1,
            margin: 0,
          }}
        >
          Exports a high-res PNG · Perfect for Stories &amp; posts
        </p>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-thumb{background:rgba(157,78,237,.4);border-radius:2px;}
      `}</style>
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
        background: "#0b0b18",
        fontFamily: "Space Mono",
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <div style={{ fontSize: 44, marginBottom: 18 }}>⚠️</div>
        <p
          style={{
            color: "#ff4757",
            fontSize: 12,
            lineHeight: 1.75,
            marginBottom: 22,
          }}
        >
          {message}
        </p>
        <button
          onClick={onRetry}
          style={{
            background: "rgba(255,255,255,.07)",
            border: "1px solid rgba(255,255,255,.13)",
            borderRadius: 9,
            color: "white",
            padding: "10px 22px",
            cursor: "pointer",
            fontFamily: "Space Mono",
            fontSize: 11,
          }}
        >
          ↩ Try Again
        </button>
      </div>
    </div>
  );
}

// ─── Read URL params once (outside component — pure, no hooks) ────────────────
function getInitialState() {
  const p = new URLSearchParams(window.location.search);
  const code = p.get("code");
  const err = p.get("error");
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
  // Lazy-initialise from URL so we never call setState synchronously inside an effect
  const [init] = useState(getInitialState);
  const [screen, setScreen] = useState(init.screen);
  const [stage, setStage] = useState(0);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(init.error);
  const cardRef = useRef(null);
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  const runAnalysis = useCallback(async (code) => {
    setScreen("loading");
    setStage(0);
    try {
      const { access_token } = await exchangeToken(code);
      setStage(1);
      const { tracks, artists } = await fetchListeningData(access_token);
      setStage(3);
      await delay(400);
      setStage(4);
      const result = analyzeAll(tracks, artists);
      setStage(5);
      await delay(500);
      setAnalysis(result);
      setScreen("results");
    } catch (e) {
      setError(e.message);
      setScreen("error");
    }
  }, []);

  // One-time init — linter-approved pattern: `ref.current == null` is allowed during render
  const didRun = useRef(null);
  if (init.code && didRun.current == null) {
    didRun.current = true;
    window.history.replaceState({}, "", window.location.pathname);
    Promise.resolve().then(() => runAnalysis(init.code));
  }

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
