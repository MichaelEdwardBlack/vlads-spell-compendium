const AudioContextConstructor =
  typeof window !== 'undefined'
    ? window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    : undefined;

let audioContext: AudioContext | undefined;

function getAudioContext(): AudioContext | undefined {
  if (!AudioContextConstructor) {
    return undefined;
  }

  audioContext ??= new AudioContextConstructor();
  return audioContext;
}

export function primeRevealAudio() {
  void getAudioContext()?.resume();
}

export function playSpellRevealSound() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  void context.resume();

  const startTime = context.currentTime + 0.02;
  const lockTime = startTime + 1.48;
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  master.gain.setValueAtTime(0.0001, startTime);
  master.gain.exponentialRampToValueAtTime(0.42, startTime + 0.24);
  master.gain.exponentialRampToValueAtTime(0.22, lockTime - 0.08);
  master.gain.setValueAtTime(0.34, lockTime);
  master.gain.exponentialRampToValueAtTime(0.0001, lockTime + 1.7);
  compressor.threshold.setValueAtTime(-18, startTime);
  compressor.knee.setValueAtTime(16, startTime);
  compressor.ratio.setValueAtTime(4, startTime);
  compressor.attack.setValueAtTime(0.004, startTime);
  compressor.release.setValueAtTime(0.16, startTime);
  master.connect(compressor);
  compressor.connect(context.destination);

  playRisingTone(context, master, startTime, lockTime);
  playLockChord(context, master, lockTime);
}

function playRisingTone(context: AudioContext, destination: AudioNode, startTime: number, lockTime: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(220, startTime);
  oscillator.frequency.exponentialRampToValueAtTime(660, lockTime);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(900, startTime);
  filter.frequency.exponentialRampToValueAtTime(2800, lockTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.28, startTime + 0.28);
  gain.gain.exponentialRampToValueAtTime(0.0001, lockTime + 0.04);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  oscillator.start(startTime);
  oscillator.stop(lockTime + 0.08);

  [330, 440, 550, 660].forEach((frequency, index) => {
    playBell(context, destination, frequency, startTime + 0.34 + index * 0.24, 0.3, 0.12);
  });
}

function playLockChord(context: AudioContext, destination: AudioNode, lockTime: number) {
  [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
    playBell(context, destination, frequency, lockTime + index * 0.035, 1.45, 0.2);
  });
}

function playBell(
  context: AudioContext,
  destination: AudioNode,
  frequency: number,
  startTime: number,
  duration: number,
  volume: number,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.04);
}
