const fs = require('fs');
let code = fs.readFileSync('src/store/useAppStore.ts', 'utf8');

code = code.replace(
  "dersleri_yerleştir: (preparedState: AppState, keepExisting: boolean, targets?: { classIds?: string[], teacherIds?: string[] }) => Promise<any>;",
  "dersleri_yerleştir: (preparedState: AppState, keepExisting: boolean, targets?: { classIds?: string[], teacherIds?: string[] }, extraOpts?: any) => Promise<any>;"
);
code = code.replace(
  "dersleri_yerleştir: async (preparedState, keepExisting, targets) => {",
  "dersleri_yerleştir: async (preparedState, keepExisting, targets, extraOpts) => {"
);
code = code.replace(
  "deepSearch: store.deepSearch,",
  "deepSearch: extraOpts?.deepSearch !== undefined ? extraOpts.deepSearch : store.deepSearch,"
);
code = code.replace(
  "numTrials: store.numTrials",
  "numTrials: extraOpts?.numTrials !== undefined ? extraOpts.numTrials : store.numTrials,\n      maxDurationMs: extraOpts?.maxDurationMs"
);

fs.writeFileSync('src/store/useAppStore.ts', code);
