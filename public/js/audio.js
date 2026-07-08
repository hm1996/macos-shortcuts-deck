//
//  DCC — Audio feedback
//

let soundCtx = null;

function getSoundCtx() {
  if (soundCtx) return soundCtx;
  var AC = typeof AudioContext !== "undefined" ? AudioContext
    : typeof webkitAudioContext !== "undefined" ? webkitAudioContext : null;
  if (!AC) return null;
  try { soundCtx = new AC(); return soundCtx; } catch (e) { return null; }
}

function playBeep(freq, durationMs, vol) {
  var ctx = getSoundCtx();
  if (!ctx) return;
  try {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch (e) { /* silent */ }
}

function playTapSound() { playBeep(880, 60, 0.08); }
function playSuccessSound() { playBeep(660, 80, 0.1); setTimeout(function () { playBeep(990, 100, 0.12); }, 100); }
function playErrorSound() { playBeep(320, 100, 0.12); setTimeout(function () { playBeep(240, 140, 0.14); }, 120); }

function playPomodoroAlert() {
  playBeep(660, 250, 0.45);
  setTimeout(function () { playBeep(880, 250, 0.45); }, 260);
  setTimeout(function () { playBeep(1100, 350, 0.50); }, 520);
}
