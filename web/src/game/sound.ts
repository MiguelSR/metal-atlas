/** A short distorted power chord made in the browser (no network), so players can check their volume. */

const E5_CHORD = [82.41, 123.47, 164.81]; // Hz: E2, B2, E3
const DURATION = 1.45; // seconds

export function playTestChord(): void {
  let ctx: AudioContext;
  try {
    ctx = new AudioContext();
  } catch {
    return; // audio unavailable
  }
  const now = ctx.currentTime;

  const volume = ctx.createGain();
  volume.gain.setValueAtTime(0.0001, now);
  volume.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
  volume.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2200;

  const distortion = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(4 * (i / 512 - 1));
  distortion.curve = curve;

  distortion.connect(tone);
  tone.connect(volume);
  volume.connect(ctx.destination);
  for (const frequency of E5_CHORD) {
    const oscillator = ctx.createOscillator();
    oscillator.type = "sawtooth";
    oscillator.frequency.value = frequency;
    oscillator.connect(distortion);
    oscillator.start(now);
    oscillator.stop(now + DURATION);
  }
  setTimeout(() => void ctx.close(), 1800);
}
