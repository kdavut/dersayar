import fs from 'fs';
const lines = fs.readFileSync('./src/components/ScheduleTab.tsx', 'utf8').split('\n');
let count = 0;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '}' && lines[i+1] === '') {
        console.log(`Found pattern at line ${i+1}:`);
        console.log(`${lines[i]}`);
        console.log(`${lines[i+1]}`);
        console.log(`${lines[i+2]}`);
        count++;
    }
}
console.log(`Total found: ${count}`);
