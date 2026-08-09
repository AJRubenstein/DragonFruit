export const ONBOARDING_COMPLETED_STORAGE_KEY = 'dragonfruit-onboarding-completed';

/** True once the first-run onboarding wizard has been completed or dismissed.
 *  The wizard is a one-time experience; afterwards the lighter "Get Started"
 *  empty-state block is the fallback for users without a printer. */
export function getOnboardingCompleted(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(ONBOARDING_COMPLETED_STORAGE_KEY) === '1';
}

export function setOnboardingCompleted(completed: boolean): void {
  if (typeof window === 'undefined') return;
  if (completed) {
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, '1');
  } else {
    window.localStorage.removeItem(ONBOARDING_COMPLETED_STORAGE_KEY);
  }
}
