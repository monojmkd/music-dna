import { useState, useEffect, useRef } from "react";

// ─── PKCE Utilities ──────────────────────────────────────────────────────────────────────────
function generateCodeVerifier(length = 128) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => chars[b % chars.length]).join("");
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// ─── Spotify API ─────────────────────────────────────────────────────────────────────────────
const SPOTIFY_BASE = "https://api.spotify.com/v1";
const SCOPES = "user-top-read user-read-private";
const REDIRECT_URI = window.location.origin + window.location.pathname;

async function spotifyFetch(endpoint, token) {
  const res = await fetch(`${SPOTIFY_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify API ${res.status}: ${res.statusText}`);
  return res.json();
}

async function fetchAllListeningData(token) {
  const [tracksData, artistsData] = await Promise.all([
    spotifyFetch("/me/top/tracks?limit=50&time_range=medium_term", token),
    spotifyFetch("/me/top/artists?limit=50&time_range=medium_term", token),
  ]);
  const tracks = tracksData.items || [];
  const artists = artistsData.items || [];
  const ids = tracks.map((t) => t.id).join(",");
  const featuresData = await spotifyFetch(`/audio-features?ids=${ids}`, token);
  const features = (featuresData.audio_features || []).filter(Boolean);
  return { tracks, artists, features };
}

async function initiateAuth(clientId) {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  sessionStorage.setItem("pkce_verifier", verifier);
  sessionStorage.setItem("spotify_client_id", clientId);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

async function exchangeCodeForToken(code, clientId, verifier) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  if (!res.ok)
    throw new Error(
      "Token exchange failed — check your redirect URI and Client ID.",
    );
  return res.json();
}

// ─── Personality Algorithm ───────────────────────────────────────────────────────────────────

