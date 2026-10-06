# Tangled Up

A 3-second Bob Dylan song identification game. Hear the first 3 seconds of a track and name it.

## How it plays
- Songs are shuffled and play continuously. The game never shows how many songs are in the library.
- Every clip is 3 seconds.
- 3 guesses per song, with autocomplete. Spelling is forgiving (case, punctuation, *knockin'* / *knocking*, leading "The").
- **+1** for a correct answer. Deep cuts (the last 10 songs in `songs.js`) are worth **+2**, and the reveal explains the bonus.

## Files
| File | What it is |
|---|---|
| `index.html` | Page structure |
| `styles.css` | All styling |
| `songs.js` | The library: edit titles, video IDs, popularity order, deep cuts |
| `app.js` | Game logic and YouTube playback |

There's no build step. Any static host works.

## Editing the library
Songs in `songs.js` are listed from most to least popular, and the last 10 are the deep cuts. To swap a song, change its `name`, `videoId` (the part after `watch?v=` in a YouTube URL) and `dur` (length in seconds). If a track has silence at the start, add `start: 1.5` (or however many seconds) to skip it.

## How playback avoids ads and glitches
1. **Silent pre-check.** Each track first plays muted in a hidden player. It counts as ready only once it's confirmed to be the real song: correct video ID, a length that matches `dur` (an ad's won't), and a moving playhead. Any pre-roll ad plays through silently during this step.
2. **Measured clips.** The 3-second clip counts only time the real song spends playing, so buffering can't shorten it.
3. **Watchdogs.** If something other than the song starts mid-clip, it's muted. Stalls cause a re-check and, if that fails, the player is rebuilt. Videos that are removed or blocked from embedding are skipped automatically.

## Run locally
```
python3 -m http.server 8000
```
Then open http://localhost:8000. Opening `index.html` straight from disk won't work, because YouTube embeds need a real web address.

## Credit / Inspiration
https://akharazian.github.io/revolution1/
