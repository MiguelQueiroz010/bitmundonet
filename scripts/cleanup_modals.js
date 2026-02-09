const fs = require('fs');
const path = 'g:/Meu Drive/Projetos/BitMundo/scripts/admin_controller.js';
let content = fs.readFileSync(path, 'utf8');

// remove the wrapping <div style="padding: 2rem;"> from all modals
// We replace it with just the content inside, because .modal-content now handles padding.
// We also need to remove the closing </div> at the end of the template literal.

// Match the specific modal wrappers
const modalPatterns = [
    /`\s*<div style="padding: 2rem;">/g,
    /<\/div>\s*`;\s*window\.showModal/g
];

// This is a bit risky globally, so let's be more specific
// Replace `<div style="padding: 2rem;">` with empty string
content = content.replace(/<div style="padding: 2rem;">\s*<div style="display: flex;/g, '<div style="display: flex;');

// Also fix the one in editProject specifically
content = content.replace(/window\.editProject = async \(id\) => \{[\s\S]*?const html = `\s*<div style="padding: 2rem;">/g, (match) => {
    return match.replace('<div style="padding: 2rem;">', '');
});

// Remove the trailing </div> before the closing backtick
// Usually it looks like:   </div>\n    `;\n    window.showModal(html);
content = content.replace(/<\/div>\s*`;\s*window\.showModal\(html\);/g, '`;\n    window.showModal(html);');

// Specifically handle addNewProject
content = content.replace(/window\.addNewProject = \(\) => \{[\s\S]*?const html = `\s*<div style="padding: 2rem;">/g, (match) => {
    return match.replace('<div style="padding: 2rem;">', '');
});

// Specifically handle editArticle
content = content.replace(/window\.editArticle = async \(id\) => \{[\s\S]*?const html = `\s*<div style="padding: 2rem;">/g, (match) => {
    return match.replace('<div style="padding: 2rem;">', '');
});

// Specifically handle addNewArticle
content = content.replace(/window\.addNewArticle = \(\) => \{[\s\S]*?const html = `\s*<div style="padding: 2rem;">/g, (match) => {
    return match.replace('<div style="padding: 2rem;">', '');
});

// Specifically handle addNewTool
content = content.replace(/window\.addNewTool = \(\) => \{[\s\S]*?const html = `\s*<div style="padding: 2rem;">/g, (match) => {
    return match.replace('<div style="padding: 2rem;">', '');
});

// One more: editTool (it might be different)
content = content.replace(/window\.editTool = async \(id\) => \{[\s\S]*?const html = `\s*<div style="padding: 1rem;">/g, (match) => {
    return match.replace('<div style="padding: 1rem;">', '');
});

fs.writeFileSync(path, content, 'utf8');
console.log('JS Modal Cleanup complete.');
