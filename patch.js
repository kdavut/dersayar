const fs = require('fs');
const code = fs.readFileSync('src/utils/scheduler.worker.ts', 'utf8');

const target = `          const dSize = getRemainingDomainSize(
            b,
            currentSchedule,
            currentTeacherOccupancy,
            currentClassroomOccupancy,
            settings,
            teachersMap,
            classesMap,
            classroomsMap,
            coursesMap,
            options
          );
          const bestDSize = getRemainingDomainSize(
            bestBlock,
            currentSchedule,
            currentTeacherOccupancy,
            currentClassroomOccupancy,
            settings,
            teachersMap,
            classesMap,
            classroomsMap,
            coursesMap,
            options
          );
          if (dSize !== bestDSize) {
            if (dSize < bestDSize) bestIdx = i;
            continue;
          }`;

const replacement = `          const strictSize = getStrictEmptyDomainSize(
            b,
            currentSchedule,
            currentTeacherOccupancy,
            currentClassroomOccupancy,
            settings,
            teachersMap,
            classesMap,
            classroomsMap,
            coursesMap,
            options
          );
          const bestStrictSize = getStrictEmptyDomainSize(
            bestBlock,
            currentSchedule,
            currentTeacherOccupancy,
            currentClassroomOccupancy,
            settings,
            teachersMap,
            classesMap,
            classroomsMap,
            coursesMap,
            options
          );

          // "Apaçık boşlukları doldur" - Fill obvious gaps first!
          const hasStrict = strictSize > 0 ? 1 : 0;
          const bestHasStrict = bestStrictSize > 0 ? 1 : 0;
          if (hasStrict !== bestHasStrict) {
            if (hasStrict > bestHasStrict) bestIdx = i;
            continue;
          }

          // If both have strict empty slots, MRV on strict slots (smallest first)
          if (hasStrict === 1) {
            if (strictSize !== bestStrictSize) {
              if (strictSize < bestStrictSize) bestIdx = i;
              continue;
            }
          }

          const dSize = getRemainingDomainSize(
            b,
            currentSchedule,
            currentTeacherOccupancy,
            currentClassroomOccupancy,
            settings,
            teachersMap,
            classesMap,
            classroomsMap,
            coursesMap,
            options
          );
          const bestDSize = getRemainingDomainSize(
            bestBlock,
            currentSchedule,
            currentTeacherOccupancy,
            currentClassroomOccupancy,
            settings,
            teachersMap,
            classesMap,
            classroomsMap,
            coursesMap,
            options
          );
          if (dSize !== bestDSize) {
            if (dSize < bestDSize) bestIdx = i;
            continue;
          }`;

if (code.includes(target)) {
  fs.writeFileSync('src/utils/scheduler.worker.ts', code.replace(target, replacement));
  console.log("Patch applied successfully.");
} else {
  console.log("Target not found!");
}
