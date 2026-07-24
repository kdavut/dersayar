const fs = require('fs');
const lines = fs.readFileSync('./src/components/ScheduleTab.tsx', 'utf8').split('\n');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].endsWith('}') && lines[i+1] === '') {
        console.log(`Found pattern at line ${i+1}`);
    }
}
