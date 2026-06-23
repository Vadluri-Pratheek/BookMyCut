import fs from 'fs';
import path from 'path';

const backendDir = path.join(process.cwd(), 'backend');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            if (!file.includes('node_modules')) {
                results = results.concat(walk(file));
            }
        } else {
            if (file.endsWith('.js')) {
                results.push(file);
            }
        }
    });
    return results;
}

const files = walk(backendDir);

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let modified = false;

    // Fix `import { x: y }` to `import { x as y }`
    const newContent = content.replace(/import\s+({[\s\S]+?})\s+from\s+['"][^'"]+['"]/g, (match) => {
        if (match.includes(':')) {
            modified = true;
            return match.replace(/([a-zA-Z0-9_]+)\s*:\s*([a-zA-Z0-9_]+)/g, '$1 as $2');
        }
        return match;
    });

    if (modified) {
        fs.writeFileSync(file, newContent, 'utf8');
        console.log('Fixed:', file);
    }
});