const GENRE_META_MAP = {
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
  "future bass": "Electronic",
  vapor: "Electronic",
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
  "art rock": "Rock & Alt",
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
  "chamber pop": "Acoustic & Folk",
  classical: "Classical & Ambient",
  orchestral: "Classical & Ambient",
  jazz: "Classical & Ambient",
  piano: "Classical & Ambient",
  instrumental: "Classical & Ambient",
  "new age": "Classical & Ambient",
  "post-classical": "Classical & Ambient",
  pop: "Pop",
  latin: "Pop",
  "k-pop": "Pop",
  "j-pop": "Pop",
  reggaeton: "Pop",
  dancehall: "Pop",
  tropical: "Pop",
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

// 12 Archetypes — each is an ideal-point vector in 8D space:
// [Emotionality, Entropy/Chaos, Sociability, Nostalgia, Exploration, Mainstream, Drive/Intensity, Ether/Dreaminess]
const ARCHETYPES = [
  {
    id: "midnight_drifter",
    name: "Midnight Drifter",
    emoji: "🌙",
    tagline: "You feel everything twice.",
    description:
      "Music is your emotional processing system. You gravitate toward songs that articulate things you can't say out loud. Late nights, low volume, high feeling.",
    profile: [85, 30, 25, 55, 65, 30, 40, 60],
    color: "#9d4edd",
  },
  {
    id: "sonic_rebel",
    name: "Sonic Rebel",
    emoji: "⚡",
    tagline: "You don't listen to music. You survive it.",
    description:
      "High energy, genre-agnostic chaos. You need music that matches your internal voltage. Rules, structures, genres — all exist to be distorted.",
    profile: [60, 80, 35, 25, 80, 20, 85, 15],
    color: "#ff4757",
  },
  {
    id: "velvet_romantic",
    name: "Velvet Romantic",
    emoji: "🥀",
    tagline: "You've built a whole world inside three chords.",
    description:
      "Deeply emotional, socially warm. R&B, soul, emotional pop. You believe a song should feel like being held by someone who truly understands.",
    profile: [90, 20, 60, 50, 30, 55, 30, 40],
    color: "#e91e8c",
  },
  {
    id: "neon_runner",
    name: "Neon Runner",
    emoji: "🏃",
    tagline: "Music is fuel. Everything else is noise.",
    description:
      "Function over feeling. BPM is your currency. Your playlist is precision-engineered for momentum — gym sets, commutes, personal records.",
    profile: [25, 50, 80, 10, 45, 70, 95, 10],
    color: "#06b6d4",
  },
  {
    id: "cosmic_dreamer",
    name: "Cosmic Dreamer",
    emoji: "🌌",
    tagline: "You listen to music that doesn't exist yet.",
    description:
      "Ambient, experimental, instrumental. You treat music as a portal, not entertainment. Maximum genre diversity, minimum mainstream. Sound over song.",
    profile: [50, 60, 15, 30, 90, 15, 25, 90],
    color: "#4361ee",
  },
  {
    id: "chaos_curator",
    name: "Chaos Curator",
    emoji: "🎲",
    tagline: "Your shuffle would give an algorithm an existential crisis.",
    description:
      "Truly genre-fluid. Classical to drill to bossa nova in three songs. You actively resist the idea of having a type — because you contain all types.",
    profile: [40, 95, 50, 35, 95, 40, 55, 35],
    color: "#f7931e",
  },
  {
    id: "nostalgia_architect",
    name: "Nostalgia Architect",
    emoji: "📼",
    tagline: "You're building a museum, one playlist at a time.",
    description:
      "Drawn to older recordings, acoustic textures, familiar song structures. The past isn't where you live — it's what you trust. Every era had better B-sides.",
    profile: [65, 25, 45, 95, 25, 45, 35, 50],
    color: "#d4a017",
  },
  {
    id: "cafe_philosopher",
    name: "Café Philosopher",
    emoji: "☕",
    tagline: "You have opinions about reverb.",
    description:
      "Jazz, acoustic, lo-fi, singer-songwriter. Music is simultaneously background and foreground. Deeply intentional. You notice the room's acoustics before the menu.",
    profile: [55, 30, 30, 60, 55, 35, 20, 70],
    color: "#2dc653",
  },
  {
    id: "hype_machine",
    name: "The Hype Machine",
    emoji: "📣",
    tagline: "If it's not a banger, what even is the point.",
    description:
      "Chart-dominant, high popularity, maximum danceability. You're not chasing trends — you are the trend, three weeks before anyone else notices.",
    profile: [20, 55, 90, 15, 30, 95, 80, 5],
    color: "#c77dff",
  },
  {
    id: "phantom_aesthete",
    name: "Phantom Aesthete",
    emoji: "🎭",
    tagline: "You listen like a critic, feel like a poet.",
    description:
      "Underground, genre-selective, instrumentally complex. Low mainstream pull, impossibly high sonic standards. Hard to impress, harder still to bore.",
    profile: [70, 40, 20, 45, 70, 10, 45, 85],
    color: "#0f9b8e",
  },
  {
    id: "lone_wolf",
    name: "Lone Wolf",
    emoji: "🐺",
    tagline: "Your taste is a locked room only you have the key to.",
    description:
      "Deeply personal, non-social music choices. Eclectic underground selections that feel autobiographical. Music as identity, not conversation.",
    profile: [75, 70, 15, 40, 85, 15, 60, 65],
    color: "#8d99ae",
  },
  {
    id: "solar_architect",
    name: "Solar Architect",
    emoji: "🔆",
    tagline: "You make the energy in the room.",
    description:
      "Upbeat, diverse, socially calibrated. Your music makes things happen. Parties, workouts, good moods — you are the soundtrack person.",
    profile: [30, 45, 65, 20, 60, 60, 70, 30],
    color: "#ff7b00",
  },
];

// ─── Algorithm helpers ───────────────────────────────────────────────────────────────────────
function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}
function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
}
function clamp(v, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, v));
}

