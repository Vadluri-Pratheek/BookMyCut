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
    
    // Replace `import someController from '../controllers/someController.js';`
    // with `import * as someController from '../controllers/someController.js';`
    const newContent = content.replace(/import\s+([a-zA-Z0-9_]+Controller)\s+from\s+['"]([^'"]+)['"];?/g, (match, controllerName, modulePath) => {
        if (modulePath.includes('controllers')) {
            return `import * as ${controllerName} from '${modulePath}';`;
        }
        return match;
    });

    if (newContent !== content) {
        fs.writeFileSync(file, newContent, 'utf8');
        console.log('Fixed controller import:', file);
    }
});
