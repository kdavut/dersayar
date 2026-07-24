import { ClassScheduleMap } from "../../types";
import { parseTeacherIds } from "./helpers";

export function getTeacherGapsForDay(
  schedule: ClassScheduleMap,
  teacherId: string,
  dayIndex: number,
  numPeriods: number
): number {
  const teacherIds = parseTeacherIds(teacherId);
  let maxGaps = 0;
  
  for (const tId of teacherIds) {
    const activePeriods = new Set<number>();
    for (const cId of Object.keys(schedule)) {
      const classSched = schedule[cId];
      if (!classSched) continue;
      const daySlots = classSched[dayIndex];
      if (!daySlots) continue;
      for (let p = 0; p < numPeriods; p++) {
        const slot = daySlots[p];
        if (slot && slot.teacherId) {
          const slotTIds = parseTeacherIds(slot.teacherId);
          if (slotTIds.includes(tId)) {
            activePeriods.add(p);
          }
        }
      }
    }
    
    if (activePeriods.size < 2) continue;
    
    const minP = Math.min(...activePeriods);
    const maxP = Math.max(...activePeriods);
    let gapsCount = 0;
    for (let p = minP; p <= maxP; p++) {
      if (!activePeriods.has(p)) {
        gapsCount++;
      }
    }
    maxGaps = Math.max(maxGaps, gapsCount);
  }
  return maxGaps;
}
