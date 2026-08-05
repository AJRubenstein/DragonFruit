/**
 * What produced a wheel event — or an honest admission that we cannot tell.
 *
 * 'unknown' is the point of this module. The previous version had no such
 * verdict: when the evidence ran out it guessed, and a wrong guess stuck.
 */
export type WheelDevice = 'wheel' | 'trackpad' | 'unknown';

export type WheelSample = {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  /** Legacy Blink/WebKit field. Absent in Firefox; quantised for wheels. */
  wheelDeltaY?: number;
};

/**
 * Tells a mouse wheel apart from a trackpad two-finger scroll, as far as the
 * DOM allows — which is not very far, and the API offers nothing better: a
 * `wheel` event carries no device identity. (A 3D mouse is a different story;
 * it arrives through the Gamepad API, which does name its device.)
 *
 * Signals, strongest first:
 *
 * - **`deltaMode !== 0`.** Line/page deltas only ever come from a wheel.
 * - **`ctrlKey`.** The pinch gesture Blink synthesizes. NOTE: WebKit uses
 *   proprietary GestureEvents for pinch instead, so this may never fire inside
 *   a WKWebView — pinch handling there needs `gesturestart`/`gesturechange`,
 *   which this app does not implement yet.
 * - **Movement on both axes.** A wheel turns in one axis per event; a tilt
 *   wheel moves in the other, never in both. A trackpad is a 2D surface, so a
 *   drag leaks into the off-axis. Checked per event *and* across the gesture,
 *   since the leak may show up only in some frames.
 * - **Fractional deltas.** Wheel notches are whole numbers everywhere.
 * - **Quantised `wheelDeltaY`.** Multiples of 120 are wheel notches. Only
 *   trusted when two consecutive events agree, because macOS acceleration can
 *   land a trackpad delta on a multiple by chance.
 *
 * What is deliberately NOT used: the *size* of a delta, and the *cadence* of
 * the event stream. Both describe the platform's scroll pipeline, not the
 * device. macOS accelerates the wheel and gives it a momentum tail, so one
 * notch arrives as a burst of decaying pixel deltas that looks exactly like a
 * trackpad flick — the mistake that made the wheel stop zooming mid-gesture.
 * Any of it can be rewritten anyway by a userspace remapper (LinearMouse, Mos,
 * Logi Options+), which sits between the hardware and the browser.
 *
 * A verdict is sticky for the length of a gesture, and survives between
 * gestures for a short while: the device does not change between two flicks a
 * moment apart, but it may well have changed a minute later. That TTL is the
 * self-healing property the previous version lacked.
 */

const GESTURE_GAP_MS = 200;
/**
 * How long a verdict outlives its gesture. Long enough to carry a series of
 * flicks; short enough that a wrong call cannot outlive the session.
 */
const VERDICT_TTL_MS = 1500;
/** One wheel notch in Blink/WebKit's legacy units. */
const WHEEL_DELTA_QUANTUM = 120;

function hasFractionalDelta(sample: WheelSample): boolean {
  return !Number.isInteger(sample.deltaX) || !Number.isInteger(sample.deltaY);
}

function isQuantisedWheelDelta(sample: WheelSample): boolean {
  const raw = sample.wheelDeltaY;
  if (typeof raw !== 'number' || raw === 0) return false;
  if (!Number.isInteger(raw)) return false;
  return Math.abs(raw) % WHEEL_DELTA_QUANTUM === 0;
}

export function createWheelDeviceClassifier() {
  let lastEventTime = Number.NEGATIVE_INFINITY;

  // Per gesture.
  let gestureVerdict: WheelDevice = 'unknown';
  let gestureSawX = false;
  let gestureSawY = false;

  // Rolling, across gesture boundaries on purpose: slow wheel notches are one
  // gesture each, so a per-gesture memory could never see two of them agree.
  let previousWasQuantised = false;

  // Across gestures, until the TTL runs out.
  let recentVerdict: WheelDevice = 'unknown';
  let recentVerdictTime = Number.NEGATIVE_INFINITY;

  // Both wheel handlers see the same event; classifying it twice would count
  // the same evidence twice.
  let memoSample: WheelSample | null = null;
  let memoVerdict: WheelDevice = 'unknown';

  function startGesture(): void {
    gestureVerdict = 'unknown';
    gestureSawX = false;
    gestureSawY = false;
  }

  function evidenceFor(sample: WheelSample): WheelDevice {
    if (sample.deltaMode !== 0) return 'wheel';
    if (sample.ctrlKey) return 'trackpad';
    if (sample.deltaX !== 0 && sample.deltaY !== 0) return 'trackpad';
    if (hasFractionalDelta(sample)) return 'trackpad';
    // Both axes have moved at some point in this gesture: a drag, not a turn.
    if (gestureSawX && gestureSawY) return 'trackpad';
    if (isQuantisedWheelDelta(sample) && previousWasQuantised) return 'wheel';
    return 'unknown';
  }

  return {
    classify(sample: WheelSample, now: number): WheelDevice {
      if (sample === memoSample) return memoVerdict;

      if (now - lastEventTime > GESTURE_GAP_MS) startGesture();
      lastEventTime = now;

      if (sample.deltaX !== 0) gestureSawX = true;
      if (sample.deltaY !== 0) gestureSawY = true;

      const evidence = evidenceFor(sample);
      previousWasQuantised = isQuantisedWheelDelta(sample);

      if (evidence !== 'unknown' && gestureVerdict === 'unknown') {
        gestureVerdict = evidence;
        recentVerdict = evidence;
        recentVerdictTime = now;
      }

      let verdict = gestureVerdict;
      if (verdict === 'unknown' && now - recentVerdictTime <= VERDICT_TTL_MS) {
        verdict = recentVerdict;
      }

      memoSample = sample;
      memoVerdict = verdict;
      return verdict;
    },

    /** Test seam — the handlers never need it. */
    reset(): void {
      lastEventTime = Number.NEGATIVE_INFINITY;
      recentVerdict = 'unknown';
      recentVerdictTime = Number.NEGATIVE_INFINITY;
      memoSample = null;
      memoVerdict = 'unknown';
      startGesture();
    },
  };
}

export type WheelDeviceClassifier = ReturnType<typeof createWheelDeviceClassifier>;