function scoreDimensions(tracks, artists, features) {
  const val = features.map((f) => f.valence);
  const nrg = features.map((f) => f.energy);
  const dnc = features.map((f) => f.danceability);
  const aco = features.map((f) => f.acousticness);
  const ins = features.map((f) => f.instrumentalness);
  const sph = features.map((f) => f.speechiness);
  const tmp = features.map((f) => f.tempo);
  const pop = tracks.map((t) => t.popularity);
  const yrs = tracks.map((t) =>
    parseInt((t.album?.release_date || "2020").slice(0, 4)),
  );

  const allGenres = artists.flatMap((a) => a.genres || []);
  const genreCounts = {};
  for (const g of allGenres) genreCounts[g] = (genreCounts[g] || 0) + 1;
  const uniqueCount = Object.keys(genreCounts).length;

  // Shannon entropy of genre distribution → measures listening breadth
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

  // Social genre affinity — how much of listening is crowd-oriented
  const socialWords = [
    "pop",
    "hip hop",
    "rap",
    "dance",
    "latin",
    "reggaeton",
    "k-pop",
    "club",
  ];
  const socialBonus =
    allGenres.filter((g) => socialWords.some((w) => g.includes(w))).length /
    totalG;

  // 1. EMOTIONALITY — low valence = high emotional depth
  const EQ = clamp(
    (1 - mean(val)) * 100 + (mean(features.map((f) => f.mode)) < 0.4 ? 8 : 0),
  );

  // 2. CHAOS — energy variance across tracks + genre distribution entropy
  const Entropy = clamp(stddev(nrg) * 175 + genreEntropy * 48);

  // 3. SOCIABILITY — danceability as proxy for communal listening intent
  const Social = clamp(mean(dnc) * 70 + socialBonus * 30);

  // 4. NOSTALGIA — weighted release year recency, boosted by acoustic texture
  const avgYear = mean(yrs);
  const Nostalgia = clamp(
    (Math.max(0, 2024 - avgYear) / 28) * 82 + (mean(aco) > 0.5 ? 12 : 0),
  );

  // 5. EXPLORATION — unique genre count + underground bias (inverse popularity)
  const Explore = clamp(
    (Math.min(uniqueCount, 30) / 30) * 55 + (1 - mean(pop) / 100) * 45,
  );

  // 6. MAINSTREAM PULL — raw Spotify popularity score
  const Pop = clamp(mean(pop));

  // 7. DRIVE / INTENSITY — tempo normalized to 60–200bpm range, blended with energy
  const Drive = clamp(((mean(tmp) - 60) / 140) * 50 + mean(nrg) * 50);

  // 8. DREAMINESS / ETHER — instrumentalness + acousticness as portals; speechiness as anchor
  const Ether = clamp(mean(ins) * 55 + mean(aco) * 30 - mean(sph) * 25 + 18);

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
  // Weighted Euclidean distance — heavier weight on most distinctive dimensions
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
    arch: a,
    dist: Math.sqrt(
      a.profile.reduce((s, v, i) => s + W[i] * (user[i] - v) ** 2, 0),
    ),
  })).sort((a, b) => a.dist - b.dist);
  return { primary: scored[0].arch, secondary: scored[1].arch };
}

