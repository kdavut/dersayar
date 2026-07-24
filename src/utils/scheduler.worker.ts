/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { runSolver } from "./scheduler/solveEngine";

let stopped = false;

// Listen to messages from the main thread
self.onmessage = async (e: MessageEvent) => {
  const { type, state, options } = e.data;

  if (type === "stop") {
    stopped = true;
    return;
  }

  // Set up running state
  stopped = false;
  const activeSeed = options?.randomSeed ?? 123456789;

  try {
    const result = await runSolver(
      state,
      options,
      activeSeed,
      (progress) => {
        self.postMessage({
          type: "progress",
          progress
        });
      },
      () => stopped
    );

    self.postMessage({
      type: "result",
      result: {
        success: result.success,
        schedule: result.schedule,
        unplacedCount: result.unplacedCount,
        usedSeed: result.usedSeed,
        message: result.unplacedCount === 0
          ? "Tüm dersler başarıyla yerleştirildi, motor kendiliğinden durdu!"
          : `Ders programı yerleştirildi ancak ${result.unplacedCount} ders saati yerleştirilemedi.`,
        unplacedDetails: result.unplacedDetails
      }
    });
  } catch (err: any) {
    console.error("Solver execution failed inside worker:", err);
    self.postMessage({
      type: "result",
      result: {
        success: false,
        schedule: state.schedule || {},
        unplacedCount: 999,
        usedSeed: activeSeed,
        message: `Planlama sırasında hata oluştu: ${err.message || err}`
      }
    });
  }
};
