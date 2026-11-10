// 朗讀（與常頌 SEMPER 相同）：用裝置內建的語音（Web Speech API）以粵語或普通話讀出當前畫面的彌撒／禮典經文。
// 不經網絡、不收費；語音的質素取決於裝置（iPhone/iPad、Android、Mac、Windows 各有內建中文語音）。
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
const LANGS = { yue: { label: '粵語', want: ['zh-HK', 'yue-HK', 'yue', 'zh-yue'] }, cmn: { label: '普通話', want: ['zh-TW', 'zh-CN', 'cmn-Hant-TW', 'cmn-Hans-CN', 'zh'] } };
const SPEEDS = [['slow', 0.6, '慢'], ['mid', 0.9, '中']];   // no fast speed (Fr. Gervais, 9 Nov 2026)
const speed = () => SPEEDS.find((r) => r[0] === store.get('ttsSpeed', 'mid')) || SPEEDS[1];
let queue = [], pos = 0, playing = false, paused = false, store, $bar, gen = 0;   // gen: ignore events of cancelled utterances
const live = new Set();   // utterances being spoken: kept referenced, or Safari may drop them (and their end event)
let tmr = 0, cancelledAt = 0;
// iOS 27: Web Speech follows the ring/silent switch (heard on Bluetooth, silent on the speaker).
// While reading, a silent clip plays in 'playback' mode so the speaker is used even in silent mode.
const IOS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const SILENCE = 'data:audio/wav;base64,UklGRvQHAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YdAHAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
let keep = null;
function audioOn() {   // call inside the tap
  if (!IOS) return;
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older iOS */ }
  try {
    if (!keep) { keep = new Audio(SILENCE); keep.loop = true; keep.setAttribute('playsinline', ''); }
    const pr = keep.play(); if (pr) pr.catch(() => {});
  } catch (e) { /* no audio element */ }
}
function audioOff() {
  if (!IOS) return;
  try { if (keep) keep.pause(); } catch (e) {}
  try { if (navigator.audioSession) navigator.audioSession.type = 'auto'; } catch (e) {}
}
// iOS 27 / Safari 27: speech queued in the same moment as cancel() is dropped (it 'plays' with no sound).
// So: cancel only if something is speaking, then wait a moment before speaking; otherwise speak at once (inside the tap).
function restart() {
  gen++; clearTimeout(tmr);
  if (synth.speaking || synth.pending) { synth.cancel(); cancelledAt = Date.now(); live.clear(); }
  const wait = 250 - (Date.now() - cancelledAt);   // also right after a pause
  if (wait > 0) { const my = gen; tmr = setTimeout(() => { if (my === gen) speakNext(); }, wait); }
  else speakNext();
}
function halt() { gen++; clearTimeout(tmr); if (synth && (synth.speaking || synth.pending)) { synth.cancel(); cancelledAt = Date.now(); } live.clear(); }

const norm = (l) => (l || '').toLowerCase().replace('_', '-');
function voiceFor(lang) {
  const vs = synth ? synth.getVoices() : [];
  for (const w of LANGS[lang].want) {
    const m = vs.filter((v) => norm(v.lang) === norm(w) || norm(v.lang).startsWith(norm(w) + '-'));
    if (m.length) return m.find((v) => v.localService) || m[0];
  }
  return null;
}

