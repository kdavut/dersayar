const fs = require('fs');
const path = require('path');

const filePath = '/src/utils/scheduler/solveEngine.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Use non-regex markers for exact matches, ignoring potential CRLF differences
const normalize = s => s.replace(/\r\n/g, '\n').trim();

const lines = content.replace(/\r\n/g, '\n').split('\n');

let startIndex = -1;
let endIndex = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const solveStateSpace = async (') && lines[i].includes('blocks: BlockToPlace[]')) {
    startIndex = i;
  }
  if (lines[i].includes('const solveRes = await solveStateSpace(randomizedBlocks, 0);')) {
    endIndex = i;
  }
}

if (startIndex === -1 || endIndex === -1) {
  console.error(`Markers not found! startIndex=${startIndex}, endIndex=${endIndex}`);
  process.exit(1);
}

// Rebuild the file content
const before = lines.slice(0, startIndex).join('\n');
const after = lines.slice(endIndex + 1).join('\n');

const newCode = `    const solveStateSpace = async (
      blocks: BlockToPlace[],
      depth: number,
      sched: ClassScheduleMap,
      tOcc: Record<string, (string | null)[][]>,
      crOcc: Record<string, (string | null)[][]>
    ): Promise<{
      success: boolean;
      newSchedule?: ClassScheduleMap;
      newTeacherOccupancy?: Record<string, (string | null)[][]>;
      newClassroomOccupancy?: Record<string, (string | null)[][]>;
    }> => {
      if (isStopped()) return { success: false };

      const tryChainShiftRecursive = async (
        assignmentId: string,
        targetD: number,
        targetP: number,
        visited: Set<string>,
        chainDepth: number,
        maxChainDepth: number,
        exactSourceD: number = -1,
        exactSourceP: number = -1,
        exactBlockSize: number = 0,
        exactClassId: string = "",
        scheduleToUse: ClassScheduleMap,
        teacherOccupancyToUse: Record<string, (string | null)[][]>,
        classroomOccupancyToUse: Record<string, (string | null)[][]>
      ): Promise<{
        success: boolean;
        newSchedule?: ClassScheduleMap;
        newTeacherOccupancy?: Record<string, (string | null)[][]>;
        newClassroomOccupancy?: Record<string, (string | null)[][]>;
      }> => {
        if (Date.now() - startTime > maxDurationMs) return { success: false };
        if (chainDepth > maxChainDepth) return { success: false };
        if (visited.has(assignmentId)) return { success: false };

        const assignObj = assignmentsMap.get(assignmentId);
        if (!assignObj) return { success: false };

        const classId = exactClassId || assignObj.classId;
        const classObj = classesMap.get(classId);
        if (!classObj) return { success: false };

        let sourceD = exactSourceD;
        let sourceP = exactSourceP;
        let blockSize = exactBlockSize;

        if (sourceD === -1) {
          const slotsToMove: ScheduleSlot[] = [];
          for (let d = 0; d < numDays && sourceD === -1; d++) {
            for (let p = 0; p < numPeriods; p++) {
              const slot = scheduleToUse[classId]?.[d]?.[p];
              if (slot && slot.assignmentId === assignmentId) {
                sourceD = d;
                sourceP = p;
                let currP = p;
                while (currP < numPeriods) {
                  const s = scheduleToUse[classId]?.[d]?.[currP];
                  if (s && s.assignmentId === assignmentId) {
                    slotsToMove.push(s);
                    currP++;
                  } else {
                    break;
                  }
                }
                blockSize = slotsToMove.length;
                break;
              }
            }
          }
        }
        
        if (blockSize === 0) blockSize = 1;

        if (sourceD === targetD && sourceP === targetP) {
          return {
            success: true,
            newSchedule: scheduleToUse,
            newTeacherOccupancy: teacherOccupancyToUse,
            newClassroomOccupancy: classroomOccupancyToUse
          };
        }

        for (let offset = 0; offset < blockSize; offset++) {
          const currP = targetP + offset;
          if (currP >= numPeriods) return { success: false };
          if (classObj.unavailability[targetD]?.[currP] === true) return { success: false };
          if (classObj.dailyPeriods && classObj.dailyPeriods[targetD] !== undefined && currP >= classObj.dailyPeriods[targetD]) return { success: false };
          if (assignObj.teacherId) {
            const tIds = parseTeacherIds(assignObj.teacherId);
            for (const tId of tIds) {
              const teacher = teachersMap.get(tId);
              if (teacher?.unavailability[targetD]?.[currP] === true) return { success: false };
            }
          }
          if (assignObj.classroomId) {
            const classroom = classroomsMap.get(assignObj.classroomId);
            if (classroom?.unavailability[targetD]?.[currP] === true) return { success: false };
          }
        }

        const conflicts = new Map<string, {d: number, p: number, size: number, conflictClassId: string}>();
        
        const checkAndAddConflict = (occupiedSlot: ScheduleSlot | null, busyClassId: string, currP: number) => {
           if (occupiedSlot && occupiedSlot.assignmentId !== assignmentId) {
              if (!conflicts.has(occupiedSlot.assignmentId)) {
                  let startP = currP;
                  while(startP > 0 && scheduleToUse[busyClassId]?.[targetD]?.[startP - 1]?.assignmentId === occupiedSlot.assignmentId) {
                    startP--;
                  }
                  let endP = currP;
                  while(endP < numPeriods - 1 && scheduleToUse[busyClassId]?.[targetD]?.[endP + 1]?.assignmentId === occupiedSlot.assignmentId) {
                    endP++;
                  }
                  conflicts.set(occupiedSlot.assignmentId, {d: targetD, p: startP, size: endP - startP + 1, conflictClassId: busyClassId});
              }
           }
        };

        const isAssignmentForcedSameDay = (assignObj as any)._forceSameDay === true;
        if (sourceD !== targetD && !globalAllowSameDaySameCourse && !isAssignmentForcedSameDay && (!options?.priorityAssignmentIds || !options.priorityAssignmentIds.includes(assignmentId))) {
          const classDaySched = scheduleToUse[classId]?.[targetD];
          if (classDaySched) {
            for (let p = 0; p < numPeriods; p++) {
               const s = classDaySched[p];
               if (s !== null && s.assignmentId !== assignmentId && s.courseId === assignObj.courseId) {
                  checkAndAddConflict(s, classId, p);
               }
            }
          }
        }

        for (let offset = 0; offset < blockSize; offset++) {
          const currP = targetP + offset;
          checkAndAddConflict(scheduleToUse[classId]?.[targetD]?.[currP], classId, currP);
          if (assignObj.teacherId) {
            const tIds = parseTeacherIds(assignObj.teacherId);
            for (const tId of tIds) {
              const busyClassId = teacherOccupancyToUse[tId]?.[targetD]?.[currP];
              if (busyClassId && busyClassId !== classId) {
                checkAndAddConflict(scheduleToUse[busyClassId]?.[targetD]?.[currP], busyClassId, currP);
              }
            }
          }
          if (assignObj.classroomId) {
            const busyClassId = classroomOccupancyToUse[assignObj.classroomId]?.[targetD]?.[currP];
            if (busyClassId && busyClassId !== classId) {
              checkAndAddConflict(scheduleToUse[busyClassId]?.[targetD]?.[currP], busyClassId, currP);
            }
          }
        }

        for (const [confId, confData] of conflicts.entries()) {
          if (visited.has(confId)) return { success: false }; 
          const confAssignObj = assignmentsMap.get(confId);
          if (!confAssignObj) return { success: false };
          if (options?.priorityAssignmentIds && options.priorityAssignmentIds.includes(confId)) {
            return { success: false };
          }
          const exSlot = scheduleToUse[confData.conflictClassId]?.[confData.d]?.[confData.p];
          if (isSlotLocked(exSlot, coursesMap, options?.priorityAssignmentIds)) {
            return { success: false };
          }
        }

        const workingSchedule = cloneSchedule(scheduleToUse);
        const workingTeacherOccupancy = cloneOccupancy(teacherOccupancyToUse, numDays);
        const workingClassroomOccupancy = cloneOccupancy(classroomOccupancyToUse, numDays);

        const nextVisited = new Set(visited);
        nextVisited.add(assignmentId);

        if (sourceD !== -1) {
          for (let offset = 0; offset < blockSize; offset++) {
            const sP = sourceP + offset;
            const slot = workingSchedule[classId][sourceD]?.[sP];
            if (slot && slot.assignmentId === assignmentId) {
              workingSchedule[classId][sourceD][sP] = null;
              clearOccupancy(classId, sourceD, sP, slot, workingTeacherOccupancy, workingClassroomOccupancy);
            }
          }
        }

        let allResolved = true;
        for (const [confId, confData] of conflicts.entries()) {
          if (workingSchedule[confData.conflictClassId]?.[confData.d]?.[confData.p]?.assignmentId !== confId) {
             continue;
          }

          const confAssign = assignmentsMap.get(confId);
          if (!confAssign) {
            allResolved = false;
            break;
          }

          let branchPlaced = false;
          const classObjConf = classesMap.get(confData.conflictClassId);
          if (!classObjConf) {
            allResolved = false;
            break;
          }

          for (let altD = 0; altD < numDays && !branchPlaced; altD++) {
            if (classObjConf.unavailability[altD]?.every(p => p === true)) continue;
            for (let altP = 0; altP <= numPeriods - confData.size && !branchPlaced; altP++) {
              if (altD === confData.d && altP === confData.p) continue;
              
              let memoryFailPenalty = branchFailureMemory.get(\`\${confId}-\${altD}-\${altP}\`) || 0;
              if (memoryFailPenalty > 15) {
                if (random() > 0.10) continue;
              }

              let canPlaceBranch = true;
              for (let o = 0; o < confData.size; o++) {
                const curAltP = altP + o;
                if (classObjConf.unavailability[altD]?.[curAltP] === true) { canPlaceBranch = false; break; }
                if (classObjConf.dailyPeriods && classObjConf.dailyPeriods[altD] !== undefined && curAltP >= classObjConf.dailyPeriods[altD]) { canPlaceBranch = false; break; }
              }
              if (!canPlaceBranch) continue;

              const isConfForcedSameDay = (confAssign as any)._forceSameDay === true;
              let isAltSameDaySameCourseConflict = false;
              if (altD !== confData.d && !globalAllowSameDaySameCourse && !isConfForcedSameDay && (!options?.priorityAssignmentIds || !options.priorityAssignmentIds.includes(confId))) {
                const classAltSched = workingSchedule[confData.conflictClassId]?.[altD];
                if (classAltSched) {
                  for (let p = 0; p < numPeriods; p++) {
                     const s = classAltSched[p];
                     if (s !== null && s.assignmentId !== confId && s.courseId === confAssign.courseId) {
                        isAltSameDaySameCourseConflict = true;
                        break;
                     }
                  }
                }
              }
              if (isAltSameDaySameCourseConflict) continue;

              const tempSchedule = cloneSchedule(workingSchedule);
              const tempTeacherOccupancy = cloneOccupancy(workingTeacherOccupancy, numDays);
              const tempClassroomOccupancy = cloneOccupancy(workingClassroomOccupancy, numDays);

              for (let o = 0; o < confData.size; o++) {
                const sP = confData.p + o;
                const slot = tempSchedule[confData.conflictClassId][confData.d]?.[sP];
                if (slot && slot.assignmentId === confId) {
                  tempSchedule[confData.conflictClassId][confData.d][sP] = null;
                  clearOccupancy(confData.conflictClassId, confData.d, sP, slot, tempTeacherOccupancy, tempClassroomOccupancy);
                }
              }

              if (isPlacementValidEx(state, teachersMap, classesMap, classroomsMap, tempSchedule, tempTeacherOccupancy, tempClassroomOccupancy, confAssign, altD, altP, confData.size, confData.conflictClassId, { priorityAssignmentIds: options?.priorityAssignmentIds })) {
                for (let o = 0; o < confData.size; o++) {
                  const altPeriod = altP + o;
                  const newSlot = {
                    assignmentId: confId,
                    courseId: confAssign.courseId,
                    teacherId: confAssign.teacherId,
                    classroomId: confAssign.classroomId
                  };
                  tempSchedule[confData.conflictClassId][altD][altPeriod] = newSlot;
                  registerOccupancy(confData.conflictClassId, altD, altPeriod, newSlot, tempTeacherOccupancy, tempClassroomOccupancy);
                }
                
                for (const cIdKey of Object.keys(tempSchedule)) {
                  workingSchedule[cIdKey] = tempSchedule[cIdKey];
                }
                for (const tIdKey of Object.keys(tempTeacherOccupancy)) {
                  workingTeacherOccupancy[tIdKey] = tempTeacherOccupancy[tIdKey];
                }
                for (const crIdKey of Object.keys(tempClassroomOccupancy)) {
                  workingClassroomOccupancy[crIdKey] = tempClassroomOccupancy[crIdKey];
                }
                branchPlaced = true;
              } else {
                const recursionRes = await tryChainShiftRecursive(
                  confId,
                  altD,
                  altP,
                  nextVisited,
                  chainDepth + 1,
                  maxChainDepth,
                  confData.d,
                  confData.p,
                  confData.size,
                  confData.conflictClassId,
                  tempSchedule,
                  tempTeacherOccupancy,
                  tempClassroomOccupancy
                );
                if (recursionRes.success && recursionRes.newSchedule && recursionRes.newTeacherOccupancy && recursionRes.newClassroomOccupancy) {
                  for (const cIdKey of Object.keys(recursionRes.newSchedule)) {
                    workingSchedule[cIdKey] = recursionRes.newSchedule[cIdKey];
                  }
                  for (const tIdKey of Object.keys(recursionRes.newTeacherOccupancy)) {
                    workingTeacherOccupancy[tIdKey] = recursionRes.newTeacherOccupancy[tIdKey];
                  }
                  for (const crIdKey of Object.keys(recursionRes.newClassroomOccupancy)) {
                    workingClassroomOccupancy[crIdKey] = recursionRes.newClassroomOccupancy[crIdKey];
                  }
                  branchPlaced = true;
                }
              }
              
              if (!branchPlaced) {
                branchFailureMemory.set(\`\${confId}-\${altD}-\${altP}\`, (branchFailureMemory.get(\`\${confId}-\${altD}-\${altP}\`) || 0) + 1);
              }
            }
          }

          if (!branchPlaced) {
            allResolved = false;
            break;
          }
        }

        if (allResolved) {
          if (isPlacementValidEx(state, teachersMap, classesMap, classroomsMap, workingSchedule, workingTeacherOccupancy, workingClassroomOccupancy, assignObj, targetD, targetP, blockSize, classId, { priorityAssignmentIds: options?.priorityAssignmentIds })) {
            for (let offset = 0; offset < blockSize; offset++) {
              const targetPeriod = targetP + offset;
              const newSlot = {
                assignmentId: assignmentId,
                courseId: assignObj.courseId,
                teacherId: assignObj.teacherId,
                classroomId: assignObj.classroomId
              };
              workingSchedule[classId][targetD][targetPeriod] = newSlot;
              registerOccupancy(classId, targetD, targetPeriod, newSlot, workingTeacherOccupancy, workingClassroomOccupancy);
            }

            return {
              success: true,
              newSchedule: workingSchedule,
              newTeacherOccupancy: workingTeacherOccupancy,
              newClassroomOccupancy: workingClassroomOccupancy
            };
          }
        }

        return { success: false };
      };

      if (blocks.length === 0) {
        return {
          success: true,
          newSchedule: sched,
          newTeacherOccupancy: tOcc,
          newClassroomOccupancy: crOcc
        };
      }

      currentTrialSteps++;
      if (currentTrialSteps > maxTrialSteps) {
        return { success: false };
      }

      if (currentTrialSteps % 3500 === 0) {
        const now = Date.now();
        if (now - lastYieldTime > 80) {
          await new Promise(resolve => setTimeout(resolve, 0));
          lastYieldTime = Date.now();
          if (isStopped()) return { success: false };
        }
      }

      if (Date.now() - startTime > maxDurationMs) {
        return { success: false };
      }

      let bestIdx = 0;
      let highestPriorityWeight = -Infinity;

      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const failCount = blockFailureCounts.get(b.id) || 0;
        let priorityWeight = failCount * 12.0;

        if (options?.priorityAssignmentIds && options.priorityAssignmentIds.includes(b.assignment.id)) {
          priorityWeight += 1500.0;
        }

        const tIds = parseTeacherIds(b.assignment.teacherId);
        tIds.forEach(id => {
          priorityWeight += (teacherConflictWeights.get(id) || 0) * 1.5;
        });
        priorityWeight += (classConflictWeights.get(b.assignment.classId) || 0) * 1.5;

        if (b.size > 2) priorityWeight += 15.0;
        
        if (priorityWeight > highestPriorityWeight) {
          highestPriorityWeight = priorityWeight;
          bestIdx = i;
        }
      }

      const block = blocks[bestIdx];
      const blocksSlice1 = [...blocks];
      blocksSlice1.splice(bestIdx, 1);

      const classId = block.assignment.classId;
      const classObj = classesMap.get(classId);
      if (!classObj) {
        return await solveStateSpace(blocksSlice1, depth, sched, tOcc, crOcc);
      }

      const candidates: { d: number; p: number; conflictsCount: number }[] = [];

      for (let d = 0; d < numDays; d++) {
        if (classObj.unavailability[d]?.every(p => p === true)) continue;

        for (let p = 0; p <= numPeriods - block.size; p++) {
          let canPlace = true;
          let conflictsCount = 0;

          for (let offset = 0; offset < block.size; offset++) {
            const period = p + offset;

            if (classObj.unavailability[d]?.[period] === true) {
              canPlace = false;
              break;
            }

            if (classObj.dailyPeriods) {
              const maxPeriods = classObj.dailyPeriods[d];
              if (maxPeriods !== undefined && period >= maxPeriods) {
                canPlace = false;
                break;
              }
            }

            const existingSlot = sched[classId]?.[d]?.[period];
            if (existingSlot) {
              if (isSlotLocked(existingSlot, coursesMap, options?.priorityAssignmentIds)) {
                canPlace = false;
                break;
              }
              conflictsCount++;
            }

            if (block.assignment.teacherId) {
              const tIds = parseTeacherIds(block.assignment.teacherId);
              for (const tId of tIds) {
                const teacher = teachersMap.get(tId);
                if (teacher?.unavailability[d]?.[period] === true) {
                   canPlace = false;
                   break;
                }

                const occupiedByClassId = tOcc[tId]?.[d]?.[period];
                if (occupiedByClassId !== null && occupiedByClassId !== undefined && occupiedByClassId !== classId) {
                  const occupiedSlot = sched[occupiedByClassId]?.[d]?.[period];
                  if (occupiedSlot) {
                    if (isSlotLocked(occupiedSlot, coursesMap) || (options?.priorityAssignmentIds && options.priorityAssignmentIds.includes(occupiedSlot.assignmentId))) {
                      canPlace = false;
                      break;
                    }
                    conflictsCount++;
                  }
                }
              }
              if (!canPlace) break;
            }

            if (block.assignment.classroomId) {
              const classroom = classroomsMap.get(block.assignment.classroomId);
              if (classroom?.unavailability[d]?.[period] === true) {
                 canPlace = false;
                 break;
              }

              const occupiedByClassId = crOcc[block.assignment.classroomId]?.[d]?.[period];
              if (occupiedByClassId !== null && occupiedByClassId !== undefined && occupiedByClassId !== classId) {
                const occupiedSlot = sched[occupiedByClassId]?.[d]?.[period];
                if (occupiedSlot) {
                  if (isSlotLocked(occupiedSlot, coursesMap) || (options?.priorityAssignmentIds && options.priorityAssignmentIds.includes(occupiedSlot.assignmentId))) {
                    canPlace = false;
                    break;
                  }
                  conflictsCount++;
                }
              }
              if (!canPlace) break;
            }
          }

          if (canPlace) {
            candidates.push({ d, p, conflictsCount });
          }
        }
      }

      if (candidates.length === 0) {
        blockFailureCounts.set(block.id, (blockFailureCounts.get(block.id) || 0) + 1);
        if (block.assignment.teacherId) {
          parseTeacherIds(block.assignment.teacherId).forEach(tId => {
            teacherConflictWeights.set(tId, (teacherConflictWeights.get(tId) || 0) + 1.0);
          });
        }
        classConflictWeights.set(classId, (classConflictWeights.get(classId) || 0) + 1.0);
        return { success: false };
      }

      candidates.sort((a, b) => {
        if (a.conflictsCount !== b.conflictsCount) {
          return a.conflictsCount - b.conflictsCount;
        }

        const isMorningA = a.p < numPeriods / 2;
        const isMorningB = b.p < numPeriods / 2;
        const course = coursesMap.get(block.assignment.courseId);
        const isGenCulture = course ? isGeneralCultureCourse(course.name, course.code) : false;
        if (isGenCulture) {
          if (isMorningA !== isMorningB) {
            return isMorningA ? 1 : -1;
          }
        } else {
          if (isMorningA !== isMorningB) {
            return isMorningA ? -1 : 1;
          }
        }

        return random() - 0.5;
      });

      const maxBacktrackBranches = Math.max(3, 10 - depth);
      const branchesToTry = candidates.slice(0, maxBacktrackBranches);

      for (const cand of branchesToTry) {
        const chainRes = await tryChainShiftRecursive(
          block.assignment.id,
          cand.d,
          cand.p,
          new Set<string>(),
          0,
          5,
          -1,
          -1,
          block.size,
          classId,
          sched,
          tOcc,
          crOcc
        );

        if (chainRes.success && chainRes.newSchedule && chainRes.newTeacherOccupancy && chainRes.newClassroomOccupancy) {
          const recurRes = await solveStateSpace(
            blocksSlice1,
            depth + 1,
            chainRes.newSchedule,
            chainRes.newTeacherOccupancy,
            chainRes.newClassroomOccupancy
          );
          if (recurRes.success) {
            return recurRes;
          }
        }
      }

      return { success: false };
    };

    // Greedy Phase: Try to place blocks that have completely conflict-free slots first
    const greedyUnplacedBlocks = [];

    for (const block of randomizedBlocks) {
      let placedGreedily = false;
      const classId = block.assignment.classId;
      const classObj = classesMap.get(classId);
      if (!classObj) {
        greedyUnplacedBlocks.push(block);
        continue;
      }

      const daysOrder = Array.from({ length: numDays }, (_, i) => i);
      const periodsOrder = Array.from({ length: numPeriods - block.size + 1 }, (_, i) => i);
      if (restartCount > 0) {
        shuffle(daysOrder);
        shuffle(periodsOrder);
      }

      for (const d of daysOrder) {
        if (placedGreedily) break;
        if (classObj.unavailability[d]?.every(p => p === true)) continue;

        for (const p of periodsOrder) {
          if (classObj.unavailability[d]?.[p] === true) continue;
          if (classObj.dailyPeriods && classObj.dailyPeriods[d] !== undefined && p + block.size > classObj.dailyPeriods[d]) continue;

          if (isPlacementValidEx(state, teachersMap, classesMap, classroomsMap, currentSchedule, currentTeacherOccupancy, currentClassroomOccupancy, block.assignment, d, p, block.size, classId, { priorityAssignmentIds: options?.priorityAssignmentIds })) {
            for (let offset = 0; offset < block.size; offset++) {
              const period = p + offset;
              const newSlot = {
                assignmentId: block.assignment.id,
                courseId: block.assignment.courseId,
                teacherId: block.assignment.teacherId,
                classroomId: block.assignment.classroomId,
                isLocked: lockedAssignmentIds.has(block.assignment.id)
              };
              currentSchedule[classId][d][period] = newSlot;
              registerOccupancy(classId, d, period, newSlot, currentTeacherOccupancy, currentClassroomOccupancy);
            }
            placedGreedily = true;
            break;
          }
        }
      }

      if (!placedGreedily) {
        greedyUnplacedBlocks.push(block);
      }
    }

    const solveRes = await solveStateSpace(
      greedyUnplacedBlocks,
      0,
      currentSchedule,
      currentTeacherOccupancy,
      currentClassroomOccupancy
    );

    if (solveRes.success && solveRes.newSchedule && solveRes.newTeacherOccupancy && solveRes.newClassroomOccupancy) {
      currentSchedule = solveRes.newSchedule;
      currentTeacherOccupancy = solveRes.newTeacherOccupancy;
      currentClassroomOccupancy = solveRes.newClassroomOccupancy;
    } else {`;

fs.writeFileSync('/src/utils/scheduler/solveEngine.ts', before + '\n' + newCode + '\n' + after, 'utf8');
console.log('Patch successfully applied!');
