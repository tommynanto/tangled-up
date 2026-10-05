// The library: 30 Bob Dylan songs, ranked most → least popular.
// Ranking = view counts of the official uploads on Bob Dylan's YouTube channel (Oct 2026).
// The LAST 10 in this list are "deep cuts" and earn a +1 bonus. Reorder freely.
//
// Fields:
//   name     – canonical title (what the player must match)
//   aka      – optional extra spellings that also count as correct
//   videoId  – YouTube video ID (official audio from Bob Dylan's channel)
//   dur      – expected video length in seconds (used to tell the song apart from an ad)
//   start    – optional: second to start the clip at (default 0), for tracks with silence up front
//   album, year – shown on reveal
window.SONGS = [
  { name: "Hurricane", videoId: "bpZvg_FjL3Q", dur: 515, album: "Desire", year: 1976 },
  { name: "Like a Rolling Stone", videoId: "IwOfCgkyEj0", dur: 360, album: "Highway 61 Revisited", year: 1965 },
  { name: "Knockin' on Heaven's Door", videoId: "rm9coqlk8fY", dur: 152, album: "Pat Garrett & Billy the Kid", year: 1973 },
  { name: "Blowin' in the Wind", videoId: "MMFj8uDubsE", dur: 171, album: "The Freewheelin' Bob Dylan", year: 1963 },
  { name: "The Times They Are A-Changin'", videoId: "90WD_ats6eE", dur: 194, album: "The Times They Are A-Changin'", year: 1964 },
  { name: "Don't Think Twice, It's All Right", videoId: "1iHhWh9FtsQ", dur: 219, album: "The Freewheelin' Bob Dylan", year: 1963 },
  { name: "A Hard Rain's A-Gonna Fall", videoId: "T5al0HmR4to", dur: 412, album: "The Freewheelin' Bob Dylan", year: 1963 },
  { name: "Subterranean Homesick Blues", videoId: "1I_oWQmddMk", dur: 139, album: "Bringing It All Back Home", year: 1965 },
  { name: "Lay, Lady, Lay", aka: ["Lay Lady Lay"], videoId: "LhzEsb2tNbI", dur: 199, album: "Nashville Skyline", year: 1969 },
  { name: "Tangled Up in Blue", videoId: "QKcNyMBw818", dur: 344, album: "Blood on the Tracks", year: 1975 },
  { name: "Shelter from the Storm", videoId: "-gsDBuHwqbM", dur: 303, album: "Blood on the Tracks", year: 1975 },
  { name: "One More Cup of Coffee", aka: ["One More Cup of Coffee (Valley Below)"], videoId: "95cufW4h-gA", dur: 227, album: "Desire", year: 1976 },
  { name: "Forever Young", videoId: "Frj2CLGldC4", dur: 299, album: "Planet Waves", year: 1974 },
  { name: "Mr. Tambourine Man", aka: ["Mister Tambourine Man"], videoId: "oecX_1pqxk0", dur: 333, album: "Bringing It All Back Home", year: 1965 },
  { name: "Desolation Row", videoId: "hUvcWXTIjcU", dur: 683, album: "Highway 61 Revisited", year: 1965 },
  { name: "Positively 4th Street", aka: ["Positively Fourth Street"], videoId: "aehwEu8SBSo", dur: 249, album: "Single", year: 1965 },
  { name: "Girl from the North Country", videoId: "Je4Eg77YSSA", dur: 222, album: "Nashville Skyline (with Johnny Cash)", year: 1969 },
  { name: "All Along the Watchtower", videoId: "bT7Hj-ea0VE", dur: 153, album: "John Wesley Harding", year: 1967 },
  { name: "I Want You", videoId: "-iIS6ZZ9RVA", dur: 187, album: "Blonde on Blonde", year: 1966 },
  { name: "Just Like a Woman", videoId: "dRLXZVojdhQ", dur: 292, album: "Blonde on Blonde", year: 1966 },

  // ── Deep cuts (bottom 10): +1 bonus ──
  { name: "Visions of Johanna", videoId: "AwuCF5lYqEE", dur: 453, album: "Blonde on Blonde", year: 1966 },
  { name: "It Ain't Me Babe", aka: ["It Ain't Me, Babe"], videoId: "YoagldK69U0", dur: 216, album: "Another Side of Bob Dylan", year: 1964 },
  { name: "Make You Feel My Love", videoId: "fdWto-AUM3Q", dur: 213, album: "Time Out of Mind", year: 1997 },
  { name: "Masters of War", videoId: "JEmI_FT4YHU", dur: 273, album: "The Freewheelin' Bob Dylan", year: 1963 },
  { name: "It's All Over Now, Baby Blue", videoId: "L4HW33SgZlM", dur: 254, album: "Bringing It All Back Home", year: 1965 },
  { name: "Simple Twist of Fate", videoId: "sGnhyoP_DSc", dur: 259, album: "Blood on the Tracks", year: 1975 },
  { name: "Rainy Day Women #12 & 35", aka: ["Rainy Day Women", "Everybody Must Get Stoned"], videoId: "fm-po_FUmvM", dur: 276, album: "Blonde on Blonde", year: 1966 },
  { name: "Ballad of a Thin Man", videoId: "we37yX3zpKA", dur: 359, album: "Highway 61 Revisited", year: 1965 },
  { name: "Highway 61 Revisited", videoId: "8hr3Stnk8_k", dur: 208, album: "Highway 61 Revisited", year: 1965 },
  { name: "Most Likely You Go Your Way (And I'll Go Mine)", aka: ["Most Likely You Go Your Way"], videoId: "qPRzHqAEpZk", dur: 209, album: "Blonde on Blonde", year: 1966 },
];

window.DEEP_CUT_COUNT = 10;