// what is read: the spoken texts (prayers, readings, responses, the Words of Consecration); not rubrics, headings, speaker labels,
// reading references, option lists, the 彌撒選項 panel or folded introductions
const TOP = () => (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--toph')) || 110);
function collect() {
  const out = [];
  for (const el of document.querySelectorAll('#office p.m-p, #office p.m-cons')) {
    if (el.matches('.ropt, .b-crumb, .empty, .loading') || el.closest('details.mpanel, details.b-intro:not([open]), .mbtns, nav')) continue;
    if (out.some((x) => x.el === el)) continue;
    const c = el.cloneNode(true); c.querySelectorAll('.spk, .ri, .tag, .b-num, .b-tt, .b-arr').forEach((x) => x.remove());
    let t = c.textContent
      .replace(/[※†＊*✠＋+]/g, '')
      .replace(/【答】/g, '')
      .replace(/（[^（）]{16,}）/g, '')                                // long bracketed alternatives / rubrics (e.g. 主教獻祭時念：…)
      .replace(/[（(][^（）()]*[0-9A-Za-z][^（）()]*[）)]/g, '')      // (希3:13)
      .replace(/祢/g, '你').replace(/祂/g, '他')                        // same sound; some voices do not know these forms
      .replace(/\s+/g, el.matches('.m-cons') ? '，' : '').replace(/([：，。！？；])，/g, '$1').trim();
    if (!t) continue;
    const parts = t.length > 120 ? t.match(/[^。！？；]+[。！？；」]*/g) || [t] : [t];
    for (const p of parts) out.push({ el, t: p });
  }
  return out;
}

function speakNext() {
  if (!playing || paused) return;
  document.querySelectorAll('#office .speaking').forEach((x) => x.classList.remove('speaking'));
  if (pos >= queue.length) { stop(); return; }
  const { el, t } = queue[pos];
  el.classList.add('speaking');
  const r = el.getBoundingClientRect();
  if (r.top < TOP() + 10 || r.bottom > innerHeight - 90) window.scrollBy({ top: r.top - TOP() - 30, behavior: 'smooth' });
  const lang = store.get('ttsLang', 'yue');
  const u = new SpeechSynthesisUtterance(t);
  const v = voiceFor(lang);
  if (v) u.voice = v;
  u.lang = v ? v.lang : LANGS[lang].want[0];
  u.rate = speed()[1];
  const my = ++gen;
  const done = () => { live.delete(u); if (my === gen && playing && !paused) { pos++; speakNext(); } };
  u.onend = done; u.onerror = done;
  live.add(u);
  if (synth.paused) synth.resume();
  synth.speak(u);
}

export function stop() {
  halt(); audioOff(); playing = false; paused = false; queue = []; pos = 0;
  document.querySelectorAll('#office .speaking').forEach((x) => x.classList.remove('speaking'));
  paint();
}
function play() {
  if (!synth) return;
  audioOn();
  if (paused) { paused = false; restart(); paint(); return; }   // resume from the current paragraph
  const lang = store.get('ttsLang', 'yue');
  if (!voiceFor(lang) && synth.getVoices().length) msg(lang);
  queue = collect();
  if (!queue.length) return;
  // start from the first paragraph on screen
  const first = queue.findIndex((q) => q.el.getBoundingClientRect().bottom > TOP() + 10);
  pos = Math.max(0, first); playing = true; paused = false;
  restart(); paint();
}
function pause() { paused = true; halt(); audioOff(); paint(); }

function msg(lang) {
  const el = $bar.querySelector('.tts-msg');
  el.textContent = `此裝置未有${LANGS[lang].label}語音。iPhone：設定 › 輔助使用 › 朗讀內容 › 聲音 › 中文；Android：設定 › 文字轉語音；Windows：設定 › 時間與語言 › 語音。iPhone 如果有朗讀但沒有聲音，請檢查靜音開關及音量。`;
  el.hidden = false; setTimeout(() => { el.hidden = true; }, 9000);
}

function paint() {
  if (!$bar) return;
  const lang = store.get('ttsLang', 'yue');
  $bar.querySelector('[data-tts="play"]').textContent = playing && !paused ? '❚❚' : '▶ 朗讀';
  $bar.querySelector('[data-tts="stop"]').hidden = !playing;
  $bar.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.lang === lang));
  $bar.querySelector('[data-tts="rate"]').textContent = speed()[2] + '速';
}

export function initTTS(st) {
  store = st;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;   // browser without speech: no bar
  synth.getVoices(); synth.onvoiceschanged = () => synth.getVoices();
  $bar = document.createElement('div');
  $bar.className = 'tts';
  $bar.innerHTML = `<p class="tts-msg" hidden></p><div class="tts-row">
    <button class="pill" data-tts="play">▶ 朗讀</button><button class="pill" data-tts="stop" hidden>■</button>
    <span class="tts-sp"></span>
    <span class="seg"><button class="pill" data-lang="yue">粵語</button><button class="pill" data-lang="cmn">普通話</button></span>
    <button class="pill" data-tts="rate"></button></div>`;
  document.body.appendChild($bar);
  $bar.querySelector('[data-tts="play"]').onclick = () => (playing && !paused ? pause() : play());
  $bar.querySelector('[data-tts="stop"]').onclick = stop;
  $bar.querySelectorAll('[data-lang]').forEach((b) => b.onclick = () => {
    store.set('ttsLang', b.dataset.lang); paint();
    if (playing) { paused = false; restart(); }
  });
  $bar.querySelector('[data-tts="rate"]').onclick = () => {
    store.set('ttsSpeed', speed()[0] === 'mid' ? 'slow' : 'mid'); paint();
    if (playing && !paused) { restart(); }
  };
  document.body.classList.add('has-tts');
  paint();
}