function buildGenreDNA(artists) {
  const meta = {};
  for (const genre of artists.flatMap((a) => a.genres || [])) {
    let group = "Other";
    for (const [key, val] of Object.entries(GENRE_META_MAP)) {
      if (genre.toLowerCase().includes(key)) {
        group = val;
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

function analyzeAll(tracks, artists, features) {
  const dims = scoreDimensions(tracks, artists, features);
  const { primary, secondary } = classifyArchetype(dims);
  const genreDNA = buildGenreDNA(artists);
  const moodSpectrum = buildMoodSpectrum(dims);
  const stats = {
    bpm: Math.round(mean(features.map((f) => f.tempo))),
    energy: Math.round(mean(features.map((f) => f.energy)) * 100),
    mood: Math.round(mean(features.map((f) => f.valence)) * 100),
    topArtist: artists[0]?.name || "—",
    topTrack: tracks[0]?.name || "—",
    uniqueGenres: [...new Set(artists.flatMap((a) => a.genres || []))].length,
  };
  return { dims, primary, secondary, genreDNA, moodSpectrum, stats };
}

// ─── SVG: Radar (Mood Spectrum) ──────────────────────────────────────────────────────────────
function RadarChart({ axes, color }) {
  const CX = 150,
    CY = 150,
    R = 108;
  const N = axes.length;
  const ang = (i) => (2 * Math.PI * i) / N - Math.PI / 2;
  const pt = (val, i) => {
    const d = (val / 100) * R;
    return [CX + d * Math.cos(ang(i)), CY + d * Math.sin(ang(i))];
  };
  const dataPts = axes.map((a, i) => pt(a.value, i));
  const polyStr = dataPts.map((p) => p.join(",")).join(" ");
  const gridLvls = [0.25, 0.5, 0.75, 1];

  return (
    <svg
      viewBox="0 0 300 300"
      style={{
        width: "100%",
        maxWidth: 280,
        filter: `drop-shadow(0 0 22px ${color}44)`,
      }}
    >
      {gridLvls.map((lvl) => {
        const pts = axes
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
            points={pts}
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
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />
      ))}
      <polygon
        points={polyStr}
        fill={`${color}28`}
        stroke={color}
        strokeWidth="2.5"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 10px ${color})` }}
      />
      {dataPts.map(([x, y], i) => (
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
        const lx = CX + (R + 24) * Math.cos(ang(i));
        const ly = CY + (R + 24) * Math.sin(ang(i));
        return (
          <text
            key={i}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(255,255,255,0.6)"
            fontSize="9.5"
            fontFamily="'Space Mono',monospace"
            fontWeight="700"
          >
            {a.label.toUpperCase()}
          </text>
        );
      })}
      {dataPts.map(([x, y], i) => (
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

// ─── SVG: Donut Chart (Genre DNA) ───────────────────────────────────────────────────────────
function DonutChart({ data }) {
  const CX = 90,
    CY = 90,
    OR = 70,
    IR = 46;
  let start = -Math.PI / 2;
  const GAP = 0.03;
  const slices = data.map((d) => {
    const sweep = (d.pct / 100) * 2 * Math.PI - GAP;
    const s = { ...d, start, sweep };
    start += sweep + GAP;
    return s;
  });
  const arc = (s, sw, outer, inner) => {
    const ea = s + sw,
      lg = sw > Math.PI ? 1 : 0;
    const x1 = CX + outer * Math.cos(s),
      y1 = CY + outer * Math.sin(s);
    const x2 = CX + outer * Math.cos(ea),
      y2 = CY + outer * Math.sin(ea);
    const x3 = CX + inner * Math.cos(ea),
      y3 = CY + inner * Math.sin(ea);
    const x4 = CX + inner * Math.cos(s),
      y4 = CY + inner * Math.sin(s);
    return `M${x1},${y1} A${outer},${outer} 0 ${lg} 1 ${x2},${y2} L${x3},${y3} A${inner},${inner} 0 ${lg} 0 ${x4},${y4} Z`;
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
        style={{ width: 140, height: 140, flexShrink: 0 }}
      >
        {slices.map((s, i) => (
          <path
            key={i}
            d={arc(s.start, s.sweep, OR, IR)}
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
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                flex: 1,
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

// ─── Component: Dimension Bar ────────────────────────────────────────────────────────────────
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
            color: "rgba(255,255,255,0.52)",
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
            background: `linear-gradient(90deg, ${color}55, ${color})`,
            boxShadow: `0 0 8px ${color}55`,
          }}
        />
      </div>
    </div>
  );
}

// ─── Screen: Setup ───────────────────────────────────────────────────────────────────────────
function SetupScreen({ onConnect }) {
  const [clientId, setClientId] = useState("");
  const [copied, setCopied] = useState(false);

  const copyUri = () => {
    navigator.clipboard?.writeText(REDIRECT_URI);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(ellipse at 25% 40%, #1e0b3d 0%, #0b0b18 55%, #0a1628 100%)",
        padding: "24px 16px",
        fontFamily: "'Space Mono', monospace",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "fixed",
          top: "5%",
          left: "-8%",
          width: 480,
          height: 480,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(157,78,237,0.12) 0%, transparent 65%)",
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
            "radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 65%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          maxWidth: 460,
          width: "100%",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 34 }}>
          <div
            style={{
              fontSize: 50,
              marginBottom: 10,
              filter: "drop-shadow(0 0 22px rgba(157,78,237,0.65))",
            }}
          >
            🎵
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 34,
              fontWeight: "700",
              color: "white",
              letterSpacing: "-1px",
              lineHeight: 1,
            }}
          >
            Music
            <span
              style={{ color: "#9d4edd", textShadow: "0 0 22px #9d4edd88" }}
            >
              DNA
            </span>
          </h1>
          <p
            style={{
              color: "rgba(255,255,255,0.35)",
              fontSize: 11,
              marginTop: 7,
              letterSpacing: 3,
            }}
          >
            PERSONALITY PROFILER
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 7,
            flexWrap: "wrap",
            justifyContent: "center",
            marginBottom: 30,
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
                border: "1px solid rgba(157,78,237,0.28)",
                color: "rgba(255,255,255,0.5)",
                background: "rgba(157,78,237,0.07)",
              }}
            >
              {t}
            </span>
          ))}
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.032)",
            border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: 18,
            padding: "24px 24px",
            backdropFilter: "blur(16px)",
          }}
        >
          <p
            style={{
              color: "rgba(255,255,255,0.62)",
              fontSize: 12,
              lineHeight: 1.8,
              margin: "0 0 20px",
            }}
          >
            Uses{" "}
            <span style={{ color: "#9d4edd", fontWeight: "bold" }}>
              PKCE OAuth
            </span>{" "}
            — zero servers, fully in-browser. You need a free Spotify Developer
            app (2 minutes).
          </p>

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                fontSize: 9,
                color: "rgba(255,255,255,0.38)",
                letterSpacing: 2.5,
                display: "block",
                marginBottom: 7,
              }}
            >
              STEP 1 — COPY THIS AS YOUR REDIRECT URI
            </label>
            <div
              onClick={copyUri}
              style={{
                background: "rgba(0,0,0,0.42)",
                border: "1px solid rgba(157,78,237,0.32)",
                borderRadius: 9,
                padding: "10px 13px",
                fontSize: 11,
                color: "#b07ff5",
                wordBreak: "break-all",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 8,
              }}
            >
              <span>{REDIRECT_URI}</span>
              <span
                style={{
                  flexShrink: 0,
                  color: copied ? "#2dc653" : "rgba(255,255,255,0.3)",
                  fontSize: 14,
                  transition: "color 0.2s",
                }}
              >
                {copied ? "✓" : "📋"}
              </span>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                fontSize: 9,
                color: "rgba(255,255,255,0.38)",
                letterSpacing: 2.5,
                display: "block",
                marginBottom: 7,
              }}
            >
              STEP 2 — PASTE YOUR CLIENT ID
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="e.g. 4ae4a3f9d1c84b2e..."
              style={{
                width: "100%",
                background: "rgba(0,0,0,0.38)",
                border: "1px solid rgba(255,255,255,0.11)",
                borderRadius: 9,
                padding: "11px 13px",
                color: "white",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "Space Mono",
              }}
              onFocus={(e) =>
                (e.target.style.borderColor = "rgba(157,78,237,0.55)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "rgba(255,255,255,0.11)")
              }
            />
          </div>

          <button
            onClick={() => onConnect(clientId.trim())}
            disabled={!clientId.trim()}
            style={{
              width: "100%",
              padding: "13px",
              fontFamily: "Space Mono",
              background: clientId.trim()
                ? "linear-gradient(135deg, #7c3aed, #4f46e5)"
                : "rgba(255,255,255,0.06)",
              border: "none",
              borderRadius: 11,
              color: clientId.trim() ? "white" : "rgba(255,255,255,0.22)",
              fontSize: 12,
              fontWeight: "bold",
              letterSpacing: 2,
              cursor: clientId.trim() ? "pointer" : "not-allowed",
              boxShadow: clientId.trim()
                ? "0 0 32px rgba(124,58,237,0.45)"
                : "none",
              transition: "all 0.3s ease",
            }}
          >
            CONNECT SPOTIFY →
          </button>
        </div>

        <div
          style={{
            marginTop: 20,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {[
            [
              "1",
              "Visit",
              "developer.spotify.com/dashboard",
              "https://developer.spotify.com/dashboard",
            ],
            ["2", "Create App → add Redirect URI above → save"],
            ["3", "Copy Client ID → paste above → Connect"],
          ].map((s) => (
            <div
              key={s[0]}
              style={{ display: "flex", gap: 11, alignItems: "flex-start" }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "rgba(157,78,237,0.14)",
                  border: "1px solid rgba(157,78,237,0.32)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontSize: 9,
                  color: "#9d4edd",
                  fontWeight: "bold",
                }}
              >
                {s[0]}
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.38)",
                  lineHeight: 1.6,
                }}
              >
                {s[1]}{" "}
                {s[2] && (
                  <a
                    href={s[3]}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#9d4edd" }}
                  >
                    {s[2]}
                  </a>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input::placeholder { color: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
}

// ─── Screen: Loading ─────────────────────────────────────────────────────────────────────────
function LoadingScreen({ stage }) {
  const stages = [
    { label: "Exchanging auth token...", icon: "🔑" },
    { label: "Fetching your top tracks...", icon: "🎵" },
    { label: "Pulling audio features...", icon: "🔬" },
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
        background:
          "radial-gradient(ellipse at 25% 40%, #1e0b3d 0%, #0b0b18 55%, #0a1628 100%)",
        fontFamily: "Space Mono",
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
            background: "rgba(255,255,255,0.08)",
            borderRadius: 2,
            margin: "0 auto 13px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 2,
              background: "linear-gradient(90deg, #7c3aed, #a78bfa)",
              width: `${pct}%`,
              transition: "width 0.6s ease",
              boxShadow: "0 0 12px rgba(167,139,250,0.55)",
            }}
          />
        </div>
        <p
          style={{
            color: "rgba(255,255,255,0.48)",
            fontSize: 12,
            letterSpacing: 1,
          }}
        >
          {s.label}
        </p>
        <p
          style={{
            color: "rgba(255,255,255,0.18)",
            fontSize: 10,
            letterSpacing: 2,
            marginTop: 5,
          }}
        >
          {pct}%
        </p>
      </div>
      <style>{`@keyframes float { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-8px) scale(1.05)} }`}</style>
    </div>
  );
}

// ─── Screen: Results ─────────────────────────────────────────────────────────────────────────
function ResultsScreen({ analysis, onReset, cardRef }) {
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
      setShareMsg("Capturing...");
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
      setShareMsg(`Failed: ${e.message}`);
      setTimeout(() => setShareMsg(""), 3000);
    }
    setSharing(false);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse at 20% 15%, #1e0b3d 0%, #0b0b18 55%, #0a1628 100%)",
        fontFamily: "'Space Mono', monospace",
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
          background: `radial-gradient(circle, ${primary.color}14 0%, transparent 65%)`,
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
              color: "rgba(255,255,255,0.3)",
              letterSpacing: 2,
            }}
          >
            MUSIC<span style={{ color: primary.color }}>DNA</span>
          </span>
          <button
            onClick={onReset}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.11)",
              borderRadius: 7,
              color: "rgba(255,255,255,0.4)",
              fontSize: 10,
              padding: "7px 13px",
              cursor: "pointer",
              fontFamily: "Space Mono",
              letterSpacing: 1,
            }}
          >
            ↩ NEW ANALYSIS
          </button>
        </div>

        {/* ═══ SHAREABLE CARD ═══ */}
        <div
          ref={cardRef}
          style={{
            background:
              "linear-gradient(148deg, #0d0b1e 0%, #12082a 45%, #08101f 100%)",
            border: `1px solid ${primary.color}25`,
            borderRadius: 22,
            padding: "28px 26px",
            marginBottom: 14,
            boxShadow: `0 0 90px ${primary.color}16, 0 0 28px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.04)`,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Glow */}
          <div
            style={{
              position: "absolute",
              top: -120,
              right: -120,
              width: 450,
              height: 450,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${primary.color}14 0%, transparent 65%)`,
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
              background: `radial-gradient(circle, ${secondary.color}0b 0%, transparent 65%)`,
              pointerEvents: "none",
            }}
          />

          {/* ── ARCHETYPE HERO ── */}
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
                fontWeight: "700",
                letterSpacing: "-0.5px",
                textShadow: `0 0 42px ${primary.color}44`,
              }}
            >
              {primary.name}
            </h2>
            <p
              style={{
                color: "rgba(255,255,255,0.42)",
                fontSize: 13,
                fontStyle: "italic",
                margin: "0 0 12px",
              }}
            >
              "{primary.tagline}"
            </p>
            <p
              style={{
                color: "rgba(255,255,255,0.65)",
                fontSize: 12,
                lineHeight: 1.78,
                maxWidth: 430,
                margin: "0 auto",
              }}
            >
              {primary.description}
            </p>
          </div>

          {/* ── MOOD SPECTRUM ── */}
          <div
            style={{
              background: "rgba(0,0,0,0.32)",
              borderRadius: 16,
              padding: "16px 18px",
              marginBottom: 13,
              border: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            <div
              style={{
                fontSize: 8.5,
                letterSpacing: 3,
                color: "rgba(255,255,255,0.28)",
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

          {/* ── GENRE DNA + DIMENSIONS (side by side) ── */}
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
                background: "rgba(0,0,0,0.32)",
                borderRadius: 16,
                padding: "14px 13px",
                border: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <div
                style={{
                  fontSize: 8.5,
                  letterSpacing: 3,
                  color: "rgba(255,255,255,0.28)",
                  marginBottom: 12,
                }}
              >
                ◈ GENRE DNA
              </div>
              <DonutChart data={genreDNA} />
            </div>
            <div
              style={{
                background: "rgba(0,0,0,0.32)",
                borderRadius: 16,
                padding: "14px 13px",
                border: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <div
                style={{
                  fontSize: 8.5,
                  letterSpacing: 3,
                  color: "rgba(255,255,255,0.28)",
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

          {/* ── ALTER EGO ── */}
          <div
            style={{
              background: `linear-gradient(135deg, ${secondary.color}0d 0%, rgba(0,0,0,0.28) 100%)`,
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
                color: "rgba(255,255,255,0.28)",
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
                    color: "rgba(255,255,255,0.52)",
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

          {/* ── STATS ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 8,
              marginBottom: 14,
            }}
          >
            {[
              { label: "AVG BPM", val: stats.bpm, icon: "🥁" },
              { label: "ENERGY", val: `${stats.energy}%`, icon: "⚡" },
              { label: "MOOD", val: `${stats.mood}%`, icon: "💜" },
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
              { label: "GENRES", val: `${stats.uniqueGenres}+`, icon: "🌐" },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  background: "rgba(0,0,0,0.32)",
                  borderRadius: 12,
                  padding: "10px 8px 9px",
                  textAlign: "center",
                  border: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <div style={{ fontSize: 13, marginBottom: 3 }}>{s.icon}</div>
                <div
                  style={{
                    fontSize: 8,
                    color: "rgba(255,255,255,0.28)",
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
              color: "rgba(255,255,255,0.13)",
              letterSpacing: 3,
            }}
          >
            MUSICDNA • POWERED BY SPOTIFY
          </div>
        </div>

        {/* ── SHARE BUTTON ── */}
        <button
          onClick={handleShare}
          disabled={sharing}
          style={{
            width: "100%",
            padding: "14px",
            fontFamily: "Space Mono",
            background: sharing
              ? "rgba(124,58,237,0.4)"
              : "linear-gradient(135deg, #7c3aed, #4f46e5)",
            border: "none",
            borderRadius: 13,
            color: "white",
            fontSize: 12,
            fontWeight: "bold",
            letterSpacing: 2,
            cursor: sharing ? "wait" : "pointer",
            boxShadow: "0 0 42px rgba(124,58,237,0.48)",
            marginBottom: 8,
            transition: "all 0.3s",
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
            color: "rgba(255,255,255,0.18)",
            letterSpacing: 1,
            margin: 0,
          }}
        >
          Exports a high-res PNG · Perfect for Stories &amp; posts
        </p>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(157,78,237,0.4); border-radius: 2px; }
      `}</style>
    </div>
  );
}

// ─── Error Screen ────────────────────────────────────────────────────────────────────────────
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
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.13)",
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

// ─── App Root ────────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("setup");
  const [loadStage, setStage] = useState(0);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);
  const cardRef = useRef(null);
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  // Handle OAuth callback on page load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const verifier = sessionStorage.getItem("pkce_verifier");
    const clientId = sessionStorage.getItem("spotify_client_id");
    if (code && verifier && clientId) {
      window.history.replaceState({}, "", window.location.pathname);
      runAnalysis(code, clientId, verifier);
    }
  }, []);

  async function runAnalysis(code, clientId, verifier) {
    setScreen("loading");
    setStage(0);
    try {
      const { access_token } = await exchangeCodeForToken(
        code,
        clientId,
        verifier,
      );
      setStage(1);
      const { tracks, artists, features } =
        await fetchAllListeningData(access_token);
      setStage(3);
      await delay(450);
      setStage(4);
      const result = analyzeAll(tracks, artists, features);
      setStage(5);
      await delay(550);
      setAnalysis(result);
      setScreen("results");
    } catch (e) {
      setError(e.message);
      setScreen("error");
    }
  }

  function handleConnect(clientId) {
    setError(null);
    initiateAuth(clientId);
  }
  function handleReset() {
    sessionStorage.clear();
    setAnalysis(null);
    setError(null);
    setScreen("setup");
  }

  if (screen === "error")
    return <ErrorScreen message={error} onRetry={handleReset} />;
  if (screen === "loading") return <LoadingScreen stage={loadStage} />;
  if (screen === "results" && analysis)
    return (
      <ResultsScreen
        analysis={analysis}
        onReset={handleReset}
        cardRef={cardRef}
      />
    );
  return <SetupScreen onConnect={handleConnect} />;
}
