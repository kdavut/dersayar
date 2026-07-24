import fs from 'fs';
import { execSync } from 'child_process';

let file = './src/components/ScheduleTab.tsx';

let iter = 0;
while (iter < 100) {
  iter++;
  try {
    execSync('npx tsc --noEmit', { stdio: 'pipe' });
    console.log('Success!');
    break;
  } catch (err) {
    const out = err.stdout.toString();
    // Example: src/components/ScheduleTab.tsx(2538,185): error TS1005: '}' expected.
    // Or: src/components/ScheduleTab.tsx(2547,35): error TS1381: Unexpected token.
    let lines = fs.readFileSync(file, 'utf8').split('\n');
    let matches = [...out.matchAll(/src\/components\/ScheduleTab\.tsx\((\d+),\d+\): error (TS1005|TS1381|TS1109|TS17002|TS17015|TS1128|TS1136)/g)];
    
    if (matches.length > 0) {
       let firstMatchLine = parseInt(matches[0][1]);
       // Find the closest '}' before or at this line and replace with '} else {'
       // Actually, the '}' is often at firstMatchLine or firstMatchLine + 1 or firstMatchLine - 1
       let found = false;
       for (let i = firstMatchLine; i >= firstMatchLine - 2; i--) {
          if (lines[i] && lines[i].includes('}')) {
             lines[i] = lines[i].replace('}', '} else {');
             fs.writeFileSync(file, lines.join('\n'));
             console.log('Fixed line ' + (i + 1) + ' by replacing } with } else {');
             found = true;
             break;
          }
       }
       if (!found) {
         console.log("Couldn't find '}' near line " + firstMatchLine);
         console.log(out);
         break;
       }
    } else {
       console.log("No recognizable TS error");
       console.log(out);
       break;
    }
  }
}
