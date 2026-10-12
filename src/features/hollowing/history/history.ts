import { createTypedHistory } from '@/history/typedHistory';

import type { HollowingHistoryPayloadMap } from './actionTypes';

const hollowingHistory = createTypedHistory<HollowingHistoryPayloadMap>();

export const pushHollowingHistory = hollowingHistory.push;
export const registerHollowingHistoryHandler = hollowingHistory.register;
