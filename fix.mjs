import fs from 'fs';
let lines = fs.readFileSync('./src/components/ScheduleTab.tsx', 'utf8').split('\n');

const errors = [
2538, 2543, 2547, 2551, 2553, 2555, 2559, 2568, 2573, 2576, 2580, 2584, 2588, 2593, 2834, 3040, 3045, 3065, 3106, 3120, 3149, 3157, 3161, 3166, 3364, 3368, 3373, 3728, 3731, 3733, 3821, 4082, 4088, 4095, 4101, 4106, 4111, 4116, 4118, 4123, 4128, 4133, 4143
];

for (let e of errors) {
    let lineIdx = e - 1;
    console.log(`--- Line ${e} ---`);
    for (let i = lineIdx - 2; i <= lineIdx + 2; i++) {
        if (lines[i] !== undefined) console.log(`${i+1}: ${lines[i]}`);
    }
}
