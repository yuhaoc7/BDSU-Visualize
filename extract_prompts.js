import fs from 'fs';
const data = JSON.parse(fs.readFileSync('/Users/yuhaoc7/Developer/BDSU-Visualize/public/data.json', 'utf8'));

const prompts = new Set();
data.models.forEach(m => {
  m.personas.forEach(p => {
    p.samples.forEach(s => prompts.add(s.prompt));
  });
});
console.log(Array.from(prompts).join('\n'));
