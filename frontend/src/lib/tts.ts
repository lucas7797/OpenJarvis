import { create } from 'zustand';
import { synthesizeSpeech, fetchTtsHealth } from './api';
import { toSpeakableText } from './message-text';

export type TtsState = 'idle' | 'loading' | 'speaking';

/**
 * Voice output is a single shared resource: one utterance at a time, for the
 * whole app. The state lives in one store rather than per component, because a
 * per-component hook would give every message its own audio element -- two
 * replies would then talk over each other, and autoplay would make that the
 * normal case rather than the exception.
 */
interface TtsStore {
  state: TtsState;
  /** id of the message currently loading or speaking, if any. */
  speakingId: string | null;
  error: string | null;
  /** Message whose read-aloud attempt failed, if any. */
  errorId: string | null;
  /** null until the health probe has answered. */
  available: boolean | null;
  /** Last message spoken by autoplay, so a re-render never repeats it. */
  autoSpokenId: string | null;
  speak: (id: string, text: string) => Promise<void>;
  stop: () => void;
  ensureHealth: () => Promise<void>;
  markAutoSpoken: (id: string) => void;
}

// Playback handles are not render state -- keeping them out of the store avoids
// re-rendering every subscriber when an audio element is swapped.
let audio: HTMLAudioElement | null = null;
let objectUrl: string | null = null;
let controller: AbortController | null = null;
let token = 0;
let healthProbe: Promise<void> | null = null;

/** Only a stream ending in the active conversation may trigger autoplay. */
export function shouldAutoplayFinishedReply(
  previousStreamingConversationId: string | null,
  activeId: string | null,
  streamIsActive: boolean,
  lastMessage: { id: string; role: string } | undefined,
  autoSpokenId: string | null,
): boolean {
  return previousStreamingConversationId !== null
    && previousStreamingConversationId === activeId
    && !streamIsActive
    && lastMessage !== undefined
    && lastMessage.role === 'assistant'
    && lastMessage.id !== autoSpokenId;
}

/** First piece is kept short so audio starts fast; later ones can be longer. */
const FIRST_PIECE_MAX = 140;
const PIECE_MAX = 260;

/** Break one sentence that is too long for a single piece at commas, then spaces. */
function splitLong(sentence: string, max: number): string[] {
  if (sentence.length <= max) return [sentence];
  const out: string[] = [];
  let rest = sentence;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '));
    cut = cut > max / 3 ? cut + 1 : window.lastIndexOf(' ');
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * Split speakable text into pieces for sentence-by-sentence synthesis.
 *
 * The first piece is the first sentence (so the voice starts after one short
 * synthesis instead of the whole reply); later sentences are grouped up to
 * PIECE_MAX characters to keep the number of requests low.
 */
export function splitForSpeech(text: string): string[] {
  const sentences = (text.match(/[^.!?…\n]+(?:[.!?…]+["')\]]*|\n+|$)/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  const pieces: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    const max = pieces.length === 0 && !current ? FIRST_PIECE_MAX : PIECE_MAX;
    for (const part of splitLong(sentence, max)) {
      if (pieces.length === 0 && !current) {
        pieces.push(part);
        continue;
      }
      if (current && current.length + 1 + part.length > PIECE_MAX) {
        pieces.push(current);
        current = part;
      } else {
        current = current ? `${current} ${part}` : part;
      }
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/** Stop and free the audio element that is playing, if any. */
function releaseAudio(): void {
  if (audio) {
    // Detach first: clearing src re-runs the media load algorithm, which fails
    // on an empty source and dispatches an `error` event. With the handler
    // still attached that surfaces as a bogus "Playback failed" after every
    // successful utterance.
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.src = '';
    audio = null;
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

function teardown(): void {
  releaseAudio();
  if (controller) {
    controller.abort();
    controller = null;
  }
}

export const useTtsStore = create<TtsStore>((set, get) => ({
  state: 'idle',
  speakingId: null,
  error: null,
  errorId: null,
  available: null,
  autoSpokenId: null,

  ensureHealth: () => {
    if (healthProbe) return healthProbe;
    healthProbe = fetchTtsHealth()
      .then((health) => {
        set({ available: health.available });
        if (!health.available) healthProbe = null;
      })
      .catch(() => {
        set({ available: false });
        healthProbe = null;
      });
    return healthProbe;
  },

  markAutoSpoken: (id: string) => set({ autoSpokenId: id }),

  speak: async (id: string, text: string) => {
    const trimmed = toSpeakableText(text);
    if (!trimmed) return;

    // Bump before teardown so a synthesis still in flight is both aborted and
    // fenced off by the token, even if the abort loses the race.
    token += 1;
    const mine = token;
    teardown();
    set({ state: 'loading', speakingId: id, error: null, errorId: null });

    const ac = new AbortController();
    controller = ac;

    // Speak sentence by sentence: synthesize piece i+1 while piece i plays,
    // so the voice starts after the first sentence instead of the whole reply.
    const pieces = splitForSpeech(trimmed);
    const requests = new Map<number, Promise<Blob>>();
    const fetchPiece = (i: number): Promise<Blob> => {
      let req = requests.get(i);
      if (!req) {
        req = synthesizeSpeech(pieces[i], { signal: ac.signal });
        // Failures are reported when the piece is played, not here.
        req.catch(() => undefined);
        requests.set(i, req);
      }
      return req;
    };

    const fail = (err: unknown) => {
      if (mine !== token) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      teardown();
      set({
        state: 'idle',
        speakingId: null,
        error: err instanceof Error ? err.message : 'Speech synthesis failed',
        errorId: id,
      });
    };

    const playPiece = async (i: number): Promise<void> => {
      try {
        const blob = await fetchPiece(i);
        if (mine !== token) return;
        if (i + 1 < pieces.length) void fetchPiece(i + 1);

        releaseAudio();
        const url = URL.createObjectURL(blob);
        objectUrl = url;
        const el = new Audio(url);
        audio = el;

        el.onended = () => {
          if (mine !== token) return;
          if (i + 1 < pieces.length) {
            void playPiece(i + 1);
            return;
          }
          teardown();
          set({ state: 'idle', speakingId: null });
        };
        el.onerror = () => {
          if (mine !== token) return;
          teardown();
          set({ state: 'idle', speakingId: null, error: 'Playback failed', errorId: id });
        };

        await el.play();
        if (mine === token) set({ state: 'speaking', speakingId: id });
      } catch (err) {
        fail(err);
      }
    };

    await playPiece(0);
  },

  stop: () => {
    token += 1;
    teardown();
    set({ state: 'idle', speakingId: null, error: null, errorId: null });
  },
}));

/** Test seam: reset module-level playback handles between cases. */
export function __resetTtsForTests(): void {
  teardown();
  token = 0;
  healthProbe = null;
  useTtsStore.setState({
    state: 'idle',
    speakingId: null,
    error: null,
    errorId: null,
    available: null,
    autoSpokenId: null,
  });
}
