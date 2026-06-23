const fs = require('fs');
const path = require('path');

const backendDir = path.join(__dirname, '..', 'backend');

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

    // 1. require('dotenv').config(); -> import dotenv from 'dotenv'; dotenv.config();
    content = content.replace(/require\(['"]dotenv['"]\)\.config\(\);?/g, "import dotenv from 'dotenv';\ndotenv.config();");

    // 2. const { a, b } = require('...'); -> import { a, b } from '...';
    content = content.replace(/const\s+(\{[\s\S]*?\})\s*=\s*require\((['"])(.*?)\2\);?/g, (match, vars, quote, modulePath) => {
        if (modulePath.startsWith('.')) {
            if (!modulePath.endsWith('.js')) modulePath += '.js';
        }
        return `import ${vars} from '${modulePath}';`;
    });

    // 3. const a = require('...'); -> import a from '...';
    content = content.replace(/const\s+([a-zA-Z0-9_]+)\s*=\s*require\((['"])(.*?)\2\);?/g, (match, varName, quote, modulePath) => {
        if (modulePath.startsWith('.')) {
            if (!modulePath.endsWith('.js')) modulePath += '.js';
        }
        return `import ${varName} from '${modulePath}';`;
    });

    // 4. module.exports = { a, b }; -> export { a, b };
    content = content.replace(/module\.exports\s*=\s*(\{[\s\S]*?\});?/g, (match, obj) => {
        return `export ${obj};`;
    });

    // 5. module.exports = identifier; -> export default identifier;
    content = content.replace(/module\.exports\s*=\s*([a-zA-Z0-9_]+);?/g, (match, identifier) => {
        return `export default ${identifier};`;
    });

    // 6. module.exports = expression; -> export default expression;
    content = content.replace(/module\.exports\s*=\s*(.+?);?/g, (match, expr) => {
        if (expr.startsWith('{') || expr.match(/^[a-zA-Z0-9_]+$/)) return match;
        return `export default ${expr};`;
    });

    fs.writeFileSync(file, content, 'utf8');
});

// Update package.json
const pkgPath = path.join(backendDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.type = 'module';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');

console.log('Conversion complete!');
