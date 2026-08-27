const fs = require('fs');

const content = fs.readFileSync('src/pages/RepDashboard.tsx', 'utf8');
const lines = content.split('\n');

let stack = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const lineNum = i + 1;
  
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    
    // Ignore inside single-line comments
    if (line.slice(j, j + 2) === '//') {
      break;
    }
    
    if (char === '{' || char === '(' || char === '[') {
      stack.push({ char, line: lineNum, col: j + 1 });
    } else if (char === '}' || char === ')' || char === ']') {
      if (stack.length === 0) {
        console.log(`Unmatched closing ${char} at line ${lineNum}, col ${j + 1}`);
      } else {
        const top = stack[stack.length - 1];
        const matches = (top.char === '{' && char === '}') ||
                        (top.char === '(' && char === ')') ||
                        (top.char === '[' && char === ']');
        if (matches) {
          stack.pop();
        } else {
          console.log(`Mismatch at line ${lineNum}, col ${j + 1}: expected closing for ${top.char} from line ${top.line}, but found ${char}`);
          // Let's print the stack around this
          console.log('Current stack (last 5):', stack.slice(-5));
          // To recover and keep parsing, let's pop if it matches something further down or just pop the top
          stack.pop();
        }
      }
    }
  }
}

console.log('--- Final Stack ---');
console.log('Unclosed items:', stack.length);
if (stack.length > 0) {
  console.log('Last 10 unclosed items:', stack.slice(-10));
}
