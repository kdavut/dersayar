/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ders Programı Worker Giriş Noktası (Temiz Şablon)
 */

self.onmessage = async (e: MessageEvent) => {
  const { type, state } = e.data;

  if (type === "stop") {
    return;
  }

  const numDays = state?.settings?.days?.length || 5;
  const numPeriods = state?.settings?.periodsPerDay || 8;
  const schedule: any = {};

  if (state?.classes) {
    for (const cls of state.classes) {
      schedule[cls.id] = {};
      for (let d = 0; d < numDays; d++) {
        schedule[cls.id][d] = Array(numPeriods).fill(null);
      }
    }
  }

  self.postMessage({
    type: "result",
    result: {
      success: true,
      schedule,
      unplacedCount: 0,
      message: "Yerleştirme motoru hazır."
    }
  });
};
