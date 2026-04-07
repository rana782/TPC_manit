const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const outPath = path.join(__dirname, '..', 'prisma', 'schema.sqlite.prisma');

let content = fs.readFileSync(schemaPath, 'utf8');

content = content.replace(/provider = "postgresql"/, 'provider = "sqlite"');
content = content.replace(/url\s+=\s+env\("DATABASE_URL"\)/, 'url = "file:./dev.db"');

const enumRegex = /enum\s+(\w+)\s+\{/g;
const enumNames = [];
let match;
while ((match = enumRegex.exec(content)) !== null) {
    enumNames.push(match[1]);
}

enumNames.forEach(name => {
    const regex = new RegExp(`enum\\s+${name}\\s+\\{[\\s\\S]*?\\}`, 'g');
    content = content.replace(regex, (m) => {
        return m.split('\n').map(line => `// ${line}`).join('\n');
    });
});

enumNames.forEach(name => {
    const regex = new RegExp(`\\b${name}\\b`, 'g');
    content = content.replace(regex, 'String');
});

content = content.replace(/@db\.Text/g, '');
content = content.replace(/\bJson\b/g, 'String');
content = content.replace(/@default\((?!(true|false|\d+(\.\d+)?)\b)(\w+)\)/g, '@default("$1")');

fs.writeFileSync(outPath, content);
console.log('Created schema.sqlite.prisma');
