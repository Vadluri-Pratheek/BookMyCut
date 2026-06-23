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

    // Fix `export default mongoose;.model` to `export default mongoose.model`
    const newContent = content.replace(/export default ([a-zA-Z0-9_]+);\./g, 'export default $1.');

    if (newContent !== content) {
        fs.writeFileSync(file, newContent, 'utf8');
        console.log('Fixed mongoose export:', file);
    }
});
